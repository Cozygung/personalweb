import {ServerError} from "../errors/server-error.js";
import {StatusCodes} from "http-status-codes";

import pLimit from 'p-limit';

const limit = pLimit(10);

class BusController {
    #busService
    #neo4jDriver
    
    constructor(neo4jDriver, busService) {
        this.#busService = busService;
        this.#neo4jDriver = neo4jDriver;
    }
    
    addBusRoutes = async (req, res, next) => {
        const session = this.#neo4jDriver.session();
        const tx = session.beginTransaction();
        
        // First create the UNIQUENESS CONSTRAINT on stop_id
        try {
            await tx.run('CREATE CONSTRAINT UNIQUE_STOP_ID IF NOT EXISTS FOR (n:BusStop) REQUIRE n.stop_id IS UNIQUE;');
            await tx.commit();
        } catch (error) {
            console.error('Error executing query:', error);
            await tx.rollback();
            await session.close();
            
            return next(error);
        }
        
        try {
            console.log("GETTING BUS STOPS")
            
            const busStops = await this.#busService.getBusStops();
            const busStopsMapped = busStops.map(busStop => busStop.attributes)
            
            console.log("ADDING BUS STOP NODES")
            await this.#busService.addBusStopNodes(session, busStopsMapped);
            
            // Get Bus Routes
            const routes = await this.#busService.getBusRoutes();
            console.log("ROUTES LENGTH:")
            console.log(routes.length);
            
            // TODO: Remove the bus routes that have already been added to the database
            // Comment these lines out once the database has been finished.
            const dbRoutes = await this.#busService.getDatabaseBusRoutes(session);
            const busRoutesSubset = routes.filter(route => !dbRoutes.has(route.attributes.route_id));
            
            // Get all trips for each route | format: trips = [ {route1: [{trip1}, {trip2}]}, {route2: [{trip3}, {trip4}]} ... ] 
            // where a trip is in format = { attributes: { "bikes_allowed": 0, "direction_id": 1, "route_id": "101-202", "service_id": "Weekday-2", "shape_id": "1254-10102-b8afdb1f",
            //                                              "trip_headsign": "Auckland University To Pt Chevalier Via Jervois Rd", "trip_id": "1254-10102-55200-2-862bfda5", "wheelchair_accessible": 0 }}
            const routeTripsGroupedByRouteId = await Promise.all( busRoutesSubset.map(route => this.#busService.getTripsByRouteId(route.attributes.route_id)) );
            
            // Group trips by serviceId | format: tripsByServiceId = [{ route1: { serviceId1: [{trip1}, {trip2}], serviceId2: ... }}, { route2: { serviceId3: [{trip3}, {trip4}] }} ] 
            const routeTripsGroupedByServiceId = routeTripsGroupedByRouteId.filter(Boolean) // Filter out nulls
                .map(routeTrips => {
                    const [routeId, trips] = Object.entries(routeTrips)[0];
                    
                    const routeTripsGroupedByServiceId = trips.reduce((acc, trip) => {
                        if (!acc[trip.attributes.service_id]) {
                            acc[trip.attributes.service_id] = [];
                        }
                        acc[trip.attributes.service_id].push(trip);
    
                        return acc;
                }, {});
                
                return { [routeId]: routeTripsGroupedByServiceId };
            })

            for (const route of routeTripsGroupedByServiceId) {
                const [routeId, routeTrips] = Object.entries(route)[0];
                console.log("STARTING ROUTE_ID:" + routeId);
                const { serviceDays: routeTripsGroupedByServiceDays, serviceDaysReverse: routeTripsGroupedByServiceDaysReverse } 
                    = await this.#busService.getServiceCalendarDays(routeTrips);
                
                // TODO: Ferries are represented as BUS_ROUTES. FIXXX!!!! Check hobsonville point ferry {stop_id: "21779-d98fae38"}
                const tx = session.beginTransaction();
                try {
                    if (Object.keys(routeTripsGroupedByServiceDays).length > 0) {
                        await this.#busService.initBusRoutes(tx, routeTripsGroupedByServiceDays, routeId, 0);
                    }

                    if (Object.keys(routeTripsGroupedByServiceDaysReverse).length > 0) {
                        await this.#busService.initBusRoutes(tx, routeTripsGroupedByServiceDaysReverse, routeId, 1);
                    }
                    console.log("COMMITING")
                    await tx.commit();
                } catch (error) {
                    console.error('Error executing query:', error);
                    await tx.rollback();

                    return next(error);
                }
            }

            return res.status(StatusCodes.OK).json({ message: "Success" });
        } catch (error) {
            console.error('Error executing query:', error);

            return next(error);
        } finally {
            await session.close()
        }
    }
    
    addWalkPaths = async (req, res, next) => {
        const session = this.#neo4jDriver.session();
        const transaction = session.beginTransaction();
        
        try {
            // Get all pairs of bus stops that are within 500m (direct distance estimate) of each other 
            // and node B cannot be reached from node A directly (without a bus transfer)
            // Vice versa: node A cannot be reached from node B directly
            console.log("GETTING ALL NODE PAIRS")
            const query = `
                MATCH (a:BusStop)
                MATCH (b:BusStop)
                WHERE a.stop_id < b.stop_id
                    AND point.distance(point({latitude: a.stop_lat, longitude: a.stop_lon}), 
                    point({latitude: b.stop_lat, longitude: b.stop_lon})) < $radius
                RETURN a, b
                `;
        
            const radius = 500
            const params = { radius: radius };
            const result = await transaction.run(query, params);
            
            const nodePairs = [];
        
            result.records.forEach(record => {
                const nodeA = record.get('a');
                const nodeB = record.get('b');
                nodePairs.push({nodeA, nodeB});
            })
            
            console.log("STARTING OSRM PROCESSING")
            // For all pairs find the accurate walking distance using OSRM
            const routes = await Promise.all(nodePairs.map(pair => this.#busService.findWalkingDistance(pair.nodeA, pair.nodeB) ));
            
            const invalidResults = routes.filter(result => result.route === null || result.route === undefined);
            if (invalidResults.length !== 0) {
                console.log(invalidResults);
                return next( new ServerError('bus-controller(addWalkPaths): One or more pairs are null') );
            }
            
            // For all pairs of nodes that are within 500m of each other add them to the Neo4J graph
            const validRoutes = routes.filter(result => result.route.distance <= radius);

            console.log("ADDING WALKING EDGES")
            await Promise.all(validRoutes.map(route => limit(() => this.#busService.addWalkingEdge(transaction, route))))
            
            console.log("PRUNING WALKING EDGES")
            // Remove WALKS_TO edges between nodes that are already linked by a chain of BUS_ROUTEs of the same route_id
            const query2 = `
                CALL {
                    MATCH ()-[r:BUS_ROUTE]->()
                    RETURN DISTINCT r.route_id AS routeId, r.direction_id AS directionId
                }
                WITH routeId, directionId
                MATCH (a:BusStop)-[w:WALKS_TO]->(b:BusStop)
                WHERE EXISTS { 
                    MATCH path = (a)-[:BUS_ROUTE*]->(b)
                    WHERE all(r IN relationships(path) WHERE r.route_id = routeId AND r.direction_id = directionId) 
                }
                AND a <> b 
                WITH w, a, b
                DELETE w
                WITH a, b
                MATCH (b)-[w2:WALKS_TO]->(a)
                DELETE w2
                `;
            await transaction.run(query2, params);
            
            console.log("COMMITTING")
            await transaction.commit();
            return res.status(StatusCodes.OK).json({ message: "Success" });
        } catch (error) {
            console.error('Error executing query:', error);
            
            await transaction.rollback();
            return next(error);
        } finally {
            await session.close()
        }
        
    }
    
}

export default BusController;