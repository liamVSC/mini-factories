import type { Building } from '../../state.js';
import { buildingFootprint, buildingClearance } from './geometry.js';
import { isInsideWorldBounds } from '../roads/validation.js';
import { riverY, WORLD_MARGIN } from '../terrain.js';

export const FACTORY_MIN_DISTANCE = 250;
export const FACTORY_MIN_SPAWN_RADIUS = 720;

const distance = (a: Pick<Building, 'x' | 'y'>, b: Pick<Building, 'x' | 'y'>): number =>
  Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));

export interface BuildingLayoutIssue {
  type: 'invalid-position' | 'duplicate-id' | 'stacked-position' | 'outside-bounds' | 'river-conflict' | 'factory-spacing' | 'overlap';
  index: number;
  building?: Building;
  otherIndex?: number;
  other?: Building;
}

export function buildingOverlaps(a: Building, b: Building): boolean {
  const af = buildingFootprint(a);
  const bf = buildingFootprint(b);
  const clearance = buildingClearance(a, b);
  return Math.abs(Number(a.x) - Number(b.x)) < af.halfWidth + bf.halfWidth + clearance &&
    Math.abs(Number(a.y) - Number(b.y)) < af.halfDepth + bf.halfDepth + clearance;
}

export function buildingPlacementConflict(a: Building, b: Building): boolean {
  return buildingOverlaps(a, b) ||
    (a.kind === 'factory' && b.kind === 'factory' && distance(a, b) < FACTORY_MIN_DISTANCE);
}

export function validateBuildingLayout(buildings: Building[] = []): BuildingLayoutIssue[] {
  const issues: BuildingLayoutIssue[] = [];
  const seenIds = new Set<string>();
  const coordinateKeys = new Set<string>();

  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i];
    if (!building || !Number.isFinite(Number(building.x)) || !Number.isFinite(Number(building.y))) {
      issues.push({ type: 'invalid-position', index: i, building });
      continue;
    }

    if (building.id) {
      if (seenIds.has(building.id)) issues.push({ type: 'duplicate-id', index: i, building });
      seenIds.add(building.id);
    }

    const coordinateKey = `${Number(building.x)},${Number(building.y)}`;
    if (coordinateKeys.has(coordinateKey)) {
      issues.push({ type: 'stacked-position', index: i, building });
    } else {
      coordinateKeys.add(coordinateKey);
    }

    if (!isInsideWorldBounds(building, WORLD_MARGIN)) {
      issues.push({ type: 'outside-bounds', index: i, building });
    }

    const footprint = buildingFootprint(building);
    const riverClearance = 105 + Math.max(footprint.halfDepth, footprint.halfWidth) * 0.18;
    if (Math.abs(Number(building.y) - riverY(Number(building.x))) < riverClearance) {
      issues.push({ type: 'river-conflict', index: i, building });
    }

    for (let j = 0; j < i; j++) {
      const other = buildings[j];
      if (buildingPlacementConflict(building, other)) {
        issues.push({
          type: building.kind === 'factory' && other?.kind === 'factory' ? 'factory-spacing' : 'overlap',
          index: i,
          otherIndex: j,
          building,
          other
        });
      }
    }
  }

  return issues;
}

function mixSeed(seed: number): number {
  let value = (Math.floor(Number(seed)) >>> 0) || 1;
  value = (value + 0x9e3779b9) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97) >>> 0;
  return (value ^ (value >>> 15)) >>> 0;
}

function randomFromSeed(seed: number): number {
  return mixSeed(seed) / 4294967296;
}

export function factorySpawnCandidates(seed: number, attempt = 0): Array<{ x: number; y: number }> {
  const baseSeed = mixSeed(seed + attempt * 0x45d9f3b);
  const rotation = baseSeed / 4294967296 * Math.PI * 2;
  const phase = attempt % 6;
  const candidates: Array<{ x: number; y: number }> = [];

  for (let slot = 0; slot < 3; slot++) {
    const slotSeed = mixSeed(baseSeed + slot * 0x9e3779b9);
    const angle = rotation +
      slot * (Math.PI * 2 / 3) +
      (randomFromSeed(slotSeed) - 0.5) * 0.16 +
      (phase - 2.5) * 0.045;
    const radius = 880 + randomFromSeed(slotSeed + 17) * 180 + Math.floor(attempt / 6) * 45;
    candidates.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }

  return candidates;
}

function validCandidate(building: Building, buildings: Building[]): boolean {
  if (!isInsideWorldBounds(building, WORLD_MARGIN)) return false;
  const footprint = buildingFootprint(building);
  const riverClearance = 105 + Math.max(footprint.halfDepth, footprint.halfWidth) * 0.18;
  if (Math.abs(Number(building.y) - riverY(Number(building.x))) < riverClearance) return false;
  return !buildings.some(other => buildingPlacementConflict(building, other));
}

export function repairBuildingLayout(buildings: Building[], seed = 1): Building[] {
  const source = Array.isArray(buildings) ? buildings.filter(Boolean) : [];
  const accepted: Building[] = [];
  const factories = source.filter(b => b.kind === 'factory');
  const others = source.filter(b => b.kind !== 'factory');

  for (let index = 0; index < factories.length; index++) {
    const original = factories[index];
    const current = { ...original };
    const centralSpawn =
      factories.length > 1 &&
      Math.hypot(Number(current.x), Number(current.y)) < FACTORY_MIN_SPAWN_RADIUS;
    if (validCandidate(current, accepted) && !centralSpawn) {
      accepted.push(current);
      continue;
    }

    let found: Building | null = null;
    for (let attempt = 0; attempt < 30 && !found; attempt++) {
      const candidates = factorySpawnCandidates(seed + index * 97, attempt);
      for (const point of candidates) {
        const test = { ...original, ...point };
        if (validCandidate(test, accepted)) {
          found = test;
          break;
        }
      }
    }
    if (found) accepted.push(found);
  }

  for (const original of others) {
    const current = { ...original };
    if (validCandidate(current, accepted)) {
      accepted.push(current);
      continue;
    }

    let found: Building | null = null;
    for (let ring = 1; ring <= 18 && !found; ring++) {
      const radius = ring * 70;
      for (let i = 0; i < 32; i++) {
        const angle = (i / 32) * Math.PI * 2;
        const test = {
          ...original,
          x: Number(original.x) + Math.cos(angle) * radius,
          y: Number(original.y) + Math.sin(angle) * radius
        };
        if (validCandidate(test, accepted)) {
          found = test;
          break;
        }
      }
    }
    if (found) accepted.push(found);
  }

  return accepted;
}

export function layoutIsValid(buildings: Building[] = []): boolean {
  return validateBuildingLayout(buildings).length === 0;
}
