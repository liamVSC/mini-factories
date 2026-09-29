import {TYPES,makeBuilding} from './state.js';
export const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const length=pts=>pts.reduce((n,p,i)=>i?n+dist(pts[i-1],p):0,0);
function projectSegment(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;if(!l)return{point:{x:a.x,y:a.y},distance:dist(p,a)};const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l));const point={x:a.x+dx*t,y:a.y+dy*t};return{point,distance:dist(p,point)}}
function nearestPointOnRoad(road,p){let best=null,bd=Infinity;for(let i=1;i<road.points.length;i++){const q=projectSegment(p,road.points[i-1],road.points[i]);if(q.distance<bd){bd=q.distance;best=q.point}}return best}
export const riverY=x=>420+Math.sin(x*.002)*35;
export function district(x,y){if(Math.abs(y-riverY(x))<170)return'Riverside';if(x<0&&y<180)return'Industrial';if(x>0&&y>0)return'Market Quarter';return'West End'}
export function buildingCost(s,type){const base={Steel:260,Food:220,Parts:320,Market:180,Garage:240,Builder:220,Plastics:420,Glass:500,Electronics:520,Furniture:600,Warehouse:700};return Math.round((base[type.name]||300)*Math.pow(1.12,s.buildings.length))}
export function buildingUnlock(t,s){if(t.unlock&&(s.research?.[t.unlock]||0)<t.unlockLevel)return'Requires '+t.unlock+' research Lv '+t.unlockLevel;const min={Steel:1,Food:1,Parts:2,Market:1,Garage:2,Builder:1,Plastics:1,Glass:2,Electronics:1,Furniture:2,Warehouse:2}[t.name]||1;if(s.companyLevel<min)return'Requires Company Level '+min;return null}
export function canBuild(s,type){const reason=buildingUnlock(type,s);if(reason)return reason;const cap=10+(s.research?.industry||0)*2;if(s.buildings.length>=cap)return'Company building capacity reached ('+cap+')';if(s.cash<buildingCost(s,type))return'Costs £'+buildingCost(s,type);return null}
export function placeBuilding(s,type,x,y){if(canBuild(s,type))return false;if(s.buildings.some(b=>dist(b,{x,y})<145))return false;if(Math.abs(y-riverY(x))<105)return false;const b=makeBuilding(type,x,y,crypto.randomUUID());b.district=district(x,y);s.cash-=buildingCost(s,type);s.buildings.push(b);return b}
export function spawn(s,kind,forced){const pool=TYPES.filter(t=>t.kind===kind&&(!forced||t.name===forced)&&(!t.unlock||(s.research?.[t.unlock]||0)>=t.unlockLevel));if(!pool.length)return null;let candidates=pool;if(!forced&&pool.length>1){const recent=s.buildings.slice(-2).map(b=>b.type);const filtered=pool.filter(t=>!recent.includes(t.name));if(filtered.length)candidates=filtered}const type=candidates[Math.floor(Math.random()*candidates.length)];let x=0,y=0,ok=false;const count=s.buildings.length,minRadius=count<6?170:280,maxRadius=count<6?430:Math.min(760,430+s.companyLevel*22);for(let n=0;n<300&&!ok;n++){const angle=Math.random()*Math.PI*2,radius=minRadius+Math.random()*(maxRadius-minRadius);x=Math.cos(angle)*radius+(Math.random()-.5)*90;y=Math.sin(angle)*radius+(Math.random()-.5)*90;const river=riverY(x);if(Math.abs(y-river)<105)y+=y<river?-120:120;ok=s.buildings.every(b=>dist(b,{x,y})>145)}if(!ok)return null;const b=makeBuilding(type,x,y,crypto.randomUUID());b.district=district(x,y);s.buildings.push(b);return b}
export function seed(s){for(const t of['Steel','Food','Parts'])spawn(s,'factory',t);for(const t of['Market','Garage','Builder'])spawn(s,'shop',t)}
export function pointOnRoute(points,t){const total=length(points);if(!total)return points[0];let want=total*Math.max(0,Math.min(1,t)),run=0;for(let i=1;i<points.length;i++){const seg=dist(points[i-1],points[i]);if(run+seg>=want){const q=(want-run)/seg;return{x:points[i-1].x+(points[i].x-points[i-1].x)*q,y:points[i-1].y+(points[i].y-points[i-1].y)*q}}run+=seg}return points.at(-1)}
export function nearestBuilding(s,p){let best=null,bd=38;for(const b of s.buildings){const d=dist(b,p);if(d<bd){bd=d;best=b}}return best}
export function nearestRoad(s,p){let best=null,bd=24;for(const r of s.roads){const q=nearestPointOnRoad(r,p);if(!q)continue;const d=dist(p,q);if(d<bd){bd=d;best=q}}return best}
export function snap(s,p){return nearestBuilding(s,p)||nearestRoad(s,p)||p}
function segmentIntersection(a,b,c,d){const ab={x:b.x-a.x,y:b.y-a.y},cd={x:d.x-c.x,y:d.y-c.y},cross=(u,v)=>u.x*v.y-u.y*v.x,den=cross(ab,cd),ac={x:c.x-a.x,y:c.y-a.y};if(Math.abs(den)<1e-9)return null;const t=cross(ac,cd)/den,u=cross(ac,ab)/den;if(t<-.000001||t>1.000001||u<-.000001||u>1.000001)return null;return{x:a.x+ab.x*t,y:a.y+ab.y*t}}
function segmentDistance(a,b,c,d){const hit=segmentIntersection(a,b,c,d);if(hit)return 0;return Math.min(projectSegment(a,c,d).distance,projectSegment(b,c,d).distance,projectSegment(c,a,b).distance,projectSegment(d,a,b).distance)}
function roadDistance(a,b){let best=Infinity;for(let i=1;i<a.points.length;i++)for(let j=1;j<b.points.length;j++)best=Math.min(best,segmentDistance(a.points[i-1],a.points[i],b.points[j-1],b.points[j]));return best}
function addNode(nodes,p){let n=nodes.find(x=>dist(x,p)<2);if(!n){n={x:p.x,y:p.y};nodes.push(n)}return n}
export function roadNetwork(s){
 const nodes=[],edges=[];
 for(const r of s.roads){
  const marks=r.points.map((p,i)=>({p,seg:i}));
  for(let i=1;i<r.points.length;i++)for(const q of s.roads)for(let j=1;j<q.points.length;j++){if(r===q&&i===j)continue;const hit=segmentIntersection(r.points[i-1],r.points[i],q.points[j-1],q.points[j]);if(hit)marks.push({p:hit,seg:i})}
  const unique=[];for(const m of marks){const node=addNode(nodes,m.p);if(!unique.some(x=>x.node===node))unique.push({node,seg:m.seg})}
  unique.sort((a,b)=>a.seg-b.seg);
  for(let i=1;i<unique.length;i++){const a=unique[i-1].node,b=unique[i].node,d=dist(a,b);if(d>1)edges.push({a,b,d,road:r})}
 }
 const adjacency=new Map(nodes.map(n=>[n,[]]));
 for(const e of edges){adjacency.get(e.a).push({node:e.b,d:e.d,road:e.road});adjacency.get(e.b).push({node:e.a,d:e.d,road:e.road})}
 return{nodes,edges,adjacency}
}
function nearestNetworkPoint(network,p){let best=null,bd=Infinity;for(const e of network.edges){const q=projectSegment(p,e.a,e.b);if(q.distance<bd){bd=q.distance;best={edge:e,point:q.point}}}return best}
export function routeOnRoadNetwork(s,a,b){
 if(!s.roads.length)return null;
 const network=roadNetwork(s);if(!network.edges.length)return null;
 const sa=nearestNetworkPoint(network,a),sb=nearestNetworkPoint(network,b);if(!sa||!sb)return null;
 const start={x:sa.point.x,y:sa.point.y,virtual:true},end={x:sb.point.x,y:sb.point.y,virtual:true};
 const adjacency=new Map(network.nodes.map(n=>[n,[...(network.adjacency.get(n)||[])]]));
 adjacency.set(start,[]);adjacency.set(end,[]);
 const connect=(virtual,attachment)=>{
   for(const node of [attachment.edge.a,attachment.edge.b]){
     const d=dist(virtual,node);
     adjacency.get(virtual).push({node,d,road:attachment.edge.road});
     adjacency.get(node).push({node:virtual,d,road:attachment.edge.road});
   }
 };
 connect(start,sa);connect(end,sb);
 const queue=[{n:start,d:dist(a,start)}],best=new Map([[start,dist(a,start)]]),prev=new Map();
 while(queue.length){
   queue.sort((x,y)=>x.d-y.d);
   const cur=queue.shift();if(cur.d!==best.get(cur.n))continue;
   if(cur.n===end)break;
   for(const nx of adjacency.get(cur.n)||[]){
     const nd=cur.d+nx.d;
     if(nd<(best.get(nx.node)??Infinity)){best.set(nx.node,nd);prev.set(nx.node,cur.n);queue.push({n:nx.node,d:nd})}
   }
 }
 if(!best.has(end))return null;
 const chain=[];let n=end;while(n){chain.unshift(n);n=prev.get(n)}
 const points=[{x:a.x,y:a.y}];
 for(const n2 of chain)if(!n2.virtual&&dist(points.at(-1),n2)>2)points.push({x:n2.x,y:n2.y});
 if(dist(points.at(-1),end)>2)points.push({x:end.x,y:end.y});
 if(dist(points.at(-1),b)>2)points.push({x:b.x,y:b.y});
 return{points,distance:length(points),networkDistance:best.get(end)};
}

export function roadPath(s,a,b){
 const start=snap(s,a),end=snap(s,b);if(dist(start,end)<8)return[start,end];
 const existing=routeOnRoadNetwork(s,start,end);if(existing&&existing.networkDistance<dist(start,end)*2.2)return existing.points;
 const h=[start,{x:end.x,y:start.y},end],v=[start,{x:start.x,y:end.y},end];
 const score=p=>length(p)+p.slice(1,-1).reduce((n,q)=>n+(Math.abs(q.y-riverY(q.x))<55?180:0),0);
 return score(h)<=score(v)?h:v;
}
export function addRoad(s,points){
 const clean=points.filter((p,i)=>!i||dist(p,points[i-1])>10);if(clean.length<2)return false;
 const roadLength=length(clean);if(roadLength<18)return false;
 const cost=Math.max(1,Math.ceil(roadLength/55)),cashCost=cost*2;if(s.roadBudget<cost||s.cash<cashCost)return false;
 if(s.roads.some(r=>roadDistance(r,clean)<12&&Math.abs(length(r.points)-roadLength)<25))return false;
 s.roadBudget-=cost;s.cash-=cashCost;s.roads.push({id:crypto.randomUUID(),points:clean,age:0,bridge:clean.some((p,i)=>i&&Math.abs(p.y-riverY(p.x))<45),condition:1});return true;
}
export function eraseRoad(s,p){let hit=null,bd=16;for(const r of s.roads)for(let i=1;i<r.points.length;i++){const q=projectSegment(p,r.points[i-1],r.points[i]);if(q.distance<bd){bd=q.distance;hit=r}}if(!hit)return false;s.roads=s.roads.filter(r=>r!==hit);return true}