import type { GameState } from '../state.ts';

export function serialise(state: GameState): Record<string, unknown> {
  const data: Record<string, unknown> = { ...state };
  delete data.week;
  delete data.weekTime;
  delete data.version;
  return {
    version: 6,
    ...data,
    selected: null,
    trucks: [],
    particles: []
  };
}
