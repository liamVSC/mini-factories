import { WORLD_BOUNDS, WORLD_MARGIN } from '../terrain.js';
import { finitePoint, validRoadPoints } from './geometry.js';
export function isInsideWorldBounds(p, margin = WORLD_MARGIN) {
    return !!p &&
        finitePoint(p) &&
        Number(p.x) >= WORLD_BOUNDS.minX + margin &&
        Number(p.x) <= WORLD_BOUNDS.maxX - margin &&
        Number(p.y) >= WORLD_BOUNDS.minY + margin &&
        Number(p.y) <= WORLD_BOUNDS.maxY - margin;
}
export function roadWithinWorldBounds(points, margin = WORLD_MARGIN) {
    const clean = validRoadPoints(points, 0);
    return !!clean && clean.every(p => isInsideWorldBounds(p, margin));
}
export function validateRoadGeometry(points) {
    const clean = validRoadPoints(points, 12);
    if (!clean)
        return { ok: false, reason: 'Road is too short or invalid', points: [] };
    if (!roadWithinWorldBounds(clean)) {
        return { ok: false, reason: 'Road is outside the playable area', points: clean };
    }
    return { ok: true, reason: null, points: clean };
}
//# sourceMappingURL=validation.js.map