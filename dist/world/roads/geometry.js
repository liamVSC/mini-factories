export const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const length=pts=>pts.reduce((n,p,i)=>i?n+dist(pts[i-1],p):0,0);

export const finitePoint=p=>p&&Number.isFinite(Number(p.x))&&Number.isFinite(Number(p.y));
export const safePoint=p=>({x:Number(p.x),y:Number(p.y)});

export function validRoadPoints(points,minLength=12){
  const clean=[];
  for(const p of points||[]){
    if(!finitePoint(p))continue;
    const q=safePoint(p);
    if(!clean.length||dist(clean.at(-1),q)>2)clean.push(q);
  }
  return clean.length>=2&&length(clean)>=minLength?clean:null;
}

export function projectSegment(p,a,b){
  const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;
  if(!l)return{point:{x:a.x,y:a.y},distance:dist(p,a)};
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l));
  const point={x:a.x+dx*t,y:a.y+dy*t};
  return{point,distance:dist(p,point)};
}

export function projectOnPolyline(points,p){
  let best=null,run=0;
  for(let i=1;i<points.length;i++){
    const q=projectSegment(p,points[i-1],points[i]);
    if(!best||q.distance<best.distance)best={...q,segment:i-1,along:run+dist(points[i-1],q.point)};
    run+=dist(points[i-1],points[i]);
  }
  return best;
}

export function pointOnRoute(points,t){
  const total=length(points);
  if(!total)return points[0];
  const want=total*Math.max(0,Math.min(1,t));
  let run=0;
  for(let i=1;i<points.length;i++){
    const seg=dist(points[i-1],points[i]);
    if(run+seg>=want){
      const q=(want-run)/seg;
      return{x:points[i-1].x+(points[i].x-points[i-1].x)*q,y:points[i-1].y+(points[i].y-points[i-1].y)*q};
    }
    run+=seg;
  }
  return points.at(-1);
}

export function roadPointParameter(a,b,p){
  const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;
  if(!l)return 0;
  return Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l));
}

export function segmentIntersection(a,b,c,d){
  const ab={x:b.x-a.x,y:b.y-a.y},cd={x:d.x-c.x,y:d.y-c.y};
  const cross=(u,v)=>u.x*v.y-u.y*v.x,den=cross(ab,cd),ac={x:c.x-a.x,y:c.y-a.y};
  if(Math.abs(den)<1e-9)return null;
  const t=cross(ac,cd)/den,u=cross(ac,ab)/den;
  if(t<-.000001||t>1.000001||u<-.000001||u>1.000001)return null;
  return{x:a.x+ab.x*t,y:a.y+ab.y*t,t,u};
}

export function addNode(nodes,p,tolerance=2.5){
  let n=nodes.find(x=>dist(x,p)<tolerance);
  if(!n){n={x:p.x,y:p.y};nodes.push(n)}
  return n;
}

export function collinearOverlapLength(a,b,c,d){
  const ab={x:b.x-a.x,y:b.y-a.y},len=Math.hypot(ab.x,ab.y);
  if(len<1e-9)return 0;
  const cross=(p,q)=>p.x*q.y-p.y*q.x,ac={x:c.x-a.x,y:c.y-a.y},ad={x:d.x-a.x,y:d.y-a.y};
  if(Math.abs(cross(ab,ac))>1e-6*len||Math.abs(cross(ab,ad))>1e-6*len)return 0;
  const ux=ab.x/len,uy=ab.y/len,cproj=ac.x*ux+ac.y*uy,dproj=ad.x*ux+ad.y*uy;
  return Math.max(0,Math.min(len,Math.max(cproj,dproj))-Math.max(0,Math.min(cproj,dproj)));
}

export function segmentDistance(a,b,c,d){
  const cross=(u,v)=>u.x*v.y-u.y*v.x,ab={x:b.x-a.x,y:b.y-a.y},cd={x:d.x-c.x,y:d.y-c.y},ac={x:c.x-a.x,y:c.y-a.y},den=cross(ab,cd);
  if(Math.abs(den)>1e-9){
    const t=cross(ac,cd)/den,u=cross(ac,ab)/den;
    if(t>=0&&t<=1&&u>=0&&u<=1)return 0;
  }
  return Math.min(projectSegment(a,c,d).distance,projectSegment(b,c,d).distance,projectSegment(c,a,b).distance,projectSegment(d,a,b).distance);
}

export const cleanRoadPoints=points=>validRoadPoints(points,0)||[];

export function endpointSegmentBlocked(building,a,b,side,connectionRadius=building?.r||25){if(!building)return false;const ax=a.x-building.x,ay=a.y-building.y,bx=b.x-building.x,by=b.y-building.y,aRadius=Math.hypot(ax,ay),bRadius=Math.hypot(bx,by);const outward=side==='start'?ax*(b.x-a.x)+ay*(b.y-a.y):bx*(a.x-b.x)+by*(a.y-b.y);const outside=side==='start'?aRadius>=connectionRadius-.001:bRadius>=connectionRadius-.001;return outside&&outward<0}
