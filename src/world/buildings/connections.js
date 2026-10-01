import {validRoadPoints,projectSegment} from '../roads/geometry.js';
import {buildingAtPoint,buildingConnectionPoint,buildingFootprint,buildingHitbox} from './geometry.js';

export function resolveBuildingRoadEndpoint(s,p,target=null,directionTarget=p){
  const building=target||buildingAtPoint(s,p,0);
  if(!building)return null;
  const point=buildingConnectionPoint(building,directionTarget);
  return{building,point};
}

export function buildingRoadAttachment(s,building){
  if(!building)return null;
  const footprint=buildingFootprint(building);
  const limit=Math.max(48,Math.hypot(footprint.halfWidth,footprint.halfDepth)+6,(building.r||25)+18);
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
  return best;
}

export function nearestBuildingRoadTarget(s,p,maxDistance=24){
  const building=buildingAtPoint(s,p,0);
  if(!building)return null;
  const hit=buildingHitbox(building,0);
  const dx=Math.max(hit.minX-p.x,0,p.x-hit.maxX);
  const dy=Math.max(hit.minY-p.y,0,p.y-hit.maxY);
  const distance=Math.hypot(dx,dy);
  if(distance>maxDistance)return null;
  return{building,point:buildingConnectionPoint(building,p),distance};
}
