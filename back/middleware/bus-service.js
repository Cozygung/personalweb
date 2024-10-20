import axios from 'axios'
import Bottleneck from 'bottleneck'

// 10 calls per second and 600 calls per minute
const limiter = new Bottleneck({
    maxConcurrent: 10, // Max 10 concurrent calls
    minTime: 101 // 100ms between each call (+ 1 otherwise it will be 610 calls per minute)
});

const OSRMLimiter = new Bottleneck({
    maxConcurrent: 4, 
    minTime: 10 
});

class BusService {
    findWalkingDistance = OSRMLimiter.wrap( async (nodeA, nodeB) => {
        const url = `http://localhost:5000/route/v1/walking/` +
            `${nodeA.properties.stop_lon},${nodeA.properties.stop_lat};` +
            `${nodeB.properties.stop_lon},${nodeB.properties.stop_lat}?overview=full&geometries=geojson`;
        const response = await axios.get(url, {timeout: 10000} );

        return {nodeA: nodeA, nodeB: nodeB, route: response.data.routes[0]}
    })
    
    getBusStops = limiter.wrap(async () => {
        const url = process.env.BUS_API_URL + '/stops';
        const response = await axios.get(url, {
            headers: {
                'Content-Type': 'application/json',
                'Ocp-Apim-Subscription-Key': process.env.BUS_API_SECRET
            }
        })

        return response.data.data
    })
    
    getBusRoutes = limiter.wrap( async () => {
        const url = process.env.BUS_API_URL + '/routes';
        const response = await axios.get(url, {
            headers: {
                'Content-Type': 'application/json',
                'Ocp-Apim-Subscription-Key': process.env.BUS_API_SECRET
            }
        })
        
        return response.data.data
    });
    
    getTripsByRouteId = limiter.wrap( async (routeId) => {
        try {
            const url = process.env.BUS_API_URL + `/routes/${routeId}/trips`;
            const response = await axios.get(url, {
                headers: {
                    'Content-Type': 'application/json',
                    'Ocp-Apim-Subscription-Key': process.env.BUS_API_SECRET
                }
            })

            return {[routeId]: response.data.data}
        } catch (error) {
            if (error?.response?.data?.errors !== undefined) {
                const apiErrors = error.response.data.errors;
                console.log(`Error for routeId "${routeId}":`, apiErrors)
            } else {
                console.error("Unexpected error:", error.message);
            }
            return null;
        }
    });
    
    getBusOperatingDaysByServiceId = limiter.wrap( async (serviceId) => {
        const weekDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        
        const url = process.env.BUS_API_URL + `/services/${serviceId}/calendars`;
        const response = await axios.get(url, {
            headers: {
                'Content-Type': 'application/json',
                'Ocp-Apim-Subscription-Key': process.env.BUS_API_SECRET
            }
        })

        return Object.keys(response.data.data.attributes)
            .filter(attribute => weekDays.includes(attribute))
            .reduce((filtered, day) => {
                filtered[day] = response.data.data.attributes[day];
                return filtered;
            }, {});
    });

    getStopTimes = limiter.wrap( async (tripId) => {
        const url = process.env.BUS_API_URL + `/trips/${tripId}/stoptimes`;
        const response = await axios.get(url, {
            headers: {
                'Content-Type': 'application/json',
                'Ocp-Apim-Subscription-Key': process.env.BUS_API_SECRET
            }
        })

        return response.data.data
    });
    
    // routeTrips are all trips grouped by service_id
    async getServiceCalendarDays(routeTrips) {
        const routeTripsGroupedByWeekday = {
            monday: [],
            tuesday: [],
            wednesday: [],
            thursday: [],
            friday: [],
            saturday: [],
            sunday: []
        };
        const routeTripsGroupedByWeekdayReverseDirection = {
            monday: [],
            tuesday: [],
            wednesday: [],
            thursday: [],
            friday: [],
            saturday: [],
            sunday: []
        }
        const serviceIdList = Object.keys(routeTrips);
        const serviceCalendarDates = await Promise.all(
            serviceIdList.map(serviceId => this.getBusOperatingDaysByServiceId(serviceId))
        );
        serviceIdList.forEach((serviceId, index) => {
            const operatingDays = serviceCalendarDates[index];
            // For each trips that serve under the same service_id
            routeTrips[serviceId].forEach(trip => {
                if (trip.attributes.direction_id === 0) {
                    // Add trip to 'schedule' on all operating days
                    Object.keys(operatingDays).forEach(day => {
                        if (operatingDays[day] === 1) {
                            routeTripsGroupedByWeekday[day].push(trip);
                        }
                    });
                } else if (trip.attributes.direction_id === 1) {
                    // Add trip to 'scheduleReverse' on all operating days
                    Object.keys(operatingDays).forEach(day => {
                        if (operatingDays[day] === 1) {
                            routeTripsGroupedByWeekdayReverseDirection[day].push(trip);
                        }
                    });
                }
            });
        })

        // Remove empty days
        Object.keys(routeTripsGroupedByWeekday).forEach(day => {
            if (routeTripsGroupedByWeekday[day].length === 0) {
                delete routeTripsGroupedByWeekday[day];
            }
        });

        Object.keys(routeTripsGroupedByWeekdayReverseDirection).forEach(day => {
            if (routeTripsGroupedByWeekdayReverseDirection[day].length === 0) {
                delete routeTripsGroupedByWeekdayReverseDirection[day];
            }
        });

        return {serviceDays: routeTripsGroupedByWeekday, serviceDaysReverse: routeTripsGroupedByWeekdayReverseDirection}
    }
    
    async initBusRoutes(tx, routeTripsGroupedByServiceDays, routeId, directionId) {
        console.log("GETTING TIMETABLES")

        // This is the sorted weekly timetables for each stop in the trip journey
        // Format: {monday: {stopId1: [trip1, trip2...], stopId2: [...], ...}, tuesday: {...}}
        const weeklyRouteTripsGroupedByStopId = await this.getTimetables(routeTripsGroupedByServiceDays);

        console.log("ADDING BUS TRIP EDGES")

        // Add the edges marking the routeId
        await this.addBusTripEdges(tx, weeklyRouteTripsGroupedByStopId, routeId, directionId)

        console.log("ADDING TIMETABLE NODES")

        // Add timetable nodes to neo4j and connect it to BusStop nodes
        await this.addTimetableNodes(tx, weeklyRouteTripsGroupedByStopId, routeId, directionId);
    }
    
    async getTimetables(routeTripsGroupedByServiceDays) {
        const timetables = {};
        await Promise.all(
            Object.keys(routeTripsGroupedByServiceDays).map(async day => {
                // Get all trips for the current day
                const trips = routeTripsGroupedByServiceDays[day];
                const currentDayTimetable = new Map();

                // Fetch stop times for all trips in parallel
                const stopTimesPromises = trips.map(trip =>
                    this.getStopTimes(trip.attributes.trip_id).then(tripStopTimes =>
                        // Where each stopTime is in format = { "attributes": { "arrival_time": "15:20:00", "departure_time": "15:20:00", "drop_off_type": 0, "pickup_type": 0,
                        //                                                      "shape_dist_traveled": 0, "stop_headsign": "PT CHEV BCH", "stop_id": "1031-6ceef13a", "stop_sequence": 1, 
                        //                                                      "timepoint": 0, "trip_id": "1254-10102-55200-2-862bfda5" }}
                        tripStopTimes.forEach(stopTime => {
                            // Group stop times by stopId
                            if (!currentDayTimetable.has(stopTime.attributes.stop_id)) {
                                currentDayTimetable.set(stopTime.attributes.stop_id, []);
                            }

                            stopTime.attributes.route_id = trip.attributes.route_id;
                            currentDayTimetable.get(stopTime.attributes.stop_id).push(stopTime.attributes)
                        })
                    )
                )

                // Wait for all stop times to be processed
                await Promise.all(stopTimesPromises);

                // Sort the stop times for each stopId by time
                const sortedTimetables = {};
                for (const [stopId, stopTimes] of currentDayTimetable.entries()) {
                    sortedTimetables[stopId] = stopTimes.sort((a, b) => a.arrival_time.localeCompare(b.arrival_time));
                }
                
                timetables[day] = sortedTimetables;
            })
        )
        
        return timetables
    }
    
    async getDatabaseBusRoutes(session) {
        const result = await session.run(`
        MATCH ()-[r:BUS_ROUTE]->()
        UNWIND r.route_id AS route_id
        RETURN DISTINCT route_id
        `);

        const routeIds = result.records.map(record => record.get('route_id'));
        return new Set(routeIds);
    }

    async addBusStopNodes(session, busStops) {
        const tx = session.beginTransaction();
        
        try {
            await tx.run(`
            CALL apoc.periodic.iterate(
                "UNWIND $busStops AS row RETURN row",
                "MERGE (n:BusStop {stop_id: row.stop_id})
                SET n.stop_lon = toFloat(row.stop_lon),
                    n.stop_lat = toFloat(row.stop_lat),
                    n.wheelchair_boarding = toInteger(row.wheelchair_boarding),
                    n.stop_code = toInteger(row.stop_code),
                    n.location_type = toInteger(row.location_type),
                    n.stop_name = row.stop_name
                WITH n, row
                WHERE row.platform_code IS NOT NULL
                SET n.platform_code = row.platform_code",
                {batchSize: 1000, iterateList: true, parallel: false, params: {busStops: $busStops}}
            )
        `, {
                busStops: busStops
            });

            console.log("COMMITING")
            await tx.commit();
        } catch (error) {
            await tx.rollback();

            throw error;
        }
        
    }
    
    async addBusTripEdges(transaction, weeklyRouteTripsGroupedByStopId, routeId, directionId) {
        const busStopSequence = {}; // All routeTrips have the same BusStop sequence
        console.log("WRTGBSI")
        console.log(weeklyRouteTripsGroupedByStopId)
        const mondayRouteTrips = Object.values(weeklyRouteTripsGroupedByStopId)[0];
        console.log("MRT")
        console.log(mondayRouteTrips)
        Object.entries(mondayRouteTrips).forEach(([stopId, trips]) => {
            const sequence = trips[0].stop_sequence;

            busStopSequence[sequence] = {stop_id: stopId, route_id: routeId};
        })

        const stopPairs = [];
        const stopKeys = Object.keys(busStopSequence)
        
        for (let i = 0; i < stopKeys.length - 1; i++) {
            const currentKey = stopKeys[i];
            const nextKey = stopKeys[i + 1];

            const currentStop = busStopSequence[currentKey];
            const nextStop = busStopSequence[nextKey];

            stopPairs.push({
                current_stop: currentStop.stop_id,
                next_stop: nextStop.stop_id,
                route_id: currentStop.route_id,
                direction_id: directionId
            });
        }

        console.log("RUNNING TRANSACTION")

        await transaction.run(`
                UNWIND $stopPairs AS row
                MATCH (a:BusStop {stop_id: row.current_stop}), (b:BusStop {stop_id: row.next_stop})
                MERGE (a)-[r:BUS_ROUTE {route_id: row.route_id}]->(b)
                ON CREATE SET r.direction_id = row.direction_id
                ON MATCH SET r.direction_id = row.direction_id;
            `, {
                stopPairs: stopPairs,
        });

        console.log("FINISHED RUNNING TRANSACTION")
    }
    
    // TODO: Check if timetable is set correctly for n.stop_id = "7124-8993255e" AND t.day = "monday" AND t.route_id = "101-202"
    // TODO: After resetting the database.
    async addTimetableNodes(transaction, weeklyRouteTripsGroupedByStopId, routeId, directionId) {
        const queries = [];
        
        for (const [day, stops] of Object.entries(weeklyRouteTripsGroupedByStopId)) {
            for (const [stopId, trips] of Object.entries(stops)) {
                const tripIds = [];
                const arrivalTimes = [];

                trips.forEach(trip => {
                    if (trip.trip_id && trip.arrival_time) {
                        tripIds.push(trip.trip_id);
                        arrivalTimes.push(trip.arrival_time);
                    } else {
                        throw new Error(`Error getting data for stop: ${stopId}, \n
                                         RouteId: , ${routeId}`)
                    }
                });
                queries.push({
                    text: `
                        MATCH (b:BusStop {stop_id: $stop_id})
                        MERGE (t:Timetable {day: $day, route_id: $route_id, direction_id: $direction_id, stop_id: $stop_id})
                        SET t.arrival_times = $arrival_times
                        SET t.trip_ids = $trip_ids
                        MERGE (b)-[:HAS_TIMETABLE]->(t)
                    `,
                    params: {
                        stop_id: stopId,
                        day: day,
                        route_id: routeId,
                        direction_id: parseInt(directionId, 10),
                        arrival_times: arrivalTimes,
                        trip_ids: tripIds
                    }
                });
            }
        }

        // Execute queries in batches
        const batchSize = 100; // TODO: Adjust batch size as needed
        for (let i = 0; i < queries.length; i += batchSize) {
            const batch = queries.slice(i, i + batchSize);

            await Promise.all(batch.map(({ text, params }) => 
                transaction.run(text, params)
            ));
        }
    }
    
    async addWalkingEdge(transaction, route) {
        await transaction.run(`
                MATCH (a:BusStop {stop_id: $nodeAId})
                MATCH (b:BusStop {stop_id: $nodeBId})
                MERGE (a)-[r:WALKS_TO {distance: $distance}]->(b)
                RETURN r
            `, {
            nodeAId: route.nodeA.properties.stop_id,
            nodeBId: route.nodeB.properties.stop_id,
            distance: route.route.distance.toFixed(2)
        });

        // Add the walking route from nodeB to nodeA (bidirectional)
        await transaction.run(`
                MATCH (a:BusStop {stop_id: $nodeAId})
                MATCH (b:BusStop {stop_id: $nodeBId})
                MERGE (b)-[r:WALKS_TO {distance: $distance}]->(a)
                RETURN r
            `, {
            nodeAId: route.nodeA.properties.stop_id,
            nodeBId: route.nodeB.properties.stop_id,
            distance: route.route.distance.toFixed(2)
        });
    }
}

export default BusService;