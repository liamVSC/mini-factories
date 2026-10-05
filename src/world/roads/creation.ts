import type { GameState, Building } from '../../state.js';
import type { Point, Road } from '../worldTypes.js';
import {newId} from '../../core/ids.js';
import {dist,length,safePoint,validRoadPoints,projectSegment} from './geometry.js';
import {validateRoadGeometry} from './validation.js';
import {roadBuildingTarget,roadPathBlocked,segmentCrossesRiver,chooseRoadPath} from './placement.js';
import {roadsHaveMeaningfulOverlap,roadsExactlyDuplicate} from './intersections.js';
import {cleanupRoadNetwork} from './editing.js';
import {resolveBuildingRoadEndpoint} from '../buildings/connections.js';
import {buildingRoadEntrance} from '../buildings/geometry.js';
import {bumpRoadNetworkRevision} from './topology.js';

interface RoadMeta {startBuilding?:Building|null;endBuilding?:Building|null}
function reconcileRoadJunctions(s:GameState,points:Point[],meta:RoadMeta={}):void{
  const endpoints=[{index:0,building:meta.startBuilding},{index:points.length-1,building:meta.endBuilding}];
  for(const endpoint of endpoints){if(endpoint.building)continue;const target=points[endpoint.index];let best:{road:Road;point:Point;distance:number}|null=null;for(const road of s.roads){if(road.points===points)continue;for(let i=1;i<road.points.length;i++){const q=projectSegment(target,road.points[i-1],road.points[i]);if(!best||q.distance<best.distance)best={road,point:q.point,distance:q.distance};}}if(best&&best.distance<=6)points[endpoint.index]={x:best.point.x,y:best.point.y};}
}
export function addRoad(s:GameState,points:Point[],meta:RoadMeta={}):true|string{
  if(!Array.isArray(points)||points.length<2)return'invalid';let normalized=points.map(q=>safePoint(q));if(s.roads.some(r=>roadsExactlyDuplicate(r,{id:'candidate',points:normalized})))return'duplicate';
  let startBuilding=meta.startBuilding||null,endBuilding=meta.endBuilding||null;
  const canonicalAt=(point:Point):Building|null=>{for(const building of s.buildings){const entrance=buildingRoadEntrance(building);if(entrance&&dist(point,entrance)<=2)return building;}return null;};
  startBuilding=startBuilding||canonicalAt(normalized[0]);endBuilding=endBuilding||canonicalAt(normalized.at(-1)!);
  const centerPair=!!startBuilding&&!!endBuilding&&dist(normalized[0],{x:startBuilding.x,y:startBuilding.y})<=2&&dist(normalized.at(-1)!,{x:endBuilding.x,y:endBuilding.y})<=2;
  const startConnection=centerPair?null:resolveBuildingRoadEndpoint(s,normalized[0],meta.startBuilding||null,normalized.at(-1)!);
  const endConnection=centerPair?null:resolveBuildingRoadEndpoint(s,normalized.at(-1)!,meta.endBuilding||null,normalized[0]);
  const resolvedStartBuilding=startConnection?.building||startBuilding,resolvedEndBuilding=endConnection?.building||endBuilding;
  if(resolvedStartBuilding&&resolvedEndBuilding&&resolvedStartBuilding===resolvedEndBuilding)return'blocked';
  if(meta.startBuilding&&startConnection)normalized[0]=startConnection.point;if(meta.endBuilding&&endConnection)normalized[normalized.length-1]=endConnection.point;points=normalized;
  const canonicalStart=!!resolvedStartBuilding&&!!buildingRoadEntrance(resolvedStartBuilding)&&dist(points[0],buildingRoadEntrance(resolvedStartBuilding)!)<=2,canonicalEnd=!!resolvedEndBuilding&&!!buildingRoadEntrance(resolvedEndBuilding)&&dist(points.at(-1)!,buildingRoadEntrance(resolvedEndBuilding)!)<=2,endpointBuildings={start:resolvedStartBuilding,end:resolvedEndBuilding};
  if(!(canonicalStart||canonicalEnd)&&roadPathBlocked(s,points,endpointBuildings)){const routed=chooseRoadPath(s,points[0],points.at(-1)!,endpointBuildings);if(!routed)return'blocked';points=routed;}
  if(s.roads.some(r=>roadsExactlyDuplicate(r,{id:'candidate',points})))return'duplicate';
  let validation=validateRoadGeometry(points);
  if(!validation.ok){const raw=validRoadPoints(points,0),explicit=!!resolvedStartBuilding&&!!resolvedEndBuilding&&resolvedStartBuilding!==resolvedEndBuilding;if(raw&&length(raw)<12&&explicit)validation={ok:true,reason:null,points:raw};else{if(raw&&length(raw)<12)return'too-short';return'boundary';}}
  const clean=validation.points,roadLength=length(clean);if(!Number.isFinite(roadLength))return'invalid';
  if(roadLength<12){const a=meta.startBuilding||roadBuildingTarget(s,clean[0]),b=meta.endBuilding||roadBuildingTarget(s,clean.at(-1)!);if(!a||!b||a===b)return'too-short';}
  const shortBuildingConnection=roadLength<12&&!!resolvedStartBuilding&&!!resolvedEndBuilding&&resolvedStartBuilding!==resolvedEndBuilding;if(!shortBuildingConnection&&roadPathBlocked(s,clean,{start:resolvedStartBuilding,end:resolvedEndBuilding}))return'blocked';
  const cost=Math.max(1,Math.ceil(roadLength/180))*2;if(!Number.isFinite(cost)||!Number.isFinite(s.cash)||s.cash<cost)return'cash';
  if(s.roads.some(r=>roadsExactlyDuplicate(r,{id:'candidate',points:clean})||roadsHaveMeaningfulOverlap(r,{id:'candidate',points:clean})))return'duplicate';
  const crossesWater=clean.some((p,i)=>i>0&&segmentCrossesRiver(clean[i-1],p)),road:Road={id:newId(),points:clean.map(safePoint),age:0,bridge:crossesWater,condition:1};
  const previousCash=s.cash;s.roads.push(road);cleanupRoadNetwork(s);const committed=s.roads.find(r=>r.id===road.id);if(!committed){s.cash=previousCash;return'duplicate';}s.cash-=cost;reconcileRoadJunctions(s,committed.points,meta);cleanupRoadNetwork(s);bumpRoadNetworkRevision(s);return true;
}
