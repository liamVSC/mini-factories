import {makeBuilding} from '../../state.js';
import {newId} from '../../core/ids.js';
import {buildingPhysicalPlacementReason} from './geometry.js';
import {buildingPlacementTarget} from './placement.js';
import {layoutIsValid} from './layout.js';
import {seedBuildings} from './spawning.js';

export function buildingCost(s,type){
  const base={
    Steel:260,
    Food:220,
    Parts:320,
    Market:180,
    Garage:240,
    Builder:220,
    Plastics:420,
    Glass:500,
    Electronics:520,
    Furniture:600,
    Warehouse:700
  };
  return Math.round((base[type.name]||300)*Math.pow(1.12,s.buildings.length));
}

export function buildingUnlock(t,s){
  if(t.unlock&&(s.research?.[t.unlock]||0)<t.unlockLevel){
    return 'Requires '+t.unlock+' research Lv '+t.unlockLevel;
  }

  const min={
    Steel:1,
    Food:1,
    Parts:2,
    Market:1,
    Garage:2,
    Builder:1,
    Plastics:1,
    Glass:2,
    Electronics:1,
    Furniture:2,
    Warehouse:2
  }[t.name]||1;

  if(s.companyLevel<min)return'Requires Company Level '+min;
  return null;
}

export function canBuild(s,type){
  const reason=buildingUnlock(type,s);
  if(reason)return reason;

  const cap=10+(s.research?.industry||0)*2;
  if(s.buildings.length>=cap)return'Company building capacity reached ('+cap+')';

  const cost=buildingCost(s,type);
  if(s.cash<cost)return'Costs £'+cost;
  return null;
}

export function canPlaceBuildingAt(s,type,x,y){
  const reason=canBuild(s,type);
  if(reason)return reason;
  return buildingPhysicalPlacementReason(s,type,x,y);
}

export function placeBuilding(s,type,x,y){
  if(canPlaceBuildingAt(s,type,x,y))return false;

  const building=makeBuilding(type,x,y,newId());
  const cost=buildingCost(s,type);
  s.cash-=cost;
  s.buildings.push(building);
  if(!layoutIsValid(s.buildings)){
    s.buildings.pop();
    s.cash+=cost;
    return false;
  }
  return building;
}


export function seed(s){
  // Seeding is a one-time initialization transaction. A loaded or already-seeded
  // world must never receive a second starter layout.
  if(!s||s.seeded===true)return false;

  // Refuse to seed a state that already contains buildings. Roads may already
  // exist because map setup can create the starter road network before buildings
  // are seeded; seeding must remain safe in that case while still preventing
  // duplicate starter buildings.

  const originalBuildings=s.buildings;
  const originalSeeded=s.seeded;
  s.buildings=[];
  try{
    seedBuildings(s,buildingPhysicalPlacementReason);

    const expected=['Steel','Food','Parts','Market','Garage','Builder'];
    const seededNames=s.buildings.map(building=>building.type);
    const complete=expected.every(name=>seededNames.includes(name));
    if(!complete||!layoutIsValid(s.buildings)){
      s.buildings=originalBuildings;
      s.seeded=originalSeeded;
      return false;
    }

    s.seeded=true;
    return true;
  }catch(error){
    s.buildings=originalBuildings;
    s.seeded=originalSeeded;
    throw error;
  }
}

export {buildingPlacementTarget,buildingLogisticsAccess} from './placement.js';
