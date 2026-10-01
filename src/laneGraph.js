/**
 * Deterministic lane graph derived from the canonical road graph.
 *
 * The road graph remains the authoritative geometric topology. This layer adds
 * directional lanes and lane-to-lane transitions for traffic/pathfinding while
 * keeping the persisted road geometry unchanged.
 */
const EPSILON = 1e-6;

function nodeKey(a,b){ return String(a.id)+':'+String(b.id); }

function vector(a,b){
  const dx=b.x-a.x, dy=b.y-a.y, len=Math.hypot(dx,dy)||1;
  return {x:dx/len,y:dy/len};
}

function addUnique(list,value){
  if(!list.includes(value))list.push(value);
}

/**
 * Build two directional lanes for every traversable road edge by default.
 * The lane geometry is intentionally not persisted: it is derived from the
 * road graph, so editing/deleting roads automatically invalidates old graphs.
 */
export function buildLaneGraph(network,{lanesPerDirection=1}={}){
  const nodes = network?.nodes||[];
  const edges = network?.edges||[];
  const lanes = [];
  const lanesById = new Map();
  const outgoing = new Map(nodes.map(n=>[n,[]]));
  const incoming = new Map(nodes.map(n=>[n,[]]));

  for(const edge of edges){
    if(!edge?.a||!edge?.b||!(edge.d>EPSILON))continue;
    const directionAB=vector(edge.a,edge.b);
    const directionBA={x:-directionAB.x,y:-directionAB.y};
    for(let laneIndex=0;laneIndex<Math.max(1,lanesPerDirection);laneIndex++){
      const width=8;
      const lateral=(laneIndex-(Math.max(1,lanesPerDirection)-1)/2)*width;
      const create=(from,to,direction,reverse)=>{
        const id='lane-'+lanes.length;
        const lane={
          id,
          roadId:edge.road?.id||null,
          from,
          to,
          edge,
          laneIndex,
          lateralOffset:lateral,
          direction,
          reverse
        };
        lanes.push(lane);
        lanesById.set(id,lane);
        outgoing.get(from)?.push(lane);
        incoming.get(to)?.push(lane);
      };
      create(edge.a,edge.b,directionAB,false);
      create(edge.b,edge.a,directionBA,true);
    }
  }

  const adjacency=new Map(lanes.map(lane=>[lane.id,[]]));
  for(const lane of lanes){
    const candidates=outgoing.get(lane.to)||[];
    for(const next of candidates){
      // Do not create an immediate U-turn as a normal through movement.
      // Traffic can still reverse through a future explicit turn command.
      if(next.to===lane.from&&next.roadId===lane.roadId)continue;
      addUnique(adjacency.get(lane.id),next.id);
    }
  }

  return {nodes,edges,lanes,lanesById,outgoing,incoming,adjacency};
}

function shortestLanePath(graph,startNode,endNode){
  const starts=graph.outgoing.get(startNode)||[];
  if(startNode===endNode)return{laneIds:[],distance:0};
  if(!starts.length)return null;

  const queue=[];
  const best=new Map();
  const prev=new Map();

  for(const lane of starts){
    const d=lane.edge?.d||0;
    if(d<(best.get(lane.id)??Infinity)){
      best.set(lane.id,d);
      prev.set(lane.id,null);
      queue.push({lane,d});
    }
  }

  while(queue.length){
    queue.sort((a,b)=>a.d-b.d);
    const current=queue.shift();
    if(current.d!==(best.get(current.lane.id)??Infinity))continue;
    if(current.lane.to===endNode){
      const ids=[];
      let id=current.lane.id;
      while(id){ids.unshift(id);id=prev.get(id)}
      return{laneIds:ids,distance:current.d};
    }
    for(const nextId of graph.adjacency.get(current.lane.id)||[]){
      const next=graph.lanesById.get(nextId);
      if(!next)continue;
      const nd=current.d+(next.edge?.d||0);
      if(nd<(best.get(next.id)??Infinity)){
        best.set(next.id,nd);
        prev.set(next.id,current.lane.id);
        queue.push({lane:next,d:nd});
      }
    }
  }
  return null;
}

export function findLaneRoute(graph,startNode,endNode){
  return shortestLanePath(graph,startNode,endNode);
}

/**
 * Return the canonical road-node sequence represented by a lane route.
 * Geometry stays centred on the road; the renderer can apply the existing
 * visual lane offset without double-offsetting the route itself.
 */
export function laneRouteToNodePath(graph,laneIds){
  if(!laneIds?.length)return[];
  const result=[];
  for(const id of laneIds){
    const lane=graph.lanesById.get(id);
    if(!lane)continue;
    if(!result.length)result.push(lane.from);
    result.push(lane.to);
  }
  return result;
}

export function laneAtProgress(graph,laneIds,index=0){
  const id=laneIds?.[Math.max(0,Math.min(laneIds.length-1,index))];
  return id?graph.lanesById.get(id)||null:null;
}
