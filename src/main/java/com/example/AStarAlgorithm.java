package com.example;

import org.neo4j.graphdb.*;
import org.neo4j.procedure.*;
import org.neo4j.logging.Log;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.TextStyle;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class AStarAlgorithm {
    @Context
    public Log log;

    @Context
    public GraphDatabaseService db;

    private static final DateTimeFormatter formatter = DateTimeFormatter.ofPattern("HH:mm:ss");

    // MAX_WALK_TIME only applies to one edge for the path
    private static final long MAX_WALK_TIME = 30; // in minutes
    private static final long TRANSFER_BUFFER = 5; // in minutes

    // MAX_WAIT_TIME only applies to a singular wait event
    private static long MAX_WAIT_TIME = 20; // 20 minutes
    private static void setMaxWaitTime(long maxWaitTime) { MAX_WAIT_TIME = maxWaitTime; }

    private static double AVERAGE_BUS_SPEED = 40; // 40 km/h
    private static void setBusSpeed(double speed) {
        AVERAGE_BUS_SPEED = speed;
    }

    private static double AVERAGE_WALK_SPEED = 5; // 5 km/h
    private static void setWalkSpeed(double speed) { AVERAGE_WALK_SPEED = speed; }

    private static long MAX_TOTAL_WALK_TIME = 20; // 20 minutes
    private static void setMaxTotalWalkTime(long maxTotalWalkTime) { MAX_TOTAL_WALK_TIME = maxTotalWalkTime; }

    private static long MAX_TOTAL_WAIT_TIME = 20; // 20 minutes
    private static void setMaxTotalWaitTime(long maxTotalWaitTime) { MAX_TOTAL_WAIT_TIME = maxTotalWaitTime; }

    private static final Map<String, AStarNode> visitedNodes = new HashMap<>();

    @Procedure(value = "com.example.findFastestPaths", mode = Mode.READ)
    @Description("Finds the fastest paths between two geographic points using A* algorithm.")
    public Stream<PathResult> findFastestPaths(
            @Name("startLat") double startLat,
            @Name("startLon") double startLon,
            @Name("endLat") double destLat,
            @Name("endLon") double destLon,
            @Name("dayOfWeek") long dayOfWeek, // 0 ~ 6
            @Name("startCurrentTime") String startCurrentTime,
            @Name("maxPaths") long maxPaths,
            @Name("averageWalkSpeed") double AVERAGE_WALK_SPEED, // in km/h
            @Name("averageBusSpeed") double AVERAGE_BUS_SPEED, // in km/h
            @Name("maxTotalWalkTime") long MAX_TOTAL_WALK_TIME, // in minutes
            @Name("maxTotalWaitTime") long MAX_TOTAL_WAIT_TIME // in minutes
    ) {
        // Validate parameters //
        if (dayOfWeek <= 0 || dayOfWeek > 7) {
            throw new IllegalArgumentException("dayOfWeek must be between 1 and 7");
        }

        DayOfWeek dow = DayOfWeek.of((int) dayOfWeek);
        String dowString = dow.getDisplayName(TextStyle.FULL, Locale.ENGLISH);

        try {
            LocalTime.parse(startCurrentTime, formatter);
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("Incorrect time format for startCurrentTime: " + startCurrentTime);
        }

        if (AVERAGE_WALK_SPEED < 1 || AVERAGE_WALK_SPEED > 10) {
            throw new IllegalArgumentException("Average walk speed must be between 1 and 10");
        }

        if (AVERAGE_BUS_SPEED < 20 || AVERAGE_BUS_SPEED > 80) {
            throw new IllegalArgumentException("Average bus speed must be between 20 and 80");
        }


        log.info("Setting Up");
        setBusSpeed(AVERAGE_BUS_SPEED);
        setWalkSpeed(AVERAGE_WALK_SPEED);
        setMaxTotalWalkTime(MAX_TOTAL_WALK_TIME);
        setMaxTotalWaitTime(MAX_TOTAL_WAIT_TIME);

        int maxWaitTime = (int) ((double) MAX_WALK_TIME * AVERAGE_BUS_SPEED / AVERAGE_WALK_SPEED * 3 / (5 * 8));
        setMaxWaitTime(maxWaitTime);


        // Find all bus stops near the start and destination //
        log.info("Find all nearby stops");
        try {
            // This will grab the closest bus stop per unique routeId
            // Format = { routeId_0: { busStopId: , distance: , routeId: , directionId: } }
            // TODO: This can be parallelized
            Map<String, Map<String, Object>> nearestStartBusStops = findNearestBusStops(startLat, startLon);
            Map<String, Map<String, Object>> nearestDestinationBusStops = findNearestBusStops(destLat, destLon);

            if (nearestStartBusStops.isEmpty()) {
                throw new Error("No bus stops near the starting position");
            }

            if (nearestDestinationBusStops.isEmpty()) {
                throw new Error("No bus stops near the destination position");
            }

            // Filtering: We only want the bus stops that are closer to the destination than the starting position
            double distanceFromStartToDestination = calculateDistance(startLat, startLon, destLat, destLon);
            nearestDestinationBusStops = nearestDestinationBusStops.entrySet().stream()
                    .filter(entry -> {
                        Map<String, Object> busStop = entry.getValue();
                        double distance = (double) busStop.get("distance");
                        return distance < distanceFromStartToDestination;
                    })
                    .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));

            // TODO: Instead of setting maxPaths, we can keep searching until the arrivalTime goes over the acceptable upper boundary
            // If the user wanted 5 ways to get to the destination, but there is only one way (or nearby node)
            // to the destination, then we want to stop the search after we found the one path.
            if (nearestStartBusStops.size() < maxPaths) {
                maxPaths = nearestStartBusStops.size();
            }

            // If there are no bus stops closer than the starting position then return a full path of just walking
            if (nearestDestinationBusStops.isEmpty()) {
                AStarNode start = new AStarNode(
                        "start",
                        null,
                        0,
                        null,
                        0,
                        0,
                        null,
                        0,
                        0,
                        0,
                        null
                );

                double walkTime = calculateDistance(startLat, startLon, destLat, destLon) * 60 / (AVERAGE_WALK_SPEED * 1000); // In minutes
                AStarNode destination = new AStarNode(
                        "destination",
                        "WALKS_TO",
                        0,
                        start,
                        0,
                        0,
                        null,
                        0,
                        0,
                        (int) Math.ceil(walkTime),
                        null
                );

                List<PathResult> foundPaths = List.of(reconstructPath(destination));
                return foundPaths.stream();

            }

            // Setup variables: openSet is the algorithm queue, foundPaths keeps track of the all visited nodes with their earliest arrivalTimes
            PriorityQueue<AStarNode> openSet = new PriorityQueue<>(Comparator.comparingDouble(node -> node.fScore));
            Collection<AStarNode> c = Collections.synchronizedCollection(openSet); // TODO: This
            List<PathResult> foundPaths = new ArrayList<>();


            // Setup Presets //
            long travelTimeUpperBound = 24 * 60;
            double timeTolerance = 1.5;
            int maxTransfers = 5;


            // Iterate through nearestStartBusStops //
            log.info("Iterate through nearestStartBusStops");
            AStarNode start = new AStarNode(
                    "start",
                    null,
                    0,
                    null,
                    0,
                    0,
                    startCurrentTime,
                    0,
                    0,
                    0,
                    null
            );

            // TODO: This can be parallelized
            // Initialize AStarNodes for all nearestStartBusStops and queue them in openSet (and add to visitedNodes)
            for (Map.Entry<String, Map<String, Object>> entry : nearestStartBusStops.entrySet()) {
                Map<String, Object> busStop = entry.getValue();
                String busStopId = (String) busStop.get("busStopId");
                double walkingDistance = (double) busStop.get("distance");

                double walkTime = walkingDistance * 60 / (1000 * AVERAGE_WALK_SPEED); // In minutes
                LocalTime currentTime = LocalTime.parse(start.currentTime, formatter).plusMinutes((int) Math.ceil(walkTime));

                double initialFScore = walkTime + heuristic(busStopId, destLat, destLon);

                AStarNode firstNode;
                // If the user already happens to be by the bus stop, then we use the bus stop as the starting point
                if (walkingDistance < 5) {
                    firstNode = new AStarNode(
                            busStopId,
                            "WALKS_TO",
                            0,
                            null,
                            0,
                            initialFScore - walkTime,
                            currentTime.format(formatter),
                            0,
                            0,
                            (int) Math.ceil(walkTime),
                            null
                    );
                } else {
                    firstNode = new AStarNode(
                            busStopId,
                            "WALKS_TO",
                            0,
                            start,
                            walkTime,
                            initialFScore,
                            currentTime.format(formatter),
                            0,
                            0,
                            (int) Math.ceil(walkTime),
                            null
                    );
                }

                openSet.add(firstNode);

                visitedNodes.put(busStopId, firstNode);
            }



            log.info("Starting algorithm");
            // TODO: Replace foundPaths.size() to a variable storing a number? (to allow us to have more than maxPaths)
            while (!openSet.isEmpty() && foundPaths.size() < maxPaths) {
                AStarNode currentAStarNode = openSet.poll();
                log.info("Current Node: " + currentAStarNode.busStopId);
                LocalTime currentTime = LocalTime.parse(currentAStarNode.currentTime, formatter);

                log.info("Checking for direct path");
                // Check if there is a direct path to the destination node from current node
                Map<String, Object> destStopData = nearestDestinationBusStops.get(currentAStarNode.routeId + "_" + currentAStarNode.directionId);
                if (destStopData != null) {
                    AStarNode visitedNode = visitedNodes.getOrDefault(currentAStarNode.busStopId, null);
                    // Find the direct path only if this path visits this node faster than the one recorded in "visitedNodes"
                    if (visitedNode == null || currentTime.isBefore(LocalTime.parse(visitedNode.currentTime, formatter))) {
                        PathResult path = findPath(currentAStarNode, destStopData, destLat, destLon, dowString);

                        foundPaths.add(path);
                    }
                    continue;
                }

                log.info("Checking for walkable routes");
                // TODO: Maybe only addpaths if it is faster than the one recorded in visitedNodes
                // Check if the current stop is in walkable distance to the destination (approx. 30 minutes walking)
                double walkHeuristic = (currentAStarNode.fScore - currentAStarNode.gScore) * AVERAGE_BUS_SPEED / AVERAGE_WALK_SPEED;
                if (walkHeuristic < MAX_WALK_TIME) {
                    // If we reached the current node by walking, then find all bus routes that leads to the destination
                    if (currentAStarNode.routeId.equals("WALKS_TO")) {
                        List<PathResult> pathList = findAllPaths(
                                currentAStarNode,
                                new ArrayList<>(nearestDestinationBusStops.values()),
                                destLat,
                                destLon,
                                dowString
                        );

                        if (!pathList.isEmpty()) {
                            foundPaths.addAll(pathList);
                        }
                        continue;

                    // If we reached the current node through a bus, then we take the current bus the furthest we can up
                    // to the closest stop to the destination. Then walk the rest of the distance.
                    } else {
                        PathResult path = findPath(
                                currentAStarNode,
                                destLat,
                                destLon,
                                dowString
                        );

                        if (path == null) {
                            currentTime = currentTime.plusMinutes((int) Math.ceil(walkHeuristic));
                            AStarNode destination = new AStarNode(
                                    "destination",
                                    "WALKS_TO",
                                    0,
                                    currentAStarNode,
                                    0,
                                    0,
                                    currentTime.format(formatter),
                                    currentAStarNode.totalTransfers,
                                    currentAStarNode.totalWaitTime,
                                    currentAStarNode.totalWalkTime + (int) Math.ceil(walkHeuristic),
                                    null
                            );

                            foundPaths.add(reconstructPath(destination));
                            continue;
                        }

                        foundPaths.add(path);
                        continue;
                    }

                    // TODO: Once we grab all the possible routes, we can check for routes with the same
                    // transfer points (bus stops that are used to transfer to a different bus. This can be the hallmark for
                    // how we create the ability for alternating between sub-paths.

                }
                // TODO: For journeys where the destination is closer than any of the landmarks OR
                // TODO: For journeys that don't involve landmarks, first check if there is a direct route from start to destination.
                // TODO: Afterwards, find all bus stops near the start and end nodes
                // TODO:    and order the bus stops by reach (which is = max(distanceStartToNode, distanceNodeToEnd)).
                // TODO: Starting from the bus stops with the lowest reach value, see if there is a bus route that
                // TODO:    goes from the bus node to the destination, AND another bus route that goes from the start
                // TODO:    node to the bus node.
                // TODO: Then merge the two sets of bus routes and check for similar routes

                // TODO: For journeys that are longer OR the landmarks happen to be between or closer than the destination
                // TODO:    find landmarks that connect to the destination node. Find landmarks that connect to the start node.
                // TODO: Then find routes that can connect these two landmarks.

                //


                // TODO: Give higher priority (GScore) to bus routes that reach bus stations and etc
                // TODO: Have a variable that stores all routeIds that go through bus stations.
                log.info("Checking for neighbors");
                List<Map<String, Object>> neighbors = getNeighbors(currentAStarNode, dowString);
                for (Map<String, Object> neighbor : neighbors) {
                    String stopId = (String) neighbor.get("stopId");
                    String routeId = (String) neighbor.get("routeId");
                    int directionId = (int) neighbor.getOrDefault("directionId", 0);
                    String tripId = (String) neighbor.getOrDefault("tripId", null);
                    log.info("Found neighbor: " + stopId);

                    if (!Objects.equals(routeId, "WALKS_TO")) {
                        // Check if the current route takes you to a bus station
                        getAllStations(routeId, currentAStarNode);

                        // If it does, queue that to openset
                    }

                    int waitTime = (int) neighbor.getOrDefault("waitTime", 0); // In minutes
                    LocalTime arrivalTime = (LocalTime) neighbor.get("arrivalTime");
                    double travelTime = (double) Duration.between(arrivalTime, currentTime)
                            .getSeconds() / 60; // In minutes

                    double tentativeGScore = currentAStarNode.gScore + waitTime + travelTime;
                    int totalWaitTime = currentAStarNode.totalWaitTime + waitTime;
                    int totalWalkTime = currentAStarNode.totalWalkTime;

                    if (Objects.equals(routeId, "WALKS_TO")) {
                        totalWalkTime += (int) Math.ceil(travelTime);
                    }

                    AStarNode visitedNeighborNode = visitedNodes.getOrDefault(stopId, null);
                    if (visitedNeighborNode != null &&
                            (tentativeGScore > visitedNeighborNode.gScore * timeTolerance ||
                                    totalWaitTime > MAX_TOTAL_WAIT_TIME ||
                                    totalWalkTime > MAX_TOTAL_WALK_TIME ||
                                    tentativeGScore > travelTimeUpperBound * timeTolerance
                            )
                    ) {
                        continue;
                    }

                    // Determine if this is a transfer (route change)
                    boolean isTransfer = waitTime > 0 && !currentAStarNode.previous.busStopId.equals("start");

                    // Prevent the route appearing twice in the same path
                    if (isTransfer &&
                            (currentAStarNode.totalTransfers >= maxTransfers ||
                                    hasTraversedRoute(currentAStarNode, routeId))
                    ) {
                        continue;
                    }

                    log.info("Queueing neighbor");
                    AStarNode neighborNode = new AStarNode(
                            stopId,
                            routeId,
                            directionId,
                            currentAStarNode,
                            tentativeGScore,
                            tentativeGScore + heuristic(stopId, destLat, destLon),
                            arrivalTime.format(formatter),
                            currentAStarNode.totalTransfers + (isTransfer ? 1 : 0),
                            totalWaitTime,
                            totalWalkTime,
                            tripId
                    );

                    openSet.add(neighborNode);

                    // Add the current node in visitedNodes if it has the fastest arrival time for that node.
                    if (visitedNeighborNode == null ||
                            arrivalTime.isBefore(LocalTime.parse(visitedNeighborNode.currentTime, formatter))) {
                        visitedNodes.put(stopId, neighborNode);
                    }
                }
            }

            // TODO: Once I find feasible paths, I want to go through these paths and find if I can take the same route
            // TODO: in the next hour.

            return foundPaths.stream();
        } catch(Exception e) {
            log.error("ERROR WHILE RUNNING findFastestPaths(): " + e.getMessage());
            throw e;
        }
    }

    public boolean hasTraversedRoute(AStarNode aStarNode, String routeId) {
        AStarNode currentNode = aStarNode;
        while (currentNode != null) {
            if (currentNode.routeId.equals(routeId)) {
                return true;
            }
            currentNode = currentNode.previous;
        }
        return false;
    }

    private List<String> getAllStations(String routeId, AStarNode startNode) {
        try (Transaction tx = db.beginTx()) {
            String query =
                    "MATCH (busStop:BusStop)\n" +
                    "WHERE busStop.location_type = 1 OR busStop.platform_code IS NOT NULL\n" +
                    "RETURN busStop";
            Result result = tx.execute(query);

            if (!result.hasNext()) {
                return null;
            }

            List<String> stationList = new ArrayList<>();
            while (result.hasNext()) {
                Map<String, Object> record = result.next();
                Map<String, Object> busStop = (Map<String, Object>) record.get("properties");
                stationList.add((String) busStop.get("stop_id"));
            }

            return stationList;
        }
    }

    // Find path to node closest to the destination
    private PathResult findPath (
            AStarNode startNode,
            double destLatitude,
            double destLongitude,
            String dayOfWeek
    ) {
        log.info("findPath() v2 has started");
        try (Transaction tx = db.beginTx()) {

            String query =
                    "MATCH path = (start:BusStop {stop_id: $startStopId})-[r:BUS_ROUTE* {route_id: $routeId, direction_id: $directionId}]->(end:BusStop) " +
                    "WHERE NOT (end)-[:BUS_ROUTE {route_id: $routeId, direction_id: $directionId}]->(:BusStop) " +
                    "WITH nodes(path) AS busStops " +
                    "WHERE ALL(stop IN busStops WHERE (stop)-[:HAS_TIMETABLE]->(:Timetable {day: $dayOfWeek, route_id: $routeId, direction_id: $directionId})) " +
                    "UNWIND busStops AS stop " +
                    "MATCH (stop)-[:HAS_TIMETABLE]->(timetable:Timetable {day: $dayOfWeek, route_id: $routeId, direction_id: $directionId}) " +
                    "WITH stop, timetable, point.distance( point({ latitude: stop.stop_lat, longitude: stop.stop_lon }), point({ latitude: $destLatitude, longitude: $destLongitude }) ) AS distance" +
                    "RETURN stop AS busStopData, timetable.arrival_times AS arrivalTimes, timetable.trip_ids AS tripIds, distance ";

            Result result = tx.execute(query,
                    Map.of(
                            "startStopId", startNode.busStopId,
                            "routeId", startNode.routeId,
                            "directionId", startNode.directionId,
                            "destLatitude", destLatitude,
                            "destLongitude", destLongitude,
                            "dayOfWeek", dayOfWeek
                    ));
            log.info("findPath() v2 query has finished executing");

            log.debug("findPath RESULT: " + result);

            if (!result.hasNext()) {
                return null;
            }

            // We are going to use this data to check if the route is viable for the current time
            List<Map<String, Object>> pathData = new ArrayList<>();
            while (result.hasNext()) {
                Map<String, Object> record = result.next();
                Map<String, Object> busStop = new HashMap<>();
                List<Map<String, Object>> arrivalTimes = new ArrayList<>();

                Map<String, Object> busStopData = (Map<String, Object>) record.get("busStopData");
                busStop.put("busStop", busStopData.get("properties"));
                List<String> arrivalTimeList = (List<String>) record.get("arrivalTimes");
                List<String> tripIdList = (List<String>) record.get("tripIds");

                if (arrivalTimeList.size() == tripIdList.size()) {
                    for (int i = 0; i < arrivalTimeList.size(); i++) {
                        Map<String, Object> arrivalTime = new HashMap<>();
                        arrivalTime.put("arrival_time", arrivalTimeList.get(i));
                        arrivalTime.put("trip_id", tripIdList.get(i));
                        arrivalTimes.add(arrivalTime);
                    }
                } else {
                    throw new Error("arrivalTimes and tripIds aren't the same size: " + busStopData.get("properties"));
                }

                busStop.put("arrivalTimes", arrivalTimes);
                busStop.put("distance", record.get("distance"));
                busStop.put("routeId", startNode.routeId);
                busStop.put("directionId", startNode.directionId);

                pathData.add(busStop);
            };

            int minDistanceIndex = getMinDistanceIndex(pathData);

            // Prune busStops after minIndex
            if (minDistanceIndex == -1) {
                throw new Error("minDistanceIndex is -1");
            }
            pathData = pathData.subList(0, minDistanceIndex + 1);

            log.info("findPath() v2 data preprocessing has finished");


            // Now grab the arrivalTimes for each of the busStops //
            PathResult path = generateAStarPath(startNode, pathData, destLatitude, destLongitude);

            log.info("findPath() v2 has completed");

            return path;
        }
    }

    private static int getMinDistanceIndex(List<Map<String, Object>> pathData) {
        int minDistanceIndex = -1;
        double minDistance = Double.MAX_VALUE;

        // Find the bus stop node with the smallest distance
        for (int i = 0; i < pathData.size(); i++) {
            Map<String, Object> busStopNode = pathData.get(i);

            // Assuming the distance is stored under the key "distance"
            double distance = (double) busStopNode.get("distance");

            if (distance < minDistance) {
                minDistance = distance;
                minDistanceIndex = i;
            }
        }
        return minDistanceIndex;
    }

    // Finds nearest bus stop to the point per unique routeId (that are in range)
    private Map<String, Map<String, Object>> findNearestBusStops(double latitude, double longitude) {
        try (Transaction tx = db.beginTx()) {
            // Find all Bus stops that are within radius and find all unique route_ids that connect this node to another node
            String query =
                    "MATCH (n:BusStop)-[r:BUS_ROUTE]->()\n" +
                    "WHERE point.distance(point({latitude: $startLat, longitude: $startLon}), point({latitude: n.stop_lat, longitude: n.stop_lon})) < $radius\n" +
                    "WITH n, COLLECT(DISTINCT {route_id: r.route_id, direction_id: r.direction_id}) AS routes,  \n" +
                        "point.distance(point({latitude: $startLat, longitude: $startLon}), point({latitude: n.stop_lat, longitude: n.stop_lon})) AS distance\n" +
                    "RETURN n.stop_id AS busStopId, distance, routes\n" +
                    "ORDER BY distance ASC";

            Result result = tx.execute(query,
                    Map.of(
                            "startLat", latitude,
                            "startLon", longitude,
                            "radius", 1250 // About a 15 minute walk
                    ));

            log.debug("findNearestBusStops RESULT: " + result);

            // Group bus stops by routeIds
            Map<String, Map<String, Object>> closestBusStops = new HashMap<>();

            while (result.hasNext()) {
                // result is in this format: busStopId="1023-ca6f2b92"	distance=7.207051778866632	routes=[{ "direction_id": 0, "route_id": "OUT-202" }, { "direction_id": 0,  "route_id": "101-202" }]
                Map<String, Object> record = result.next();
                log.debug("findNearestBusStops() record: " + record);
                String busStopId = (String) record.get("busStopId");
                double distance = (double) record.get("distance"); // This is distance from the location to the node (in meters)
                List<Map<String, Object>> uniqueRouteData = (List<Map<String, Object>>) record.get("routes");

                for (Map<String, Object> routeData : uniqueRouteData) {
                    String routeId = (String) routeData.get("route_id");
                    double directionId = (double) routeData.get("direction_id");

                    // Create a unique key based on route_id + direction_id
                    String key = routeId + "_" + directionId;

                    // Check if the current bus stop is closer for this route_id + direction_id
                    if (!closestBusStops.containsKey(key) || (double) closestBusStops.get(key).get("distance") > distance) {
                        // Update the closest bus stop for this route_id + direction_id
                        Map<String, Object> stopData = new HashMap<>();
                        stopData.put("busStopId", busStopId);
                        stopData.put("distance", distance);
                        stopData.put("routeId", routeId);
                        stopData.put("directionId", directionId);

                        closestBusStops.put(key, stopData);
                    }
                }
            }

            //return new ArrayList<>(closestBusStops.values());
            return closestBusStops;
        }
    }

    // Returns distance between two points in Meters
    private double calculateDistance(double lat1, double lon1, double lat2, double lon2) {
        double R = 6371000; // Radius of the Earth in meters
        double latDistance = Math.toRadians(lat2 - lat1);
        double lonDistance = Math.toRadians(lon2 - lon1);
        double a = Math.sin(latDistance / 2) * Math.sin(latDistance / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(lonDistance / 2) * Math.sin(lonDistance / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private double heuristic(String stopId, double destLatitude, double destLongitude) {
        // Use direct travel time as the heuristic
        try (Transaction tx = db.beginTx()) {
            String query =
                    "MATCH (n:BusStop {stop_id: $stopId}) " +
                    "WITH n, point({latitude: n.stop_lat, longitude: n.stop_lon}) AS busStopLocation, " +
                    "point({latitude: $destLat, longitude: $destLon}) AS destinationLocation " +
                    "RETURN point.distance(busStopLocation, destinationLocation) AS distance ";
            Result result = tx.execute(query, Map.of("stopId", stopId, "destLat", destLatitude, "destLon", destLongitude));

            if (result.hasNext()) {
                Map<String, Object> record = result.next();
                log.debug("HEURISTIC: " + record);
                return (double) record.get("distance") * 60 / (AVERAGE_BUS_SPEED * 1000); // In minutes
            }

            throw new Error("HEURISTIC FAILED TO EXECUTE PROPERLY");
        }
    }

    private List<PathResult> findAllPaths(
            AStarNode startNode,
            List<Map<String, Object>> destStopDataList,
            double destLatitude,
            double destLongitude,
            String dayOfWeek
    ) {
        log.info("findAllPaths() has started");
        try (Transaction tx = db.beginTx()) {
            List<PathResult> paths = new ArrayList<>();

            // This grabs all routes that connect the current Node to one of the destination nodes directly through a chain of BUS_ROUTEs
            // of the same routeId without any transfers. Format = { routeId: "101-202", directionId: 0 , path: [ {stop: { properties: {...} }, arrivalTimes: [...], tripIds: [...] }, ]
            String query =
                    "WITH $destinations AS destinationsList " +
                    "UNWIND destinationsList AS destination " +
                    "MATCH path = (currentStop:BusStop {stop_id: $currentBusStopId})-[:BUS_ROUTE*]->(destStop:BusStop {stop_id: destination.busStopId}) " +
                    "WHERE ALL(r IN relationships(path) " +
                        "WHERE r.route_id = destination.routeId " +
                        "AND r.direction_id = destination.directionId " +
                    ") " +
                    "WITH nodes(path) AS busStops, destination.routeId AS routeId, destination.directionId AS directionId " +
                    "WHERE ALL(stop IN busStops  " +
                        "WHERE EXISTS {  " +
                            "MATCH (stop)-[:HAS_TIMETABLE]->(timetable)  " +
                            "WHERE timetable.day = $dayOfWeek " +
                            "AND timetable.route_id = routeId " +
                            "AND timetable.direction_id = directionId " +
                        "} " +
                    ") " +
                    "UNWIND busStops AS stop " +
                    "MATCH (stop)-[:HAS_TIMETABLE]->(timetable) " +
                    "WHERE timetable.day = $dayOfWeek " +
                        "AND timetable.route_id = routeId " +
                        "AND timetable.direction_id = directionId " +
                    "WITH routeId, stop, timetable.arrival_times AS arrivalTimes, timetable.trip_ids AS tripIds, directionId " +
                    "RETURN routeId, directionId, collect({stopData: stop, arrivalTimes: arrivalTimes, tripIds: tripIds}) AS pathData ";

            Result result = tx.execute(query, Map.of(
                    "currentBusStopId", startNode.busStopId,
                    "destinations", destStopDataList,
                    "dayOfWeek", dayOfWeek
            ));
            log.info("findAllPaths() query has finished executing");

            // Check if the result is empty (This means that there are no paths to the destination node)
            if (!result.hasNext()) {
                return paths; // Return emptyList
            }

            while (result.hasNext()) {
                Map<String, Object> record = result.next();
                String routeId = (String) record.get("routeId");
                int directionId = (int) record.get("directionId");
                List<Map<String, Object>> pathData = (List<Map<String, Object>>) record.get("pathData");

                pathData = pathData.stream().map(busStop -> {
                    Map<String, Object> stopData = (Map<String, Object>) busStop.get("stopData");
                    List<String> arrivalTimeList = (List<String>) stopData.get("arrivalTimes");
                    List<String> tripIdList = (List<String>) stopData.get("tripIds");
                    List<Map<String, Object>> arrivalTimes = new ArrayList<>();

                    if (arrivalTimeList.size() == tripIdList.size()) {
                        for (int i = 0; i < arrivalTimeList.size(); i++) {
                            Map<String, Object> arrivalTime = new HashMap<>();
                            arrivalTime.put("arrival_time", arrivalTimeList.get(i));
                            arrivalTime.put("trip_id", tripIdList.get(i));
                            arrivalTimes.add(arrivalTime);
                        }
                    } else {
                        throw new Error("arrivalTimes and tripIds aren't the same size: " + stopData.get("properties"));
                    }

                    return Map.of(
                            "busStop", stopData.get("properties"),
                            "arrivalTimes", arrivalTimes,
                            "routeId", routeId,
                            "directionId", directionId
                    );
                }).toList();

                log.info("findAllPaths() has finished preprocessing for routeId: " + routeId);

                // Prevent the route appearing twice in the same path
                if (hasTraversedRoute(startNode, routeId)) {
                    continue;
                }

                PathResult path = generateAStarPath(startNode, pathData, destLatitude, destLongitude);

                log.info("findAllPaths() has completed for routeId: " + routeId);

                if (path != null) {
                    paths.add(path);
                }
            }

            return paths;
        }
    }

    // Returns full path from start to destination node or partial if it stops near the destination; no matter the wait times
    private PathResult findPath(AStarNode startNode, Map<String, Object> destStopData, double destLat, double destLon, String dayOfWeek) {
        String destStopId = (String) destStopData.get("busStopId");
        String routeId = (String) destStopData.get("routeId");
        double directionId = (int) destStopData.get("directionId");

        log.info("findPath() has started");
        try (Transaction tx = db.beginTx()) {
            String query =
                    "MATCH path = (start:BusStop {stop_id: $startBusStopId})-[r:BUS_ROUTE*]->(end:BusStop {stop_id: $destBusStopId}) " +
                    "WHERE ALL(rel in relationships(path)  " +
                              "WHERE rel.route_id = $routeId) " +
                              "AND rel.direction_id = $directionId " +
                    "WITH nodes(path) AS busStops " +
                    "WHERE ALL(stop IN busStops  " +
                        "WHERE EXISTS {  " +
                            "MATCH (stop)-[:HAS_TIMETABLE]->(timetable)  " +
                            "WHERE timetable.day = $dayOfWeek AND timetable.route_id = $routeId AND timetable.direction_id = $directionId " +
                        "}) " +
                    "UNWIND busStops AS stop " +
                    "MATCH (stop)-[:HAS_TIMETABLE]->(timetable) " +
                    "WHERE timetable.day = $dayOfWeek AND timetable.route_id = $routeId AND timetable.direction_id = $directionId " +
                    "RETURN stop AS busStopData, timetable.arrival_times AS arrivalTimes, timetable.trip_ids AS tripIds";

            // Result in format = { properties: { wheelchair_boarding: 0, stop_lon: 174.72348, stop_lat: -36.85154, stop_id: "8495-d8b98d40",
            //                                    stop_code: 8495, stop_name: "Cox's Bay Reserve", location_type: 0 },
            //                      arrivalTimes: ["06:37:23", "06:52:55", "07:08:27", "07:23:59", "07:40:34", "07:51:37", "08:01:37",
            //                                     "08:11:37", "08:26:37", "08:41:37", "08:56:37", "09:08:27"],
            //                      trip_ids: [...] }
            Result result = tx.execute(query, Map.of(
                    "startBusStopId", startNode.busStopId,
                    "destBusStopId", destStopId,
                    "routeId", routeId,
                    "directionId", directionId,
                    "dayOfWeek", dayOfWeek
                    ));
            log.info("findPath() query finished executing");

            // Check if the result is empty (This means that this path is not feasible)
            if (!result.hasNext()) {
                return null;
            }

            // We are going to use this data to check if the route is viable for the current time
            List<Map<String, Object>> pathData = new ArrayList<>();
            while (result.hasNext()) {
                Map<String, Object> record = result.next();
                Map<String, Object> busStop = new HashMap<>();
                List<Map<String, Object>> arrivalTimes = new ArrayList<>();
                Map<String, Object> busStopData = (Map<String, Object>) record.get("busStopData");
                List<String> arrivalTimeList = (List<String>) record.get("arrivalTimes");
                List<String> tripIdList = (List<String>) record.get("tripIds");

                if (arrivalTimeList.size() == tripIdList.size()) {
                    for (int i = 0; i < arrivalTimeList.size(); i++) {
                        Map<String, Object> arrivalTime = new HashMap<>();
                        arrivalTime.put("arrival_time", arrivalTimeList.get(i));
                        arrivalTime.put("trip_id", tripIdList.get(i));
                        arrivalTimes.add(arrivalTime);
                    }
                } else {
                    throw new Error("arrivalTimes and tripIds aren't the same size: " + busStopData.get("properties"));
                }

                busStop.put("arrivalTimes", arrivalTimes);
                busStop.put("busStop", busStopData.get("properties"));
                busStop.put("routeId", routeId);
                busStop.put("directionId", directionId);

                pathData.add(busStop);
            };
            log.info("findPath() finished data preprocessing");

            PathResult path = generateAStarPathNoLimits(startNode, pathData, destLat, destLon);

            log.info("findPath() has finished");

            return path;
        }
    }

    // Generate a path from the startNode to the destination with pathData which contains the bus Stop nodes and their timetables
    private PathResult generateAStarPathNoLimits(AStarNode startNode, List<Map<String, Object>> pathData, double destLat, double destLon) {
        LocalTime currentTime = LocalTime.parse(startNode.currentTime, formatter);
        double waitTime = 0; // In minutes
        String tripId = null;


        // Initialise the first node //
        Map<String, Object> zeroNode = pathData.get(0); // pathData includes the data for the pathSegment starting from the startNode to the destNode
        Map<String, Object> firstNode = pathData.get(1);
        List<Map<String, Object>> arrivalTimes = (List<Map<String, Object>>) firstNode.get("arrivalTimes");
        String routeId = (String) firstNode.get("routeId");
        int directionId = (int) firstNode.get("directionId");

        Map<String, Object> busStop = (Map<String, Object>) firstNode.get("busStop");
        String stopId = (String) busStop.get("stop_id");

        // Then get the arrivalTime that is the closest
        LocalTime arrivalTime = arrivalTimes.stream()
                .filter(arrivalTimeData -> startNode.tripId.equals(arrivalTimeData.get("trip_id")))
                .map(arrivalTimeData -> LocalTime.parse((String) arrivalTimeData.get("arrival_time"), formatter))
                .findFirst()
                .orElse(null);


        if (arrivalTime == null) {
            Map<String, Object> arrivalTimeData = getArrivalTime(zeroNode, firstNode, currentTime, MAX_WAIT_TIME);
            if (!arrivalTimeData.isEmpty()) {
                arrivalTime = (LocalTime) arrivalTimeData.get("arrival_time");
                tripId = (String) arrivalTimeData.get("trip_id");
                waitTime = (double) arrivalTimeData.get("waitTime");
            }
        }

        if (arrivalTime == null || waitTime > MAX_WAIT_TIME) {
            AStarNode currentPathNode = addFinalWalkingEdge(zeroNode, startNode, currentTime, destLat, destLon);

            if (currentPathNode != null) {
                return reconstructPath(currentPathNode);
            }
        }

        if (arrivalTime == null) {
            return null;
        }
        currentTime = arrivalTime;

        AStarNode currentPathNode = new AStarNode(
                stopId,
                routeId,
                directionId,
                startNode,
                0,
                0,
                currentTime.toString(),
                startNode.totalTransfers + (waitTime > 0 ? 1 : 0),
                startNode.totalWaitTime + (int) Math.ceil(waitTime),
                startNode.totalWalkTime,
                tripId
        );

        // Add the node to visitedNodes if it has the earliest arrivalTime for that node
        AStarNode visitedNeighborNode = visitedNodes.getOrDefault(stopId, null);
        if (visitedNeighborNode == null ||
                arrivalTime.isBefore(LocalTime.parse(visitedNeighborNode.currentTime, formatter))) {
            visitedNodes.put(stopId, currentPathNode);
        }

        // We are going to check the rest of the path to see if it is viable
        for (int i = 2; i < pathData.size(); i++) {
            Map<String, Object> node = pathData.get(i);
            waitTime = 0;
            arrivalTimes = (List<Map<String, Object>>) node.get("arrivalTimes");
            busStop = (Map<String, Object>) node.get("busStop");
            routeId = (String) node.get("routeId");
            String _tripId = tripId;
            directionId = (int) node.get("directionId");

            // Find an arrivalTime that cannot be before the currentTime
            arrivalTime = arrivalTimes.stream()
                    .filter(arrivalTimeData -> _tripId.equals(arrivalTimeData.get("trip_id")))
                    .map(arrivalTimeData -> LocalTime.parse((String) arrivalTimeData.get("arrival_time"), formatter))
                    .findFirst()
                    .orElse(null);

            // If there is no trip_id for this node (IE. the bus didn't go all the way)
            if (arrivalTime == null) {
                Map<String, Object> arrivalTimeData = getClosestArrivalTime(arrivalTimes, currentTime, 0, TRANSFER_BUFFER);
                if (!arrivalTimeData.isEmpty()) {
                    arrivalTime = (LocalTime) arrivalTimeData.get("arrival_time");
                    tripId = (String) arrivalTimeData.get("trip_id");
                    waitTime = ((double) Duration.between(currentTime, arrivalTime).getSeconds()) / 60;
                }
            }

            if (arrivalTime == null || waitTime > MAX_WAIT_TIME) {
                AStarNode pathNode = addFinalWalkingEdge(zeroNode, startNode, currentTime, destLat, destLon);

                if (pathNode != null) {
                    return reconstructPath(pathNode);
                }
            }

            if (arrivalTime == null) {
                return null;
            }
            currentTime = arrivalTime;

            currentPathNode = new AStarNode(
                    (String) busStop.get("stop_id"),
                    routeId,
                    directionId,
                    currentPathNode,
                    0,
                    0,
                    currentTime.toString(),
                    currentPathNode.totalTransfers + (waitTime > 0 ? 1 : 0),
                    currentPathNode.totalWaitTime + (int) Math.ceil(waitTime),
                    currentPathNode.totalWalkTime,
                    tripId
            );

            visitedNeighborNode = visitedNodes.getOrDefault(stopId, null);
            if (visitedNeighborNode == null ||
                    arrivalTime.isBefore(LocalTime.parse(visitedNeighborNode.currentTime, formatter))) {
                visitedNodes.put(stopId, currentPathNode);
            }
        }

        // Create the last node
        Map<String, Object> lastPathNode = pathData.get(pathData.size() - 1);
        currentPathNode = addFinalWalkingEdge(lastPathNode, currentPathNode, currentTime, destLat, destLon);

        return reconstructPath(Objects.requireNonNull(currentPathNode));
    }

    // Generate a path from the startNode to the destination with pathData which contains the bus Stop nodes and their timetables
    private PathResult generateAStarPath(AStarNode startNode, List<Map<String, Object>> pathData, double destLat, double destLon) {
        LocalTime currentTime = LocalTime.parse(startNode.currentTime, formatter);
        LocalTime arrivalTime = null;
        String tripId = null;
        double waitTime = 0; // In minutes
        String routeId = null;

        Map<String, Object> zeroNode = pathData.get(0);
        Map<String, Object> firstNode = pathData.get(1);


        // Initialise the first node //
        List<Map<String, Object>> arrivalTimes = (List<Map<String, Object>>) firstNode.get("arrivalTimes");
        routeId = (String) firstNode.get("routeId");
        int directionId = (int) firstNode.get("directionId");

        Map<String, Object> busStop = (Map<String, Object>) firstNode.get("busStop");
        String stopId = (String) busStop.get("stop_id");

        // Check if current tripId leads us to the next node
        if (startNode.tripId != null) {
            tripId = startNode.tripId;
            arrivalTime = arrivalTimes.stream()
                    .filter(arrivalTimeData -> startNode.tripId.equals(arrivalTimeData.get("trip_id")))
                    .map(arrivalTimeData -> LocalTime.parse((String) arrivalTimeData.get("arrival_time"), formatter))
                    .findFirst()
                    .orElse(null);
        }

        // If not; see if waiting for the next bus is viable
        if (arrivalTime == null) {
            Map<String, Object> arrivalTimeData = getArrivalTime(zeroNode, firstNode, currentTime, MAX_WAIT_TIME);
            if (!arrivalTimeData.isEmpty()) {
                arrivalTime = (LocalTime) arrivalTimeData.get("arrival_time");
                tripId = (String) arrivalTimeData.get("trip_id");
                waitTime = (double) arrivalTimeData.get("waitTime");
            }
        }

        // If none of these options are viable; create a walk edge for the rest of the path.
        if (arrivalTime == null) {
            // currentPathNode points to the previous iteration; the same node that prevNode represents
            AStarNode currentPathNode = addFinalWalkingEdge(zeroNode, startNode, currentTime, destLat, destLon);

            if (currentPathNode == null) {
                return null;
            }

            return reconstructPath(currentPathNode);
        }
        currentTime = arrivalTime;

        AStarNode currentPathNode = new AStarNode(
                stopId,
                routeId,
                directionId,
                startNode,
                0,
                0,
                currentTime.toString(),
                startNode.totalTransfers + (waitTime > 0 ? 1 : 0),
                startNode.totalWaitTime + (int) Math.ceil(waitTime),
                startNode.totalWalkTime,
                tripId
        );

        // Add the node to visitedNodes if it has the earliest arrivalTime for that node
        AStarNode visitedNeighborNode = visitedNodes.getOrDefault(stopId, null);
        if (visitedNeighborNode == null ||
                arrivalTime.isBefore(LocalTime.parse(visitedNeighborNode.currentTime, formatter))) {
            visitedNodes.put(stopId, currentPathNode);
        }


        // Create the rest of the path //
        for (int i = 2; i < pathData.size(); i++) {
            Map<String, Object> node = pathData.get(i);
            String _tripId = tripId;
            waitTime = 0;
            arrivalTimes = (List<Map<String, Object>>) node.get("arrivalTimes");
            busStop = (Map<String, Object>) node.get("busStop");
            routeId = (String) node.get("routeId");
            directionId = (int) node.get("directionId");

            // Find an arrivalTime that cannot be before the currentTime
            arrivalTime = arrivalTimes.stream()
                    .filter(arrivalTimeData -> _tripId.equals(arrivalTimeData.get("trip_id")))
                    .map(arrivalTimeData -> LocalTime.parse((String) arrivalTimeData.get("arrival_time"), formatter))
                    .findFirst()
                    .orElse(null);
            if (arrivalTime == null) {
                Map<String, Object> prevNode = pathData.get(i-1);

                Map<String, Object> arrivalTimeData = getArrivalTime(prevNode, node, currentTime, MAX_WAIT_TIME);
                if (!arrivalTimeData.isEmpty()) {
                    arrivalTime = (LocalTime) arrivalTimeData.get("arrival_time");
                    tripId = (String) arrivalTimeData.get("trip_id");
                    waitTime = (double) arrivalTimeData.get("waitTime");
                }
            }

            // If there is no trip_id for this node (IE. the bus didn't go all the way)
            if (arrivalTime == null) {
                Map<String, Object> prevNode = pathData.get(i - 1);
                currentPathNode = addFinalWalkingEdge(prevNode, currentPathNode, currentTime, destLat, destLon);

                if (currentPathNode == null) {
                    return null;
                }

                return reconstructPath(currentPathNode);
            }
            currentTime = arrivalTime;

            currentPathNode = new AStarNode(
                    (String) busStop.get("stop_id"),
                    routeId,
                    directionId,
                    currentPathNode,
                    0,
                    0,
                    currentTime.toString(),
                    currentPathNode.totalTransfers + (waitTime > 0 ? 1 : 0),
                    currentPathNode.totalWaitTime + (int) Math.ceil(waitTime),
                    currentPathNode.totalWalkTime,
                    tripId
            );

            visitedNeighborNode = visitedNodes.getOrDefault(stopId, null);
            if (visitedNeighborNode == null ||
                    arrivalTime.isBefore(LocalTime.parse(visitedNeighborNode.currentTime, formatter))) {
                visitedNodes.put(stopId, currentPathNode);
            }
        }

        // Create the last node
        Map<String, Object> lastPathNode = pathData.get(pathData.size() - 1);
        currentPathNode = addFinalWalkingEdge(lastPathNode, currentPathNode, currentTime, destLat, destLon);

        return reconstructPath(Objects.requireNonNull(currentPathNode));
    }

    // Adds the final walking edge from the current node to the destination
    private AStarNode addFinalWalkingEdge(Map<String, Object> startNode, AStarNode startAStarNode, LocalTime currentTime, double destLat, double destLon) {
        Map<String, Object> busStop = (Map<String, Object>) startNode.get("busStop");

        double startLat = (double) busStop.get("stop_lat");
        double startLon = (double) busStop.get("stop_lon");

        double walkDistance = calculateDistance(
                startLat,
                startLon,
                destLat,
                destLon
        );
        // If it is longer than a 30 minute walk, return null
        if (walkDistance * 60 / (AVERAGE_WALK_SPEED * 1000) > MAX_WALK_TIME) {
            return null;
        }
        double walkTime = walkDistance * 60 / (AVERAGE_WALK_SPEED * 1000); // In minutes
        LocalTime destArrivalTime = currentTime.plusMinutes((int) Math.ceil(walkTime));

        return new AStarNode(
                "destination",
                "WALKS_TO",
                0,
                startAStarNode,
                0,
                0,
                destArrivalTime.toString(),
                startAStarNode.totalTransfers,
                startAStarNode.totalWaitTime,
                startAStarNode.totalWalkTime + (int) Math.ceil(walkTime),
                null
        );
    }

    private Map<String, Object> getArrivalTime(Map<String, Object> startNode, Map<String, Object> endNode, LocalTime currentTime, long maxWaitTime) {
        List<Map<String, Object>> startArrivalTimes = (List<Map<String, Object>>) startNode.get("arrivalTimes");
        List<Map<String, Object>> endArrivalTimes = (List<Map<String, Object>>) endNode.get("arrivalTimes");

        // Filter out the arrivalTimes that aren't in endArrivalTimes
        startArrivalTimes = startArrivalTimes.stream()
                .filter(startTime -> endArrivalTimes.stream()
                        .anyMatch(endTime -> startTime.get("trip_id").equals(endTime.get("trip_id"))))
                .collect(Collectors.toList());

        Map<String, Object> startArrivalTimeData = getClosestArrivalTime(startArrivalTimes, currentTime, maxWaitTime, TRANSFER_BUFFER);
        if (startArrivalTimeData.isEmpty()) {
            return Collections.emptyMap();
        }
        LocalTime startArrivalTime = (LocalTime) startArrivalTimeData.get("arrival_time");
        String tripId = (String) startArrivalTimeData.get("trip_id");
        double waitTime = ((double) Duration.between(currentTime, startArrivalTime).getSeconds()) / 60; // In minutes

        Map<String, Object> endArrivalTimeData = endArrivalTimes.stream()
                .filter(arrivalTimeData -> tripId.equals(arrivalTimeData.get("trip_id")))
                .findFirst()
                .orElse(null);
        if (endArrivalTimeData == null) {
            return Collections.emptyMap();
        }
        endArrivalTimeData.put("waitTime", waitTime);

        return endArrivalTimeData;
    }

    // Returns the closest arrivalTime that is after the input parameter
    // Returns {arrival_time: , trip_id: }
    // If waitTime == 0, it will try to find an arrivalTime no matter how long the waiting time is.
    private Map<String, Object> getClosestArrivalTime(List<Map<String, Object>> arrivalTimes, LocalTime approxArrivalTime, long waitTime, long transferBuffer) {
        Optional<Map<String, Object>> closestArrivalTime = arrivalTimes.stream()
                .map(trip -> {
                    Map<String, Object> arrivalTimeData = new HashMap<>();
                    arrivalTimeData.put("arrival_time", LocalTime.parse((String) trip.get("arrival_time"), formatter));
                    arrivalTimeData.put("trip_id", trip.get("trip_id"));

                    return arrivalTimeData;
                })
                .filter(arrivalTimeData -> {
                    LocalTime arrivalTime = (LocalTime) arrivalTimeData.get("arrival_time");
                    return !arrivalTime.isBefore(approxArrivalTime.plusMinutes(transferBuffer)) && // Transfer Buffer
                           (!arrivalTime.isAfter(approxArrivalTime.plusMinutes(waitTime)) || waitTime == 0);  // Wait Time
                    }
                )
                .min(Comparator.comparing(arrivalTimeData -> (LocalTime) arrivalTimeData.get("arrival_time")));

        return closestArrivalTime.orElse(Collections.emptyMap());
    }

    // Checks for all neighboring nodes connected by BUS_ROUTE or WALKS_TO
    private List<Map<String, Object>> getNeighbors(AStarNode currentNode, String dow) {

        log.info("getNeighbors() has started");
        try (Transaction tx = db.beginTx()) {
            LocalTime currentTime = LocalTime.parse(currentNode.currentTime, formatter);
            String busRouteQuery =
                    "MATCH (n)-[:HAS_TIMETABLE]->(t1:Timetable),\n" +
                        "(m)-[:HAS_TIMETABLE]->(t2:Timetable),\n" +
                        "(n)-[r:BUS_ROUTE]->(m)\n" +
                    "WHERE n.stop_id = $startStopId\n" +
                        "AND t1.route_id = r.route_id\n" +
                        "AND t1.direction_id = r.direction_id\n" +
                        "AND t1.day = $dow\n" +
                        "AND t2.route_id = r.route_id\n" +
                        "AND t2.direction_id = r.direction_id\n" +
                        "AND t2.day = $dow\n" +
                    "RETURN m.stop_id AS stopId, \n" +
                        "r.route_id AS routeId, \n" +
                        "r.direction_id AS directionId, \n" +
                        "t1.arrival_times AS currentArrivalTimes, \n" +
                        "t2.arrival_times AS neighborArrivalTimes";
            Result busRouteResult = tx.execute(busRouteQuery, Map.of(
                    "startStopId", currentNode.busStopId,
                    "dow", dow
            ));
            log.info("getNeighbors() BUS_ROUTE query has finished executing");

            List<Map<String, Object>> neighbors = new ArrayList<>();
            while (busRouteResult.hasNext()) {
                Map<String, Object> record = busRouteResult.next();
                Map<String, Object> neighbor = new HashMap<>();
                neighbor.put("stopId", record.get("stopId"));
                neighbor.put("routeId", record.get("routeId"));
                neighbor.put("directionId", record.get("directionId"));
                //neighbor.put("travelTime", null);

                List<Map<String, Object>> currentArrivalTimes = (List<Map<String, Object>>) record.get("currentArrivalTimes");
                List<Map<String, Object>> neighborArrivalTimes = (List<Map<String, Object>>) record.get("neighborArrivalTimes");
                Optional<Map<String, Object>> neighborArrivalTime = neighborArrivalTimes.stream()
                        .filter(arrivalTime -> Objects.equals(currentNode.tripId, arrivalTime.get("trip_id")))
                        .findFirst();

                if (!neighborArrivalTime.isPresent()) {
                    // TODO: Check if currentArrivalTime is empty
                    Map<String, Object> currentArrivalTime = getClosestArrivalTime(currentArrivalTimes, currentTime, 20, 5);
                    double waitTime = (double) Duration.between(
                            (LocalTime) currentArrivalTime.get("arrival_time"), currentTime
                            ).getSeconds() / 60;

                    if (waitTime > MAX_WAIT_TIME) {
                        continue;
                    }

                    neighbor.put("waitTime", (int) Math.ceil(waitTime)); // In minutes

                    neighborArrivalTime = neighborArrivalTimes.stream()
                            .filter(arrivalTime -> Objects.equals(currentArrivalTime.get("trip_id"), arrivalTime.get("trip_id")))
                            .findFirst();
                    if (!neighborArrivalTime.isPresent()) {
                        continue;
                    }
                }

                Map<String, Object> result = neighborArrivalTime.get();
                neighbor.put("tripId", result.get("trip_id"));
                neighbor.put("arrivalTime", result.get("arrival_time"));

                neighbors.add(neighbor);
            };
            log.info("getNeighbors() finished data preprocessing for bus routes");


            String walkToQuery =
                    "MATCH (n)-[r:WALKS_TO]->(m) " +
                    "WHERE n.stop_id = $startStopId " +
                    "RETURN m.stop_id as stopId, r.distance AS distanceWalked";
            Result walkToResult = tx.execute(walkToQuery, Map.of("startStopId", currentNode.busStopId));
            log.info("getNeighbors() WALKS_TO query has finished executing");

            while (walkToResult.hasNext()) {
                Map<String, Object> record = walkToResult.next();
                Map<String, Object> neighbor = new HashMap<>();
                neighbor.put("stopId", record.get("stopId"));
                double distanceWalked = (double) record.get("distanceWalked");
                neighbor.put("arrivalTime", currentTime.plusSeconds((long) (distanceWalked * 3600 / (AVERAGE_WALK_SPEED * 1000))) );

                neighbor.put("routeId", "WALKS_TO");
                neighbors.add(neighbor);
            };
            log.info("getNeighbors() finished data preprocessing for walk routes");

            return neighbors;
        }
    }

    private PathResult reconstructPath(AStarNode node) {
        List<PathSegment> path = new ArrayList<>();
        long totalWaitTime = node.totalWaitTime;
        long totalTransfers = node.totalTransfers;

        List<BusStop> currentBusStops = new ArrayList<>();
        String currentRouteId = null;
        String currentSegmentType = null;

        int waitTime = 0;
        int currentTotalWaitTime = node.totalWaitTime;

        AStarNode currentNode = node;
        while (currentNode != null) {
            BusStop currentBusStop = new BusStop(currentNode.busStopId);

            // If this iteration takes a different routeId
            if (!currentNode.routeId.equals(currentRouteId)) {
                // Save the current routeId's PathSegment and clear the temp variable currentBusStops
                if (!currentBusStops.isEmpty()) { // Unless if we just started the iteration (when currentBusStops will be empty)
                    currentBusStops.add(currentBusStop);
                    path.add(new PathSegment(
                            new ArrayList<>(currentBusStops),
                            currentRouteId,
                            currentSegmentType,
                            waitTime
                    ));

                    // Reset Segment metadata (Since we are starting a new segment)
                    waitTime = 0;
                    currentBusStops.clear();
                }

                // Determine the new segment (current iteration) is a walk or bus route segment
                if (currentNode.routeId.equals("WALKS_TO")) {
                    currentRouteId = null;
                    currentSegmentType = "WALKS_TO";
                } else {
                    // Reset for the new bus route segment
                    currentRouteId = currentNode.routeId;
                    currentSegmentType = "BUS_ROUTE";
                }
            }

            // Add the current bus stop to the current segment
            currentBusStops.add(currentBusStop);
            waitTime += Math.abs(currentTotalWaitTime - currentNode.totalWaitTime); // Remember waitTime is recorded on the bus stop one AFTER the stop the user transfered on
            currentTotalWaitTime = currentNode.totalWaitTime;

            // Continue to the next iteration
            currentNode = currentNode.previous;
        }

        // Add the final segment
        if (!currentBusStops.isEmpty()) {
            path.add(new PathSegment(
                    currentBusStops,
                    currentRouteId,
                    currentSegmentType,
                    waitTime
            ));
        }

        // Reverse the list since we reconstruct the path backward
        Collections.reverse(path);

        return new PathResult(path, totalWaitTime, totalTransfers);
    }

    public static class AStarNode {
        String busStopId;
        String routeId;
        int directionId;
        String tripId;
        AStarNode previous;
        double gScore; // In minutes
        double fScore;
        String currentTime;
        int totalTransfers; // Cumulative; Variable used for path traversal (maxTransfers), not for users to view
        int totalWaitTime; // In minutes
        int totalWalkTime; // In minutes

        // TODO: Fix all gScore initialisations
        AStarNode(String busStopId, String routeId, int directionId, AStarNode previous, double gScore, double fScore, String currentTime, int totalTransfers, int totalWaitTime, int totalWalkTime, String tripId) {
            this.busStopId = busStopId;
            this.routeId = routeId;
            this.directionId = directionId;
            this.previous = previous;
            this.gScore = gScore;
            this.fScore = fScore;
            this.currentTime = currentTime;
            this.totalTransfers = totalTransfers;
            this.totalWaitTime = totalWaitTime;
            this.tripId = tripId;
            this.totalWalkTime = totalWalkTime;
        }
    }

    public static class PathResult {
        public List<Map<String, Object>> path;
        public long totalTransfers;
        public long totalWaitTime;

        public PathResult(List<PathSegment> path, long totalWaitTime, long totalTransfers) {
            this.path = path.stream()
                    .map(segment -> Map.of(
                            "pathSegment", segment.pathSegment.stream().map(busStop -> Map.of(
                                    "stopId", busStop.busStopId
                            )).toList(),
                            "routeId", segment.routeId,
                            "waitTime", segment.waitTime,
                            "segmentType", segment.segmentType
                    ))
                    .toList();;
            this.totalTransfers = totalTransfers;
            this.totalWaitTime = totalWaitTime;
        }
    }

    public static class PathSegment {
        public List<BusStop> pathSegment;
        public String routeId;
        public double waitTime;
        public String segmentType;

        public PathSegment(List<BusStop> pathSegment, String routeId, String segmentType, double waitTime) {
            this.pathSegment = pathSegment;
            this.routeId = routeId;
            this.segmentType = segmentType;
            this.waitTime = waitTime;
        }

        public Map<String, Object> toMap() {
            List<Map<String, Object>> busStops = pathSegment.stream()
                    .map(busStop -> Map.of("stopId", (Object) busStop.busStopId)) // Assuming BusStop has a getBusStopId method
                    .toList();

            return Map.of(
                    "path", busStops,
                    "routeId", routeId,
                    "segmentType", segmentType,
                    "waitTime", waitTime
            );
        }
    }

    public static class BusStop {
        String busStopId;

        public BusStop(String busStopId) {
            this.busStopId = busStopId;
        }

    }
}