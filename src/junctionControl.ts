/**
 * Derived per-junction traffic-control model.
 *
 * Road geometry and lane graph remain authoritative. Junction controls are
 * derived from them and are never persisted as topology.
 */
import type { Point } from './world/worldTypes.js';
import type { Lane, LaneGraph } from './laneGraph.js';

interface Movement {
  id:string;
  junctionId:string;
  junction:Point;
  incomingLaneId:string;
  outgoingLaneId:string;
  roadId:string|null;
  outgoingRoadId:string|null;
  type:string;
  approachDirection:Point;
  stopLineDistance:number;
  conflictZoneDistance:number;
  turn?:string;
}

interface JunctionControl {
  id:string;
  node:Point;
  approaches:string[];
  movements:Movement[];
  byId:Map<string,Movement>;
  conflicts:Map<string,string[]>;
}

export interface TrafficSignalState {
  enabled?:boolean;
  cycle?:number;
}

export interface TrafficControlState {
  trafficSignals?:TrafficSignalState;
  trafficClock?:number;
}

interface MovementPermissionOptions {
  occupiedIds?:string[];
  priority?:'arrival'|'signal-only'|string;
}

function keyForNode(node:Point):string { return `${Math.round(node.x*10)/10},${Math.round(node.y*10)/10}`; }
function dot(a:Point,b:Point):number{return a.x*b.x+a.y*b.y}
function cross(a:Point,b:Point):number{return a.x*b.y-a.y*b.x}

function classifyMovement(fromLane:Lane,toLane:Lane):string{
  const angle=Math.atan2(cross(fromLane.direction,toLane.direction),dot(fromLane.direction,toLane.direction));
  if(Math.abs(angle)<0.35)return'straight';
  if(Math.abs(angle)>2.45)return'uturn';
  return angle>0?'left':'right';
}
function approachKey(lane:Lane):string{return lane?.id||'unknown'}
function movementId(fromLane:Lane,toLane:Lane):string{return `${fromLane.id}->${toLane.id}`}

function buildMovement(fromLane:Lane,toLane:Lane):Movement{
  const type=classifyMovement(fromLane,toLane),junction=fromLane.to;
  const approachDirection={x:-fromLane.direction.x,y:-fromLane.direction.y};
  return{id:movementId(fromLane,toLane),junctionId:keyForNode(junction),junction:{x:junction.x,y:junction.y},
    incomingLaneId:fromLane.id,outgoingLaneId:toLane.id,roadId:fromLane.roadId,outgoingRoadId:toLane.roadId,type,approachDirection,
    stopLineDistance:type==='uturn'?24:30,conflictZoneDistance:type==='uturn'?20:18};
}

function conflicts(a:Movement,b:Movement):boolean{
  if(!a||!b||a.id===b.id||a.junctionId!==b.junctionId||a.incomingLaneId===b.incomingLaneId)return false;
  if(a.outgoingLaneId===b.outgoingLaneId)return true;
  if(a.type==='straight'&&b.type==='straight'&&dot(a.approachDirection,b.approachDirection)<-.7)return false;
  if(dot(a.approachDirection,b.approachDirection)>.7)return false;
  return true;
}
function phaseAxis(movement:Movement):'horizontal'|'vertical'{const x=Math.abs(movement?.approachDirection?.x||0),y=Math.abs(movement?.approachDirection?.y||0);return x>=y?'horizontal':'vertical'}

export function buildJunctionControls(network:{nodes?:Point[]}|null|undefined,laneGraph:LaneGraph|null|undefined):Map<string,JunctionControl>{
  const controls=new Map<string,JunctionControl>();
  if (!laneGraph) return controls;
  for(const node of network?.nodes||[]){
    const incoming=laneGraph?.incoming?.get(node)||[],outgoing=laneGraph?.outgoing?.get(node)||[],movements:Movement[]=[],byId=new Map<string,Movement>();
    for(const fromLane of incoming)for(const toLane of outgoing){
      if(fromLane.to!==node||toLane.from!==node)continue;
      const transition=laneGraph.transitions?.get(fromLane.id)?.find(t=>t.toLaneId===toLane.id);
      if(!transition)continue;
      const movement=buildMovement(fromLane,toLane); movement.turn=transition.type; movements.push(movement); byId.set(movement.id,movement);
    }
    if(!movements.length)continue;
    const conflictMap=new Map<string,string[]>();
    for(const movement of movements)conflictMap.set(movement.id,movements.filter(other=>conflicts(movement,other)).map(other=>other.id));
    controls.set(keyForNode(node),{id:keyForNode(node),node:{x:node.x,y:node.y},approaches:[...new Set(incoming.map(approachKey))],movements,byId,conflicts:conflictMap});
  }
  return controls;
}

export function getJunctionControl(controls:Map<string,JunctionControl>|null|undefined,node:Point):JunctionControl|null{return controls?.get(keyForNode(node))||null}
export function getMovementControl(controls:Map<string,JunctionControl>|null|undefined,node:Point,incomingLaneId:string,outgoingLaneId:string):Movement|null{return getJunctionControl(controls,node)?.byId?.get(`${incomingLaneId}->${outgoingLaneId}`)||null}

export function signalForMovement(state:TrafficControlState|null|undefined,control:JunctionControl|null,movement:Movement|null){
  if(!state?.trafficSignals?.enabled||!control||!movement)return{state:'priority',blocked:false,axis:null as 'horizontal'|'vertical'|null};
  const cycle=Math.max(8,Number(state.trafficSignals.cycle)||12);let hash=0;for(const char of control.id)hash=(hash*31+char.charCodeAt(0))>>>0;
  const elapsed=((state.trafficClock||0)+(hash%1000)/1000*cycle)%cycle,half=cycle/2,yellow=Math.min(1.5,cycle*.1);
  const inYellow=(elapsed%half)>half-yellow,activeAxis=elapsed<half?'horizontal':'vertical',axis=phaseAxis(movement),allowed=axis===activeAxis;
  return{state:allowed?(inYellow?'yellow':'green'):'red',blocked:!allowed||inYellow,axis};
}

export function movementPermission(state:TrafficControlState|null|undefined,controls:Map<string,JunctionControl>|null|undefined,node:Point,movement:Movement|null,{occupiedIds=[],priority='arrival'}:MovementPermissionOptions={}){
  const control=getJunctionControl(controls,node);
  if(!control||!movement)return{allowed:true,reason:'no-control'};
  const signal=signalForMovement(state,control,movement);
  if(signal.blocked)return{allowed:false,reason:signal.state,signal};
  if(priority==='signal-only')return{allowed:true,reason:'green',signal};
  const occupied=new Set(occupiedIds);
  for(const id of control.conflicts.get(movement.id)||[])if(occupied.has(id))return{allowed:false,reason:'conflict',signal};
  return{allowed:true,reason:'priority',signal};
}

export function laneIndexForJunction(laneGraph:LaneGraph|null|undefined,laneIds:string[]|null|undefined,node:Point):number{
  if(!Array.isArray(laneIds)||!node)return -1;
  for(let i=0;i<laneIds.length-1;i++){const lane=laneGraph?.lanesById?.get(laneIds[i]);if(lane?.to===node)return i}
  return -1;
}
export function movementForLaneRoute(laneGraph:LaneGraph,controls:Map<string,JunctionControl>,laneIds:string[],index=0):Movement|null{
  if(!Array.isArray(laneIds)||index<0||index>=laneIds.length-1)return null;
  const from=laneGraph.lanesById.get(laneIds[index]),to=laneGraph.lanesById.get(laneIds[index+1]);
  if(!from||!to)return null;
  return getMovementControl(controls,from.to,from.id,to.id);
}
export function stopLinePoint(laneGraph:LaneGraph,movement:Movement|null):Point|null{
  const lane=laneGraph?.lanesById?.get(movement?.incomingLaneId||'');if(!lane)return null;
  const p=lane.from,q=lane.to,dx=q.x-p.x,dy=q.y-p.y,len=Math.hypot(dx,dy)||1,distance=Math.min(movement?.stopLineDistance||0,len*.45);
  return{x:q.x-dx/len*distance,y:q.y-dy/len*distance};
}
export function movementConflictIds(controls:Map<string,JunctionControl>,node:Point,movementId:string):string[]{return getJunctionControl(controls,node)?.conflicts?.get(movementId)||[]}
export function serializeJunctionControlSummary(controls:Map<string,JunctionControl>):unknown[]{return [...(controls?.values()||[])].map(control=>({id:control.id,node:{...control.node},approaches:[...control.approaches],movements:control.movements.map(m=>({id:m.id,type:m.type,incomingLaneId:m.incomingLaneId,outgoingLaneId:m.outgoingLaneId,stopLineDistance:m.stopLineDistance,conflictZoneDistance:m.conflictZoneDistance}))}))}
