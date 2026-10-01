import {finitePoint} from '../roads/geometry.js';
import {isInsideWorldBounds} from '../roads/validation.js';
import {riverY,WORLD_MARGIN} from '../terrain.js';

export function buildingClearance(a,b){
  if(a?.kind==='factory'&&b?.kind==='factory')return 72;
  if(a?.kind==='factory'||b?.kind==='factory')return 36;
  return 18;
}

function footprintForKind(kind){
  if(kind==='warehouse')return{halfWidth:48,halfDepth:33};
  if(kind==='factory')return{halfWidth:39,halfDepth:31};
  return{halfWidth:35,halfDepth:28};
}

function overlapsBuilding(candidate,b,clearance){
  const other=buildingFootprint(b);
  const overlapX=Math.abs(Number(b.x)-candidate.x)<candidate.footprint.halfWidth+other.halfWidth+clearance;
  const overlapY=Math.abs(Number(b.y)-candidate.y)<candidate.footprint.halfDepth+other.halfDepth+clearance;
  return overlapX&&overlapY;
}

export function buildingPhysicalPlacementReason(s,type,x,y){
  if(!type)return'Unknown building';
  const px=Number(x),py=Number(y);
  if(!Number.isFinite(px)||!Number.isFinite(py))return'Invalid placement';
  if(!isInsideWorldBounds({x:px,y:py},WORLD_MARGIN))return'Outside the playable area';

  const candidate={kind:type.kind,x:px,y:py,footprint:buildingFootprint({kind:type.kind})};
  for(const building of s.buildings||[]){
    if(!finitePoint(building))continue;
    if(candidate.kind==='factory'&&building.kind==='factory'&&Math.hypot(px-Number(building.x),py-Number(building.y))<250){
      return'Too close to another factory';
    }
    if(overlapsBuilding(candidate,building,buildingClearance(candidate,building))){
      return candidate.kind==='factory'&&building.kind==='factory'
        ?'Too close to another factory'
        :'Too close to another building';
    }
  }

  const riverClearance=105+Math.max(candidate.footprint.halfDepth,candidate.footprint.halfWidth)*.18;
  if(Math.abs(py-riverY(px))<riverClearance)return'Too close to the river';
  return null;
}

export function buildingHitbox(building,tolerance=0){
  const footprint=buildingFootprint(building);
  return{
    minX:building.x-footprint.halfWidth-tolerance,
    maxX:building.x+footprint.halfWidth+tolerance,
    minY:building.y-footprint.halfDepth-tolerance,
    maxY:building.y+footprint.halfDepth+tolerance
  };
}

export function buildingAtPoint(s,p,tolerance=10){
  if(!finitePoint(p))return null;

  let best=null;
  let bestDistance=Infinity;
  for(const building of s.buildings||[]){
    const hit=buildingHitbox(building,tolerance);
    const dx=Math.max(hit.minX-p.x,0,p.x-hit.maxX);
    const dy=Math.max(hit.minY-p.y,0,p.y-hit.maxY);
    const distance=Math.hypot(dx,dy);

    if(distance<=tolerance&&distance<bestDistance){
      best=building;
      bestDistance=distance;
    }
  }
  return best;
}

export function nearestBuilding(s,p){
  return buildingAtPoint(s,p,18);
}

export function buildingFootprint(building){
  return footprintForKind(building?.kind);
}

const DOCK_SPECS={
  factory:[
    {name:'north-loading',x:0,y:31.5,normal:{x:0,y:1},width:22},
    {name:'south-loading',x:-23.4,y:-31.5,normal:{x:0,y:-1},width:13}
  ],
  warehouse:[
    {name:'north-main',x:0,y:33.5,normal:{x:0,y:1},width:24},
    {name:'north-secondary',x:-30.7,y:33.5,normal:{x:0,y:1},width:14},
    {name:'south-secondary',x:30.7,y:-33.5,normal:{x:0,y:-1},width:14}
  ],
  default:[
    {name:'front-entrance',x:0,y:-28.5,normal:{x:0,y:-1},width:12}
  ]
};

export function buildingDockPoints(building){
  const x=Number(building?.x)||0;
  const y=Number(building?.y)||0;
  const specs=DOCK_SPECS[building?.kind]||DOCK_SPECS.default;

  return specs.map(dock=>({
    ...dock,
    point:{x:x+dock.x,y:y+dock.y},
    approach:{
      x:x+dock.x+dock.normal.x*10,
      y:y+dock.y+dock.normal.y*10
    }
  }));
}

export function buildingConnectionPoint(building,target,exteriorOffset=2.5){
  const dx=Number(target?.x)-Number(building?.x);
  const dy=Number(target?.y)-Number(building?.y);
  const distanceToTarget=Math.hypot(dx,dy)||1;
  const ux=dx/distanceToTarget;
  const uy=dy/distanceToTarget;
  const footprint=buildingFootprint(building);

  const tx=Math.abs(ux)>1e-6?footprint.halfWidth/Math.abs(ux):Infinity;
  const ty=Math.abs(uy)>1e-6?footprint.halfDepth/Math.abs(uy):Infinity;
  const distance=Math.min(tx,ty)+exteriorOffset;

  return{
    x:building.x+ux*distance,
    y:building.y+uy*distance,
    building,
    distance:0
  };
}

export function buildingFootprintRadius(building){
  const footprint=buildingFootprint(building);
  return Math.max(
    26,
    (building?.r||25)+9,
    Math.min(footprint.halfWidth,footprint.halfDepth)
  );
}
