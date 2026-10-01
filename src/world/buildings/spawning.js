import {TYPES,makeBuilding} from '../../state.js';
import {createRng,seedFromState} from '../../core/rng.js';
import {newId} from '../../core/ids.js';
import {district,riverY} from '../terrain.js';
import {buildingLocationScore} from './intelligence.js';

export function spawnBuilding(s,kind,forced,placementReason){
  const random=createRng(seedFromState(s));
  const layoutSeed=seedFromState(s);
  const layoutRotation=(layoutSeed/4294967296)*Math.PI*2;
  const pool=TYPES.filter(t=>t.kind===kind&&(!forced||t.name===forced));
  if(!pool.length)return null;
  let candidates=pool;
  if(!forced&&pool.length>1){
    const recent=s.buildings.slice(-2).map(b=>b.type);
    const filtered=pool.filter(t=>!recent.includes(t.name));
    if(filtered.length)candidates=filtered;
  }
  const type=candidates[Math.floor(random()*candidates.length)];
  const count=s.buildings.length;
  const factoryCount=(s.buildings||[]).filter(b=>b.kind==='factory').length;
  const factorySlot=kind==='factory'?factoryCount:-1;
  const minRadius=count<6?170:280;
  const maxRadius=count<6?430:Math.min(760,430+s.companyLevel*22);
  for(let n=0;n<500;n++){
    const sectorAngle=factorySlot>=0
      ?layoutRotation+factorySlot*(Math.PI*2/3)+(random()-.5)*.24+(n%5)*.045
      :random()*Math.PI*2;
    const angle=factorySlot>=0?sectorAngle:layoutRotation+random()*Math.PI*2;
    const radius=factorySlot>=0
      ?Math.max(300,Math.min(maxRadius,330+random()*190))
      :minRadius+random()*Math.max(1,maxRadius-minRadius);
    let x=Math.cos(angle)*radius+(random()-.5)*45;
    let y=Math.sin(angle)*radius+(random()-.5)*90;
    const river=riverY(x);
    if(Math.abs(y-river)<105)y+=y<river?-120:120;
    if(!placementReason(s,type,x,y)){
      const building=makeBuilding(type,x,y,newId());
      building.district=district(x,y);
      s.buildings.push(building);
      return building;
    }
  }
  return null;
}

export function seedBuildings(s,placementReason){
  for(const type of ['Steel','Food','Parts'])spawnBuilding(s,'factory',type,placementReason);
  for(const type of ['Market','Garage','Builder'])spawnBuilding(s,'shop',type,placementReason);
}
