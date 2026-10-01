import {dist,finitePoint} from '../roads/geometry.js';
import {isInsideWorldBounds} from '../roads/validation.js';
import {riverY,WORLD_MARGIN} from '../terrain.js';

export function buildingPhysicalPlacementReason(s,type,x,y){if(!type)return'Unknown building';if(!Number.isFinite(Number(x))||!Number.isFinite(Number(y)))return'Invalid placement';if(!isInsideWorldBounds({x,y},WORLD_MARGIN))return'Outside the playable area';const candidate={kind:type.kind,x:Number(x),y:Number(y)};const footprint=buildingFootprint(candidate);for(const b of s.buildings||[]){if(!finitePoint(b))continue;const other=buildingFootprint(b),clearance=candidate.kind==='factory'&&b.kind==='factory'?48:18;const overlapX=Math.abs(Number(b.x)-Number(x))<footprint.halfWidth+other.halfWidth+clearance;const overlapY=Math.abs(Number(b.y)-Number(y))<footprint.halfDepth+other.halfDepth+clearance;if(overlapX&&overlapY)return candidate.kind==='factory'&&b.kind==='factory'?'Too close to another factory':'Too close to another building'}if(Math.abs(Number(y)-riverY(Number(x)))<105+Math.max(footprint.halfDepth,footprint.halfWidth)*.18)return'Too close to the river';return null}

export function buildingHitbox(building,tolerance=0){const footprint=buildingFootprint(building);return{minX:building.x-footprint.halfWidth-tolerance,maxX:building.x+footprint.halfWidth+tolerance,minY:building.y-footprint.halfDepth-tolerance,maxY:building.y+footprint.halfDepth+tolerance}}

export function buildingAtPoint(s,p,tolerance=10){if(!finitePoint(p))return null;let best=null,bestDistance=Infinity;for(const b of s.buildings||[]){const hit=buildingHitbox(b,tolerance);const dx=Math.max(hit.minX-p.x,0,p.x-hit.maxX),dy=Math.max(hit.minY-p.y,0,p.y-hit.maxY),d=Math.hypot(dx,dy);if(d<=tolerance&&d<bestDistance){best=b;bestDistance=d}}return best}

export function nearestBuilding(s,p){return buildingAtPoint(s,p,18)}

export function buildingFootprint(building){
  if(building?.kind==='warehouse')return{halfWidth:48,halfDepth:33};
  if(building?.kind==='factory')return{halfWidth:39,halfDepth:31};
  return{halfWidth:35,halfDepth:28};
}

export function buildingDockPoints(building){
  const x=Number(building?.x)||0,y=Number(building?.y)||0;
  const specs=building?.kind==='factory'
    ?[{name:'north-loading',x:0,y:31.5,normal:{x:0,y:1},width:22},{name:'south-loading',x:-23.4,y:-31.5,normal:{x:0,y:-1},width:13}]
    :building?.kind==='warehouse'
      ?[{name:'north-main',x:0,y:33.5,normal:{x:0,y:1},width:24},{name:'north-secondary',x:-30.7,y:33.5,normal:{x:0,y:1},width:14},{name:'south-secondary',x:30.7,y:-33.5,normal:{x:0,y:-1},width:14}]
      :[{name:'front-entrance',x:0,y:-28.5,normal:{x:0,y:-1},width:12}];
  return specs.map(dock=>({...dock,point:{x:x+dock.x,y:y+dock.y},approach:{x:x+dock.x+dock.normal.x*10,y:y+dock.y+dock.normal.y*10}}));
}

export function buildingConnectionPoint(building,target,exteriorOffset=2.5){
  const dx=Number(target?.x)-Number(building?.x),dy=Number(target?.y)-Number(building?.y);
  const len=Math.hypot(dx,dy)||1;
  const ux=dx/len,uy=dy/len;
  const footprint=buildingFootprint(building);
  // Buildings are rendered as rectangles, so use the exact ray/rectangle
  // intersection instead of an oversized circular radius. Keep a tiny
  // exterior offset so the road centreline sits just outside the facade while
  // the shoulder/surface still visually meets and overlaps the building edge.
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

function buildingFootprintRadius(building){
  const footprint=buildingFootprint(building);
  return Math.max(26,(building?.r||25)+9,Math.min(footprint.halfWidth,footprint.halfDepth));
}
