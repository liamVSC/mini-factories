import {validRoadPoints,projectSegment} from '../roads/geometry.js';
import {buildingConnectionPoint,buildingRoadEntrance,buildingRoadFootprint,buildingRoadHitbox,buildingFootprintRadius} from './geometry.js';

export function resolveBuildingRoadEndpoint(s,p,target=null,directionTarget=p){
  const building=target||s.buildings?.find(candidate=>{const hit=buildingRoadHitbox(candidate,0);return Number(p?.x)>=hit.minX&&Number(p?.x)<=hit.maxX&&Number(p?.y)>=hit.minY&&Number(p?.y)<=hit.maxY;});
  if(!building)return null;
  const point=buildingConnectionPoint(building,directionTarget);
  return{building,point};
}

export function buildingRoadDistance(building,p){
  if(!building||!p)return Infinity;
  const hit=buildingRoadHitbox(building,0);
  const dx=Math.max(hit.minX-p.x,0,p.x-hit.maxX);
  const dy=Math.max(hit.minY-p.y,0,p.y-hit.maxY);
  return Math.hypot(dx,dy);
}

export function resolveBuildingRoadTarget(s,p,maxDistance=46){
  if(!p)return null;
  let best=null;
  for(const building of s.buildings||[]){
    const distance=buildingRoadDistance(building,p);
    if(distance>maxDistance)continue;
    if(!best||distance<best.distance){
      best={building,point:buildingConnectionPoint(building,p),distance};
    }
  }
  return best;
}

export function buildingRoadAttachment(s,building){
  if(!building)return null;
  const entrance=buildingRoadEntrance(building);
  const footprint=buildingRoadFootprint(building);
  // Allow established roads to remain logistics-connected even when their
  // pavement predates the visual yard/gate. New road placement still snaps to
  // the canonical entrance; this wider attachment window is only for persisted
  // compatibility and seeded road networks.
  const limit=Math.max(70,Math.hypot(footprint.halfWidth,footprint.halfDepth)+6,(building.r||25)+18);
  let best=null;
  for(const road of s.roads||[]){
    const points=validRoadPoints(road?.points,0);
    if(!points)continue;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],q=projectSegment(building,a,b);
      if(q.distance<=limit&&(!best||q.distance<best.distance)){
        best={road,point:{x:q.point.x,y:q.point.y},distance:q.distance,segment:i-1};
      }
    }
  }
  // Persisted/seeded worlds can still contain roads that pre-date the canonical
  // gate. Keep those roads attached to the site for routing compatibility, while
  // exposing the canonical entrance separately so new road snapping and rendering
  // always use the single gate.
  if(!best||!entrance)return null;
  return{...best,entrance:{...entrance}};
}

export function buildingRoadEndpointClearance(building){
  return buildingFootprintRadius(building);
}

export function nearestBuildingRoadTarget(s,p,maxDistance=24){
  const target=resolveBuildingRoadTarget(s,p,maxDistance);
  if(!target)return null;
  return target;
}
