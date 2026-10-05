export function serialise(s){
  const d={...s};
  delete d.week;
  delete d.weekTime;
  delete d.version;
  return{version:6,...d,selected:null,trucks:[],particles:[]};
}
