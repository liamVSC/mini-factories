import {dist,length,pointOnRoute} from './world/roads/geometry.js';
import {riverY,WORLD_SIZE,WORLD_HALF_SIZE,WORLD_BOUNDS,WORLD_CONSTRUCTION_MARGIN,WORLD_MARGIN,WORLD_EDGE_SNAP_DISTANCE} from './world/terrain.js';
import {roadBuildingTarget,nearestRoad,snapRoadPoint,snap,segmentNearRiver,roadPathBlocked,roadPathIntersectsBuildingFootprint,simplifyRoad,snapToWorldEdge,roadTarget,roadPreview} from './world/roads/placement.js';
import {addRoad} from './world/roads/creation.js';
import {routeOnRoadNetwork} from './world/roads/routing.js';
export {buildingPhysicalPlacementReason,buildingHitbox,buildingAtPoint,nearestBuilding,buildingFootprint,buildingDockPoints,buildingConnectionPoint,buildingCost,buildingUnlock,canBuild,canPlaceBuildingAt,buildingPlacementTarget,placeBuilding,spawn,seed,buildingLogisticsAccess};
export {riverY,district,WORLD_SIZE,WORLD_HALF_SIZE,WORLD_BOUNDS,WORLD_CONSTRUCTION_MARGIN,WORLD_MARGIN,WORLD_EDGE_SNAP_DISTANCE} from './world/terrain.js';
export {isInsideWorldBounds} from './world/roads/validation.js';
export {dist,length,pointOnRoute};
export {roadBuildingTarget,nearestRoad,snapRoadPoint,snap,segmentNearRiver,roadPathBlocked,roadPathIntersectsBuildingFootprint,simplifyRoad,snapToWorldEdge,roadTarget,roadPreview};
import {roadNetwork} from './world/roads/topology.js';
import {buildingPhysicalPlacementReason,buildingHitbox,buildingAtPoint,nearestBuilding,buildingFootprint,buildingDockPoints,buildingConnectionPoint} from './world/buildings/geometry.js';
import {buildingCost,buildingUnlock,canBuild,canPlaceBuildingAt,buildingPlacementTarget,placeBuilding,spawn,seed,buildingLogisticsAccess} from './world/buildings/operations.js';



export {addRoad,roadAtPoint,roadSegmentAtPoint,roadEndpointCandidate,roadEndpointAtPoint,endpointTarget,roadEndpointPreview,editRoadSegment,editRoadEndpoint,endpointSegmentBlocked,eraseRoad,cleanupRoadNetwork} from './world/roads/editing.js';
export {roadNetwork,roadTopology,nearestGraphNode,shortestRoadPath,bumpRoadNetworkRevision} from './world/roads/topology.js';
export {roadAttachment,routeOnRoadNetwork,roadPath,connectedRoadComponents,isRouteStale} from './world/roads/routing.js';
