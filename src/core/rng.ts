export function normaliseSeed(value: unknown, fallback = 1): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? (n >>> 0) || 1 : (Math.floor(Number(fallback)) >>> 0) || 1;
}

export function createRng(seed = 1): () => number {
  let value = normaliseSeed(seed);
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function seedFromState(state: { layoutSeed?: unknown; gameSeed?: unknown } | null | undefined): number {
  return normaliseSeed(state?.layoutSeed, state?.gameSeed);
}
