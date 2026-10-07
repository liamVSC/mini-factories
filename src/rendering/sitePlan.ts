import type { Building } from '../state.js';
import {
  buildingDockPoints,
  buildingFootprint,
  buildingRoadEntrance,
  buildingVisualFootprint
} from '../world/buildings/geometry.js';

const MODEL_SPECS = Object.freeze({
  factory: Object.freeze({ width: 192, depth: 146, height: 50, gateWidth: 50 }),
  warehouse: Object.freeze({ width: 212, depth: 150, height: 40, gateWidth: 54 }),
  shop: Object.freeze({ width: 180, depth: 120, height: 34, gateWidth: 44 }),
  default: Object.freeze({ width: 180, depth: 120, height: 34, gateWidth: 44 })
});

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function buildingSitePlan(building: Pick<Building, 'id' | 'type' | 'kind' | 'x' | 'y'>) {
  const kind = MODEL_SPECS[building?.kind] ? building.kind : 'default';
  const spec = MODEL_SPECS[kind];
  const shell = buildingFootprint(building);
  const site = buildingVisualFootprint(building);
  const dock = buildingDockPoints(building)[0];
  const entrance = buildingRoadEntrance(building);
  const x = Number(building?.x);
  const y = Number(building?.y);
  if (!dock || !entrance || !Number.isFinite(x) || !Number.isFinite(y)) return null;

  const variant = stableHash(`${building.id || ''}|${building.type || ''}|${kind}`) % 4;
  const sizeOffsets = [-5, 0, 3, 5];
  const width = Math.min(spec.width + sizeOffsets[variant], shell.halfWidth * 2 - 4);
  const depth = Math.min(spec.depth + sizeOffsets[(variant + 1) % 4], shell.halfDepth * 2 - 4);
  const direction = Math.sign(dock.normal.y) || 1;
  const dockX = dock.point.x - x;
  const dockZ = dock.point.y - y;
  const approachZ = dock.approach.y - y;
  const gateZ = entrance.y - y;
  const rearZ = -direction * (site.halfDepth - 6);
  const courtStartZ = dockZ + direction * 4;
  const courtEndZ = gateZ - direction * 1;
  const courtDepth = Math.abs(courtEndZ - courtStartZ);
  const rearShellZ = -direction * depth / 2;
  const parkingDepth = Math.min(60, Math.max(0, Math.abs(rearZ - rearShellZ) - 10));
  const parkingZ = (rearZ + rearShellZ) / 2;
  const serviceSide = variant % 2 ? 1 : -1;
  const serviceX = serviceSide * Math.min(width / 2 + 16, site.halfWidth - 14);
  const turnX = dockX + (dock.normal.y > 0 ? 58 : -58);
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
    lotWidth: site.halfWidth * 2 - 8,
    lotDepth: Math.abs(gateZ - rearZ),
    lotZ: (gateZ + rearZ) / 2,
    courtStartZ,
    courtEndZ,
    courtDepth,
    courtZ: (courtStartZ + courtEndZ) / 2,
    courtWidth: site.halfWidth * 2 - 12,
    turnX,
    turnZ,
    turnRadius: Math.max(18, Math.min(34, Math.abs(gateZ - approachZ) / 2 - 4)),
    parkingZ,
    parkingDepth,
    parkingWidth: Math.min(144, site.halfWidth * 2 - 28),
    serviceSide,
    serviceX,
    fenceX: site.halfWidth - 4
  };
}
