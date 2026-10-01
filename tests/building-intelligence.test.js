import assert from 'node:assert/strict';
import test from 'node:test';
import {freshState,makeBuilding,TYPES} from '../src/state.js';
import {
  buildingRole,
  buildingUtilization,
  buildingDemandPressure,
  buildingOperationalState,
  buildingLocationScore
} from '../src/world/buildings/intelligence.js';

function make(type,x,y){
  return makeBuilding(TYPES.find(t=>t.name===type),x,y,type+'-test');
}

test('buildings derive useful operational roles and utilization',()=>{
  const factory=make('Food',0,0);
  factory.stock=3;
  assert.equal(buildingRole(factory),'producer');
  assert.equal(buildingUtilization(factory),.75);
  assert.equal(buildingOperationalState({buildings:[]},factory).bottleneck,'idle');
});

test('shops expose demand pressure instead of only raw demand',()=>{
  const shop=make('Market',0,0);
  shop.demand=8;
  shop.contract={remaining:4,inFlight:0};
  const pressure=buildingDemandPressure(shop);
  assert.ok(pressure>.7);
  assert.equal(buildingOperationalState({buildings:[]},shop).bottleneck,'road-access');
});

test('warehouse saturation is classified as a real bottleneck',()=>{
  const warehouse=make('Warehouse',0,0);
  warehouse.max=20;
  warehouse.storage=20;
  const status=buildingOperationalState({buildings:[]},warehouse);
  assert.equal(status.role,'hub');
  assert.equal(status.bottleneck,'storage-full');
  assert.equal(status.state,'storage-full');
});

test('location scoring rejects invalid placement and rewards useful road access',()=>{
  const s=freshState();
  const type=TYPES.find(t=>t.name==='Food');
  s.roads=[{points:[{x:35,y:0},{x:180,y:0}]}];
  const reason=()=>null;
  const near=buildingLocationScore(s,type,40,20,reason);
  const far=buildingLocationScore(s,type,700,700,reason);
  assert.ok(near>far);
  assert.equal(buildingLocationScore(s,type,0,0,()=> 'blocked'),-Infinity);
});
