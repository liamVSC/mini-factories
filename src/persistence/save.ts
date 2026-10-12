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
    // Trucks are persisted with their cargo; hydration rebinds building references
    // to the canonical loaded buildings and reconciles contract in-flight totals.
    trucks: Array.isArray(state.trucks) ? state.trucks.filter((truck: any) => {
      const route = Array.isArray(truck?.route) ? truck.route : [];
      return typeof truck?.id === 'string' && truck.id.length > 0
        && ['delivery', 'warehouse', 'return'].includes(String(truck.stage))
        && typeof truck.source?.id === 'string' && typeof truck.to?.id === 'string'
        && Number.isFinite(Number(truck.cargo)) && Number(truck.cargo) >= 0
        && Number.isFinite(Number(truck.t)) && Number.isFinite(Number(truck.speed)) && Number(truck.speed) > 0
        && route.length >= 2 && route.every((point: any) => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y)));
    }) : [],
    particles: []
  };
}
