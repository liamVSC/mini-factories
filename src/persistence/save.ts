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
    // Preserve every persisted truck record until hydration can reconcile it.
    // Filtering malformed trucks here can silently discard cargo before load.ts
    // has a chance to refund that cargo to its canonical source building.
    trucks: Array.isArray(state.trucks) ? state.trucks : [],
    particles: []
  };
}
