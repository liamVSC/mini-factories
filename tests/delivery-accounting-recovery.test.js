import test from 'node:test';
import assert from 'node:assert/strict';

const {freshState, makeBuilding, TYPES} = await import('../dist/state.js');
const {route, updateEconomy} = await import('../dist/economy.js');
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
  shop.contract = { id: 77, type: 'Food', qty: 12, remaining: 12, reward: 100, expires: 500, initial: 12, urgent: false, inFlight: 0 };
  const incomeBefore = state.deliveryIncome || 0;
  const initialStock = factory.stock;
  let deliveredUnits = 0;
  let deliveredCash = 0;

  // Dispatch is intentionally separated from delivery so the inventory debit
  // cannot be confused with the sale credit.
  for (let i = 0; i < 20 && state.trucks.length === 0; i++) updateEconomy(state, 0.2, () => {});
  assert.ok(state.trucks.length > 0, 'connected factory should dispatch a truck');
  assert.ok(factory.stock < initialStock, 'dispatch must debit factory stock');
  const dispatchedStock = factory.stock;
  // Isolate delivery settlement from later production/dispatch cycles.
  factory.production = -1000;
  factory.dispatchTimer = -10000;
  const truck = state.trucks.find(candidate => candidate.stage === 'delivery');
  assert.ok(truck, 'a delivery truck should be active');
  const expectedUnits = truck.cargo;
  const expectedValue = truck.value;

  for (let i = 0; i < 500; i++) {
    updateEconomy(state, 0.2, () => {});
    if (state.orders > 0) {
      deliveredUnits = state.orders;
      deliveredCash = (state.deliveryIncome || 0) - incomeBefore;
      // Continue ticking beyond the arrival frame to detect duplicate credits.
      for (let j = 0; j < 30; j++) updateEconomy(state, 0.2, () => {});
      break;
    }
  }

  assert.ok(deliveredUnits >= expectedUnits, 'shop must receive the dispatched units');
  assert.equal(state.orders, deliveredUnits, 'delivery order count must not increase again after arrival');
  assert.equal((state.deliveryIncome || 0) - incomeBefore, deliveredCash, 'delivery income must not be credited twice');
  assert.equal(deliveredCash, expectedValue, 'cash credit must equal the delivered load value');
  assert.equal(shop.served, deliveredUnits, 'shop service count must match completed deliveries');
  assert.equal(factory.stock, dispatchedStock, 'delivery settlement must not debit factory stock a second time');
  assert.equal(state.deliveredBy.Food, deliveredUnits, 'delivered-by accounting must match completed units');
  assert.ok(shop.contract, 'a partially fulfilled contract should remain active');
  assert.equal(shop.contract.remaining, 12 - deliveredUnits, 'contract remaining must decrease by the delivered units exactly once');
  const activeContractCargo = state.trucks
    .filter(candidate => candidate.stage === 'delivery' && candidate.contractId === shop.contract.id)
    .reduce((total, candidate) => total + (candidate.cargo || 0), 0);
  assert.equal(shop.contract.inFlight, activeContractCargo, 'contract inFlight must equal cargo on active contract delivery trucks');
  assert.ok(shop.contract.inFlight <= shop.contract.remaining, 'inFlight cargo must never exceed the contract quantity still outstanding');
});

test('blocked or disconnected delivery routes never silently complete a sale', () => {
  const { state, factory, shop } = setupDelivery();
  const incomeBefore = state.deliveryIncome || 0;
  const ordersBefore = state.orders;
  const servedBefore = shop.served || 0;

  // Break the only connecting path before dispatch; route resolution must fail
  // closed and no sale/accounting side effects may occur.
  state.roads = [road([{ x: 900, y: 900 }, { x: 1100, y: 900 }])];
  assert.equal(route(state, factory, shop), null);
  for (let i = 0; i < 80; i++) updateEconomy(state, 0.2, () => {});

  assert.equal((state.deliveryIncome || 0) - incomeBefore, 0);
  assert.equal(state.orders, ordersBefore);
  assert.equal(shop.served || 0, servedBefore);
  assert.equal(state.trucks.length, 0, 'no truck should remain stranded on a route that never existed');
});


test('disconnect recovery restores cargo and reconciles contract inFlight exactly once', async () => {
  const { state, factory, shop } = setupDelivery();
  const { eraseRoad } = await import('../dist/world/roads/index.js');
  shop.contract = { id: 91, type: 'Food', qty: 3, remaining: 3, reward: 100, expires: 500, initial: 3, urgent: false, inFlight: 2 };
  const cargo = 2;
  // The cargo was already debited from factory stock when this truck was dispatched.
  factory.stock = Math.max(0, factory.stock - cargo);
  const stockBefore = factory.stock;
  const deliveryRoute = route(state, factory, shop);
  assert.ok(deliveryRoute, 'fixture must start with a valid delivery route');
  const middle = state.roads[1];
  assert.ok(middle, 'fixture must contain the connecting road segment');
  const cutPoint = { x: 180, y: (middle.points[0].y + middle.points.at(-1).y) / 2 };
  state.trucks.push({
    id: 'contract-disconnect-recovery',
    route: deliveryRoute.points.map(point => ({ ...point })),
    centerlineRoute: deliveryRoute.points.map(point => ({ ...point })),
    laneRoute: (deliveryRoute.lanePoints || deliveryRoute.points).map(point => ({ ...point })),
    routeNetworkRevision: state.roadNetworkRevision,
    laneIds: [...(deliveryRoute.laneIds || [])],
    laneRoadIds: [...(deliveryRoute.laneRoadIds || [])],
    currentLaneIndex: 0,
    currentLaneId: deliveryRoute.laneIds?.[0] || null,
    t: 0.35,
    speed: 0.085,
    currentSpeed: 0.085,
    value: 50,
    cargo,
    cargoType: 'Food',
    source: factory,
    to: shop,
    contractId: shop.contract.id,
    stage: 'delivery',
    wait: 0,
    dead: false
  });

  assert.equal(eraseRoad(state, cutPoint), true, 'removing the connecting road must succeed');
  assert.ok(state.roadNetworkRevision > 0, 'road deletion must invalidate cached truck routes');
  updateEconomy(state, 0.01, () => {});

  assert.equal(state.trucks.length, 0, 'disconnected truck must be retired');
  assert.equal(factory.stock, stockBefore + cargo, 'recovered cargo must return to factory stock once');
  assert.equal(shop.contract.inFlight, 0, 'recovered cargo must be removed from contract inFlight once');
  assert.equal(shop.contract.remaining, 3, 'recovery must not count as a completed delivery');
  assert.equal(state.orders, 0, 'recovery must not create a sale');
  assert.equal(state.deliveryIncome, 0, 'recovery must not credit delivery income');

  updateEconomy(state, 0.01, () => {});
  assert.equal(state.trucks.length, 0, 'repeated ticks must not recreate the retired truck');
  assert.equal(factory.stock, stockBefore + cargo, 'repeated ticks must not restore the same cargo twice');
  assert.equal(shop.contract.inFlight, 0, 'repeated ticks must not reconcile inFlight twice');
  assert.equal(shop.contract.remaining, 3, 'repeated ticks must not consume contract quantity');
});



test('active contract cargo survives road deletion when the truck can reroute, without double reconciliation', async () => {
  const { state, factory, shop } = setupDelivery();
  const { eraseRoad } = await import('../dist/world/roads/index.js');
  shop.contract = { id: 92, type: 'Food', qty: 3, remaining: 3, reward: 100, expires: 500, initial: 3, urgent: false, inFlight: 2 };
  const cargo = 2;
  factory.stock = Math.max(0, factory.stock - cargo);
  const stockBefore = factory.stock;
  const middle = state.roads[1];
  assert.ok(middle, 'fixture must contain the original connecting segment');
  const [start, end] = middle.points;
  // Build an alternate path between the same junctions before deleting the
  // original segment, so an in-flight truck should reroute rather than recover.
  state.roads.push(
    road([{ x: start.x, y: start.y }, { x: 260, y: start.y }]),
    road([{ x: 260, y: start.y }, { x: 260, y: end.y }]),
    road([{ x: 260, y: end.y }, { x: end.x, y: end.y }])
  );
  const originalRoute = route(state, factory, shop);
  assert.ok(originalRoute, 'fixture must start with a valid route');
  state.trucks.push({
    id: 'contract-reroute-recovery',
    route: originalRoute.points.map(point => ({ ...point })),
    centerlineRoute: originalRoute.points.map(point => ({ ...point })),
    laneRoute: (originalRoute.lanePoints || originalRoute.points).map(point => ({ ...point })),
    routeNetworkRevision: state.roadNetworkRevision,
    laneIds: [...(originalRoute.laneIds || [])],
    laneRoadIds: [...(originalRoute.laneRoadIds || [])],
    currentLaneIndex: 0,
    currentLaneId: originalRoute.laneIds?.[0] || null,
    t: 0.2,
    speed: 0.085,
    currentSpeed: 0.085,
    value: 50,
    cargo,
    cargoType: 'Food',
    source: factory,
    to: shop,
    contractId: shop.contract.id,
    stage: 'delivery',
    wait: 0,
    dead: false
  });

  assert.equal(eraseRoad(state, { x: start.x, y: (start.y + end.y) / 2 }), true, 'deleting the original segment must succeed');
  updateEconomy(state, 0.001, () => {});

  assert.equal(state.trucks.length, 1, 'truck must remain active on the alternate route');
  assert.notDeepEqual(state.trucks[0].route, originalRoute.points, 'truck must replace its stale route geometry');
  assert.equal(state.trucks[0].cargo, cargo, 'rerouting must preserve cargo');
  assert.equal(factory.stock, stockBefore, 'rerouting must not restore dispatched cargo');
  assert.equal(shop.contract.inFlight, cargo, 'rerouting must not decrement or duplicate contract inFlight');
  assert.equal(shop.contract.remaining, 3, 'rerouting must not count as delivery');
  assert.equal(state.orders, 0, 'rerouting must not create a sale');
  assert.equal(state.deliveryIncome || 0, 0, 'rerouting must not credit delivery income');

  updateEconomy(state, 0.001, () => {});
  assert.equal(state.trucks.length, 1, 'repeated ticks must not retire the rerouted truck');
  assert.equal(state.trucks[0].cargo, cargo, 'repeated ticks must not duplicate or lose cargo');
  assert.equal(factory.stock, stockBefore, 'repeated ticks must not restore cargo');
  assert.equal(shop.contract.inFlight, cargo, 'repeated ticks must reconcile inFlight exactly once');
  assert.equal(shop.contract.remaining, 3, 'repeated ticks must not consume contract quantity');
});

test('contract dispatch never exceeds remaining units already in flight', () => {
  const { state, factory, shop } = setupDelivery();
  factory.stock = 12;
  factory.production = -1000;
  factory.dispatchTimer = 0;
  shop.contract = { id: 103, type: 'Food', qty: 5, remaining: 5, reward: 100, expires: 500, initial: 5, urgent: false, inFlight: 0 };

  for (let i = 0; i < 20; i++) updateEconomy(state, 0.2, () => {});

  const contractTrucks = state.trucks.filter(truck => truck.stage === 'delivery' && truck.contractId === shop.contract.id);
  const inFlightCargo = contractTrucks.reduce((total, truck) => total + (truck.cargo || 0), 0);
  assert.equal(inFlightCargo, 5, 'dispatch should send only the five units still required by the contract');
  assert.equal(shop.contract.inFlight, inFlightCargo, 'contract inFlight must equal active contract cargo');
  assert.ok(shop.contract.inFlight <= shop.contract.remaining, 'contract inFlight must never exceed remaining contract units');
  assert.equal(contractTrucks.length, 2, 'dispatch should send one full load and one partial load, not an extra truck');
  assert.equal(shop.contract.remaining, 5, 'dispatching cargo must not count as delivery');
  assert.equal(state.orders, 0, 'dispatching cargo must not create completed sales');
});
