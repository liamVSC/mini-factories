import { makeBuilding } from '../../state.js';
import { newId } from '../../core/ids.js';
import { buildingPhysicalPlacementReason } from './geometry.js';
import { layoutIsValid } from './layout.js';
import { seedBuildings } from './spawning.js';
const BUILDING_BASE_COSTS = Object.freeze({
    Steel: 260,
    Food: 220,
    Parts: 320,
    Market: 180,
    Garage: 240,
    Builder: 220,
    Plastics: 420,
    Glass: 500,
    Electronics: 520,
    Furniture: 600,
    Warehouse: 700
});
const MIN_COMPANY_LEVEL = Object.freeze({
    Steel: 1,
    Food: 1,
    Parts: 2,
    Market: 1,
    Garage: 2,
    Builder: 1,
    Plastics: 1,
    Glass: 2,
    Electronics: 1,
    Furniture: 2,
    Warehouse: 2
});
export function buildingCost(state, type) {
    const base = BUILDING_BASE_COSTS[type.name] ?? 300;
    return Math.round(base * Math.pow(1.12, state.buildings.length));
}
export function buildingUnlock(type, state) {
    if ('unlock' in type && 'unlockLevel' in type) {
        const unlock = type.unlock;
        if ((state.research?.[unlock] ?? 0) < type.unlockLevel) {
            return `Requires ${type.unlock} research Lv ${type.unlockLevel}`;
        }
    }
    const minimum = MIN_COMPANY_LEVEL[type.name] ?? 1;
    if (state.companyLevel < minimum)
        return `Requires Company Level ${minimum}`;
    return null;
}
export function canBuild(state, type) {
    const unlockReason = buildingUnlock(type, state);
    if (unlockReason)
        return unlockReason;
    const capacity = 10 + (state.research?.industry ?? 0) * 2;
    if (state.buildings.length >= capacity)
        return `Company building capacity reached (${capacity})`;
    const cost = buildingCost(state, type);
    if (state.cash < cost)
        return `Costs £${cost}`;
    return null;
}
export function canPlaceBuildingAt(state, type, x, y) {
    const reason = canBuild(state, type);
    if (reason)
        return reason;
    return buildingPhysicalPlacementReason(state, type, x, y);
}
export function placeBuilding(state, type, x, y) {
    if (canPlaceBuildingAt(state, type, x, y))
        return false;
    const building = makeBuilding(type, x, y, newId());
    const cost = buildingCost(state, type);
    state.cash -= cost;
    state.buildings.push(building);
    if (!layoutIsValid(state.buildings)) {
        state.buildings.pop();
        state.cash += cost;
        return false;
    }
    return building;
}
export function seed(state) {
    if (!state || state.seeded === true)
        return false;
    if ((state.buildings?.length ?? 0) > 0)
        return false;
    const originalBuildings = state.buildings;
    const originalSeeded = state.seeded;
    state.buildings = [];
    try {
        seedBuildings(state, buildingPhysicalPlacementReason);
        const expected = ['Steel', 'Food', 'Parts', 'Market', 'Garage', 'Builder'];
        const seededNames = state.buildings.map(building => building.type);
        const complete = expected.every(name => seededNames.includes(name));
        if (!complete || !layoutIsValid(state.buildings)) {
            state.buildings = originalBuildings;
            state.seeded = originalSeeded;
            return false;
        }
        state.seeded = true;
        return true;
    }
    catch (error) {
        state.buildings = originalBuildings;
        state.seeded = originalSeeded;
        throw error;
    }
}
export { buildingPlacementTarget, buildingLogisticsAccess } from './placement.js';
//# sourceMappingURL=operations.js.map