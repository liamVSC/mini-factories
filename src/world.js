import {TYPES,makeBuilding} from './state.js';
const newId=()=>globalThis.crypto?.randomUUID?.()||'id-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
export const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const length=pts=>pts.reduce((n,p,i)=>i?n+dist(pts[i-1],p):0,0);
function projectSegment(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;if(!l)return{point:{x:a.x,y:a.y},distance:dist(p,a)};const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l));const point={x:a.x+dx*t,y:a.y+dy*t};return{point,distance:dist(p,point)}}
function nearestPointOnRoad(road,p){let best=null,bd=Infinity;for(let i=1;i<road.points.length;i++){const q=projectSegment(p,road.points[i-1],road.points[i]);if(q.distance<bd){bd=q.distance;best=q.point}}return best}
export const riverY=x=>420+Math.sin(x*.002)*35;
export function district(x,y){if(Math.abs(y-riverY(x))<170)return'Riverside';if(x<0&&y<180)return'Industrial';if(x>0&&y>0)return'Market Quarter';return'West End'}
export function buildingCost(s,type){const base={Steel:260,Food:220,Parts:320,Market:180,Garage:240,Builder:220,Plastics:420,Glass:500,Electronics:520,Furniture:600,Warehouse:700};return Math.round((base[type.name]||300)*Math.pow(1.12,s.buildings.length))}
export function buildingUnlock(t,s){if(t.unlock&&(s.research?.[t.unlock]||0)<t.unlockLevel)return'Requires '+t.unlock+' research Lv '+t.unlockLevel;const min={Steel:1,Food:1,Parts:2,Market:1,Garage:2,Builder:1,Plastics:1,Glass:2,Electronics:1,Furniture:2,Warehouse:2}[t.name]||1;if(s.companyLevel<min)return'Requires Company Level '+min;return null}
export function canBuild(s,type){const reason=buildingUnlock(type,s);if(reason)return reason;const cap=10+(s.research?.industry||0)*2;if(s.buildings.length>=cap)return'Company building capacity reached ('+cap+')';if(s.cash<buildingCost(s,type))return'Costs £'+buildingCost(s,type);return null}
export function placeBuilding(s,type,x,y){if(canBuild(s,type))return false;if(s.buildings.some(b=>dist(b,{x,y})<145))return false;if(Math.abs(y-riverY(x))<105)return false;const b=makeBuilding(type,x,y,newId());b.district=district(x,y);s.cash-=buildingCost(s,type);s.buildings.push(b);return b}
export function spawn(s,kind,forced){const pool=TYPES.filter(t=>t.kind===kind&&(!forced||t.name===forced)&&(!t.unlock||(s.research?.[t.unlock]||0)>=t.unlockLevel));if(!pool.length)return null;let candidates=pool;if(!forced&&pool.length>1){const recent=s.buildings.slice(-2).map(b=>b.type);const filtered=pool.filter(t=>!recent.includes(t.name));if(filtered.length)candidates=filtered}const type=candidates[Math.floor(Math.random()*candidates.length)];let x=0,y=0,ok=false;const count=s.buildings.length,minRadius=count<6?170:280,maxRadius=count<6?430:Math.min(760,430+s.companyLevel*22);for(let n=0;n<300&&!ok;n++){const angle=Math.random()*Math.PI*2,radius=minRadius+Math.random()*(maxRadius-minRadius);x=Math.cos(angle)*radius+(Math.random()-.5)*90;y=Math.sin(angle)*radius+(Math.random()-.5)*90;const river=riverY(x);if(Math.abs(y-river)<105)y+=y<river?-120:120;ok=s.buildings.every(b=>dist(b,{x,y})>145)}if(!ok)return null;const b=makeBuilding(type,x,y,newId());b.district=district(x,y);s.buildings.push(b);return b}
export function seed(s){for(const t of['Steel','Food','Parts'])spawn(s,'factory',t);for(const t of['Market','Garage','Builder'])spawn(s,'shop',t)}
export function pointOnRoute(points,t){const total=length(points);if(!total)return points[0];let want=total*Math.max(0,Math.min(1,t)),run=0;for(let i=1;i<points.length;i++){const seg=dist(points[i-1],points[i]);if(run+seg>=want){const q=(want-run)/seg;return{x:points[i-1].x+(points[i].x-points[i-1].x)*q,y:points[i-1].y+(points[i].y-points[i-1].y)*q}}run+=seg}return points.at(-1)}
export function nearestBuilding(s,p){let best=null,bd=58;for(const b of s.buildings){const d=dist(b,p);if(d<bd){bd=d;best=b}}return best}
export function roadBuildingTarget(s,p){
  let best=null,bd=Infinity;
  for(const b of s.buildings||[]){
    const hit=Math.max(52,(b.r||25)+26);
    const d=dist(b,p);
    if(d<=hit&&d<bd){bd=d;best=b}
  }
  return best;
}
function projectOnPolyline(points,p){let best=null,run=0;for(let i=1;i<points.length;i++){const q=projectSegment(p,points[i-1],points[i]);if(!best||q.distance<best.distance)best={...q,segment:i-1,along:run+dist(points[i-1],q.point)};run+=dist(points[i-1],points[i])}return best}
export function nearestRoad(s,p){let best=null;for(const road of s.roads||[]){if(!road?.points||road.points.length<2)continue;const q=projectOnPolyline(road.points,p);if(q&&(!best||q.distance<best.distance))best={x:q.point.x,y:q.point.y,road,distance:q.distance,segment:q.segment,along:q.along}}return best&&best.distance<=46?best:null}
function buildingConnectionPoint(building,target){const dx=target.x-building.x,dy=target.y-building.y;const len=Math.hypot(dx,dy)||1;const radius=Math.max(26,(building.r||25)+9);return{x:building.x+dx/len*radius,y:building.y+dy/len*radius,building,distance:0}}
function resolveRoadEndpoint(s,value){if(value?.building&&Number.isFinite(value.building.x))return buildingConnectionPoint(value.building,value);const building=nearestBuilding(s,value);if(building&&dist(building,value)<=48)return buildingConnectionPoint(building,value);const road=snapRoadPoint(s,value,42);return road||{x:value.x,y:value.y,distance:Infinity}}
export function snapRoadPoint(s,p,max=42){const q=nearestRoad(s,p);if(!q||q.distance>max)return null;return{x:q.x,y:q.y,road:q.road,distance:q.distance}}
export function snap(s,p){const b=nearestBuilding(s,p);if(b)return b;const r=nearestRoad(s,p);return r||p}
function segmentIntersection(a,b,c,d){const ab={x:b.x-a.x,y:b.y-a.y},cd={x:d.x-c.x,y:d.y-c.y},cross=(u,v)=>u.x*v.y-u.y*v.x,den=cross(ab,cd),ac={x:c.x-a.x,y:c.y-a.y};if(Math.abs(den)<1e-9)return null;const t=cross(ac,cd)/den,u=cross(ac,ab)/den;if(t<-.000001||t>1.000001||u<-.000001||u>1.000001)return null;return{x:a.x+ab.x*t,y:a.y+ab.y*t,t,u}}
function addNode(nodes,p){let n=nodes.find(x=>dist(x,p)<2.5);if(!n){n={x:p.x,y:p.y};nodes.push(n)}return n}
function roadPointParameter(a,b,p){
  const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;
  if(!l)return 0;
  return Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l));
}
export function roadNetwork(s,extraPoints=[]){
  const valid=(s.roads||[]).filter(r=>r?.points?.length>=2),nodes=[],edges=[],marks=new Map();
  for(const road of valid){
    const segments=road.points.slice(1).map(()=>[]);
    marks.set(road,segments);
    for(let i=1;i<road.points.length;i++){segments[i-1].push(addNode(nodes,road.points[i-1]));segments[i-1].push(addNode(nodes,road.points[i]));}
  }
  for(let ri=0;ri<valid.length;ri++){
    const aRoad=valid[ri];
    for(let qi=ri;qi<valid.length;qi++){
      const bRoad=valid[qi];
      for(let i=1;i<aRoad.points.length;i++){
        const a=aRoad.points[i-1],b=aRoad.points[i],first=aRoad===bRoad?i:1;
        for(let j=first;j<bRoad.points.length;j++){
          if(aRoad===bRoad&&i===j)continue;
          const hit=segmentIntersection(a,b,bRoad.points[j-1],bRoad.points[j]);
          if(!hit)continue;
          const n=addNode(nodes,hit);
          marks.get(aRoad)[i-1].push(n);marks.get(bRoad)[j-1].push(n);
        }
      }
    }
  }
  for(const p of extraPoints||[]){
    if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;
    let best=null;
    for(const road of valid)for(let i=1;i<road.points.length;i++){
      const q=projectSegment(p,road.points[i-1],road.points[i]);
      if(!best||q.distance<best.distance)best={road,segment:i-1,point:q.point,distance:q.distance};
    }
    if(best){const n=addNode(nodes,best.point);marks.get(best.road)[best.segment].push(n);}
  }
  for(const road of valid)for(let i=0;i<road.points.length-1;i++){
    const a=road.points[i],b=road.points[i+1];
    const list=[...new Set(marks.get(road)[i])].sort((u,v)=>roadPointParameter(a,b,u)-roadPointParameter(a,b,v));
    for(let j=1;j<list.length;j++){const u=list[j-1],v=list[j],d=dist(u,v);if(d>0.5)edges.push({a:u,b:v,d,road});}
  }
  const adjacency=new Map(nodes.map(n=>[n,[]]));
  for(const e of edges){adjacency.get(e.a).push({node:e.b,d:e.d,road:e.road});adjacency.get(e.b).push({node:e.a,d:e.d,road:e.road});}
  return{nodes,edges,adjacency};
}
function shortestRoadPath(network,a,b){
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
  while(n){path.unshift(n);n=prev.get(n)}
  return{path,distance:best.get(b)};
}
export function roadAttachment(s,building){
  if(!building)return null;
  const limit=Math.max(42,(building.r||25)+18);
  let best=null;
  for(const road of s.roads||[]){
    if(!road?.points||road.points.length<2)continue;
    for(let i=1;i<road.points.length;i++){
      const a=road.points[i-1],b=road.points[i];
      const q=projectSegment(building,a,b);
      if(q.distance<=limit&&(!best||q.distance<best.distance)){
        best={road,point:{x:q.point.x,y:q.point.y},distance:q.distance,segment:i-1};
      }
    }
  }
  return best;
}
export function routeOnRoadNetwork(s,a,b){
  const aa=roadAttachment(s,a),bb=roadAttachment(s,b);
  if(!aa||!bb)return null;
  const network=roadNetwork(s,[aa.point,bb.point]);
  const start=nearestGraphNode(network,aa.point),end=nearestGraphNode(network,bb.point);
  if(!start||!end)return null;
  const result=shortestRoadPath(network,start,end);
  if(!result||result.path.length<2)return null;
  return{points:result.path.map(p=>({x:p.x,y:p.y})),distance:result.distance,networkDistance:result.distance,start:{x:aa.point.x,y:aa.point.y},end:{x:bb.point.x,y:bb.point.y}};
}
function nearestGraphNode(network,p){
  let best=null,bd=Infinity;
  for(const n of network.nodes){const d=dist(n,p);if(d<bd){bd=d;best=n}}
  return best&&bd<=2.5?best:null;
}
export function roadPath(s,a,b){const start=snap(s,a),end=snap(s,b);if(dist(start,end)<8)return[start,end];const existing=routeOnRoadNetwork(s,start,end);return existing?existing.points:null}
function roadDistance(a,b){const ap=a?.points||a,bp=b?.points||b;if(!Array.isArray(ap)||!Array.isArray(bp)||ap.length<2||bp.length<2)return Infinity;let best=Infinity;for(let i=1;i<ap.length;i++){const pa=ap[i-1],pb=ap[i];for(let j=1;j<bp.length;j++){const pc=bp[j-1],pd=bp[j];best=Math.min(best,projectSegment(pa,pc,pd).distance,projectSegment(pb,pc,pd).distance,projectSegment(pc,pa,pb).distance,projectSegment(pd,pa,pb).distance)}}return best}
function pointSegmentDistance(p,a,b){return projectSegment(p,a,b).distance}
function normalizeRoadEndpoint(s,p){
  const b=nearestBuilding(s,p);
  if(!b||dist(b,p)>88)return p;
  return buildingConnectionPoint(b,p)
}
function roadTargetInternal(s,p){
  if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return null;
  if(p.building&&Number.isFinite(p.building.x))return buildingConnectionPoint(p.building,p);
  if(p.road&&Number.isFinite(p.x)&&Number.isFinite(p.y))return{x:p.x,y:p.y,road:p.road,distance:0};

  const building=roadBuildingTarget(s,p);
  if(building)return buildingConnectionPoint(building,p);

  const road=nearestRoad(s,p);
  if(road)return{x:road.x,y:road.y,road:road.road,distance:road.distance};

  // Unsnapped endpoints use a small construction grid so roads can be
  // aligned cleanly without forcing nearby points onto unrelated roads.
  const grid=12;
  const snapped={x:Math.round(p.x/grid)*grid,y:Math.round(p.y/grid)*grid};
  return{x:snapped.x,y:snapped.y,distance:Infinity,gridSnapped:true};
}
function cleanRoadPoints(points){
  const out=[];
  for(const p of points||[]){
    if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;
    if(!out.length||dist(out[out.length-1],p)>2)out.push({x:p.x,y:p.y});
  }
  return out;
}
function segmentNearRiver(a,b,threshold=45){
  const span=Math.max(1,dist(a,b));
  const samples=Math.max(3,Math.ceil(span/24));
  for(let i=0;i<=samples;i++){
    const t=i/samples,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
    if(Math.abs(y-riverY(x))<threshold)return true;
  }
  return false;
}
function roadPathBlocked(s,points,endpointBuildings={}){
  if(!points||points.length<2)return true;
  const startBuilding=endpointBuildings.start||roadBuildingTarget(s,points[0]);
  const endBuilding=endpointBuildings.end||roadBuildingTarget(s,points[points.length-1]);
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    for(const building of s.buildings||[]){
      const clearance=(building.r||25)+12;
      // A road is allowed to terminate at its endpoint buildings.
      if((i===1&&building===startBuilding)||(i===points.length-1&&building===endBuilding))continue;
      if(pointSegmentDistance(building,a,b)<clearance)return true;
    }
  }
  return false;
}

function simplifyRoad(points){
  const p=cleanRoadPoints(points);
  if(p.length<=2)return p;
  const out=[p[0]];
  for(let i=1;i<p.length-1;i++){
    const a=out[out.length-1],b=p[i],c=p[i+1];
    const ab={x:b.x-a.x,y:b.y-a.y},bc={x:c.x-b.x,y:c.y-b.y};
    if(Math.abs(ab.x*bc.y-ab.y*bc.x)<1.5)continue;
    out.push(b);
  }
  out.push(p[p.length-1]);
  return out;
}
function candidateRoadPaths(start,end){
  const mx=(start.x+end.x)/2,my=(start.y+end.y)/2;
  return[
    [start,end],
    [start,{x:mx,y:start.y}, {x:mx,y:end.y},end],
    [start,{x:start.x,y:my}, {x:end.x,y:my},end]
  ];
}
export function roadTarget(s,p){
  return roadTargetInternal(s,p);
}

function roadTargetInternal(s,p){
  if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return null;
  if(p.building&&Number.isFinite(p.building.x))
    return buildingConnectionPoint(p.building,p);
  if(p.road&&Number.isFinite(p.x)&&Number.isFinite(p.y))
    return{x:p.x,y:p.y,road:p.road,distance:0};

  const building=roadBuildingTarget(s,p);
  if(building)return buildingConnectionPoint(building,p);

  const road=nearestRoad(s,p);
  if(road)return{x:road.x,y:road.y,road:road.road,distance:road.distance};

  const grid=12;
  const snapped={x:Math.round(p.x/grid)*grid,y:Math.round(p.y/grid)*grid};
  return{x:snapped.x,y:snapped.y,distance:Infinity,gridSnapped:true};
}

export function roadPreview(s,a,b){
  const start=roadTargetInternal(s,a);
  const end=roadTargetInternal(s,b);
  if(!start||!end)return null;

  const startBuilding=start.building;
  const endBuilding=end.building;

  if(startBuilding&&endBuilding&&startBuilding!==endBuilding){
    const sa=buildingConnectionPoint(startBuilding,endBuilding);
    const eb=buildingConnectionPoint(endBuilding,startBuilding);
    const direct=[sa,eb];
    const candidates=candidateRoadPaths(sa,eb).map(simplifyRoad);
    const clear=candidates.filter(path=>!roadPathBlocked(s,path,{startBuilding,endBuilding}));
    const path=(clear.length?clear:[direct]).sort((x,y)=>length(x)-length(y))[0];
    const roadLength=length(path);
    return{
      path,start:sa,end:eb,
      snappedStart:true,snappedEnd:true,
      connectsBuilding:true,connectsRoad:false,
      blocked:roadPathBlocked(s,path,{startBuilding,endBuilding}),
      length:roadLength,
      cost:Math.max(1,Math.ceil(roadLength/180))*2
    };
  }

  const candidates=candidateRoadPaths(start,end).map(simplifyRoad);
  const clear=candidates.filter(path=>!roadPathBlocked(s,path,{startBuilding,endBuilding}));
  const path=(clear.length?clear:candidates).sort((x,y)=>length(x)-length(y))[0]||[start,end];
  const blocked=roadPathBlocked(s,path,{startBuilding,endBuilding});
  const roadLength=length(path);

  return{
    path,start,end,
    snappedStart:Number.isFinite(start.distance),
    snappedEnd:Number.isFinite(end.distance),
    gridSnappedStart:!!start.gridSnapped,
    gridSnappedEnd:!!end.gridSnapped,
    connectsBuilding:!!start.building||!!end.building,
    connectsRoad:!!start.road||!!end.road,
    blocked,
    length:roadLength,
    cost:Math.max(1,Math.ceil(roadLength/180))*2
  };
}
export function addRoad(s,points,meta={}){
  const clean=simplifyRoad(points);
  if(clean.length<2)return'invalid';
  const roadLength=length(clean);
  if(!Number.isFinite(roadLength))return'too-short';
  if(roadLength<1){
    const a=meta.startBuilding||roadBuildingTarget(s,clean[0]);
    const b=meta.endBuilding||roadBuildingTarget(s,clean[clean.length-1]);
    if(!a||!b||a===b)return'too-short';
  }
  if(roadPathBlocked(s,clean,{start:meta.startBuilding,end:meta.endBuilding}))return'blocked';
  const cost=Math.max(1,Math.ceil(roadLength/180))*2;
  if(!Number.isFinite(cost)||!Number.isFinite(s.cash)||s.cash<cost)return'cash';
  if((s.roads||[]).some(r=>roadDistance(r,clean)<12&&Math.abs(length(r.points)-roadLength)<24))return'duplicate';
  const bridge=clean.some((p,i)=>i?segmentNearRiver(clean[i-1],p):false);
  s.cash-=cost;
  s.roads.push({id:newId(),points:clean,age:0,bridge,condition:1});
  return true;
}
export function eraseRoad(s,p){let hit=null,bd=24;for(const r of s.roads||[]){const q=projectOnPolyline(r.points,p);if(q&&q.distance<bd){bd=q.distance;hit=r}}if(!hit)return false;s.roads=s.roads.filter(r=>r!==hit);return true}
