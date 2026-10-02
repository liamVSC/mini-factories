const distance=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);
const append=(points,point)=>{if(!points.length||distance(points.at(-1),point)>.01)points.push(point);};
const interpolate=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});

export function smoothRoadPath(points,radius=18){
  if(!Array.isArray(points)||points.length<3||!Number.isFinite(radius)||radius<=0)return(points||[]).map(p=>({x:p.x,y:p.y}));
  const clean=[];
  for(const point of points)if(Number.isFinite(point?.x)&&Number.isFinite(point?.y))append(clean,{x:point.x,y:point.y});
  if(clean.length<3)return clean;
  const path=[clean[0]];
  for(let i=1;i<clean.length-1;i++){
    const previous=clean[i-1],corner=clean[i],next=clean[i+1];
    const inLength=distance(previous,corner),outLength=distance(corner,next);
    if(inLength<.01||outLength<.01)continue;
    const inX=(corner.x-previous.x)/inLength,inY=(corner.y-previous.y)/inLength;
    const outX=(next.x-corner.x)/outLength,outY=(next.y-corner.y)/outLength;
    const dot=Math.max(-1,Math.min(1,inX*outX+inY*outY)),angle=Math.acos(dot);
    if(angle<.04||Math.PI-angle<.04){append(path,corner);continue;}
    const tangent=Math.tan(angle/2);
    if(!Number.isFinite(tangent)||tangent<.001){append(path,corner);continue;}
    const trim=Math.min(radius/tangent,inLength*.45,outLength*.45);
    if(trim<.5){append(path,corner);continue;}
    const start=interpolate(corner,previous,trim/inLength);
    const end=interpolate(corner,next,trim/outLength);
    append(path,start);
    const samples=Math.max(3,Math.min(12,Math.ceil((angle*(trim/tangent))/6)));
    for(let step=1;step<=samples;step++){
      const t=step/samples,u=1-t;
      append(path,{x:u*u*start.x+2*u*t*corner.x+t*t*end.x,y:u*u*start.y+2*u*t*corner.y+t*t*end.y});
    }
  }
  append(path,clean.at(-1));
  return path;
}

export function offsetRoadPath(points,offset){
  if(!Array.isArray(points)||points.length<2||!Number.isFinite(offset))return[];
  return points.map((point,index)=>{
    const previous=points[Math.max(0,index-1)],next=points[Math.min(points.length-1,index+1)];
    const dx=next.x-previous.x,dy=next.y-previous.y,length=Math.hypot(dx,dy)||1;
    return{x:point.x-dy/length*offset,y:point.y+dx/length*offset};
  });
}

export function roadDashSegments(points,dashLength=20,gapLength=18){
  if(!Array.isArray(points)||points.length<2||dashLength<=0||gapLength<0)return[];
  const segments=[];
  let travelled=0,nextDash=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],length=distance(a,b);
    if(length<.01)continue;
    const end=travelled+length;
    while(nextDash<end){
      const dashStart=Math.max(0,nextDash-travelled),dashEnd=Math.min(length,nextDash+dashLength-travelled);
      if(dashEnd-dashStart>.5)segments.push([interpolate(a,b,dashStart/length),interpolate(a,b,dashEnd/length)]);
      nextDash+=dashLength+gapLength;
    }
    travelled=end;
  }
  return segments;
}
