import {TYPES,makeBuilding} from './state.js';
export const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const length=pts=>pts.reduce((n,p,i)=>i?n+dist(pts[i-1],p):0,0);
export const riverY=x=>420+Math.sin(x*.002)*35;
export function district(x,y){if(Math.abs(y-riverY(x))<170)return'Riverside';if(x<0&&y<180)return'Industrial';if(x>0&&y>0)return'Market Quarter';return'West End'}
export function buildingCost(s,type){
  const base={Steel:260,Food:220,Parts:320,Market:180,Garage:240,Builder:220,Plastics:420,Glass:500,Electronics:520,Furniture:600};
  return Math.round((base[type.name]||300)*Math.pow(1.12,s.buildings.length));
}
export function buildingUnlock(t,s){
  if(t.unlock&&(s.research?.[t.unlock]||0)<t.unlockLevel)return 'Requires '+t.unlock+' research Lv '+t.unlockLevel;
  const min={Steel:1,Food:1,Parts:2,Market:1,Garage:2,Builder:1,Plastics:1,Glass:2,Electronics:1,Furniture:2}[t.name]||1;
  if(s.companyLevel<min)return 'Requires Company Level '+min;
  return null;
}
export function canBuild(s,type){
  const reason=buildingUnlock(type,s); if(reason)return reason;
  if(s.cash<buildingCost(s,type))return 'Costs £'+buildingCost(s,type);
  return null;
}
export function placeBuilding(s,type,x,y){
  if(canBuild(s,type))return false;
  if(s.buildings.some(b=>dist(b,{x,y})<145))return false;
  const river=riverY(x);
  if(Math.abs(y-river)<105)return false;
  const b=makeBuilding(type,x,y,crypto.randomUUID()); b.district=district(x,y);
  s.cash-=buildingCost(s,type);s.buildings.push(b);return b;
}
export function spawn(s,kind,forced){
  const pool=TYPES.filter(t=>t.kind===kind&&(!forced||t.name===forced)&&(!t.unlock||(s.research?.[t.unlock]||0)>=t.unlockLevel));
  if(!pool.length)return null;

  // Keep placement random, but avoid repeatedly spawning the same building type.
  // Forced spawns (used for the initial city) always honour the requested type.
  let candidates=pool;
  if(!forced&&pool.length>1){
    const recent=s.buildings.slice(-2).map(b=>b.type);
    const filtered=pool.filter(t=>!recent.includes(t.name));
    if(filtered.length)candidates=filtered;
  }
  const type=candidates[Math.floor(Math.random()*candidates.length)];

  // Buildings should feel organically/randomly placed, while still respecting
  // spacing and the river so the map remains playable.
  let x=0,y=0,ok=false;
  const count=s.buildings.length;
  const minRadius=count<6?170:280;
  const maxRadius=count<6?430:Math.min(760,430+s.companyLevel*22);

  for(let n=0;n<300&&!ok;n++){
    const angle=Math.random()*Math.PI*2;
    const radius=minRadius+Math.random()*(maxRadius-minRadius);
    x=Math.cos(angle)*radius+(Math.random()-.5)*90;
    y=Math.sin(angle)*radius+(Math.random()-.5)*90;

    // Keep buildings out of the river itself, but allow them on either side.
    const river=riverY(x);
    if(Math.abs(y-river)<105)y += y<river ? -120 : 120;

    ok=s.buildings.every(b=>dist(b,{x,y})>145);
  }

  if(!ok)return null;
  const b=makeBuilding(type,x,y,crypto.randomUUID());
  b.district=district(x,y);
  s.buildings.push(b);
  return b;
}

export function seed(s){
  for(const t of ['Steel','Food','Parts'])spawn(s,'factory',t);
  for(const t of ['Market','Garage','Builder'])spawn(s,'shop',t);
}

export function pointOnRoute(points,t){const total=length(points);if(!total)return points[0];let want=total*Math.max(0,Math.min(1,t)),run=0;for(let i=1;i<points.length;i++){const seg=dist(points[i-1],points[i]);if(run+seg>=want){const q=(want-run)/seg;return{x:points[i-1].x+(points[i].x-points[i-1].x)*q,y:points[i-1].y+(points[i].y-points[i-1].y)*q}}run+=seg}return points.at(-1)}
export function nearestBuilding(s,p){let best=null,bd=38;for(const b of s.buildings){const d=dist(b,p);if(d<bd){bd=d;best=b}}return best}
export function nearestRoad(s,p){let best=null,bd=24;for(const r of s.roads)for(let i=1;i<r.points.length;i++){const a=r.points[i-1],b=r.points[i],dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;if(!l)continue;let t=((p.x-a.x)*dx+(p.y-a.y)*dy)/l;t=Math.max(0,Math.min(1,t));const q={x:a.x+dx*t,y:a.y+dy*t},d=dist(p,q);if(d<bd){bd=d;best=q}}return best}
export function snap(s,p){return nearestBuilding(s,p)||nearestRoad(s,p)||p}
export function roadPath(s,a,b){
  const start=snap(s,a);
  const end=snap(s,b);
  if(dist(start,end)<8)return[start,end];

  // Use a simple Manhattan bend, but prefer the orientation that avoids
  // unnecessary backtracking and keeps the path compact.
  const horizontalFirst=[
    start,
    {x:end.x,y:start.y},
    end
  ];
  const verticalFirst=[
    start,
    {x:start.x,y:end.y},
    end
  ];
  const score=p=>length(p)+p.slice(1,-1).reduce((n,q)=>n+(Math.abs(q.y-riverY(q.x))<55?180:0),0);
  return score(horizontalFirst)<=score(verticalFirst)?horizontalFirst:verticalFirst;
}

export function addRoad(s,points){
  const clean=points.filter((p,i)=>!i||dist(p,points[i-1])>10);
  if(clean.length<2)return false;
  const roadLength=length(clean);
  if(roadLength<18)return false;
  const cost=Math.max(1,Math.ceil(roadLength/55));
  const cashCost=cost*2;
  if(s.roadBudget<cost||s.cash<cashCost)return false;

  // Don't create a duplicate/near-duplicate road.
  if(s.roads.some(r=>roadDistance(r,clean)<12&&Math.abs(length(r.points)-roadLength)<25))return false;

  s.roadBudget-=cost;
  s.cash-=cashCost;
  s.roads.push({
    id:crypto.randomUUID(),
    points:clean,
    age:0,
    bridge:clean.some((p,i)=>i&&Math.abs(p.y-riverY(p.x))<45)
  });
  return true;
}

function roadDistance(r,points){
  let best=Infinity;
  for(const a of [r.points[0],r.points.at(-1)])
    for(const b of [points[0],points.at(-1)])
      best=Math.min(best,dist(a,b));
  return best;
}
export function eraseRoad(s,p){let hit=null,bd=14;for(const r of s.roads)for(let i=1;i<r.points.length;i++){const a=r.points[i-1],b=r.points[i],dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;if(!l)continue;let t=((p.x-a.x)*dx+(p.y-a.y)*dy)/l;t=Math.max(0,Math.min(1,t));const d=dist(p,{x:a.x+dx*t,y:a.y+dy*t});if(d<bd){bd=d;hit=r}}if(!hit)return false;s.roads=s.roads.filter(r=>r!==hit);return true}