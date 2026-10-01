import {dist,finitePoint,safePoint,validRoadPoints,projectOnPolyline} from './geometry.js';
import {validateRoadGeometry} from './validation.js';
import {roadBuildingTarget,nearestRoad,snapRoadPoint,roadPathBlocked,roadPathIntersectsBuildingFootprint} from './placement.js';
import {buildingHitbox,buildingConnectionPoint} from '../buildings/buildings.js';
import {cleanupRoadNetwork,commitRoadMutation,cloneRoadState,validateRoadNetworkState,bumpRoadNetworkRevision,invalidateTrucksForRoads,segmentNearRiver} from './roads.js';
import {routeTouchesRoad} from './intersections.js';

function roadAtPoint(s,p,tolerance=24){if(!finitePoint(p))return null;let hit=null,bd=tolerance;for(const r of s.roads||[]){const points=validRoadPoints(r?.points,0);if(!points)continue;const q=projectOnPolyline(points,p);if(q&&q.distance<bd){bd=q.distance;hit={road:r,projection:q}}}return hit}
export function roadSegmentAtPoint(s,p,tolerance=24){const hit=roadAtPoint(s,p,tolerance);if(!hit)return null;const segment=hit.projection.segment;if(!Number.isInteger(segment)||segment<0||segment>=hit.road.points.length-1)return null;return{road:hit.road,roadId:hit.road.id,segment,point:hit.projection.point,distance:hit.projection.distance}}
export function editRoadSegment(s,p,action='delete'){
  const hit=roadAtPoint(s,p);if(!hit)return false;
  const{road,projection}=hit,i=projection.segment;
  if(!Number.isInteger(i)||i<0||i>=road.points.length-1)return false;
  if(action!=='delete')return false;
  const idx=s.roads.indexOf(road);if(idx<0)return false;
  const removed=cloneRoadState([road])[0];
  if(!commitRoadMutation(s,()=>s.roads.splice(idx,1)))return false;
  for(const truck of s.trucks||[])if(routeTouchesRoad(truck.route,removed,4))truck.routeInvalidated=true;
  return{road:removed,segments:[],point:projection.point,action:'delete'};
}
function roadEndpointCandidate(s,p,maxDistance=24){if(!finitePoint(p))return null;let best=null;for(const road of s.roads||[]){if(!validRoadPoints(road?.points,0))continue;for(const index of [0,road.points.length-1]){const q=road.points[index],d=dist(q,p);if(d<=maxDistance&&(!best||d<best.distance))best={road,index,point:{x:q.x,y:q.y},distance:d}}}return best}
export function roadEndpointAtPoint(s,p,tolerance=28){const hit=roadEndpointCandidate(s,p,tolerance);if(!hit)return null;return{road:hit.road,roadId:hit.road.id,index:hit.index,point:hit.point,distance:hit.distance}}
function endpointTarget(s,p,road,index){
  const building=roadBuildingTarget(s,p);
  const roadHit=snapRoadPoint(s,p,24);
  const candidateRoad=roadHit&&roadHit.road!==road?roadHit:null;
  if(building){
    const hit=buildingHitbox(building,0);
    const dx=Math.max(hit.minX-p.x,0,p.x-hit.maxX),dy=Math.max(hit.minY-p.y,0,p.y-hit.maxY);
    const buildingDistance=Math.hypot(dx,dy);
    if(buildingDistance<=24&&(buildingDistance<=10||!candidateRoad||buildingDistance<candidateRoad.distance)){
      const q=buildingConnectionPoint(building,p);
      return{x:q.x,y:q.y,building};
    }
  }
  if(candidateRoad)return{x:candidateRoad.x,y:candidateRoad.y,road:candidateRoad.road};
  const endpoint=roadEndpointCandidate(s,p,24);
  if(endpoint&&endpoint.road!==road)return{x:endpoint.point.x,y:endpoint.point.y,road:endpoint.road};
  const edge=snapToWorldEdge(p);if(edge)return edge;
  const grid=12;const snapped={x:Math.round(p.x/grid)*grid,y:Math.round(p.y/grid)*grid};
  return isInsideWorldBounds(snapped)?snapped:{x:Math.max(WORLD_BOUNDS.minX+WORLD_MARGIN,Math.min(WORLD_BOUNDS.maxX-WORLD_MARGIN,snapped.x)),y:Math.max(WORLD_BOUNDS.minY+WORLD_MARGIN,Math.min(WORLD_BOUNDS.maxY-WORLD_MARGIN,snapped.y))};
}
export function roadEndpointPreview(s,road,index,p){if(!road?.points||!Number.isInteger(index)||!road.points[index]||!finitePoint(p))return null;const target=endpointTarget(s,p,road,index),points=road.points.map(q=>safePoint(q));points[index]={x:target.x,y:target.y};
const clean=simplifyRoad(points),boundary=validateRoadGeometry(clean),lengthValue=length(clean);
const meta={startBuilding:index===0?target.building:roadBuildingTarget(s,clean[0]),endBuilding:index===clean.length-1?target.building:roadBuildingTarget(s,clean.at(-1))};
const targetRoad=target.road||null;const targetPoint=targetRoad&&target.x!=null?{x:target.x,y:target.y}:null;const targetEndpoints=targetRoad?.points?.length?[targetRoad.points[0],targetRoad.points.at(-1)]:[];const targetIsInterior=!!targetPoint&&targetEndpoints.every(q=>dist(q,targetPoint)>6);const blocked=clean.length<2||lengthValue<12||(target.road?false:(target.gridSnapped?roadPathIntersectsBuildingFootprint(s,clean,meta):roadPathBlocked(s,clean,meta))),otherRoads=(s.roads||[]).filter(r=>r!==road&&(!targetIsInterior||r!==targetRoad)),duplicate=otherRoads.some(r=>roadsHaveMeaningfulOverlap(r,{points:clean}));
return{road,roadId:road.id,index,target,point:target,edgeSnapped:!!target.edgeSnapped,path:clean,blocked:blocked||!boundary.ok,blockedReason:boundary.ok?null:boundary.reason,duplicate,length:lengthValue}}
export function editRoadEndpoint(s,roadId,index,p){
  const road=(s.roads||[]).find(r=>r?.id===roadId);
  if(!road?.points||!Number.isInteger(index)||index<0||index>=road.points.length)return false;
  const preview=roadEndpointPreview(s,road,index,p);
  if(!preview||preview.blocked||preview.duplicate)return false;
  const oldPoints=road.points.map(safePoint),oldEndpoint=oldPoints[index],clean=preview.path;
  if(dist(oldEndpoint,clean[index])<2)return false;
  const bridge=clean.some((point,i)=>i?segmentNearRiver(clean[i-1],point):false);
  const next={...road,points:clean,bridge,condition:Number.isFinite(road.condition)?road.condition:1};
  const idx=s.roads.indexOf(road);if(idx<0)return false;
  const targetRoad=preview.target?.road||null,targetBefore=targetRoad?targetRoad.points.map(safePoint):null;
  const junctionPoint={x:preview.target.x,y:preview.target.y};
  const beforeRoads=cloneRoadState(s.roads);
  try{
    s.roads.splice(idx,1,next);
    const liveTarget=targetRoad&&s.roads.includes(targetRoad)?targetRoad:null;
    if(liveTarget||preview.target?.road)next.points[index]=junctionPoint;
    if(!validateRoadNetworkState(s))throw new Error('invalid-road-network');
  }catch{
    s.roads=beforeRoads;
    return false;
  }
  bumpRoadNetworkRevision(s);
  for(const truck of s.trucks||[]){
    if(routeTouchesRoad(truck.route,{points:oldPoints},4))truck.routeInvalidated=true;
    if(targetBefore&&routeTouchesRoad(truck.route,{points:targetBefore},4))truck.routeInvalidated=true;
  }
  return{road:next,oldPoints,point:{x:next.points[index].x,y:next.points[index].y},target:preview.target,affected:[road,targetRoad].filter(Boolean)};
}
export function eraseRoad(s,p){const hit=roadAtPoint(s,p);if(!hit)return false;const{road}=hit;s.roads=s.roads.filter(r=>r!==road);cleanupRoadNetwork(s);bumpRoadNetworkRevision(s);invalidateTrucksForRoads(s,[road]);return true}

export {roadAtPoint,roadSegmentAtPoint,editRoadSegment,roadEndpointAtPoint,roadEndpointPreview,editRoadEndpoint};
