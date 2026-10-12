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
    trucks: Array.isArray(state.trucks) ? state.trucks : [],
    particles: []
  };
}
