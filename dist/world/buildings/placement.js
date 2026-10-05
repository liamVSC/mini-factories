import { dist, finitePoint } from '../roads/geometry.js';
import { nearestRoad, roadPathBlocked } from '../roads/placement.js';
import { buildingRoadAttachment, resolveBuildingRoadEndpoint } from './connections.js';
import { buildingFootprint, nearestBuilding, buildingPrimaryDock } from './geometry.js';
export function buildingPlacementTarget(state, type, point) {
    if (!finitePoint(point) || !type)
        return null;
    const footprint = buildingFootprint({ kind: type.kind });
    const raw = { x: Number(point.x), y: Number(point.y) };
    const road = nearestRoad(state, raw);
    const building = nearestBuilding(state, raw);
    const candidates = [];
    if (road) {
        const vx = raw.x - road.x;
        const vy = raw.y - road.y;
        const len = Math.hypot(vx, vy) || 1;
        const ux = vx / len;
        const uy = vy / len;
        const support = Math.abs(ux) > Math.abs(uy) ? footprint.halfWidth : footprint.halfDepth;
        candidates.push({
            point: { x: road.x + ux * (support + 10), y: road.y + uy * (support + 10) },
            snapType: 'road',
            road: road.road,
            roadPoint: { x: road.x, y: road.y },
            distance: road.distance
        });
    }
    if (building) {
        const vx = raw.x - building.x;
        const vy = raw.y - building.y;
        const len = Math.hypot(vx, vy) || 1;
        const ux = vx / len;
        const uy = vy / len;
        const other = buildingFootprint(building);
        const support = Math.abs(ux) > Math.abs(uy) ? footprint.halfWidth : footprint.halfDepth;
        const otherSupport = Math.abs(ux) > Math.abs(uy) ? other.halfWidth : other.halfDepth;
        candidates.push({
            point: {
                x: building.x + ux * (otherSupport + support + 12),
                y: building.y + uy * (otherSupport + support + 12)
            },
            snapType: 'building',
            building,
            distance: dist(raw, building)
        });
    }
    const snap = candidates.sort((a, b) => a.distance - b.distance)[0];
    const snapped = !!snap && snap.distance <= 58;
    const placementPoint = snapped ? snap.point : raw;
    const accessPoints = [
        { side: 'north', x: placementPoint.x, y: placementPoint.y - footprint.halfDepth, active: false },
        { side: 'east', x: placementPoint.x + footprint.halfWidth, y: placementPoint.y, active: false },
        { side: 'south', x: placementPoint.x, y: placementPoint.y + footprint.halfDepth, active: false },
        { side: 'west', x: placementPoint.x - footprint.halfWidth, y: placementPoint.y, active: false }
    ];
    let connection = null;
    if (snapped && snap) {
        let best = accessPoints[0];
        let bestDistance = Infinity;
        const target = snap.roadPoint ?? { x: snap.building?.x ?? placementPoint.x, y: snap.building?.y ?? placementPoint.y };
        for (const access of accessPoints) {
            const distance = dist(access, target);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = access;
            }
        }
        best.active = true;
        connection = { from: snap.roadPoint ?? best, to: best };
        if (snap.snapType === 'building' && snap.building) {
            const resolved = resolveBuildingRoadEndpoint(state, placementPoint, snap.building);
            connection.to = resolved?.point ?? connection.to;
        }
    }
    return {
        point: placementPoint,
        snapType: snapped ? snap.snapType : null,
        road: snap?.road ?? null,
        building: snap?.building ?? null,
        roadPoint: snap?.roadPoint ?? null,
        accessPoints,
        connection
    };
}
export function buildingLogisticsAccess(state, building) {
    if (!building || !Array.isArray(state?.buildings) || !state.buildings.includes(building))
        return null;
    const attachment = buildingRoadAttachment(state, building);
    if (!attachment || !state.roads?.includes(attachment.road))
        return null;
    const dock = buildingPrimaryDock(building);
    const entrance = attachment.entrance;
    if (!dock || !entrance)
        return null;
    const driveway = [
        { x: attachment.point.x, y: attachment.point.y },
        { x: entrance.x, y: entrance.y },
        { x: dock.approach.x, y: dock.approach.y }
    ];
    return {
        road: attachment.road,
        roadPoint: { ...attachment.point },
        dock,
        driveway,
        connected: !roadPathBlocked(state, driveway, { end: building }),
        roadNetworkRevision: Math.max(0, Math.floor(Number(state.roadNetworkRevision) || 0))
    };
}
//# sourceMappingURL=placement.js.map