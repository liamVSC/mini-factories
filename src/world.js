export {addRoad} from './world/roads/creation.js';

export {
  dist,
  length,
  pointOnRoute
} from './world/roads/geometry.js';

export {
  roadBuildingTarget,
  nearestRoad,
  snapRoadPoint,
  snap,
  segmentNearRiver,
  roadPathBlocked,
  roadPathIntersectsBuildingFootprint,
  simplifyRoad,
  snapToWorldEdge,
  roadTarget,
  roadPreview
} from './world/roads/placement.js';

export {isInsideWorldBounds} from './world/roads/validation.js';

export {
  roadAtPoint,
  roadSegmentAtPoint,
  roadEndpointCandidate,
  roadEndpointAtPoint,
  endpointTarget,
  roadEndpointPreview,
  editRoadSegment,
  editRoadEndpoint,
  endpointSegmentBlocked,
  eraseRoad,
  cleanupRoadNetwork
} from './world/roads/editing.js';

export {
  roadNetwork,
  roadTopology,
  nearestGraphNode,
  shortestRoadPath,
  bumpRoadNetworkRevision
} from './world/roads/topology.js';

export {
  roadAttachment,
  routeOnRoadNetwork,
  roadPath,
  connectedRoadComponents,
  isRouteStale
} from './world/roads/routing.js';

export {
  buildingPhysicalPlacementReason,
  buildingHitbox,
  buildingAtPoint,
  nearestBuilding,
  buildingFootprint,
  buildingDockPoints,
  buildingConnectionPoint
} from './world/buildings/geometry.js';

export {
  buildingCost,
  buildingUnlock,
  canBuild,
  canPlaceBuildingAt,
  buildingPlacementTarget,
  placeBuilding,
  spawn,
  seed,
  buildingLogisticsAccess
} from './world/buildings/operations.js';

export {
  riverY,
  district,
  WORLD_SIZE,
  WORLD_HALF_SIZE,
  WORLD_BOUNDS,
  WORLD_CONSTRUCTION_MARGIN,
  WORLD_MARGIN,
  WORLD_EDGE_SNAP_DISTANCE
} from './world/terrain.js';
