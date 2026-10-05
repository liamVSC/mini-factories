import { validRoadPoints, projectSegment } from '../roads/geometry.js';
import { buildingConnectionPoint, buildingRoadEntrance, buildingRoadFootprint, buildingRoadHitbox, buildingFootprintRadius } from './geometry.js';
export function resolveBuildingRoadEndpoint(state, point, target = null, directionTarget = point) {
    const building = target || state.buildings?.find(candidate => {
        const hit = buildingRoadHitbox(candidate, 0);
        const insideShell = Number(point?.x) >= hit.minX &&
            Number(point?.x) <= hit.maxX &&
            Number(point?.y) >= hit.minY &&
            Number(point?.y) <= hit.maxY;
        const entrance = buildingRoadEntrance(candidate);
        const nearGate = !!entrance &&
            Math.hypot(entrance.x - Number(point?.x), entrance.y - Number(point?.y)) <= 18;
        return insideShell || nearGate;
    });
    if (!building)
        return null;
    const resolved = buildingConnectionPoint(building, directionTarget ?? point ?? { x: building.x, y: building.y });
    return resolved ? { building, point: { x: resolved.x, y: resolved.y } } : null;
}
export function buildingRoadDistance(building, point) {
    if (!building || !point)
        return Infinity;
    const hit = buildingRoadHitbox(building, 6);
    const dx = Math.max(hit.minX - point.x, 0, point.x - hit.maxX);
    const dy = Math.max(hit.minY - point.y, 0, point.y - hit.maxY);
    const entrance = buildingRoadEntrance(building);
    const gateDistance = entrance ? Math.hypot(entrance.x - point.x, entrance.y - point.y) : Infinity;
    return Math.min(Math.hypot(dx, dy), gateDistance);
}
export function resolveBuildingRoadTarget(state, point, maxDistance = 46) {
    if (!point)
        return null;
    let best = null;
    for (const building of state.buildings || []) {
        const distance = buildingRoadDistance(building, point);
        if (distance > maxDistance)
            continue;
        const resolved = buildingConnectionPoint(building, point);
        if (!resolved)
            continue;
        if (!best || distance < best.distance) {
            best = { building, point: { x: resolved.x, y: resolved.y }, distance };
        }
    }
    return best;
}
export function buildingRoadAttachment(state, building) {
    if (!building)
        return null;
    const entrance = buildingRoadEntrance(building);
    if (!entrance)
        return null;
    buildingRoadFootprint(building); // Preserve the legacy geometry dependency/evaluation.
    const hit = buildingRoadHitbox(building, 18);
    let best = null;
    for (const road of state.roads || []) {
        const points = validRoadPoints(road?.points, 0);
        if (!points)
            continue;
        for (let i = 1; i < points.length; i++) {
            const a = points[i - 1];
            const b = points[i];
            const q = projectSegment(building, a, b);
            const pointInsideConnectionFootprint = q.point.x >= hit.minX &&
                q.point.x <= hit.maxX &&
                q.point.y >= hit.minY &&
                q.point.y <= hit.maxY;
            const entranceDistance = entrance ? projectSegment(entrance, a, b).distance : Infinity;
            const reachesCanonicalGate = entranceDistance <= 18;
            const candidateDistance = Math.min(q.distance, entranceDistance);
            if ((pointInsideConnectionFootprint || reachesCanonicalGate) &&
                (!best || candidateDistance < best.distance)) {
                best = {
                    road,
                    point: reachesCanonicalGate
                        ? { x: entrance.x, y: entrance.y }
                        : { x: q.point.x, y: q.point.y },
                    roadPoint: { x: q.point.x, y: q.point.y },
                    canonical: reachesCanonicalGate,
                    distance: candidateDistance,
                    segment: i - 1,
                    entrance
                };
            }
        }
    }
    if (!best || !entrance)
        return null;
    return { ...best, entrance: { ...entrance } };
}
export function buildingRoadEndpointClearance(building) {
    return buildingFootprintRadius(building);
}
export function nearestBuildingRoadTarget(state, point, maxDistance = 24) {
    return resolveBuildingRoadTarget(state, point, maxDistance);
}
//# sourceMappingURL=connections.js.map