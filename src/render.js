import {riverY,pointOnRoute} from './world.js';

export function render(ctx,s,W,H){
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#b9c99d';ctx.fillRect(0,0,W,H);
  ctx.save();
  ctx.translate(s.camera.x,s.camera.y);ctx.scale(s.camera.zoom,s.camera.zoom);ctx.translate(-W/2,-H/2);
  const left=-s.camera.x/s.camera.zoom+W/2,right=(W-s.camera.x)/s.camera.zoom+W/2,top=-s.camera.y/s.camera.zoom+H/2,bottom=(H-s.camera.y)/s.camera.zoom+H/2;

  // Ground texture and subtle city blocks
  ctx.fillStyle='#c7d5ae';ctx.fillRect(left,top,right-left,bottom-top);
  ctx.strokeStyle='rgba(75,96,66,.16)';ctx.lineWidth=1;
  for(let x=Math.floor(left/56)*56;x<right;x+=56){ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke()}
  for(let y=Math.floor(top/56)*56;y<bottom;y+=56){ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke()}
  for(let x=Math.floor(left/180)*180;x<right;x+=180)for(let y=Math.floor(top/180)*180;y<bottom;y+=180){
    ctx.fillStyle='rgba(238,228,191,.32)';ctx.fillRect(x+8,y+8,164,164);
  }

  // River with banks and water highlights
  const ry=riverY((left+right)/2);
  ctx.fillStyle='#91a879';ctx.fillRect(left,ry-58,right-left,116);
  ctx.fillStyle='#6fa7bd';ctx.fillRect(left,ry-39,right-left,78);
  ctx.strokeStyle='rgba(255,255,255,.24)';ctx.lineWidth=2;
  for(let x=Math.floor(left/90)*90;x<right;x+=90){ctx.beginPath();ctx.moveTo(x,ry+Math.sin(x*.05)*7);ctx.quadraticCurveTo(x+22,ry-5,x+45,ry+2);ctx.stroke()}

  // Roads: base asphalt, kerb, centre line
  for(const r of s.roads){
    road(ctx,r.points,'#6f6a5f',22);
    road(ctx,r.points,'#3f4548',17);
    road(ctx,r.points,r.bridge?'#b8864c':'#565d60',12);
    if(!r.bridge) roadDashed(ctx,r.points,'#d7bd72',2.2,14);
    if(r.bridge){road(ctx,r.points,'#b8864c',8);roadDashed(ctx,r.points,'#ead7a0',2,12)}
  }

\n  // Junctions are rendered above the road surface so intersections read as real nodes.\n  const junctions=new Map();\n  for(const r of s.roads)for(let i=1;i<r.points.length;i++)for(const q of s.roads)for(let j=1;j<q.points.length;j++){\n    if(r===q&&i===j)continue;\n    const a=r.points[i-1],b=r.points[i],c=q.points[j-1],d=q.points[j];\n    const ab={x:b.x-a.x,y:b.y-a.y},cd={x:d.x-c.x,y:d.y-c.y},cross=(u,v)=>u.x*v.y-u.y*v.x,den=cross(ab,cd);\n    if(Math.abs(den)<1e-9)continue;\n    const ac={x:c.x-a.x,y:c.y-a.y},t=cross(ac,cd)/den,u=cross(ac,ab)/den;\n    if(t>=0&&t<=1&&u>=0&&u<=1){const p={x:a.x+ab.x*t,y:a.y+ab.y*t},key=Math.round(p.x)+','+Math.round(p.y);junctions.set(key,p)}\n  }\n  for(const p of junctions.values()){ctx.fillStyle='#454b4d';ctx.beginPath();ctx.arc(p.x,p.y,9,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d7bd72';ctx.beginPath();ctx.arc(p.x,p.y,2.2,0,Math.PI*2);ctx.fill()}\n\n  // Trucks with shadows, cab, cargo and wheels
  for(const t of s.trucks){
    const p=pointOnRoute(t.route,t.t),q=pointOnRoute(t.route,Math.min(1,t.t+.012));
    const ang=Math.atan2(q.y-p.y,q.x-p.x);
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(ang);
    ctx.fillStyle='rgba(34,42,37,.22)';ctx.fillRect(-12,6,25,7);
    ctx.fillStyle=t.longDistance?'#8b5cf6':'#e39a35';ctx.fillRect(-11,-6,22,11);
    ctx.fillStyle='#f3c969';ctx.fillRect(-5,-5,10,9);
    ctx.fillStyle='#4d5960';ctx.fillRect(3,-5,6,4);
    ctx.fillStyle='#20282b';ctx.beginPath();ctx.arc(-7,6,3,0,Math.PI*2);ctx.arc(7,6,3,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }

  for(const b of s.buildings)drawBuilding(ctx,b,s.selected===b);
  for(const p of s.particles){
    ctx.globalAlpha=Math.max(0,1-p.t);ctx.fillStyle=p.color||'#f3c969';ctx.font='bold 14px system-ui';ctx.textAlign='center';
    ctx.fillText(p.text,p.x,p.y-p.t*30);ctx.globalAlpha=1;
  }
  ctx.restore();
}

function drawBuilding(ctx,b,selected){
  const factory=b.kind==='factory',warehouse=b.kind==='warehouse',w=factory?58:warehouse?68:54,h=factory?52:warehouse?54:48;
  ctx.save();ctx.translate(b.x,b.y);
  ctx.fillStyle='rgba(43,54,42,.22)';ctx.beginPath();ctx.ellipse(0,12,w*.72,12,0,0,Math.PI*2);ctx.fill();

  // lot
  ctx.fillStyle=factory?'#aeb89d':warehouse?'#b8b5a0':'#d7c99f';ctx.fillRect(-w/2-6,-h/2-6,w+12,h+12);
  ctx.strokeStyle='rgba(70,76,62,.3)';ctx.lineWidth=1;ctx.strokeRect(-w/2-6,-h/2-6,w+12,h+12);

  ctx.fillStyle=factory?'#e7e0cb':warehouse?'#ddd7c2':'#f1e6c6';ctx.fillRect(-w/2,-h/2,w,h);
  ctx.strokeStyle=b.color;ctx.lineWidth=3;ctx.strokeRect(-w/2,-h/2,w,h);

  if(factory){
    ctx.fillStyle='#66717a';ctx.fillRect(-w*.34,-h*.18,w*.68,h*.48);
    ctx.fillStyle='#dce8e7';for(let i=-1;i<=1;i++)ctx.fillRect(i*w*.17-5,-h*.11,10,h*.22);
    ctx.fillStyle='#7b8790';ctx.fillRect(w*.19,-h*.45,9,h*.27);
    ctx.fillStyle='#9ca8aa';ctx.beginPath();ctx.arc(w*.235,-h*.48,8,0,Math.PI*2);ctx.fill();
    if(b.active>0){ctx.fillStyle='#f3b33d';ctx.globalAlpha=.8+.2*Math.sin(b.pulse);ctx.beginPath();ctx.arc(w*.29,-h*.37,5+2*Math.sin(b.pulse),0,Math.PI*2);ctx.fill();ctx.globalAlpha=1}
  }else if(warehouse){
    ctx.fillStyle='#b9b09b';ctx.fillRect(-w*.34,-h*.18,w*.68,h*.5);
    ctx.fillStyle=b.color;ctx.fillRect(-w*.18,-h*.02,w*.36,h*.11);
    ctx.fillStyle='#f5ead0';ctx.fillRect(-w*.08,-h*.30,w*.16,h*.2);
    ctx.fillStyle='#7a766b';ctx.fillRect(-w*.28,h*.12,w*.16,h*.2);ctx.fillRect(w*.12,h*.12,w*.16,h*.2);
  }else{
    ctx.fillStyle='#d4a45c';ctx.fillRect(-w*.34,-h*.18,w*.68,h*.5);
    ctx.fillStyle='#fff4d6';ctx.fillRect(-w*.23,-h*.08,w*.46,h*.25);
    ctx.fillStyle=b.color;ctx.fillRect(-w*.37,-h*.33,w*.74,7);
    ctx.fillStyle='#7e6b57';ctx.fillRect(-w*.08,h*.12,w*.16,h*.2);
    if(b.contract){ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,11+2*Math.sin(b.pulse),0,Math.PI*2);ctx.stroke()}
  }

  if(selected){ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.setLineDash([6,4]);ctx.beginPath();ctx.arc(0,0,Math.max(w,h)/2+12,0,Math.PI*2);ctx.stroke();ctx.setLineDash([])}

  ctx.fillStyle='rgba(35,45,43,.78)';ctx.fillRect(-30,-h/2-12,60,6);
  const ratio=factory?b.stock/Math.max(1,b.max):warehouse?b.storage/Math.max(1,b.max):Math.min(1,b.demand/8);
  ctx.fillStyle=b.color;ctx.fillRect(-30,-h/2-12,60*Math.max(0,Math.min(1,ratio)),6);
  ctx.fillStyle='#29352f';ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.fillText(b.type,0,h/2+16);
  if(factory){ctx.font='10px system-ui';ctx.fillStyle='#59665d';ctx.fillText('Lv '+b.level,0,h/2+29)}
  else if(warehouse){ctx.font='10px system-ui';ctx.fillStyle='#59665d';ctx.fillText((b.storage||0)+' / '+b.max+' stored',0,h/2+29)}
  else if(b.contract){ctx.font='10px system-ui';ctx.fillStyle='#8b6b24';ctx.fillText('JOB '+b.contract.remaining+'/'+b.contract.qty,0,h/2+29)}
  ctx.restore();
}

function road(ctx,pts,color,width){
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);ctx.stroke();
}
function roadDashed(ctx,pts,color,width,dash){
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([dash,dash*1.5]);ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);ctx.stroke();ctx.setLineDash([]);
}