import {dist,finitePoint} from '../roads/geometry.js';

export function buildingHitbox(building,tolerance=0){const footprint=buildingFootprint(building);return{minX:building.x-footprint.halfWidth-tolerance,maxX:building.x+footprint.halfWidth+tolerance,minY:building.y-footprint.halfDepth-tolerance,maxY:building.y+footprint.halfDepth+tolerance}}

export function buildingAtPoint(s,p,tolerance=10){if(!finitePoint(p))return null;let best=null,bestDistance=Infinity;for(const b of s.buildings||[]){const hit=buildingHitbox(b,tolerance);const dx=Math.max(hit.minX-p.x,0,p.x-hit.maxX),dy=Math.max(hit.minY-p.y,0,p.y-hit.maxY),d=Math.hypot(dx,dy);if(d<=tolerance&&d<bestDistance){best=b;bestDistance=d}}return best}

export function buildingFootprint(building){
  if(building?.kind==='warehouse')return{halfWidth:48,halfDepth:33};
  if(building?.kind==='factory')return{halfWidth:39,halfDepth:31};
  return{halfWidth:35,halfDepth:28};
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

export function nearestBuilding(s,p){return buildingAtPoint(s,p,18)}
