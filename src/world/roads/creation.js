import {newId} from '../../core/ids.js';
import {dist,length,safePoint,validRoadPoints,projectSegment} from './geometry.js';
import {validateRoadGeometry} from './validation.js';
import {roadBuildingTarget,roadPathBlocked,segmentNearRiver} from './placement.js';
import {roadsHaveMeaningfulOverlap,roadsExactlyDuplicate} from './intersections.js';
import {cleanupRoadNetwork} from './editing.js';
import {resolveBuildingRoadEndpoint} from '../buildings/connections.js';
import {bumpRoadNetworkRevision} from './topology.js';

function reconcileRoadJunctions(s,points,meta={}){
  const endpoints=[{index:0,building:meta.startBuilding},{index:points.length-1,building:meta.endBuilding}];
  for(const endpoint of endpoints){
    if(endpoint.building)continue;
    const target=points[endpoint.index];
    let best=null;
    for(const road of s.roads||[]){
      if(road.points===points)continue;
      for(let i=1;i<road.points.length;i++){
        const q=projectSegment(target,road.points[i-1],road.points[i]);
        if(!best||q.distance<best.distance)best={road,point:q.point,distance:q.distance};
      }
    }
    if(best&&best.distance<=6){
      points[endpoint.index]={x:best.point.x,y:best.point.y};
    }
  }
}

export function addRoad(s,points,meta={}){
  if(!Array.isArray(points)||points.length<2)return'invalid';
  const normalized=points.map(q=>safePoint(q));
  // Exact duplicates must be rejected before facade endpoint resolution. This
  // keeps legacy center-to-center duplicate calls from collapsing into a
  // too-short facade segment as building envelopes grow.
  if((s.roads||[]).some(r=>roadsExactlyDuplicate(r,{points:normalized})))return'duplicate';
  const startBuilding=meta.startBuilding||null,endBuilding=meta.endBuilding||null;
  const startConnection=resolveBuildingRoadEndpoint(s,normalized[0],startBuilding,normalized.at(-1));
  const endConnection=resolveBuildingRoadEndpoint(s,normalized.at(-1),endBuilding,normalized[0]);
  const resolvedStartBuilding=startConnection?.building||startBuilding;
  const resolvedEndBuilding=endConnection?.building||endBuilding;
  if(resolvedStartBuilding&&resolvedEndBuilding&&resolvedStartBuilding===resolvedEndBuilding)return'blocked';
  // Explicit building connections use facade endpoints. Legacy direct addRoad
  // calls may still provide a building centre as an endpoint; keep those
  // coordinates intact and let the endpoint collision rules validate them.
  if(meta.startBuilding&&startConnection)normalized[0]=startConnection.point;
  if(meta.endBuilding&&endConnection)normalized[normalized.length-1]=endConnection.point;
  points=normalized;
  // Re-check duplicates after canonical building facade endpoints are resolved.
  // Center-point duplicate checks alone can miss the same road once the larger
  // building envelopes shorten it to its connection points.
  if((s.roads||[]).some(r=>roadsExactlyDuplicate(r,{points})))return'duplicate';
  let validation=validateRoadGeometry(points);
  if(!validation.ok){
    const raw=validRoadPoints(points,0);
    const explicitBuildingConnection=!!resolvedStartBuilding&&!!resolvedEndBuilding&&resolvedStartBuilding!==resolvedEndBuilding;
    if(raw&&length(raw)<12&&explicitBuildingConnection){
      validation={ok:true,reason:null,points:raw};
    }else{
      if(raw&&length(raw)<12)return'too-short';
      return'boundary';
    }
  }
  const clean=validation.points,roadLength=length(clean);
  if(!Number.isFinite(roadLength))return'invalid';
  if(roadLength<12){
    const a=meta.startBuilding||roadBuildingTarget(s,clean[0]),b=meta.endBuilding||roadBuildingTarget(s,clean.at(-1));
    if(!a||!b||a===b)return'too-short';
  }
  const shortBuildingConnection=roadLength<12&&resolvedStartBuilding&&resolvedEndBuilding&&resolvedStartBuilding!==resolvedEndBuilding;
  if(!shortBuildingConnection&&roadPathBlocked(s,clean,{start:resolvedStartBuilding,end:resolvedEndBuilding}))return'blocked';
  const cost=Math.max(1,Math.ceil(roadLength/180))*2;
  if(!Number.isFinite(cost)||!Number.isFinite(s.cash)||s.cash<cost)return'cash';
  if((s.roads||[]).some(r=>roadsExactlyDuplicate(r,{points:clean})||roadsHaveMeaningfulOverlap(r,{points:clean})))return'duplicate';
  const road={id:newId(),points:clean.map(safePoint),age:0,bridge:clean.some((p,i)=>i?segmentNearRiver(clean[i-1],p):false),condition:1};
  const previousCash=s.cash;
  s.roads.push(road);
  cleanupRoadNetwork(s);
  const committed=s.roads.find(r=>r?.id===road.id);
  if(!committed){
    s.cash=previousCash;
    return'duplicate';
  }
  s.cash-=cost;
  reconcileRoadJunctions(s,committed.points,meta);
  cleanupRoadNetwork(s);
  bumpRoadNetworkRevision(s);
  return true;
}

