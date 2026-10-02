import {dist,finitePoint,validRoadPoints,projectOnPolyline,length,safePoint,collinearOverlapLength,segmentDistance} from './geometry.js';
import {endpointSegmentBlocked as endpointSegmentBlockedGeometry} from './geometry.js';
import {isInsideWorldBounds,validateRoadGeometry} from './validation.js';
import {WORLD_BOUNDS,WORLD_MARGIN} from '../terrain.js';
import {nearestBuildingRoadTarget} from '../buildings/connections.js';
import {buildingFootprintRadius} from '../buildings/geometry.js';
import {roadBuildingTarget,snapRoadPoint,snapToWorldEdge,roadPathBlocked,roadPathIntersectsBuildingFootprint,simplifyRoad,chooseRoadPath,segmentNearRiver} from './placement.js';
import {roadsHaveMeaningfulOverlap,roadsExactlyDuplicate} from './intersections.js';
import {bumpRoadNetworkRevision} from './topology.js';

export const endpointSegmentBlocked=(building,a,b,side)=>endpointSegmentBlockedGeometry(building,a,b,side,building?buildingFootprintRadius(building):undefined);

function normalizeRoadGeometry(road){if(!road?.points)return null;const points=simplifyRoad(road.points);const validation=validateRoadGeometry(points);if(!validation.ok)return null;const bridge=points.some((p,i)=>i?segmentNearRiver(points[i-1],p):false);return{...road,points,bridge,age:Number.isFinite(road.age)?road.age:0,condition:Number.isFinite(road.condition)?Math.max(0,Math.min(1,road.condition)):1}}
function invalidateTrucksForRoads(s,roads){const removed=new Set(roads);for(const truck of s.trucks||[])if((truck.routeSegments||[]).some(r=>removed.has(r))||roads.some(r=>routeTouchesRoad(truck.route,r)))truck.routeInvalidated=true}
function cloneRoadState(roads){return (roads||[]).map(road=>({...road,points:(road.points||[]).map(safePoint)}));}
function validateRoadNetworkState(s){
  const seen=new Set();
  for(const road of s.roads||[]){
    if(!road?.id||seen.has(road.id))return false;
    seen.add(road.id);
    const normalized=normalizeRoadGeometry(road);
    if(!normalized||normalized.points.length<2)return false;
  }
  return true;
}
function commitRoadMutation(s,mutator){
  const before=cloneRoadState(s.roads);
  try{mutator();cleanupRoadNetwork(s);if(!validateRoadNetworkState(s))throw new Error('invalid-road-network');}
  catch{ s.roads=before; return false; }
  bumpRoadNetworkRevision(s);
  const affected=[...before,...(s.roads||[])];
  invalidateTrucksForRoads(s,affected.filter((road,index)=>index===affected.findIndex(r=>r.id===road.id)));
  return true;
}
export function cleanupRoadNetwork(s){const original=[...(s.roads||[])],kept=[],removed=[];for(const road of original){const normalized=normalizeRoadGeometry(road);if(!normalized){removed.push(road);continue}if(kept.some(existing=>roadsExactlyDuplicate(existing,normalized)||roadsHaveMeaningfulOverlap(existing,normalized))){removed.push(road);continue}kept.push(normalized)}s.roads=kept;if(removed.length)invalidateTrucksForRoads(s,removed);return{removed,roads:s.roads}}
function routeTouchesRoad(route,road,tolerance=3){if(!Array.isArray(route)||route.length<2||!road?.points||road.points.length<2)return false;for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i];for(let j=1;j<road.points.length;j++){const c=road.points[j-1],d=road.points[j],ab={x:b.x-a.x,y:b.y-a.y},cd={x:d.x-c.x,y:d.y-c.y},cross=Math.abs(ab.x*cd.y-ab.y*cd.x),aligned=cross<=1e-6*Math.max(1,Math.hypot(ab.x,ab.y)*Math.hypot(cd.x,cd.y));if(aligned){if(collinearOverlapLength(a,b,c,d)>tolerance)return true}else if(segmentDistance(a,b,c,d)<=tolerance&&segmentDistance(a,b,c,d)>tolerance*.25)return true}}return false}
export function roadAtPoint(s,p,tolerance=24){if(!finitePoint(p))return null;let hit=null,bd=tolerance;for(const r of s.roads||[]){const points=validRoadPoints(r?.points,0);if(!points)continue;const q=projectOnPolyline(points,p);if(q&&q.distance<bd){bd=q.distance;hit={road:r,projection:q}}}return hit}
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
export function roadEndpointCandidate(s,p,maxDistance=24){if(!finitePoint(p))return null;let best=null;for(const road of s.roads||[]){if(!validRoadPoints(road?.points,0))continue;for(const index of [0,road.points.length-1]){const q=road.points[index],d=dist(q,p);if(d<=maxDistance&&(!best||d<best.distance))best={road,index,point:{x:q.x,y:q.y},distance:d}}}return best}
export function roadEndpointAtPoint(s,p,tolerance=28){const hit=roadEndpointCandidate(s,p,tolerance);if(!hit)return null;return{road:hit.road,roadId:hit.road.id,index:hit.index,point:hit.point,distance:hit.distance}}
export function endpointTarget(s,p,road,index){
  const buildingTarget=nearestBuildingRoadTarget(s,p,24);
  const roadHit=snapRoadPoint(s,p,24);
  const candidateRoad=roadHit&&roadHit.road!==road?roadHit:null;
  if(buildingTarget&&(buildingTarget.distance<=10||!candidateRoad||buildingTarget.distance<candidateRoad.distance)){
    return{x:buildingTarget.point.x,y:buildingTarget.point.y,building:buildingTarget.building};
  }
  if(candidateRoad)return{x:candidateRoad.x,y:candidateRoad.y,road:candidateRoad.road};
  const endpoint=roadEndpointCandidate(s,p,24);
  if(endpoint&&endpoint.road!==road)return{x:endpoint.point.x,y:endpoint.point.y,road:endpoint.road};
  const edge=snapToWorldEdge(p);if(edge)return edge;
  const grid=12;const snapped={x:Math.round(p.x/grid)*grid,y:Math.round(p.y/grid)*grid};
  return isInsideWorldBounds(snapped)?snapped:{x:Math.max(WORLD_BOUNDS.minX+WORLD_MARGIN,Math.min(WORLD_BOUNDS.maxX-WORLD_MARGIN,snapped.x)),y:Math.max(WORLD_BOUNDS.minY+WORLD_MARGIN,Math.min(WORLD_BOUNDS.maxY-WORLD_MARGIN,snapped.y))};
}
export function roadEndpointPreview(s,road,index,p){if(!road?.points||!Number.isInteger(index)||!road.points[index]||!finitePoint(p))return null;const target=endpointTarget(s,p,road,index),points=road.points.map(q=>safePoint(q));points[index]={x:target.x,y:target.y};
let clean=simplifyRoad(points);
let startBuilding=index===0?target.building:roadBuildingTarget(s,clean[0]);
let endBuilding=index===clean.length-1?target.building:roadBuildingTarget(s,clean.at(-1));
let meta={start:startBuilding,end:endBuilding,startBuilding,endBuilding};
let boundary=validateRoadGeometry(clean),lengthValue=length(clean);

// A moved endpoint may leave a building's rendered shell while the old straight
// segment still cuts back through the building/site envelope. For a simple
// two-point road, rebuild that segment with the same orthogonal obstacle router
// used by road previews instead of rejecting an otherwise valid endpoint edit.
const initiallyBlocked=clean.length>=2&&roadPathBlocked(s,clean,meta);
if(initiallyBlocked&&clean.length===2){
  const from=clean[index],to=clean[index===0?1:0];
  const rerouted=chooseRoadPath(s,from,to,{});
  if(rerouted&&rerouted.length>=2){
    clean=index===0?rerouted:rerouted.slice().reverse();
    boundary=validateRoadGeometry(clean);
    lengthValue=length(clean);
    startBuilding=index===0?target.building:roadBuildingTarget(s,clean[0]);
    endBuilding=index===clean.length-1?target.building:roadBuildingTarget(s,clean.at(-1));
    meta={start:startBuilding,end:endBuilding,startBuilding,endBuilding};
  }
}
const targetRoad=target.road||null;const targetPoint=targetRoad&&target.x!=null?{x:target.x,y:target.y}:null;const targetEndpoints=targetRoad?.points?.length?[targetRoad.points[0],targetRoad.points.at(-1)]:[];const targetIsInterior=!!targetPoint&&targetEndpoints.every(q=>dist(q,targetPoint)>6);const blocked=clean.length<2||lengthValue<12||(target.gridSnapped?roadPathIntersectsBuildingFootprint(s,clean,meta):roadPathBlocked(s,clean,meta)),otherRoads=(s.roads||[]).filter(r=>r!==road&&(!targetIsInterior||r!==targetRoad)),duplicate=otherRoads.some(r=>roadsHaveMeaningfulOverlap(r,{points:clean}));
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
