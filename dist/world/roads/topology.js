import {dist,finitePoint,validRoadPoints,projectSegment,roadPointParameter,addNode} from './geometry.js';
import {roadWithinWorldBounds} from './validation.js';
import {WORLD_BOUNDS,WORLD_MARGIN} from '../terrain.js';
import {buildRoadIntersections} from './intersections.js';

export function bumpRoadNetworkRevision(s){
  s.roadNetworkRevision=Math.max(0,Math.floor(Number(s.roadNetworkRevision)||0))+1;
}

export function roadNetwork(s,extraPoints=[]){
  const valid=(s.roads||[])
    .map(r=>({...r,points:validRoadPoints(r?.points,0)}))
    .filter(r=>r.points?.length>=2&&roadWithinWorldBounds(r.points));
  const nodes=[],edges=[],marks=new Map(),virtualEdges=[];

  for(const road of valid){
    const segments=road.points.slice(1).map(()=>[]);
    marks.set(road,segments);
    for(let i=1;i<road.points.length;i++){
      segments[i-1].push(addNode(nodes,road.points[i-1]));
      segments[i-1].push(addNode(nodes,road.points[i]));
    }
  }

  buildRoadIntersections(valid,nodes,marks,virtualEdges);

  for(const p of extraPoints||[]){
    if(!finitePoint(p))continue;
    let best=null;
    for(const road of valid)for(let i=1;i<road.points.length;i++){
      const q=projectSegment(p,road.points[i-1],road.points[i]);
      if(!best||q.distance<best.distance)best={road,segment:i-1,point:q.point,distance:q.distance};
    }
    if(best){
      const n=addNode(nodes,best.point);
      marks.get(best.road)[best.segment].push(n);
    }
  }

  for(const road of valid)for(let i=0;i<road.points.length-1;i++){
    const a=road.points[i],b=road.points[i+1];
    const list=[...new Set(marks.get(road)[i])]
      .sort((u,v)=>roadPointParameter(a,b,u)-roadPointParameter(a,b,v));
    for(let j=1;j<list.length;j++){
      const u=list[j-1],v=list[j],d=dist(u,v);
      if(d>0.5)edges.push({a:u,b:v,d,road});
    }
  }

  for(const edge of virtualEdges)if(edge.d>.001)edges.push(edge);

  const nodeIds=new Map(nodes.map((node,index)=>[node,index]));
  const uniqueEdges=[];
  const edgeKeys=new Set();

  for(const edge of edges){
    if(!edge?.a||!edge?.b||edge.d<=.001)continue;
    const ai=nodeIds.get(edge.a),bi=nodeIds.get(edge.b);
    if(ai===undefined||bi===undefined||ai===bi)continue;
    const lo=Math.min(ai,bi),hi=Math.max(ai,bi),roadId=edge.road?.id||'road';
    const key=lo+':'+hi+':'+roadId;
    if(edgeKeys.has(key))continue;
    edgeKeys.add(key);
    uniqueEdges.push(edge);
  }

  edges.length=0;
  edges.push(...uniqueEdges);

  const adjacency=new Map(nodes.map(n=>[n,[]]));
  for(const e of edges){
    adjacency.get(e.a).push({node:e.b,d:e.d,road:e.road});
    adjacency.get(e.b).push({node:e.a,d:e.d,road:e.road});
  }

  const junctions=nodes.filter(n=>(adjacency.get(n)?.length||0)>=3);
  return{nodes,edges,adjacency,junctions};
}

export function roadTopology(s){
  const network=roadNetwork(s);
  const boundaryMinX=WORLD_BOUNDS.minX+WORLD_MARGIN;
  const boundaryMaxX=WORLD_BOUNDS.maxX-WORLD_MARGIN;
  const boundaryMinY=WORLD_BOUNDS.minY+WORLD_MARGIN;
  const boundaryMaxY=WORLD_BOUNDS.maxY-WORLD_MARGIN;
  const boundaryTolerance=3;

  const topologyNodes=network.nodes.map((node,index)=>{
    const links=network.adjacency.get(node)||[];
    const roadIds=[...new Set(links.map(link=>link.road?.id).filter(Boolean))];
    const degree=links.length;
    const boundary=
      Math.abs(node.x-boundaryMinX)<=boundaryTolerance||
      Math.abs(node.x-boundaryMaxX)<=boundaryTolerance||
      Math.abs(node.y-boundaryMinY)<=boundaryTolerance||
      Math.abs(node.y-boundaryMaxY)<=boundaryTolerance;
    const junction=degree>=3;
    return{
      id:index,x:node.x,y:node.y,degree,roadIds,boundary,junction,
      type:junction?(boundary?'boundary-junction':'junction'):(boundary?'boundary':degree===1?'endpoint':'node')
    };
  });

  const junctions=topologyNodes.filter(node=>node.junction);
  return{
    ...network,
    topologyNodes,
    topologyJunctions:junctions,
    boundaryNodes:topologyNodes.filter(node=>node.boundary),
    threeWayJunctions:junctions.filter(node=>node.degree===3),
    fourWayJunctions:junctions.filter(node=>node.degree>=4)
  };
}

export function nearestGraphNode(network,p){
  if(!network||!finitePoint(p))return null;
  let best=null,bd=Infinity;
  for(const n of network.nodes||[]){
    const d=dist(n,p);
    if(d<bd){bd=d;best=n;}
  }
  return best&&bd<=2.5?best:null;
}

export function shortestRoadPath(network,a,b){
  if(!network||!a||!b)return null;
  const queue=[{node:a,d:0}],best=new Map([[a,0]]),prev=new Map();
  while(queue.length){
    queue.sort((x,y)=>x.d-y.d);
    const cur=queue.shift();
    if(cur.d!==best.get(cur.node))continue;
    if(cur.node===b)break;
    for(const nx of network.adjacency.get(cur.node)||[]){
      const nd=cur.d+nx.d;
      if(nd<(best.get(nx.node)??Infinity)){
        best.set(nx.node,nd);
        prev.set(nx.node,cur.node);
        queue.push({node:nx.node,d:nd});
      }
    }
  }
  if(!best.has(b))return null;
  const path=[];
  let n=b;
  while(n){path.unshift(n);n=prev.get(n);}
  return{path,distance:best.get(b)};
}
