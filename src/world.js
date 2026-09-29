import {TYPES,makeBuilding} from './state.js';
export const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const length=pts=>pts.reduce((n,p,i)=>i?n+dist(pts[i-1],p):0,0);
export const riverY=x=>420+Math.sin(x*.002)*35;
export function district(x,y){if(Math.abs(y-riverY(x))<170)return'Riverside';if(x<0&&y<180)return'Industrial';if(x>0&&y>0)return'Market Quarter';return'West End'}
export function spawn(s,kind,forced){
  const pool=TYPES.filter(t=>t.kind===kind&&(!forced||t.name===forced));
  const type=pool[Math.floor(Math.random()*pool.length)];
  if(!type)return null;

  // Buildings should feel organically/randomly placed, while still respecting
  // spacing and the river so the map remains playable.
  let x=0,y=0,ok=false;
  const count=s.buildings.length;
  const minRadius=count<6?170:280;
  const maxRadius=count<6?430:Math.min(760,430+s.week*22);

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
export function roadPath(s,a,b){const end=snap(s,b);if(Math.abs(end.x-a.x)<8||Math.abs(end.y-a.y)<8)return[a,end];return Math.abs(end.x-a.x)>=Math.abs(end.y-a.y)?[a,{x:end.x,y:a.y},end]:[a,{x:a.x,y:end.y},end]}
export function addRoad(s,points){const clean=points.filter((p,i)=>!i||dist(p,points[i-1])>10);if(clean.length<2)return false;const cost=Math.max(1,Math.ceil(length(clean)/55));const cashCost=cost*2;if(s.roadBudget<cost||s.cash<cashCost)return false;s.roadBudget-=cost;s.cash-=cashCost;s.roads.push({id:crypto.randomUUID(),points:clean,age:0,bridge:clean.some((p,i)=>i&&Math.abs(p.y-riverY(p.x))<45)});return true}
export function eraseRoad(s,p){let hit=null,bd=14;for(const r of s.roads)for(let i=1;i<r.points.length;i++){const a=r.points[i-1],b=r.points[i],dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;if(!l)continue;let t=((p.x-a.x)*dx+(p.y-a.y)*dy)/l;t=Math.max(0,Math.min(1,t));const d=dist(p,{x:a.x+dx*t,y:a.y+dy*t});if(d<bd){bd=d;hit=r}}if(!hit)return false;s.roads=s.roads.filter(r=>r!==hit);return true}