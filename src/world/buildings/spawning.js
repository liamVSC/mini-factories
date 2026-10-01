import {TYPES,makeBuilding} from '../../state.js';
import {createRng,seedFromState} from '../../core/rng.js';
import {newId} from '../../core/ids.js';
import {riverY,WORLD_HALF_SIZE,WORLD_MARGIN} from '../terrain.js';
import {buildingFootprint} from './geometry.js';
import {factorySpawnCandidates} from './layout.js';

const FACTORY_TARGET_RADIUS=900;
const FACTORY_RADIUS_MIN=720;
const FACTORY_RADIUS_MAX=1120;
const BUILDING_SEARCH_RADIUS=820;
const RIVER_BUFFER=145;

function chooseBuildingType(s,kind,forced,random){
  const pool=TYPES.filter(type=>type.kind===kind&&(!forced||type.name===forced));
  if(!pool.length)return null;
  if(forced||pool.length===1)return pool[Math.floor(random()*pool.length)];

  const recent=new Set((s.buildings||[]).slice(-3).map(building=>building.type));
  const preferred=pool.filter(type=>!recent.has(type.name));
  const candidates=preferred.length?preferred:pool;
  return candidates[Math.floor(random()*candidates.length)];
}

function addBuilding(s,type,x,y){
  const building=makeBuilding(type,x,y,newId());
  s.buildings.push(building);
  return building;
}

function distance(a,b){return Math.hypot(Number(a.x)-Number(b.x),Number(a.y)-Number(b.y));}

function insideBounds(x,y){
  const limit=WORLD_HALF_SIZE-WORLD_MARGIN;
  return Math.abs(x)<=limit&&Math.abs(y)<=limit;
}

function riverPenalty(x,y){
  const gap=Math.abs(y-riverY(x));
  if(gap<RIVER_BUFFER)return 100000+(RIVER_BUFFER-gap)*500;
  return Math.max(0,220-gap);
}

function roadScore(s,x,y){
  const roads=Array.isArray(s.roads)?s.roads:[];
  if(!roads.length)return 0;
  let nearest=Infinity;
  for(const road of roads){
    for(const point of road.points||[]){
      nearest=Math.min(nearest,distance({x,y},point));
    }
  }
  if(!Number.isFinite(nearest))return 0;
  if(nearest<45)return 900;
  if(nearest<120)return 650;
  if(nearest<220)return 350;
  if(nearest<360)return 100;
  return 0;
}

function neighbourhoodScore(s,x,y,type){
  const buildings=Array.isArray(s.buildings)?s.buildings:[];
  let score=0;
  let nearest=Infinity;

  for(const building of buildings){
    const d=distance({x,y},building);
    nearest=Math.min(nearest,d);

    if(building.kind===type.kind){
      score+=Math.min(240,d*.45);
    }else if(type.kind==='factory'&&building.kind==='shop'){
      // Factories benefit from being close enough to the commercial network to
      // keep routes practical, but not packed into the same block.
      if(d>=260&&d<=700)score+=180;
      else if(d<220)score-=220;
    }else if(type.kind==='shop'&&building.kind==='factory'){
      if(d>=180&&d<=520)score+=120;
    }
  }

  if(buildings.length&&nearest<(type.kind==='factory'?260:100))score-=600;
  return score;
}

function candidateScore(s,type,x,y,random){
  if(!insideBounds(x,y))return -Infinity;

  const footprint=buildingFootprint({kind:type.kind});
  if(Math.abs(y-riverY(x))<RIVER_BUFFER+Math.max(footprint.halfWidth,footprint.halfDepth)*.18)return -Infinity;

  const buildings=s.buildings||[];
  for(const other of buildings){
    const d=distance({x,y},other);
    const minimum=type.kind==='factory'&&other.kind==='factory'
      ?250
      :type.kind==='factory'||other.kind==='factory'?115:85;
    if(d<minimum)return -Infinity;
  }

  score+=roadScore(s,x,y);
  score+=neighbourhoodScore(s,x,y,type);
  score-=riverPenalty(x,y);

  const centreDistance=Math.hypot(x,y);
  if(type.kind==='factory'){
    if(centreDistance<FACTORY_RADIUS_MIN)return -Infinity;
    score-=Math.abs(centreDistance-FACTORY_TARGET_RADIUS)*.9;
    score+=Math.min(centreDistance,FACTORY_RADIUS_MAX)*.12;
  }else{
    score-=Math.max(0,centreDistance-BUILDING_SEARCH_RADIUS)*.7;
  }

  score+=random()*35;
  return score;
}

function candidatePoints(s,type,random){
  const points=[];
  const rotation=(seedFromState(s)/4294967296)*Math.PI*2;

  if(type.kind==='factory'){
    for(let attempt=0;attempt<18;attempt++){
      for(const point of factorySpawnCandidates(seedFromState(s)+attempt*97,attempt)){
        points.push(point);
      }
    }
  }else{
    for(let attempt=0;attempt<420;attempt++){
      const angle=rotation+random()*Math.PI*2;
      const radius=90+random()*BUILDING_SEARCH_RADIUS;
      points.push({x:Math.cos(angle)*radius,y:Math.sin(angle)*radius});
    }
  }
  return points;
}

function findBestPosition(s,type,random){
  let best=null;
  let bestScore=-Infinity;

  for(const point of candidatePoints(s,type,random)){
    const score=candidateScore(s,type,point.x,point.y,random);
    if(score>bestScore){
      bestScore=score;
      best=point;
    }
  }

  return best;
}

export function spawnBuilding(s,kind,forced,placementReason){
  // Derive each spawn decision from the stable map seed plus the current world
  // shape. This keeps new-game seeding deterministic without replaying the exact same
  // random stream for every building created during a session.
  const kindSeed=kind==='factory'?0x9e3779b9:0x7f4a7c15;
  const typeSeed=forced?Array.from(String(forced)).reduce((sum,char)=>sum+char.charCodeAt(0),0):0;
  const spawnSeed=(seedFromState(s)+Math.imul((s.buildings?.length||0)+1,0x45d9f3b)+kindSeed+typeSeed)>>>0;
  const random=createRng(spawnSeed);
  const type=chooseBuildingType(s,kind,forced,random);
  if(!type)return null;

  // Score deterministic candidates against the actual world constraints and existing buildings/roads.
  const preferred=findBestPosition(s,type,random);

  if(preferred&&!placementReason(s,type,preferred.x,preferred.y)){
    return addBuilding(s,type,preferred.x,preferred.y);
  }

  // Keep a bounded fallback search so unusual/custom maps still get a chance
  // to produce a valid building without an unbounded placement loop.
  for(let attempt=0;attempt<180;attempt++){
    const angle=random()*Math.PI*2;
    const radius=kind==='factory'
      ?FACTORY_RADIUS_MIN+random()*(FACTORY_RADIUS_MAX-FACTORY_RADIUS_MIN)
      :90+random()*BUILDING_SEARCH_RADIUS;
    const point={x:Math.cos(angle)*radius,y:Math.sin(angle)*radius};
    // The fallback must obey the same hard world constraints as the scored
    // candidates; otherwise a crowded/custom map could bypass river or bounds
    // rules merely because the primary search found no usable candidate.
    if(candidateScore(s,type,point.x,point.y,()=>0)>-Infinity&&
      !placementReason(s,type,point.x,point.y)){
      return addBuilding(s,type,point.x,point.y);
    }
  }

  return null;
}

export function seedBuildings(s,placementReason){
  // Seed factories first so shops can deliberately react to their positions.
  for(const type of ['Steel','Food','Parts']){
    spawnBuilding(s,'factory',type,placementReason);
  }
  for(const type of ['Market','Garage','Builder']){
    spawnBuilding(s,'shop',type,placementReason);
  }
}
