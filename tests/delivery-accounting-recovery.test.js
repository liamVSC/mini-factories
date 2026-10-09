import test from 'node:test';
import assert from 'node:assert/strict';

const {freshState, makeBuilding, TYPES} = await import('../dist/state.js');
const {route, updateEconomy} = await import('../dist/economy.js');
const {addRoad, roadNetwork} = await import('../dist/world.js');
const buildings = await import('../dist/world/buildings/index.js');

function road(points) {
  return { id: crypto.randomUUID(), points, age: 0, bridge: false, condition: 1 };
}

function setupDelivery() {
  const state = freshState();
  state.cash = 10000;
  state.roads = [];
  state.buildings = [];
  state.trucks = [];
  const factory = makeBuilding(TYPES.find(type => type.name === 'Food'), 0, -108, 'accounting-factory');
  const shop = makeBuilding(TYPES.find(type => type.name === 'Market'), 360, 99, 'accounting-shop');
  factory.stock = 3;
  factory.dispatchTimer = 0;
  shop.demand = 3;
  state.buildings.push(factory, shop);
  const start = buildings.buildingRoadEntrance(factory);
  const end = buildings.buildingRoadEntrance(shop);
  assert.ok(start && end, 'fixtures must expose real yard gates');
  state.roads.push(
    road([{ x: start.x, y: start.y }, { x: 180, y: start.y }]),
    road([{ x: 180, y: start.y }, { x: 180, y: end.y }]),
    road([{ x: 180, y: end.y }, { x: end.x, y: end.y }])
  );
  return { state, factory, shop };
}

test('delivery accounting removes factory stock at dispatch and credits the shop exactly once', () => {
  const { state, factory, shop } = setupDelivery();
  const cashBefore = state.cash;
  const initialStock = factory.stock;
  let deliveredUnits = 0;
  let deliveredCash = 0;

  // Dispatch is intentionally separated from delivery so the inventory debit
  // cannot be confused with the sale credit.
  updateEconomy(state, 0.8, () => {});
  assert.ok(state.trucks.length > 0, 'connected factory should dispatch a truck');
  assert.ok(factory.stock < initialStock, 'dispatch must debit factory stock');
  const dispatchedStock = factory.stock;
  const truck = state.trucks.find(candidate => candidate.stage === 'delivery');
  assert.ok(truck, 'a delivery truck should be active');
  const expectedUnits = truck.cargo;
  const expectedValue = truck.value;

  for (let i = 0; i < 500; i++) {
    updateEconomy(state, 0.2, () => {});
    if (state.orders > 0) {
      deliveredUnits = state.orders;
      deliveredCash = state.cash - cashBefore;
      // Continue ticking beyond the arrival frame to detect duplicate credits.
      for (let j = 0; j < 30; j++) updateEconomy(state, 0.2, () => {});
      break;
    }
  }

  assert.ok(deliveredUnits >= expectedUnits, 'shop must receive the dispatched units');
  assert.equal(state.orders, deliveredUnits, 'delivery order count must not increase again after arrival');
  assert.equal(state.cash - cashBefore, deliveredCash, 'delivery cash must not be credited twice');
  assert.equal(deliveredCash, expectedValue, 'cash credit must equal the delivered load value');
  assert.equal(shop.served, deliveredUnits, 'shop service count must match completed deliveries');
  assert.equal(factory.stock, dispatchedStock, 'completed delivery must not debit factory stock a second time');
  assert.equal(state.deliveredBy.Food, deliveredUnits, 'delivered-by accounting must match completed units');
});

test('blocked or disconnected delivery routes never silently complete a sale', () => {
  const { state, factory, shop } = setupDelivery();
  const cashBefore = state.cash;
  const ordersBefore = state.orders;
  const servedBefore = shop.served || 0;

  // Break the only connecting path before dispatch; route resolution must fail
  // closed and no sale/accounting side effects may occur.
  state.roads.splice(1, 1);
  assert.equal(route(state, factory, shop), null);
  for (let i = 0; i < 80; i++) updateEconomy(state, 0.2, () => {});

  assert.equal(state.cash, cashBefore);
  assert.equal(state.orders, ordersBefore);
  assert.equal(shop.served || 0, servedBefore);
  assert.equal(state.trucks.length, 0, 'no truck should remain stranded on a route that never existed');
});
