import {TYPES,makeBuilding} from '../../state.js';
import {createRng,seedFromState} from '../../core/rng.js';
import {newId} from '../../core/ids.js';
import {district,riverY} from '../terrain.js';

function chooseBuildingType(s,kind,forced,random){
  const pool=TYPES.filter(type=>type.kind===kind&&(!forced||type.name===forced));
  if(!pool.length)return null;

  if(forced||pool.length===1)return pool[Math.floor(random()*pool.length)];

  const recent=new Set((s.buildings||[]).slice(-2).map(building=>building.type));
  const preferred=pool.filter(type=>!recent.has(type.name));
  const candidates=preferred.length?preferred:pool;
  return candidates[Math.floor(random()*candidates.length)];
}

function spawnSearchRadius(s){
  const count=s.buildings?.length||0;
  const minRadius=count<6?170:280;
  const maxRadius=count<6?430:Math.min(760,430+(s.companyLevel||1)*22);
  return{minRadius,maxRadius};
}

function candidatePosition(s,kind,factorySlot,rotation,random,maxRadius,minRadius,index){
  const sectorAngle=factorySlot>=0
    ?rotation+factorySlot*(Math.PI*2/3)+(random()-.5)*.24+(index%5)*.045
    :random()*Math.PI*2;
  const angle=factorySlot>=0
    ?sectorAngle
    :rotation+random()*Math.PI*2;
  const radius=factorySlot>=0
    ?Math.max(300,Math.min(maxRadius,330+random()*190))
    :minRadius+random()*Math.max(1,maxRadius-minRadius);

  let x=Math.cos(angle)*radius+(random()-.5)*45;
  let y=Math.sin(angle)*radius+(random()-.5)*90;
  const river=riverY(x);

  if(Math.abs(y-river)<105)y+=y<river?-120:120;
  return{x,y};
}

export function spawnBuilding(s,kind,forced,placementReason){
  const random=createRng(seedFromState(s));
  const rotation=(seedFromState(s)/4294967296)*Math.PI*2;
  const type=chooseBuildingType(s,kind,forced,random);
  if(!type)return null;

  const factorySlot=kind==='factory'
    ?(s.buildings||[]).filter(building=>building.kind==='factory').length
    :-1;
  const {minRadius,maxRadius}=spawnSearchRadius(s);

  for(let attempt=0;attempt<500;attempt++){
    const {x,y}=candidatePosition(
      s,kind,factorySlot,rotation,random,maxRadius,minRadius,attempt
    );
    if(placementReason(s,type,x,y))continue;

    const building=makeBuilding(type,x,y,newId());
    building.district=district(x,y);
    s.buildings.push(building);
    return building;
  }

  return null;
}

export function seedBuildings(s,placementReason){
  for(const type of ['Steel','Food','Parts']){
    spawnBuilding(s,'factory',type,placementReason);
  }
  for(const type of ['Market','Garage','Builder']){
    spawnBuilding(s,'shop',type,placementReason);
  }
}
