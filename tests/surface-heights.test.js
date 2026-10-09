import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRIDGE_SURFACE_Y,
  GRASS_SURFACE_Y,
  ROAD_SURFACE_Y,
  WATER_CENTER_Y,
  WATER_SURFACE_Y,
  WATER_THICKNESS
} from '../dist/rendering/surfaceHeights.js';

test('water surface renders below grass, road and bridge decks', () => {
  const actualWaterTop = WATER_CENTER_Y + WATER_THICKNESS / 2;
  assert.ok(Math.abs(actualWaterTop - WATER_SURFACE_Y) < 1e-9, 'water mesh top must match the configured surface height');
  assert.ok(WATER_SURFACE_Y < GRASS_SURFACE_Y, 'water must be below grass');
  assert.ok(GRASS_SURFACE_Y < ROAD_SURFACE_Y, 'road surface must remain raised above grass');
  assert.ok(ROAD_SURFACE_Y < BRIDGE_SURFACE_Y, 'bridge deck must remain raised above the road');
  assert.ok(WATER_SURFACE_Y < BRIDGE_SURFACE_Y, 'water must be below the bridge deck');
});
