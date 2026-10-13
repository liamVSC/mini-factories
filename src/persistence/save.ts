import type { GameState } from '../state.js';

export function serialise(state: GameState): Record<string, unknown> {
  const data: Record<string, unknown> = { ...state };
  delete data.week;
  delete data.weekTime;
  delete data.version;
  return {
    version: 6,
    ...data,
    selected: null,
    // Keep valid trucks intact. For malformed trucks with recoverable cargo,
    // persist only the source/destination IDs and cargo so hydration can refund
    // it without carrying stale route/lane references into the next session.
    trucks: Array.isArray(state.trucks) ? state.trucks.flatMap((truck: any) => {
      const route = Array.isArray(truck?.route) ? truck.route : [];
      const valid = typeof truck?.id === 'string' && truck.id.length > 0
        && ['delivery', 'warehouse', 'return'].includes(String(truck.stage))
        && typeof truck.source?.id === 'string' && typeof truck.to?.id === 'string'
        && Number.isFinite(Number(truck.cargo)) && Number(truck.cargo) >= 0
        && Number.isFinite(Number(truck.t)) && Number.isFinite(Number(truck.speed)) && Number(truck.speed) > 0
        && route.length >= 2 && route.every((point: any) => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y)));
      if (valid) return [truck];
      const sourceId = truck?.source?.id;
      const cargo = Number(truck?.cargo);
      if (typeof sourceId !== 'string' || !sourceId || !Number.isFinite(cargo) || cargo <= 0) return [];
      return [{
        id: typeof truck?.id === 'string' ? truck.id : '',
        source: { id: sourceId },
        to: { id: typeof truck?.to?.id === 'string' ? truck.to.id : '' },
        cargo,
        stage: String(truck?.stage || ''),
        t: Number.isFinite(Number(truck?.t)) ? Number(truck.t) : 0,
        speed: 0,
        route: []
      }];
    }) : [],
    particles: []
  };
}
