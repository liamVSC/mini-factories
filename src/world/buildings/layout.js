import {buildingFootprint,buildingClearance} from './geometry.js';
import {isInsideWorldBounds} from '../roads/validation.js';
import {riverY,WORLD_MARGIN} from '../terrain.js';

export const FACTORY_MIN_DISTANCE=250;
export const FACTORY_MIN_SPAWN_RADIUS=720;

const distance=(a,b)=>Math.hypot(Number(a.x)-Number(b.x),Number(a.y)-Number(b.y));

export function buildingOverlaps(a,b){
  const af=buildingFootprint(a),bf=buildingFootprint(b);
  const clearance=buildingClearance(a,b);
  return Math.abs(Number(a.x)-Number(b.x))<af.halfWidth+bf.halfWidth+clearance
    &&Math.abs(Number(a.y)-Number(b.y))<af.halfDepth+bf.halfDepth+clearance;
}

export function buildingPlacementConflict(a,b){
  return buildingOverlaps(a,b)
    ||(a?.kind==='factory'&&b?.kind==='factory'&&distance(a,b)<FACTORY_MIN_DISTANCE);
}

export function validateBuildingLayout(buildings=[]){
  const issues=[];
  const seenIds=new Set();

  for(let i=0;i<buildings.length;i++){
    const building=buildings[i];
    if(!building||!Number.isFinite(Number(building.x))||!Number.isFinite(Number(building.y))){
      issues.push({type:'invalid-position',index:i,building});
      continue;
    }

    if(building.id){
      if(seenIds.has(building.id))issues.push({type:'duplicate-id',index:i,building});
      seenIds.add(building.id);
    }

    if(!isInsideWorldBounds(building,WORLD_MARGIN)){
      issues.push({type:'outside-bounds',index:i,building});
    }

    const footprint=buildingFootprint(building);
    const riverClearance=105+Math.max(footprint.halfDepth,footprint.halfWidth)*.18;
    if(Math.abs(Number(building.y)-riverY(Number(building.x)))<riverClearance){
      issues.push({type:'river-conflict',index:i,building});
    }

    for(let j=0;j<i;j++){
      const other=buildings[j];
      if(buildingPlacementConflict(building,other)){
        issues.push({
          type:building.kind==='factory'&&other?.kind==='factory'?'factory-spacing':'overlap',
          index:i,
          otherIndex:j,
          building,
          other
        });
      }
    }
  }

  return issues;
}

function layoutRotation(seed){
  const value=Math.abs(Math.floor(Number(seed)||1))%360;
  return value/360*Math.PI*2;
}

export function factorySpawnCandidates(seed,attempt=0){
  const rotation=layoutRotation(seed);
  // Keep starter factories decisively outside the central play area. The old 620-unit
  // ring still looked central on the default camera, so the new ring starts at 900.
  const radius=900+Math.floor(attempt/6)*85;
  const phase=attempt%6;
  const candidates=[];

  for(let slot=0;slot<3;slot++){
    const angle=rotation+slot*(Math.PI*2/3)+(phase-2.5)*0.045;
    const radialOffset=phase>=3?(phase-2)*18:0;
    candidates.push({
      x:Math.cos(angle)*(radius+radialOffset),
      y:Math.sin(angle)*(radius+radialOffset)
    });
  }

  return candidates;
}

function validCandidate(building,buildings){
  if(!isInsideWorldBounds(building,WORLD_MARGIN))return false;
  const footprint=buildingFootprint(building);
  const riverClearance=105+Math.max(footprint.halfDepth,footprint.halfWidth)*.18;
  if(Math.abs(Number(building.y)-riverY(Number(building.x)))<riverClearance)return false;
  return !buildings.some(other=>buildingPlacementConflict(building,other));
}

export function repairBuildingLayout(buildings,seed=1){
  const source=Array.isArray(buildings)?buildings.filter(Boolean):[];
  const accepted=[];
  const factories=source.filter(b=>b.kind==='factory');
  const others=source.filter(b=>b.kind!=='factory');

  for(let index=0;index<factories.length;index++){
    const original=factories[index];
    const current={...original};
    const centralSpawn=factories.length>1&&Math.hypot(Number(current.x),Number(current.y))<FACTORY_MIN_SPAWN_RADIUS;
    if(validCandidate(current,accepted)&&!centralSpawn){
      accepted.push(current);
      continue;
    }

    let found=null;
    for(let attempt=0;attempt<30&&!found;attempt++){
      const candidates=factorySpawnCandidates(seed+index*97,attempt);
      for(const point of candidates){
        const test={...original,...point};
        if(validCandidate(test,accepted)){found=test;break;}
      }
    }
    if(found)accepted.push(found);
  }

  for(const original of others){
    const current={...original};
    if(validCandidate(current,accepted)){
      accepted.push(current);
      continue;
    }

    let found=null;
    for(let ring=1;ring<=18&&!found;ring++){
      const radius=ring*70;
      for(let i=0;i<32;i++){
        const angle=(i/32)*Math.PI*2;
        const test={
          ...original,
          x:Number(original.x)+Math.cos(angle)*radius,
          y:Number(original.y)+Math.sin(angle)*radius
        };
        if(validCandidate(test,accepted)){found=test;break;}
      }
    }
    if(found)accepted.push(found);
  }

  return accepted;
}

export function layoutIsValid(buildings=[]){
  return validateBuildingLayout(buildings).length===0;
}
