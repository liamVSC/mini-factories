import type { Building, BuildingType, GameState } from '../../state.js';
import { finitePoint } from '../roads/geometry.js';
import { isInsideWorldBounds } from '../roads/validation.js';
import { riverY, WORLD_MARGIN } from '../terrain.js';

export function buildingClearance(a: Pick<Building, 'kind'>, b: Pick<Building, 'kind'>): number {
  if (a.kind === 'factory' && b.kind === 'factory') return 55;
  if (a.kind === 'factory' || b.kind === 'factory') return 36;
  return 18;
}

interface Footprint {
  halfWidth: number;
  halfDepth: number;
}

const PLACEMENT_FOOTPRINTS: Readonly<Record<string, Footprint>> = Object.freeze({
  warehouse: Object.freeze({ halfWidth: 132, halfDepth: 190 }),
  factory: Object.freeze({ halfWidth: 116, halfDepth: 168 }),
  shop: Object.freeze({ halfWidth: 108, halfDepth: 146 }),
  default: Object.freeze({ halfWidth: 56, halfDepth: 72 })
});

function footprintForKind(kind: string | undefined): Footprint {
  return PLACEMENT_FOOTPRINTS[kind ?? 'default'] ?? PLACEMENT_FOOTPRINTS.default;
}

const ROAD_CONNECTION_FOOTPRINTS: Readonly<Record<string, Footprint>> = Object.freeze({
  warehouse: Object.freeze({ halfWidth: 52, halfDepth: 40 }),
  factory: Object.freeze({ halfWidth: 44, halfDepth: 36 }),
  shop: Object.freeze({ halfWidth: 40, halfDepth: 40 }),
  default: Object.freeze({ halfWidth: 40, halfDepth: 40 })
});

function roadConnectionFootprintForKind(kind: string | undefined): Footprint {
  return ROAD_CONNECTION_FOOTPRINTS[kind ?? 'default'] ?? ROAD_CONNECTION_FOOTPRINTS.default;
}

export function buildingRoadFootprint(building: Pick<Building, 'kind'>): Footprint {
  return roadConnectionFootprintForKind(building.kind);
}

export function buildingVisualFootprint(building: Pick<Building, 'kind'>): Footprint {
  return { ...(PLACEMENT_FOOTPRINTS[building.kind] ?? PLACEMENT_FOOTPRINTS.default) };
}

export interface BuildingHitbox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function buildingVisualHitbox(
  building: Pick<Building, 'kind' | 'x' | 'y'>,
  tolerance = 0
): BuildingHitbox {
  const footprint = buildingVisualFootprint(building);
  const x = Number(building.x);
  const y = Number(building.y);
  return {
    minX: x - footprint.halfWidth - tolerance,
    maxX: x + footprint.halfWidth + tolerance,
    minY: y - footprint.halfDepth - tolerance,
    maxY: y + footprint.halfDepth + tolerance
  };
}

function overlapsBuilding(
  candidate: { kind: Building['kind']; x: number; y: number; footprint: Footprint },
  building: Building,
  clearance: number
): boolean {
  const other = buildingSiteFootprint(building);
  const overlapX =
    Math.abs(Number(building.x) - candidate.x) <
    candidate.footprint.halfWidth + other.halfWidth + clearance;
  const overlapY =
    Math.abs(Number(building.y) - candidate.y) <
    candidate.footprint.halfDepth + other.halfDepth + clearance;
  return overlapX && overlapY;
}

export function buildingPhysicalPlacementReason(
  state: Pick<GameState, 'buildings'>,
  type: BuildingType | null | undefined,
  x: number,
  y: number
): string | null {
  if (!type) return 'Unknown building';
  const px = Number(x);
  const py = Number(y);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return 'Invalid placement';
  if (!isInsideWorldBounds({ x: px, y: py }, WORLD_MARGIN)) return 'Outside the playable area';

  const candidate = {
    kind: type.kind,
    x: px,
    y: py,
    footprint: buildingSiteFootprint({ kind: type.kind } as Pick<Building, 'kind'>)
  };
  for (const building of state.buildings) {
    if (!finitePoint(building)) continue;
    if (
      candidate.kind === 'factory' &&
      building.kind === 'factory' &&
      Math.hypot(px - Number(building.x), py - Number(building.y)) < 250
    ) {
      return 'Too close to another factory';
    }
    if (overlapsBuilding(candidate, building, buildingClearance(candidate, building))) {
      return candidate.kind === 'factory' && building.kind === 'factory'
        ? 'Too close to another factory'
        : 'Too close to another building';
    }
  }

  const riverClearance =
    105 + Math.max(candidate.footprint.halfDepth, candidate.footprint.halfWidth) * 0.18;
  if (Math.abs(py - riverY(px)) < riverClearance) return 'Too close to the river';

  const yard = buildingYardHitbox({ kind: type.kind, x: px, y: py });
  const yardPoints = [
    { x: yard.minX, y: yard.minY },
    { x: yard.maxX, y: yard.minY },
    { x: yard.minX, y: yard.maxY },
    { x: yard.maxX, y: yard.maxY },
    { x: (yard.minX + yard.maxX) / 2, y: (yard.minY + yard.maxY) / 2 }
  ];
  if (yardPoints.some(point => !isInsideWorldBounds(point, WORLD_MARGIN))) {
    return 'Building yard is outside the playable area';
  }
  const yardRiverClearance = 70;
  if (yardPoints.some(point => Math.abs(point.y - riverY(point.x)) < yardRiverClearance)) {
    return 'Building yard is too close to the river';
  }
  return null;
}

export function buildingHitbox(
  building: Pick<Building, 'kind' | 'x' | 'y'>,
  tolerance = 0
): BuildingHitbox {
  const footprint = buildingFootprint(building);
  return {
    minX: building.x - footprint.halfWidth - tolerance,
    maxX: building.x + footprint.halfWidth + tolerance,
    minY: building.y - footprint.halfDepth - tolerance,
    maxY: building.y + footprint.halfDepth + tolerance
  };
}

export function buildingAtPoint(
  state: Pick<GameState, 'buildings'>,
  point: { x: number; y: number },
  tolerance = 10
): Building | null {
  if (!finitePoint(point)) return null;

  let best: Building | null = null;
  let bestDistance = Infinity;
  for (const building of state.buildings) {
    const hit = buildingHitbox(building, tolerance);
    const dx = Math.max(hit.minX - point.x, 0, point.x - hit.maxX);
    const dy = Math.max(hit.minY - point.y, 0, point.y - hit.maxY);
    const distance = Math.hypot(dx, dy);

    if (distance <= tolerance && distance < bestDistance) {
      best = building;
      bestDistance = distance;
    }
  }
  return best;
}

export function nearestBuilding(
  state: Pick<GameState, 'buildings'>,
  point: { x: number; y: number }
): Building | null {
  return buildingAtPoint(state, point, 18);
}

const SHELL_FOOTPRINTS: Readonly<Record<string, Footprint>> = Object.freeze({
  warehouse: Object.freeze({ halfWidth: 112, halfDepth: 78 }),
  factory: Object.freeze({ halfWidth: 100, halfDepth: 76 }),
  shop: Object.freeze({ halfWidth: 94, halfDepth: 62 }),
  default: Object.freeze({ halfWidth: 54, halfDepth: 44 })
});

export function buildingFootprint(building: Pick<Building, 'kind'>): Footprint {
  return SHELL_FOOTPRINTS[building.kind] ?? SHELL_FOOTPRINTS.default;
}

export function buildingSiteFootprint(building: Pick<Building, 'kind'>): Footprint {
  return footprintForKind(building.kind);
}

interface DockSpec {
  name: string;
  x: number;
  y: number;
  normal: { x: number; y: number };
  width: number;
}

const DOCK_SPECS: Readonly<Record<string, readonly DockSpec[]>> = {
  factory: [
    { name: 'north-loading', x: 0, y: 76, normal: { x: 0, y: 1 }, width: 34 },
    { name: 'south-loading', x: -44, y: -76, normal: { x: 0, y: -1 }, width: 22 }
  ],
  warehouse: [
    { name: 'north-main', x: 0, y: 78, normal: { x: 0, y: 1 }, width: 38 },
    { name: 'north-secondary', x: -58, y: 78, normal: { x: 0, y: 1 }, width: 22 },
    { name: 'south-secondary', x: 58, y: -78, normal: { x: 0, y: -1 }, width: 22 }
  ],
  default: [
    { name: 'front-entrance', x: 0, y: -62, normal: { x: 0, y: -1 }, width: 22 }
  ]
};

export interface BuildingDock extends DockSpec {
  point: { x: number; y: number };
  approach: { x: number; y: number };
}

export function buildingDockPoints(building: Pick<Building, 'kind' | 'x' | 'y'>): BuildingDock[] {
  const x = Number(building.x) || 0;
  const y = Number(building.y) || 0;
  const specs = DOCK_SPECS[building.kind] ?? DOCK_SPECS.default;

  return specs.map(dock => ({
    ...dock,
    point: { x: x + dock.x, y: y + dock.y },
    approach: {
      x: x + dock.x + dock.normal.x * 12,
      y: y + dock.y + dock.normal.y * 12
    }
  }));
}

export function buildingPrimaryDock(
  building: Pick<Building, 'kind' | 'x' | 'y'>
): BuildingDock | null {
  return buildingDockPoints(building)[0] ?? null;
}

export interface BuildingYard {
  dock: BuildingDock;
  entrance: BuildingRoadEntrance;
  hitbox: BuildingHitbox;
}

/** The reserved exterior access area between a building dock and its road gate. */
export function buildingYardHitbox(
  building: Pick<Building, 'kind' | 'x' | 'y'>,
  tolerance = 0
): BuildingHitbox {
  const dock = buildingPrimaryDock(building);
  const entrance = buildingRoadEntrance(building);
  if (!dock || !entrance) return buildingRoadHitbox(building, tolerance);
  const centerX = (dock.point.x + entrance.x) / 2;
  const centerY = (dock.point.y + entrance.y) / 2;
  const along = Math.max(10, Math.hypot(entrance.x - dock.point.x, entrance.y - dock.point.y) / 2 + 12 + tolerance);
  const across = Math.max(10, dock.width / 2 + 12 + tolerance);
  const horizontal = Math.abs(dock.normal.x) > Math.abs(dock.normal.y);
  return {
    minX: centerX - (horizontal ? along : across),
    maxX: centerX + (horizontal ? along : across),
    minY: centerY - (horizontal ? across : along),
    maxY: centerY + (horizontal ? across : along)
  };
}

export function buildingYard(building: Pick<Building, 'kind' | 'x' | 'y'>): BuildingYard | null {
  const dock = buildingPrimaryDock(building);
  const entrance = buildingRoadEntrance(building);
  if (!dock || !entrance) return null;
  return { dock, entrance, hitbox: buildingYardHitbox(building) };
}

export interface BuildingRoadEntrance {
  x: number;
  y: number;
  building: Pick<Building, 'kind' | 'x' | 'y'>;
}

export function buildingRoadEntrance(
  building: Pick<Building, 'kind' | 'x' | 'y'>
): BuildingRoadEntrance | null {
  const dock = buildingPrimaryDock(building);
  if (!dock) return null;
  const gateOffset = 62;
  return {
    x: dock.approach.x + dock.normal.x * gateOffset,
    y: dock.approach.y + dock.normal.y * gateOffset,
    building
  };
}

export function buildingRoadHitbox(
  building: Pick<Building, 'kind' | 'x' | 'y'>,
  tolerance = 0
): BuildingHitbox {
  const footprint = buildingRoadFootprint(building);
  return {
    minX: Number(building.x) - footprint.halfWidth - tolerance,
    maxX: Number(building.x) + footprint.halfWidth + tolerance,
    minY: Number(building.y) - footprint.halfDepth - tolerance,
    maxY: Number(building.y) + footprint.halfDepth + tolerance
  };
}

export function buildingConnectionPoint(
  building: Pick<Building, 'kind' | 'x' | 'y'>,
  _target: { x: number; y: number },
  _exteriorOffset = 2.5
): BuildingRoadEntrance | null {
  const entrance = buildingRoadEntrance(building);
  return entrance;
}

export function buildingFootprintRadius(building: Pick<Building, 'kind' | 'r'>): number {
  const footprint = buildingRoadFootprint(building);
  return Math.max(
    26,
    (building.r || 25) + 9,
    Math.min(footprint.halfWidth, footprint.halfDepth)
  );
}
