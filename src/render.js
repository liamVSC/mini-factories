import {riverY,pointOnRoute} from './world.js';

export function render(ctx,s,W,H){
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#b9c99d';ctx.fillRect(0,0,W,H);
  ctx.save();
  ctx.translate(s.camera.x,s.camera.y);ctx.scale(s.camera.zoom,s.camera.zoom);ctx.translate(-W/2,-H/2);
  const left=-s.camera.x/s.camera.zoom+W/2,right=(W-s.camera.x)/s.camera.zoom+W/2,top=-s.camera.y/s.camera.zoom+H/2,bottom=(H-s.camera.y)/s.camera.zoom+H/2;
  ctx.fillStyle='#c7d5ae';ctx.fillRect(left,top,right-left,bottom-top);
  ctx.strokeStyle='rgba(75,96,66,.16)';ctx.lineWidth=1;
  for(let x=Math.floor(left/56)*56;x<right;x+=56){ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke()}
  for(let y=Math.floor(top/56)*56;y<bottom;y+=56){ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke()}
  for(let x=Math.floor(left/180)*180;x<right;x+=180)for(let y=Math.floor(top/180)*180;y<bottom;y+=180){ctx.fillStyle='rgba(238,228,191,.32)';ctx.fillRect(x+8,y+8,164,164)}
  const ry=riverY((left+right)/2);
  ctx.fillStyle='#91a879';ctx.fillRect(left,ry-58,right-left,116);ctx.fillStyle='#6fa7bd';ctx.fillRect(left,ry-39,right-left,78);
  ctx.strokeStyle='rgba(255,255,255,.24)';ctx.lineWidth=2;
  for(let x=Math.floor(left/90)*90;x<right;x+=90){ctx.beginPath();ctx.moveTo(x,ry+Math.sin(x*.05)*7);ctx.quadraticCurveTo(x+22,ry-5,x+45,ry+2);ctx.stroke()}
  for(const r of s.roads){road(ctx,r.points,'#6f6a5f',22);road(ctx,r.points,'#3f4548',17);road(ctx,r.points,r.bridge?'#b8864c':'#565d60',12);if(!r.bridge)roadDashed(ctx,r.points,'#d7bd72',2.2,14);if(r.bridge){road(ctx,r.points,'#b8864c',8);roadDashed(ctx,r.points,'#ead7a0',2,12)}}
  const junctions=new Map();
  for(const r of s.roads)for(let i=1;i<r.points.length;i++)for(const q of s.roads)for(let j=1;j<q.points.length;j++){if(r===q&&i===j)continue;const a=r.points[i-1],b=r.points[i],c=q.points[j-1],d=q.points[j],ab={x:b.x-a.x,y:b.y-a.y},cd={x:d.x-c.x,y:d.y-c.y},cross=(u,v)=>u.x*v.y-u.y*v.x,den=cross(ab,cd);if(Math.abs(den)<1e-9)continue;const ac={x:c.x-a.x,y:c.y-a.y},t=cross(ac,cd)/den,u=cross(ac,ab)/den;if(t>=0&&t<=1&&u>=0&&u<=1){const p={x:a.x+ab.x*t,y:a.y+ab.y*t},key=Math.round(p.x)+','+Math.round(p.y);junctions.set(key,p)}}
  for(const p of junctions.values()){ctx.fillStyle='#454b4d';ctx.beginPath();ctx.arc(p.x,p.y,9,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d7bd72';ctx.beginPath();ctx.arc(p.x,p.y,2.2,0,Math.PI*2);ctx.fill()}
  for(const t of s.trucks){const p=pointOnRoute(t.route,t.t),q=pointOnRoute(t.route,Math.min(1,t.t+.012)),ang=Math.atan2(q.y-p.y,q.x-p.x);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(ang);ctx.fillStyle='rgba(34,42,37,.22)';ctx.fillRect(-12,6,25,7);ctx.fillStyle=t.longDistance?'#8b5cf6':'#e39a35';ctx.fillRect(-11,-6,22,11);ctx.fillStyle='#f3c969';ctx.fillRect(-5,-5,10,9);ctx.fillStyle='#4d5960';ctx.fillRect(3,-5,6,4);ctx.fillStyle='#20282b';ctx.beginPath();ctx.arc(-7,6,3,0,Math.PI*2);ctx.arc(7,6,3,0,Math.PI*2);ctx.fill();ctx.restore()}
  for(const b of s.buildings)drawBuilding(ctx,b,s.selected===b);
  for(const p of s.particles){ctx.globalAlpha=Math.max(0,1-p.t);ctx.fillStyle=p.color||'#f3c969';ctx.font='bold 14px system-ui';ctx.textAlign='center';ctx.fillText(p.text,p.x,p.y-p.t*30);ctx.globalAlpha=1}
  ctx.restore();
}

function drawBuilding(ctx,b,selected){
  const factory=b.kind==='factory',warehouse=b.kind==='warehouse';
  const scale=factory?1.24:warehouse?1.38:1.18;
  const w=(factory?78:warehouse?94:70)*scale,h=(factory?62:warehouse?66:56)*scale,depth=factory?14:warehouse?17:12;
  ctx.save();ctx.translate(b.x,b.y);

  // Larger architectural footprint instead of a flat icon.
  ctx.fillStyle='rgba(31,39,34,.24)';ctx.beginPath();ctx.ellipse(6,23,w*.78,16,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=factory?'#8d958b':warehouse?'#92938d':'#aaa18e';ctx.fillRect(-w/2-12,-h/2-10,w+24,h+22);
  ctx.fillStyle='rgba(255,255,255,.18)';ctx.fillRect(-w/2-9,-h/2-7,w+18,4);

  // Deep side wall gives every building a strong 2.5D silhouette.
  ctx.fillStyle=factory?'#7d8789':warehouse?'#858b8b':'#9a816b';
  ctx.beginPath();ctx.moveTo(w/2,-h/2);ctx.lineTo(w/2+depth,-h/2+depth*.48);ctx.lineTo(w/2+depth,h/2+depth*.48);ctx.lineTo(w/2,h/2);ctx.closePath();ctx.fill();

  ctx.fillStyle=factory?'#cbd1cd':warehouse?'#c5c8c4':'#d8d0c1';ctx.fillRect(-w/2,-h/2,w,h);
  ctx.fillStyle='rgba(39,48,47,.22)';ctx.fillRect(-w/2,h/2-7,w,7);
  ctx.strokeStyle='rgba(42,52,52,.48)';ctx.lineWidth=1.5;ctx.strokeRect(-w/2,-h/2,w,h);

  // Oversized roof and roofline make the structures read as buildings at a glance.
  const roof=factory?'#4f5c63':warehouse?'#50595b':'#5c544c';ctx.fillStyle=roof;
  ctx.beginPath();ctx.moveTo(-w/2-5,-h/2+2);ctx.lineTo(0,-h/2-18);ctx.lineTo(w/2+5,-h/2+2);ctx.lineTo(w/2+depth,-h/2+depth*.48);ctx.lineTo(0,-h/2-10);ctx.lineTo(-w/2-5,-h/2+2);ctx.closePath();ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,.18)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-w*.43,-h/2-1);ctx.lineTo(0,-h/2-13);ctx.lineTo(w*.43,-h/2-1);ctx.stroke();

  if(factory){
    ctx.fillStyle='#69777d';ctx.fillRect(-w*.43,-h*.12,w*.86,h*.50);
    ctx.fillStyle='#91a8ad';for(let i=0;i<5;i++)ctx.fillRect(-w*.38+i*w*.19,-h*.06,w*.12,h*.18);
    ctx.fillStyle='#3e484c';ctx.fillRect(-w*.18,h*.06,w*.36,h*.31);
    ctx.strokeStyle='#7e8b8f';ctx.lineWidth=1;for(let y=h*.10;y<h*.35;y+=5){ctx.beginPath();ctx.moveTo(-w*.18,y);ctx.lineTo(w*.18,y);ctx.stroke()}
    ctx.fillStyle='#39464a';ctx.fillRect(-w*.20,h*.35,w*.40,5);ctx.fillStyle='#d9a441';ctx.fillRect(-w*.16,h*.40,5,7);ctx.fillRect(w*.12,h*.40,5,7);
    ctx.fillStyle='#657176';ctx.fillRect(w*.27,-h*.63,11,h*.50);ctx.fillStyle='#7f898c';ctx.fillRect(w*.22,-h*.68,21,6);
    ctx.strokeStyle='#a7afb0';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(w*.24,-h*.08);ctx.lineTo(w*.38,-h*.08);ctx.lineTo(w*.38,-h*.40);ctx.stroke();
    ctx.fillStyle='rgba(224,231,225,.24)';ctx.beginPath();ctx.arc(w*.325,-h*.76,7+Math.sin(b.pulse||0)*2,0,Math.PI*2);ctx.arc(w*.36,-h*.84,5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#9da7a8';ctx.fillRect(-w*.47,-h*.08,10,h*.42);ctx.fillStyle='#c4ccca';ctx.beginPath();ctx.arc(-w*.42,-h*.08,5,0,Math.PI*2);ctx.fill();
    drawSign(ctx,-w*.30,-h*.39,Math.min(70,w*.56),14,b.type,b.color);
  }else if(warehouse){
    ctx.fillStyle='#a5aaab';ctx.fillRect(-w*.44,-h*.12,w*.88,h*.48);ctx.fillStyle='#717b7d';ctx.fillRect(-w*.47,-h*.21,w*.94,7);
    for(let i=-2;i<=2;i++){ctx.fillStyle='#424c50';ctx.fillRect(i*w*.16-10,h*.00,20,h*.28);ctx.fillStyle='#aeb8b8';ctx.fillRect(i*w*.16-7,h*.05,14,4)}
    ctx.fillStyle='#d7b65c';ctx.fillRect(-w*.37,-h*.36,w*.22,6);ctx.fillRect(w*.15,-h*.36,w*.22,6);
    ctx.fillStyle='#777b77';ctx.fillRect(-w*.45,h*.31,w*.20,5);ctx.fillRect(w*.25,h*.31,w*.20,5);
    drawSign(ctx,-w*.34,-h*.43,Math.min(84,w*.60),15,'WAREHOUSE','#e9c46a');
    ctx.fillStyle='#d9c27a';ctx.fillRect(w*.38,-h*.30,5,19);ctx.fillStyle='#50595b';ctx.fillRect(w*.38,-h*.16,5,18);
  }else{
    ctx.fillStyle='#9f7658';ctx.fillRect(-w*.45,-h*.03,w*.90,h*.48);
    ctx.fillStyle='#dce8e3';ctx.fillRect(-w*.36,-h*.01,w*.52,h*.28);
    ctx.fillStyle='#6c7a7b';ctx.fillRect(-w*.32,h*.04,w*.20,h*.19);ctx.fillStyle='#536466';ctx.fillRect(-w*.09,h*.04,w*.20,h*.19);
    ctx.fillStyle='#6f6255';ctx.fillRect(w*.25,-h*.01,9,h*.34);ctx.fillStyle='#f2df9a';ctx.fillRect(w*.285,h*.08,2,4);
    ctx.fillStyle=b.color;ctx.fillRect(-w*.46,-h*.29,w*.92,13);
    for(let i=0;i<7;i++){ctx.fillStyle=i%2?'rgba(255,255,255,.72)':'rgba(255,255,255,.20)';ctx.fillRect(-w*.46+i*w*.131,-h*.29,w*.065,13)}
    drawSign(ctx,-w*.30,-h*.255,Math.min(72,w*.58),15,b.type,b.color);
    ctx.fillStyle='#899391';ctx.fillRect(w*.20,-h*.50,18,11);ctx.fillStyle='#c3cbca';ctx.fillRect(w*.23,-h*.55,11,5);
    ctx.fillStyle='#b7b0a1';ctx.fillRect(-w*.48,h*.38,w*.96,5);
    if(b.contract){ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,15+2*Math.sin(b.pulse||0),0,Math.PI*2);ctx.stroke()}
  }

  ctx.strokeStyle='rgba(238,226,184,.58)';ctx.lineWidth=1;
  for(let i=-2;i<=2;i++){ctx.beginPath();ctx.moveTo(i*15,h/2+2);ctx.lineTo(i*15+8,h/2+11);ctx.stroke()}
  if(factory||warehouse){ctx.fillStyle='rgba(50,58,57,.55)';ctx.fillRect(-w*.42,h/2+7,w*.84,5);ctx.fillStyle='#d8c579';ctx.fillRect(-w*.18,h/2+7,8,5);ctx.fillRect(w*.12,h/2+7,8,5)}

  if(selected){ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.setLineDash([7,4]);ctx.beginPath();ctx.arc(0,0,Math.max(w,h)/2+19,0,Math.PI*2);ctx.stroke();ctx.setLineDash([])}

  ctx.fillStyle='rgba(35,45,43,.82)';ctx.fillRect(-38,-h/2-27,76,6);
  const ratio=factory?b.stock/Math.max(1,b.max):warehouse?b.storage/Math.max(1,b.max):Math.min(1,b.demand/8);
  ctx.fillStyle=b.color;ctx.fillRect(-38,-h/2-27,76*Math.max(0,Math.min(1,ratio)),6);
  ctx.fillStyle='#29352f';ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.fillText(b.type,0,h/2+20);
  if(factory){ctx.font='10px system-ui';ctx.fillStyle='#59665d';ctx.fillText('Lv '+b.level,0,h/2+34)}
  else if(warehouse){ctx.font='10px system-ui';ctx.fillStyle='#59665d';ctx.fillText((b.storage||0)+' / '+b.max+' stored',0,h/2+34)}
  else if(b.contract){ctx.font='10px system-ui';ctx.fillStyle='#8b6b24';ctx.fillText('JOB '+b.contract.remaining+'/'+b.contract.qty,0,h/2+34)}
  ctx.restore();
}

function drawSign(ctx,x,y,w,h,text,accent){
  ctx.fillStyle='rgba(24,30,30,.90)';ctx.fillRect(x,y,w,h);
  ctx.fillStyle=accent;ctx.fillRect(x,y,w,3);
  ctx.fillStyle='#f3f0df';ctx.font='700 '+Math.max(7,Math.min(10,h*.62))+'px system-ui';ctx.textAlign='left';ctx.fillText(text.toUpperCase(),x+5,y+h*.72);
}
function road(ctx,pts,color,width){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);ctx.stroke()}
function roadDashed(ctx,pts,color,width,dash){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([dash,dash*1.5]);ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);ctx.stroke();ctx.setLineDash([])}