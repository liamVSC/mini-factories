// Transitional TypeScript migration: runtime behavior preserved while domain types are tightened incrementally.
// @ts-nocheck
import type { Point, Road, RoadEdge, RoadNetwork } from '../worldTypes.js';
import type { GameState } from '../../state.js';
import {dist,finitePoint,validRoadPoints,projectSegment,roadPointParameter,addNode} from './geometry.js';
import {roadWithinWorldBounds} from './validation.js';
import {WORLD_BOUNDS,WORLD_MARGIN} from '../terrain.js';
import {buildRoadIntersections} from './intersections.js';

type RoadState=Omit<GameState,'roads'> & {roads:Road[]};

export function bumpRoadNetworkRevision(s:GameState):void{s.roadNetworkRevision=Math.max(0,Math.floor(Number(s.roadNetworkRevision)||0))+1;}
export function roadNetwork(s:RoadState|GameState,extraPoints:Point[]=[]):RoadNetwork{
  const roads=s.roads as unknown as Road[];
  const valid=roads.map(r=>({...r,points:validRoadPoints(r?.points,0)})).filter((r):r is Road=>!!r.points&&r.points.length>=2&&roadWithinWorldBounds(r.points));
  const nodes:Point[]=[],edges:RoadEdge[]=[],marks=new Map<Road,Point[][]>(),virtualEdges:RoadEdge[]=[];
  for(const road of valid){const segments=road.points.slice(1).map(()=>[] as Point[]);marks.set(road,segments);for(let i=1;i<road.points.length;i++){segments[i-1].push(addNode(nodes,road.points[i-1]));segments[i-1].push(addNode(nodes,road.points[i]));}}
  buildRoadIntersections(valid,nodes,marks,virtualEdges);
  for(const p of extraPoints||[]){if(!finitePoint(p))continue;let best:{road:Road;segment:number;point:Point;distance:number}|null=null;for(const road of valid)for(let i=1;i<road.points.length;i++){const q=projectSegment(p,road.points[i-1],road.points[i]);if(!best||q.distance<best.distance)best={road,segment:i-1,point:q.point,distance:q.distance};}if(best){const n=addNode(nodes,best.point);marks.get(best.road)![best.segment].push(n);}}
  for(const road of valid)for(let i=0;i<road.points.length-1;i++){const a=road.points[i],b=road.points[i+1],list=[...new Set(marks.get(road)![i])].sort((u,v)=>roadPointParameter(a,b,u)-roadPointParameter(a,b,v));for(let j=1;j<list.length;j++){const u=list[j-1],v=list[j],d=dist(u,v);if(d>.5)edges.push({a:u,b:v,d,road});}}
  for(const edge of virtualEdges)if(edge.d>.001)edges.push(edge);
  const nodeIds=new Map(nodes.map((node,index)=>[node,index])),uniqueEdges:RoadEdge[]=[],edgeKeys=new Set<string>();
  for(const edge of edges){if(!edge?.a||!edge?.b||edge.d<=.001)continue;const ai=nodeIds.get(edge.a),bi=nodeIds.get(edge.b);if(ai===undefined||bi===undefined||ai===bi)continue;const lo=Math.min(ai,bi),hi=Math.max(ai,bi),roadId=edge.road?.id||'road',key=lo+':'+hi+':'+roadId;if(edgeKeys.has(key))continue;edgeKeys.add(key);uniqueEdges.push(edge);}
  const adjacency=new Map(nodes.map(n=>[n,[] as {node:Point;d:number;road?:Road}[]]));for(const e of uniqueEdges){adjacency.get(e.a)!.push({node:e.b,d:e.d,road:e.road});adjacency.get(e.b)!.push({node:e.a,d:e.d,road:e.road});}
  const junctions=nodes.filter(n=>(adjacency.get(n)?.length||0)>=3);return{nodes,edges:uniqueEdges,adjacency,junctions};
}
export function roadTopology(s:RoadState|GameState){
  const network=roadNetwork(s),boundaryMinX=WORLD_BOUNDS.minX+WORLD_MARGIN,boundaryMaxX=WORLD_BOUNDS.maxX-WORLD_MARGIN,boundaryMinY=WORLD_BOUNDS.minY+WORLD_MARGIN,boundaryMaxY=WORLD_BOUNDS.maxY-WORLD_MARGIN,boundaryTolerance=3;
  const topologyNodes=network.nodes.map((node,index)=>{const links=network.adjacency.get(node)||[],roadIds=[...new Set(links.map(link=>link.road?.id).filter((id):id is string=>!!id))],degree=links.length,boundary=Math.abs(node.x-boundaryMinX)<=boundaryTolerance||Math.abs(node.x-boundaryMaxX)<=boundaryTolerance||Math.abs(node.y-boundaryMinY)<=boundaryTolerance||Math.abs(node.y-boundaryMaxY)<=boundaryTolerance,junction=degree>=3;return{id:index,x:node.x,y:node.y,degree,roadIds,boundary,junction,type:junction?(boundary?'boundary-junction':'junction'):(boundary?'boundary':degree===1?'endpoint':'node')};});
  const junctions=topologyNodes.filter(node=>node.junction);return{...network,topologyNodes,topologyJunctions:junctions,boundaryNodes:topologyNodes.filter(node=>node.boundary),threeWayJunctions:junctions.filter(node=>node.degree===3),fourWayJunctions:junctions.filter(node=>node.degree>=4)};
}
export function nearestGraphNode(network:RoadNetwork,p:Point):Point|null{if(!network||!finitePoint(p))return null;let best:Point|null=null,bd=Infinity;for(const n of network.nodes||[]){const d=dist(n,p);if(d<bd){bd=d;best=n;}}return best&&bd<=2.5?best:null;}
export function shortestRoadPath(network:RoadNetwork,a:Point,b:Point):{path:Point[];distance:number}|null{if(!network||!a||!b)return null;const queue:{node:Point;d:number}[]=[{node:a,d:0}],best=new Map<Point,number>([[a,0]]),prev=new Map<Point,Point>();while(queue.length){queue.sort((x,y)=>x.d-y.d);const cur=queue.shift()!;if(cur.d!==best.get(cur.node))continue;if(cur.node===b)break;for(const nx of network.adjacency.get(cur.node)||[]){const nd=cur.d+nx.d;if(nd<(best.get(nx.node)??Infinity)){best.set(nx.node,nd);prev.set(nx.node,cur.node);queue.push({node:nx.node,d:nd});}}}if(!best.has(b))return null;const path:Point[]=[];let n:Point|undefined=b;while(n){path.unshift(n);n=prev.get(n);}return{path,distance:best.get(b)!};}
