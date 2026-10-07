import { finitePoint } from '../roads/geometry.js';
import { isInsideWorldBounds } from '../roads/validation.js';
import { riverY, WORLD_MARGIN } from '../terrain.js';
export function buildingClearance(a, b) {
    if (a.kind === 'factory' && b.kind === 'factory')
        return 55;
    if (a.kind === 'factory' || b.kind === 'factory')
        return 36;
    return 18;
}
const PLACEMENT_FOOTPRINTS = Object.freeze({
    warehouse: Object.freeze({ halfWidth: 115, halfDepth: 170 }),
    factory: Object.freeze({ halfWidth: 100, halfDepth: 150 }),
    shop: Object.freeze({ halfWidth: 95, halfDepth: 130 }),
    default: Object.freeze({ halfWidth: 50, halfDepth: 62 })
});
function footprintForKind(kind) {
    return PLACEMENT_FOOTPRINTS[kind ?? 'default'] ?? PLACEMENT_FOOTPRINTS.default;
}
const ROAD_CONNECTION_FOOTPRINTS = Object.freeze({
    warehouse: Object.freeze({ halfWidth: 48, halfDepth: 36 }),
    factory: Object.freeze({ halfWidth: 40, halfDepth: 32 }),
    shop: Object.freeze({ halfWidth: 36, halfDepth: 36 }),
    default: Object.freeze({ halfWidth: 36, halfDepth: 36 })
});
function roadConnectionFootprintForKind(kind) {
    return ROAD_CONNECTION_FOOTPRINTS[kind ?? 'default'] ?? ROAD_CONNECTION_FOOTPRINTS.default;
}
export function buildingRoadFootprint(building) {
    return roadConnectionFootprintForKind(building.kind);
}
export function buildingVisualFootprint(building) {
    return { ...(PLACEMENT_FOOTPRINTS[building.kind] ?? PLACEMENT_FOOTPRINTS.default) };
}
export function buildingVisualHitbox(building, tolerance = 0) {
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
function overlapsBuilding(candidate, building, clearance) {
    const other = buildingSiteFootprint(building);
    const overlapX = Math.abs(Number(building.x) - candidate.x) <
        candidate.footprint.halfWidth + other.halfWidth + clearance;
    const overlapY = Math.abs(Number(building.y) - candidate.y) <
        candidate.footprint.halfDepth + other.halfDepth + clearance;
    return overlapX && overlapY;
}
export function buildingPhysicalPlacementReason(state, type, x, y) {
    if (!type)
        return 'Unknown building';
    const px = Number(x);
    const py = Number(y);
    if (!Number.isFinite(px) || !Number.isFinite(py))
        return 'Invalid placement';
    if (!isInsideWorldBounds({ x: px, y: py }, WORLD_MARGIN))
        return 'Outside the playable area';
    const candidate = {
        kind: type.kind,
        x: px,
        y: py,
        footprint: buildingSiteFootprint({ kind: type.kind })
    };
    for (const building of state.buildings) {
        if (!finitePoint(building))
            continue;
        if (candidate.kind === 'factory' &&
            building.kind === 'factory' &&
            Math.hypot(px - Number(building.x), py - Number(building.y)) < 250) {
            return 'Too close to another factory';
        }
        if (overlapsBuilding(candidate, building, buildingClearance(candidate, building))) {
            return candidate.kind === 'factory' && building.kind === 'factory'
                ? 'Too close to another factory'
                : 'Too close to another building';
        }
    }
    const riverClearance = 105 + Math.max(candidate.footprint.halfDepth, candidate.footprint.halfWidth) * 0.18;
    if (Math.abs(py - riverY(px)) < riverClearance)
        return 'Too close to the river';
    return null;
}
export function buildingHitbox(building, tolerance = 0) {
    const footprint = buildingFootprint(building);
    return {
        minX: building.x - footprint.halfWidth - tolerance,
        maxX: building.x + footprint.halfWidth + tolerance,
        minY: building.y - footprint.halfDepth - tolerance,
        maxY: building.y + footprint.halfDepth + tolerance
    };
}
export function buildingAtPoint(state, point, tolerance = 10) {
    if (!finitePoint(point))
        return null;
    let best = null;
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
export function nearestBuilding(state, point) {
    return buildingAtPoint(state, point, 18);
}
const SHELL_FOOTPRINTS = Object.freeze({
    warehouse: Object.freeze({ halfWidth: 82, halfDepth: 56 }),
    factory: Object.freeze({ halfWidth: 75, halfDepth: 56 }),
    shop: Object.freeze({ halfWidth: 75, halfDepth: 50 }),
    default: Object.freeze({ halfWidth: 48, halfDepth: 40 })
});
export function buildingFootprint(building) {
    return SHELL_FOOTPRINTS[building.kind] ?? SHELL_FOOTPRINTS.default;
}
export function buildingSiteFootprint(building) {
    return footprintForKind(building.kind);
}
const DOCK_SPECS = {
    factory: [
        { name: 'north-loading', x: 0, y: 56, normal: { x: 0, y: 1 }, width: 28 },
        { name: 'south-loading', x: -38, y: -56, normal: { x: 0, y: -1 }, width: 18 }
    ],
    warehouse: [
        { name: 'north-main', x: 0, y: 60, normal: { x: 0, y: 1 }, width: 32 },
        { name: 'north-secondary', x: -48, y: 60, normal: { x: 0, y: 1 }, width: 18 },
        { name: 'south-secondary', x: 48, y: -60, normal: { x: 0, y: -1 }, width: 18 }
    ],
    default: [
        { name: 'front-entrance', x: 0, y: -47, normal: { x: 0, y: -1 }, width: 18 }
    ]
};
export function buildingDockPoints(building) {
    const x = Number(building.x) || 0;
    const y = Number(building.y) || 0;
    const specs = DOCK_SPECS[building.kind] ?? DOCK_SPECS.default;
    return specs.map(dock => ({
        ...dock,
        point: { x: x + dock.x, y: y + dock.y },
        approach: {
            x: x + dock.x + dock.normal.x * 10,
            y: y + dock.y + dock.normal.y * 10
        }
    }));
}
export function buildingPrimaryDock(building) {
    return buildingDockPoints(building)[0] ?? null;
}
export function buildingRoadEntrance(building) {
    const dock = buildingPrimaryDock(building);
    if (!dock)
        return null;
    const gateOffset = 42;
    return {
        x: dock.approach.x + dock.normal.x * gateOffset,
        y: dock.approach.y + dock.normal.y * gateOffset,
        building
    };
}
export function buildingRoadHitbox(building, tolerance = 0) {
    const footprint = buildingRoadFootprint(building);
    return {
        minX: Number(building.x) - footprint.halfWidth - tolerance,
        maxX: Number(building.x) + footprint.halfWidth + tolerance,
        minY: Number(building.y) - footprint.halfDepth - tolerance,
        maxY: Number(building.y) + footprint.halfDepth + tolerance
    };
}
export function buildingConnectionPoint(building, _target, _exteriorOffset = 2.5) {
    const entrance = buildingRoadEntrance(building);
    return entrance;
}
export function buildingFootprintRadius(building) {
    const footprint = buildingRoadFootprint(building);
    return Math.max(26, (building.r || 25) + 9, Math.min(footprint.halfWidth, footprint.halfDepth));
}
//# sourceMappingURL=geometry.js.map