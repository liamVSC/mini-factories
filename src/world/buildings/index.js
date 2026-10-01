export {
  buildingPhysicalPlacementReason,
  buildingHitbox,
  buildingAtPoint,
  nearestBuilding,
  buildingFootprint,
  buildingDockPoints,
  buildingConnectionPoint
} from './geometry.js';

export {
  resolveBuildingRoadEndpoint,
  buildingRoadDistance,
  resolveBuildingRoadTarget,
  buildingRoadAttachment,
  buildingRoadEndpointClearance,
  nearestBuildingRoadTarget
} from './connections.js';

export {
  buildingPlacementTarget,
  buildingLogisticsAccess
} from './placement.js';

export {
  buildingCost,
  buildingUnlock,
  canBuild,
  canPlaceBuildingAt,
  placeBuilding,
  seed
} from './operations.js';

export {
  FACTORY_MIN_DISTANCE,
  FACTORY_MIN_SPAWN_RADIUS,
  buildingOverlaps,
  buildingPlacementConflict,
  validateBuildingLayout,
  repairBuildingLayout,
  factorySpawnCandidates,
  layoutIsValid
} from './layout.js';
