export function normaliseSeed(value,fallback=1){
  const n=Math.floor(Number(value));
  return Number.isFinite(n)&&n>0?(n>>>0)||1:(Math.floor(Number(fallback))>>>0)||1;
}

export function createRng(seed=1){
  let value=normaliseSeed(seed);
  return()=>{
    value=(Math.imul(value,1664525)+1013904223)>>>0;
    return value/4294967296;
  };
}

export function seedFromState(state){
  return normaliseSeed(state?.layoutSeed,state?.gameSeed);
}
