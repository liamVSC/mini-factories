import test from 'node:test';
import assert from 'node:assert/strict';
import { roadPathBlocked } from '../dist/world/roads/placement.js';
import { buildingRoadEntrance } from '../dist/world/buildings/geometry.js';
import { resolveBuildingRoadEndpoint } from '../dist/world/buildings/connections.js';

const factory = { id: 'factory-clearance-test', kind: 'factory', x: 0, y: 0, r: 25 };

test('road clearance includes curb and sidewalk envelope around a factory', () => {
  const state = { buildings: [factory] };
  // The asphalt centreline is outside the shell, but a 32-unit rendered road
  // envelope would overlap it unless the physical path reserves the full margin.
  assert.equal(
    roadPathBlocked(state, [{ x: -200, y: 70 }, { x: 200, y: 70 }]),
    true
  );
});

test('a road endpoint selected on a building resolves to its canonical yard gate', () => {
  const state = { buildings: [factory] };
  const gate = buildingRoadEntrance(factory);
  const resolved = resolveBuildingRoadEndpoint(state, { x: factory.x, y: factory.y }, factory, { x: factory.x, y: factory.y });
  assert.ok(gate);
  assert.ok(resolved);
  assert.equal(resolved.building.id, factory.id);
  assert.ok(Math.hypot(resolved.point.x - gate.x, resolved.point.y - gate.y) < 1e-9);
});
