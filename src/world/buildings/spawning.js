import {TYPES,makeBuilding} from '../../state.js';
import {createRng,seedFromState} from '../../core/rng.js';
import {newId} from '../../core/ids.js';
import {district} from '../terrain.js';
import {factorySpawnCandidates} from './layout.js';

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

function candidatePosition(factorySlot,rotation,random,maxRadius,minRadius){
  const angle=rotation+random()*Math.PI*2;
  const radius=minRadius+random()*Math.max(1,maxRadius-minRadius);
  return{
    x:Math.cos(angle)*radius,
    y:Math.sin(angle)*radius
  };
}

function addBuilding(s,type,x,y){
  const building=makeBuilding(type,x,y,newId());
  building.district=district(x,y);
  s.buildings.push(building);
  return building;
}

export function spawnBuilding(s,kind,forced,placementReason){
  const random=createRng(seedFromState(s));
  const rotation=(seedFromState(s)/4294967296)*Math.PI*2;
  const type=chooseBuildingType(s,kind,forced,random);
  if(!type)return null;

  if(kind==='factory'){
    const factoryCount=(s.buildings||[]).filter(building=>building.kind==='factory').length;
    const seed=Number(s.layoutSeed||s.gameSeed||1)+factoryCount*97;

    for(let attempt=0;attempt<30;attempt++){
      const candidates=factorySpawnCandidates(seed,attempt);
      const preferred=candidates[factoryCount%3];
      const ordered=[preferred,...candidates.filter(point=>point!==preferred)];

      for(const point of ordered){
        if(!placementReason(s,type,point.x,point.y)){
          return addBuilding(s,type,point.x,point.y);
        }
      }
    }
    return null;
  }

  const {minRadius,maxRadius}=spawnSearchRadius(s);
  for(let attempt=0;attempt<500;attempt++){
    const point=candidatePosition(-1,rotation,random,maxRadius,minRadius);
    if(placementReason(s,type,point.x,point.y))continue;
    return addBuilding(s,type,point.x,point.y);
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
