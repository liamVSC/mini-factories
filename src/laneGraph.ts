import type { Point, RoadEdge, RoadNetwork } from './world/worldTypes.js';

const EPSILON = 1e-6;

function vector(a: Point, b: Point): Point {
  const dx=b.x-a.x, dy=b.y-a.y, len=Math.hypot(dx,dy)||1;
  return {x:dx/len,y:dy/len};
}

export interface Lane {
  id:string; roadId:string|null; from:Point; to:Point; edge:RoadEdge;
  laneIndex:number; lateralOffset:number; lanesPerDirection:number; direction:Point; reverse:boolean;
}
export interface LaneTransition { toLaneId:string; type:string; angle:number; }
export interface LaneGraph {
  nodes:Point[]; edges:RoadEdge[]; lanes:Lane[]; lanesById:Map<string,Lane>;
  outgoing:Map<Point,Lane[]>; incoming:Map<Point,Lane[]>;
  adjacency:Map<string,string[]>; transitions:Map<string,LaneTransition[]>;
}

function addUnique(list:string[],value:string):void { if(!list.includes(value))list.push(value); }

export function buildLaneGraph(network:RoadNetwork,{lanesPerDirection=1}:{lanesPerDirection?:number}={}):LaneGraph {
  const nodes=network?.nodes||[], edges=network?.edges||[], lanes:Lane[]=[];
  const lanesById=new Map<string,Lane>(), outgoing=new Map(nodes.map(n=>[n,[] as Lane[]]));
  const incoming=new Map(nodes.map(n=>[n,[] as Lane[]]));
  for(const edge of edges){
    if(!edge?.a||!edge?.b||!(edge.d>EPSILON))continue;
    const directionAB=vector(edge.a,edge.b), directionBA={x:-directionAB.x,y:-directionAB.y};
    for(let laneIndex=0;laneIndex<Math.max(1,lanesPerDirection);laneIndex++){
      const width=7,laneCount=Math.max(1,lanesPerDirection);
      const create=(from:Point,to:Point,direction:Point,reverse:boolean)=>{
        const id='lane-'+lanes.length, carriagewayCenter=reverse?7:-7;
        const lateral=carriagewayCenter+(laneIndex-(laneCount-1)/2)*width;
        const lane:Lane={id,roadId:edge.road?.id||null,from,to,edge,laneIndex,lateralOffset:lateral,lanesPerDirection:laneCount,direction,reverse};
        lanes.push(lane); lanesById.set(id,lane); outgoing.get(from)?.push(lane); incoming.get(to)?.push(lane);
      };
      create(edge.a,edge.b,directionAB,false); create(edge.b,edge.a,directionBA,true);
    }
  }
  const adjacency=new Map(lanes.map(l=>[l.id,[] as string[]])), transitions=new Map(lanes.map(l=>[l.id,[] as LaneTransition[]]));
  for(const lane of lanes) for(const next of outgoing.get(lane.to)||[]){
    if(next.to===lane.from&&next.roadId===lane.roadId)continue;
    addUnique(adjacency.get(lane.id)!,next.id);
    transitions.get(lane.id)?.push({toLaneId:next.id,...turnInfo(lane,next)});
  }
  return {nodes,edges,lanes,lanesById,outgoing,incoming,adjacency,transitions};
}

function transitionCost(fromLane:Lane,nextLane:Lane):number {
  const base=nextLane.edge?.d||0;if(!fromLane)return base;
  const turn=turnInfo(fromLane,nextLane),maxIndex=Math.max(0,(fromLane.lanesPerDirection||nextLane.lanesPerDirection||2)-1);
  if(turn.type==='uturn')return base+1000;
  let penalty=0;
  if(turn.type==='left'&&nextLane.laneIndex!==maxIndex)penalty+=12;
  if(turn.type==='right'&&nextLane.laneIndex!==0)penalty+=12;
  if(turn.type==='straight'&&nextLane.laneIndex!==fromLane.laneIndex)penalty+=5;
  if(nextLane.laneIndex!==fromLane.laneIndex)penalty+=3;
  return base+penalty;
}

function shortestLanePath(graph:LaneGraph,startNode:Point,endNode:Point):{laneIds:string[];distance:number}|null {
  const starts=graph.outgoing.get(startNode)||[]; if(startNode===endNode)return{laneIds:[],distance:0}; if(!starts.length)return null;
  const queue:{lane:Lane;d:number}[]=[],best=new Map<string,number>(),prev=new Map<string,string|null>();
  for(const lane of starts){const d=lane.edge?.d||0;if(d<(best.get(lane.id)??Infinity)){best.set(lane.id,d);prev.set(lane.id,null);queue.push({lane,d});}}
  while(queue.length){
    queue.sort((a,b)=>a.d-b.d); const current=queue.shift()!; if(current.d!==(best.get(current.lane.id)??Infinity))continue;
    if(current.lane.to===endNode){const ids:string[]=[];let id:string|null=current.lane.id;while(id){ids.unshift(id);id=prev.get(id)||null}return{laneIds:ids,distance:current.d};}
    for(const nextId of graph.adjacency.get(current.lane.id)||[]){const next=graph.lanesById.get(nextId);if(!next)continue;const nd=current.d+transitionCost(current.lane,next);if(nd<(best.get(next.id)??Infinity)){best.set(next.id,nd);prev.set(next.id,current.lane.id);queue.push({lane:next,d:nd});}}
  }
  return null;
}
export function findLaneRoute(graph:LaneGraph,startNode:Point,endNode:Point){return shortestLanePath(graph,startNode,endNode);}
export function laneRouteToNodePath(graph:LaneGraph,laneIds:string[]):Point[]{if(!laneIds?.length)return[];const result:Point[]=[];for(const id of laneIds){const lane=graph.lanesById.get(id);if(!lane)continue;if(!result.length)result.push(lane.from);result.push(lane.to)}return result;}

function turnInfo(fromLane:Lane|null,toLane:Lane|null):{type:string;angle:number}{
  if(!fromLane||!toLane)return{type:'straight',angle:0};
  const incoming=fromLane.direction,outgoing=toLane.direction,dot=Math.max(-1,Math.min(1,incoming.x*outgoing.x+incoming.y*outgoing.y));
  const cross=incoming.x*outgoing.y-incoming.y*outgoing.x,angle=Math.atan2(cross,dot);
  if(Math.abs(angle)<0.35)return{type:'straight',angle}; if(Math.abs(angle)>2.45)return{type:'uturn',angle}; return{type:angle>0?'left':'right',angle};
}
function laneOffsetForTurn(type:string):number {if(type==='left')return 7;if(type==='right')return -7;return 0;}
function addSample(list:Point[],p:Point):void{const q={x:Number(p.x),y:Number(p.y)},last=list.at(-1);if(!last||Math.hypot(last.x-q.x,last.y-q.y)>.25)list.push(q);}
function quadratic(a:Point,c:Point,b:Point,t:number):Point{const u=1-t;return{x:u*u*a.x+2*u*t*c.x+t*t*b.x,y:u*u*a.y+2*u*t*c.y+t*t*b.y};}

export function laneRouteGeometry(graph:LaneGraph,laneIds:string[],{approachDistance=34,turnRadius=18,samples=5}:{approachDistance?:number;turnRadius?:number;samples?:number}={}):{points:Point[];transitions:(LaneTransition&{fromLaneId:string;junction:Point;offset:number})[]} {
  if(!Array.isArray(laneIds)||!laneIds.length)return{points:[],transitions:[]};
  const lanes=laneIds.map(id=>graph.lanesById.get(id)).filter((x):x is Lane=>!!x);if(!lanes.length)return{points:[],transitions:[]};
  const transitions:(LaneTransition&{fromLaneId:string;junction:Point;offset:number})[]=[];
  for(let i=0;i<lanes.length-1;i++){const turn=turnInfo(lanes[i],lanes[i+1]);transitions.push({fromLaneId:lanes[i].id,toLaneId:lanes[i+1].id,junction:lanes[i].to,...turn,offset:laneOffsetForTurn(turn.type)});}
  const points:Point[]=[];
  for(let i=0;i<lanes.length;i++){
    const lane=lanes[i],edgeA=lane.from,edgeB=lane.to,dx=edgeB.x-edgeA.x,dy=edgeB.y-edgeA.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
    const transitionIn=transitions[i-1],transitionOut=transitions[i],offsetIn=transitionIn?.offset||0,offsetOut=transitionOut?.offset||0,startOffset=i===0?lane.lateralOffset:offsetIn,endOffset=i===lanes.length-1?lane.lateralOffset:offsetOut;
    const usable=Math.min(approachDistance,len*.42); void usable; const steps=Math.max(2,Math.ceil(len/18));
    for(let s=0;s<=steps;s++){const t=s/steps;let offset=startOffset+(endOffset-startOffset)*t;if(i>0&&t<.28){const u=t/.28;offset=lane.lateralOffset+(startOffset-lane.lateralOffset)*u;}if(i<lanes.length-1&&t>.72){const u=(t-.72)/.28;offset=lane.lateralOffset+(endOffset-lane.lateralOffset)*u;}addSample(points,{x:edgeA.x+dx*t+nx*offset,y:edgeA.y+dy*t+ny*offset});}
    if(i<lanes.length-1){const next=lanes[i+1],nDx=next.to.x-next.from.x,nDy=next.to.y-next.from.y,nLen=Math.hypot(nDx,nDy)||1,nNx=-nDy/nLen,nNy=nDx/nLen, radius=Math.min(turnRadius,len*.22,nLen*.22);void radius;const incoming={x:lane.to.x+nx*lane.lateralOffset,y:lane.to.y+ny*lane.lateralOffset},outgoing={x:next.from.x+nNx*next.lateralOffset,y:next.from.y+nNy*next.lateralOffset},control={x:lane.to.x,y:lane.to.y},curveSteps=Math.max(3,samples+Math.ceil(radius/5));for(let k=1;k<=curveSteps;k++)addSample(points,quadratic(incoming,control,outgoing,k/curveSteps));}
  }
  return{points,transitions};
}
export function laneChangeRequired(graph:LaneGraph,fromLaneId:string,toLaneId:string):boolean{const from=graph?.lanesById?.get(fromLaneId),to=graph?.lanesById?.get(toLaneId);return !!from&&!!to&&from.laneIndex!==to.laneIndex;}
export function laneAtProgress(graph:LaneGraph,laneIds:string[],index=0):Lane|null{const id=laneIds?.[Math.max(0,Math.min(laneIds.length-1,index))];return id?graph.lanesById.get(id)||null:null;}
