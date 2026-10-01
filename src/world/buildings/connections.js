import {buildingAtPoint,buildingConnectionPoint,buildingHitbox} from './geometry.js';

export function resolveBuildingRoadEndpoint(s,p,target=null,directionTarget=p){
  const building=target||buildingAtPoint(s,p,0);
  if(!building)return null;
  const point=buildingConnectionPoint(building,directionTarget);
  return{building,point};
}

export function nearestBuildingRoadTarget(s,p,maxDistance=24){
  const building=buildingAtPoint(s,p,0);
  if(!building)return null;

  const hit=buildingHitbox(building,0);
  const dx=Math.max(hit.minX-p.x,0,p.x-hit.maxX);
  const dy=Math.max(hit.minY-p.y,0,p.y-hit.maxY);
  const distance=Math.hypot(dx,dy);
  if(distance>maxDistance)return null;

  return{
    building,
    point:buildingConnectionPoint(building,p),
    distance
  };
}
