import { TYPES } from './core/types.js';
export { TYPES };
export function freshState() {
    return {
        gameSeed: Math.floor(Math.random() * 0x7fffffff),
        layoutSeed: Math.floor(Math.random() * 0x7fffffff),
        seeded: false,
        cash: 500,
        orders: 0,
        companyLevel: 1,
        xp: 0,
        xpToNext: 100,
        reputation: 100,
        roads: [],
        buildings: [],
        trucks: [],
        particles: [],
        selected: null,
        mode: 'select',
        paused: false,
        gameOver: false,
        congestion: 0,
        objective: 0,
        goals: goalList(),
        deliveryIncome: 0,
        deliveredBy: {},
        longContracts: 0,
        contractId: 1,
        renderVersion: 0,
        research: { automation: 0, logistics: 0, industry: 0 },
        trafficSignals: { enabled: false, cycle: 12 },
        roadNetworkRevision: 0,
        buildMode: null,
        camera: {
            x: (globalThis.innerWidth || 1280) / 2,
            y: (globalThis.innerHeight || 720) / 2,
            zoom: 1
        }
    };
}
export function goalList() {
    return [
        {
            text: 'Deliver 10 Food orders',
            target: 10,
            progress: state => state.deliveredBy.Food || 0,
            done: state => (state.deliveredBy.Food || 0) >= 10
        },
        {
            text: 'Earn £1,000 from deliveries',
            target: 1000,
            progress: state => state.deliveryIncome,
            done: state => state.deliveryIncome >= 1000
        },
        {
            text: 'Upgrade a factory to Level 3',
            target: 1,
            progress: state => state.buildings.some(building => building.kind === 'factory' && building.level >= 3) ? 1 : 0,
            done: state => state.buildings.some(building => building.kind === 'factory' && building.level >= 3)
        },
        {
            text: 'Complete 3 long-distance deliveries',
            target: 3,
            progress: state => state.longContracts,
            done: state => state.longContracts >= 3
        },
        {
            text: 'Keep congestion below 30%',
            target: 1,
            progress: state => state.congestion < .3 ? 1 : 0,
            done: state => state.congestion < .3
        },
        {
            text: 'Reach Company Level 5',
            target: 5,
            progress: state => state.companyLevel,
            done: state => state.companyLevel >= 5
        }
    ];
}
export function makeBuilding(type, x, y, id) {
    return {
        id,
        x,
        y,
        r: 25,
        storage: 0,
        type: type.name,
        kind: type.kind,
        need: type.need || null,
        color: type.color,
        level: 1,
        stock: 0,
        max: type.kind === 'factory' ? 4 : type.kind === 'warehouse' ? 24 : 8,
        production: 0,
        demand: type.kind === 'shop' ? 3 : 0,
        served: 0,
        satisfaction: type.kind === 'shop' ? 100 : 0,
        inventory: type.kind === 'warehouse' ? {} : null,
        loading: 0,
        logistics: 0,
        contract: null,
        pulse: Math.random() * 6.28,
        active: 0
    };
}
//# sourceMappingURL=state.js.map