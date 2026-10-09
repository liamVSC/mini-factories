import test from 'node:test';
import assert from 'node:assert/strict';
import { roadPathBlocked } from '../dist/world/roads/placement.js';
import { buildingRoadEntrance, buildingVisualHitbox } from '../dist/world/buildings/geometry.js';
import { buildingOverlaps } from '../dist/world/buildings/layout.js';
import { resolveBuildingRoadEndpoint } from '../dist/world/buildings/connections.js';

const factory = { id: 'factory-clearance-test', kind: 'factory', x: 0, y: 0, r: 25 };

test('road clearance blocks paths through a factory shell', () => {
  const state = { buildings: [factory] };
  assert.equal(
    roadPathBlocked(state, [{ x: -200, y: 20 }, { x: 200, y: 20 }]),
    true
  );
});

test('factory visual bounds cover the enlarged rear yard and gate approach',()=>{
  const bounds=buildingVisualHitbox(factory);
  assert.ok(bounds.maxX-bounds.minX>=340);
  assert.ok(bounds.minY<=-334);
  assert.ok(bounds.maxY>=108);
});

test('layout validation treats the rendered factory yard as occupied space',()=>{
  const insideYard={id:'shop-yard-overlap',kind:'shop',type:'Market',x:120,y:-220,r:25};
  const outsideYard={id:'shop-clear',kind:'shop',type:'Market',x:340,y:-550,r:25};
  assert.equal(buildingOverlaps(factory,insideYard),true);
  assert.equal(buildingOverlaps(factory,outsideYard),false);
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
