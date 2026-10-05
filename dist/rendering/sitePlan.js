import { buildingDockPoints, buildingFootprint, buildingRoadEntrance, buildingVisualFootprint } from '../world/buildings/geometry.js';
const MODEL_SPECS = Object.freeze({
    factory: Object.freeze({ width: 144, depth: 108, height: 46, gateWidth: 42 }),
    warehouse: Object.freeze({ width: 156, depth: 108, height: 36, gateWidth: 46 }),
    shop: Object.freeze({ width: 136, depth: 90, height: 31, gateWidth: 38 }),
    default: Object.freeze({ width: 136, depth: 90, height: 31, gateWidth: 38 })
});
function stableHash(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}
export function buildingSitePlan(building) {
    const kind = MODEL_SPECS[building?.kind] ? building.kind : 'default';
    const spec = MODEL_SPECS[kind];
    const shell = buildingFootprint(building);
    const site = buildingVisualFootprint(building);
    const dock = buildingDockPoints(building)[0];
    const entrance = buildingRoadEntrance(building);
    const x = Number(building?.x);
    const y = Number(building?.y);
    if (!dock || !entrance || !Number.isFinite(x) || !Number.isFinite(y))
        return null;
    const variant = stableHash(`${building.id || ''}|${building.type || ''}|${kind}`) % 4;
    const sizeOffsets = [-4, 0, 2, 4];
    const width = Math.min(spec.width + sizeOffsets[variant], shell.halfWidth * 2 - 4);
    const depth = Math.min(spec.depth + sizeOffsets[(variant + 1) % 4], shell.halfDepth * 2 - 4);
    const direction = Math.sign(dock.normal.y) || 1;
    const dockX = dock.point.x - x;
    const dockZ = dock.point.y - y;
    const approachZ = dock.approach.y - y;
    const gateZ = entrance.y - y;
    const rearZ = -direction * (site.halfDepth - 8);
    const courtStartZ = dockZ + direction * 2;
    const courtEndZ = gateZ - direction * .5;
    const courtDepth = Math.abs(courtEndZ - courtStartZ);
    const rearShellZ = -direction * depth / 2;
    const parkingDepth = Math.min(46, Math.max(0, Math.abs(rearZ - rearShellZ) - 12));
    const parkingZ = (rearZ + rearShellZ) / 2;
    const serviceSide = variant % 2 ? 1 : -1;
    const serviceX = serviceSide * Math.min(width / 2 + 14, site.halfWidth - 16);
    const turnX = dockX + (dock.normal.y > 0 ? 48 : -48);
    const turnZ = (entrance.y + dock.approach.y) / 2 - y;
    return {
        kind,
        variant,
        width,
        depth,
        height: spec.height + (variant === 1 ? 2 : variant === 3 ? -1 : 0),
        gateWidth: spec.gateWidth,
        shell,
        site,
        direction,
        dockX,
        dockZ,
        approachZ,
        gateZ,
        rearZ,
        lotWidth: site.halfWidth * 2 - 14,
        lotDepth: Math.abs(gateZ - rearZ),
        lotZ: (gateZ + rearZ) / 2,
        courtStartZ,
        courtEndZ,
        courtDepth,
        courtZ: (courtStartZ + courtEndZ) / 2,
        courtWidth: site.halfWidth * 2 - 22,
        turnX,
        turnZ,
        turnRadius: Math.max(14, Math.min(28, Math.abs(gateZ - approachZ) / 2 - 3)),
        parkingZ,
        parkingDepth,
        parkingWidth: Math.min(116, site.halfWidth * 2 - 40),
        serviceSide,
        serviceX,
        fenceX: site.halfWidth - 5
    };
}
//# sourceMappingURL=sitePlan.js.map