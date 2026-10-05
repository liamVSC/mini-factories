export const WORLD_SIZE = 2600;
export const WORLD_HALF_SIZE = WORLD_SIZE / 2;
export const WORLD_BOUNDS = Object.freeze({
    minX: -WORLD_HALF_SIZE,
    maxX: WORLD_HALF_SIZE,
    minY: -WORLD_HALF_SIZE,
    maxY: WORLD_HALF_SIZE
});
export const WORLD_CONSTRUCTION_MARGIN = 24;
export const WORLD_MARGIN = WORLD_CONSTRUCTION_MARGIN;
export const WORLD_EDGE_SNAP_DISTANCE = 52;
export function riverY(x) {
    return 420 + Math.sin(x * 0.002) * 35;
}
//# sourceMappingURL=terrain.js.map