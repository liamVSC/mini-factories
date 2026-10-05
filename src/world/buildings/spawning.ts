import { TYPES, makeBuilding } from '../../state.js';
import type { Building, BuildingType, GameState } from '../../state.js';
import { createRng, seedFromState } from '../../core/rng.js';
import { newId } from '../../core/ids.js';
import { riverY, WORLD_HALF_SIZE, WORLD_MARGIN } from '../terrain.js';
import { buildingPhysicalPlacementReason } from './geometry.js';
import { factorySpawnCandidates } from './layout.js';

const FACTORY_TARGET_RADIUS = 900;
const FACTORY_RADIUS_MIN = 720;
const FACTORY_RADIUS_MAX = 1120;
const BUILDING_SEARCH_RADIUS = 820;
const RIVER_BUFFER = 145;

type PlacementReason = (
  state: GameState,
  type: BuildingType,
  x: number,
  y: number
) => string | null;

interface Point {
  x: number;
  y: number;
}

interface RoadLike {
  points?: Point[];
}

function chooseBuildingType(
  state: GameState,
  kind: Building['kind'],
  forced: string | null | undefined,
  random: () => number
): BuildingType | null {
  const pool = TYPES.filter(type => type.kind === kind && (!forced || type.name === forced));
  if (!pool.length) return null;
  if (forced || pool.length === 1) return pool[Math.floor(random() * pool.length)];

  const recent = new Set(state.buildings.slice(-3).map(building => building.type));
  const preferred = pool.filter(type => !recent.has(type.name));
  const candidates = preferred.length ? preferred : pool;
  return candidates[Math.floor(random() * candidates.length)];
}

function addBuilding(state: GameState, type: BuildingType, x: number, y: number): Building {
  const building = makeBuilding(type, x, y, newId());
  state.buildings.push(building);
  return building;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
}

function insideBounds(x: number, y: number): boolean {
  const limit = WORLD_HALF_SIZE - WORLD_MARGIN;
  return Math.abs(x) <= limit && Math.abs(y) <= limit;
}

function riverPenalty(x: number, y: number): number {
  const gap = Math.abs(y - riverY(x));
  if (gap < RIVER_BUFFER) return 100000 + (RIVER_BUFFER - gap) * 500;
  return Math.max(0, 220 - gap);
}

function roadScore(state: GameState, x: number, y: number): number {
  const roads = state.roads as RoadLike[];
  if (!roads.length) return 0;
  let nearest = Infinity;
  for (const road of roads) {
    for (const point of road.points || []) {
      nearest = Math.min(nearest, distance({ x, y }, point));
    }
  }
  if (!Number.isFinite(nearest)) return 0;
  if (nearest < 45) return 900;
  if (nearest < 120) return 650;
  if (nearest < 220) return 350;
  if (nearest < 360) return 100;
  return 0;
}

function neighbourhoodScore(
  state: GameState,
  x: number,
  y: number,
  type: BuildingType
): number {
  let score = 0;
  let nearest = Infinity;
  for (const building of state.buildings) {
    const d = distance({ x, y }, building);
    nearest = Math.min(nearest, d);
    if (building.kind === type.kind) score += Math.min(240, d * 0.45);
    else if (type.kind === 'factory' && building.kind === 'shop') {
      if (d >= 260 && d <= 700) score += 180;
      else if (d < 220) score -= 220;
    } else if (type.kind === 'shop' && building.kind === 'factory' && d >= 180 && d <= 520) {
      score += 120;
    }
  }
  if (state.buildings.length && nearest < (type.kind === 'factory' ? 260 : 100)) score -= 600;
  return score;
}

function candidateScore(
  state: GameState,
  type: BuildingType,
  x: number,
  y: number,
  random: () => number
): number {
  if (!insideBounds(x, y)) return -Infinity;
  if (buildingPhysicalPlacementReason(state, type, x, y)) return -Infinity;

  if (type.kind === 'shop') {
    const factories = state.buildings.filter(building => building.kind === 'factory');
    if (factories.length) {
      const nearestFactory = Math.min(...factories.map(factory => distance({ x, y }, factory)));
      if (nearestFactory < 250 || nearestFactory > 650) return -Infinity;
    }
  }

  let score = 0;
  score += roadScore(state, x, y);
  score += neighbourhoodScore(state, x, y, type);
  score -= riverPenalty(x, y);

  const centreDistance = Math.hypot(x, y);
  if (type.kind === 'factory') {
    if (centreDistance < FACTORY_RADIUS_MIN) return -Infinity;
    score -= Math.abs(centreDistance - FACTORY_TARGET_RADIUS) * 0.9;
    score += Math.min(centreDistance, FACTORY_RADIUS_MAX) * 0.12;
  } else {
    score -= Math.max(0, centreDistance - BUILDING_SEARCH_RADIUS) * 0.7;
  }
  score += random() * 35;
  return score;
}

function candidatePoints(state: GameState, type: BuildingType, random: () => number): Point[] {
  const points: Point[] = [];
  const rotation = (seedFromState(state) / 4294967296) * Math.PI * 2;

  if (type.kind === 'factory') {
    const factoryIndex = state.buildings.filter(building => building.kind === 'factory').length;
    for (let attempt = 0; attempt < 18; attempt++) {
      const candidates = factorySpawnCandidates(seedFromState(state) + attempt * 97, attempt);
      const primary = candidates[factoryIndex % 3];
      if (primary) points.push(primary);
    }
    for (let attempt = 0; attempt < 18; attempt++) {
      points.push(...factorySpawnCandidates(seedFromState(state) + attempt * 97, attempt));
    }
  } else {
    const factories = state.buildings.filter(building => building.kind === 'factory');
    const shopIndex = state.buildings.filter(building => building.kind === 'shop').length;

    if (factories.length) {
      const anchor = factories[shopIndex % factories.length];
      const anchorAngle = rotation + (shopIndex % factories.length) * (Math.PI * 2 / 3);
      for (let ring = 0; ring < 8; ring++) {
        const radius = 260 + ring * 55;
        for (let side = 0; side < 8; side++) {
          const angle = anchorAngle + (side / 8) * Math.PI * 2;
          points.push({
            x: Number(anchor.x) + Math.cos(angle) * radius,
            y: Number(anchor.y) + Math.sin(angle) * radius
          });
        }
      }
    }

    for (const factory of factories) {
      for (let attempt = 0; attempt < 120; attempt++) {
        const angle = rotation + random() * Math.PI * 2;
        const radius = 250 + random() * 400;
        points.push({
          x: Number(factory.x) + Math.cos(angle) * radius,
          y: Number(factory.y) + Math.sin(angle) * radius
        });
      }
    }
  }
  return points;
}

function findBestPosition(
  state: GameState,
  type: BuildingType,
  random: () => number
): Point | null {
  let best: Point | null = null;
  let bestScore = -Infinity;

  for (const point of candidatePoints(state, type, random)) {
    const score = candidateScore(state, type, point.x, point.y, random);
    if (score > bestScore) {
      bestScore = score;
      best = point;
    }
  }

  return best;
}

function spawnBuilding(
  state: GameState,
  kind: Building['kind'],
  forced: string | null | undefined,
  placementReason: PlacementReason
): Building | null {
  const kindSeed = kind === 'factory' ? 0x9e3779b9 : 0x7f4a7c15;
  const typeSeed = forced
    ? Array.from(String(forced)).reduce((sum, char) => sum + char.charCodeAt(0), 0)
    : 0;
  const spawnSeed =
    (seedFromState(state) +
      Math.imul((state.buildings.length || 0) + 1, 0x45d9f3b) +
      kindSeed +
      typeSeed) >>> 0;
  const random = createRng(spawnSeed);
  const type = chooseBuildingType(state, kind, forced, random);
  if (!type) return null;

  if (kind === 'factory') {
    const factoryIndex = state.buildings.filter(building => building.kind === 'factory').length;
    const sectorCandidates: Point[] = [];
    for (let attempt = 0; attempt < 30; attempt++) {
      const candidates = factorySpawnCandidates(seedFromState(state) + attempt * 97, attempt);
      const preferred = candidates[factoryIndex % 3];
      if (preferred) sectorCandidates.push(preferred);
    }
    for (const point of sectorCandidates) {
      if (
        candidateScore(state, type, point.x, point.y, () => 0) > -Infinity &&
        !placementReason(state, type, point.x, point.y)
      ) {
        return addBuilding(state, type, point.x, point.y);
      }
    }
  }

  const preferred = findBestPosition(state, type, random);
  if (preferred && !placementReason(state, type, preferred.x, preferred.y)) {
    return addBuilding(state, type, preferred.x, preferred.y);
  }

  for (let attempt = 0; attempt < 180; attempt++) {
    const angle = random() * Math.PI * 2;
    const radius = kind === 'factory'
      ? FACTORY_RADIUS_MIN + random() * (FACTORY_RADIUS_MAX - FACTORY_RADIUS_MIN)
      : 90 + random() * BUILDING_SEARCH_RADIUS;
    const point = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    if (
      candidateScore(state, type, point.x, point.y, () => 0) > -Infinity &&
      !buildingPhysicalPlacementReason(state, type, point.x, point.y) &&
      !placementReason(state, type, point.x, point.y)
    ) {
      return addBuilding(state, type, point.x, point.y);
    }
  }

  return null;
}

export function seedBuildings(
  state: GameState,
  placementReason: PlacementReason
): void {
  for (const type of ['Steel', 'Food', 'Parts']) {
    spawnBuilding(state, 'factory', type, placementReason);
  }
  for (const type of ['Market', 'Garage', 'Builder']) {
    spawnBuilding(state, 'shop', type, placementReason);
  }
}
