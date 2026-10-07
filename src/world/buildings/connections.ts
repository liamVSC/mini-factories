import { validRoadPoints, projectSegment } from '../roads/geometry.js';
import {
  buildingConnectionPoint,
  buildingRoadEntrance,
  buildingRoadFootprint,
  buildingRoadHitbox,
  buildingFootprintRadius,
  buildingYardHitbox
} from './geometry.js';
import type { Building, GameState } from '../../state.js';

export interface BuildingRoadEndpoint {
  building: Building;
  point: { x: number; y: number };
}

export function resolveBuildingRoadEndpoint(
  state: Pick<GameState, 'buildings'>,
  point: { x: number; y: number } | null | undefined,
  target: Building | null = null,
  directionTarget = point
): BuildingRoadEndpoint | null {
  const building = target || state.buildings?.find(candidate => {
    const yard = buildingYardHitbox(candidate, 0);
    const insideYard =
      Number(point?.x) >= yard.minX &&
      Number(point?.x) <= yard.maxX &&
      Number(point?.y) >= yard.minY &&
      Number(point?.y) <= yard.maxY;
    const entrance = buildingRoadEntrance(candidate);
    const nearGate =
      !!entrance &&
      Math.hypot(entrance.x - Number(point?.x), entrance.y - Number(point?.y)) <= 18;
    return insideYard || nearGate;
  });
  if (!building) return null;
  const resolved = buildingConnectionPoint(building, directionTarget ?? point ?? { x: building.x, y: building.y });
  return resolved ? { building, point: { x: resolved.x, y: resolved.y } } : null;
}

export function buildingRoadDistance(
  building: Building | null | undefined,
  point: { x: number; y: number } | null | undefined
): number {
  if (!building || !point) return Infinity;
  const yard = buildingYardHitbox(building, 0);
  const dx = Math.max(yard.minX - point.x, 0, point.x - yard.maxX);
  const dy = Math.max(yard.minY - point.y, 0, point.y - yard.maxY);
  const entrance = buildingRoadEntrance(building);
  const gateDistance = entrance ? Math.hypot(entrance.x - point.x, entrance.y - point.y) : Infinity;
  return Math.min(Math.hypot(dx, dy), gateDistance);
}

export interface BuildingRoadTarget {
  building: Building;
  point: { x: number; y: number };
  distance: number;
}

export function resolveBuildingRoadTarget(
  state: Pick<GameState, 'buildings'>,
  point: { x: number; y: number } | null | undefined,
  maxDistance = 46
): BuildingRoadTarget | null {
  if (!point) return null;
  let best: BuildingRoadTarget | null = null;
  for (const building of state.buildings || []) {
    const distance = buildingRoadDistance(building, point);
    if (distance > maxDistance) continue;
    const resolved = buildingConnectionPoint(building, point);
    if (!resolved) continue;
    if (!best || distance < best.distance) {
      best = { building, point: { x: resolved.x, y: resolved.y }, distance };
    }
  }
  return best;
}

export interface BuildingRoadAttachment {
  road: GameState['roads'][number];
  point: { x: number; y: number };
  roadPoint: { x: number; y: number };
  canonical: boolean;
  distance: number;
  segment: number;
  entrance: { x: number; y: number; building: Pick<Building, 'kind' | 'x' | 'y'> };
}

export function buildingRoadAttachment(
  state: Pick<GameState, 'buildings' | 'roads'>,
  building: Building | null | undefined
): BuildingRoadAttachment | null {
  if (!building) return null;
  const entrance = buildingRoadEntrance(building);
  if (!entrance) return null;
  buildingRoadFootprint(building); // Preserve the legacy geometry dependency/evaluation.
  const hit = buildingRoadHitbox(building, 18);
  let best: BuildingRoadAttachment | null = null;

  for (const road of state.roads || []) {
    const points = validRoadPoints(road?.points, 0);
    if (!points) continue;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const q = projectSegment(building, a, b);
      // A building is never a valid road endpoint. Roads attach only through
      // the building's exterior yard gate/entrance. A wider tolerance preserves
      // legacy pavement that stops near the gate while routing through the
      // yard rather than accepting the building footprint itself.
      const entranceDistance = entrance ? projectSegment(entrance, a, b).distance : Infinity;
      const reachesCanonicalGate = entranceDistance <= 46;
      if (reachesCanonicalGate && (!best || entranceDistance < best.distance)) {
        const projected = projectSegment(entrance, a, b);
        best = {
          road,
          point: { x: entrance.x, y: entrance.y },
          roadPoint: { x: projected.point.x, y: projected.point.y },
          canonical: true,
          distance: entranceDistance,
          segment: i - 1,
          entrance
        };
      }
    }
  }

  if (!best || !entrance) return null;
  return { ...best, entrance: { ...entrance } };
}

export function buildingRoadEndpointClearance(building: Building): number {
  // Keep the existing physical connection radius, but add a small visual
  // safety margin so the road/shoulder cannot turn back into the building.
  return buildingFootprintRadius(building) + 14;
}

export function nearestBuildingRoadTarget(
  state: Pick<GameState, 'buildings'>,
  point: { x: number; y: number } | null | undefined,
  maxDistance = 24
): BuildingRoadTarget | null {
  return resolveBuildingRoadTarget(state, point, maxDistance);
}
