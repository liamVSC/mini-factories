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


  // Junctions are rendered above the road surface so intersections read as real nodes.
  const junctions=new Map();
  for(const r of s.roads)for(let i=1;i<r.points.length;i++)for(const q of s.roads)for(let j=1;j<q.points.length;j++){
    if(r===q&&i===j)continue;
    const a=r.points[i-1],b=r.points[i],c=q.points[j-1],d=q.points[j];
    const ab={x:b.x-a.x,y:b.y-a.y},cd={x:d.x-c.x,y:d.y-c.y},cross=(u,v)=>u.x*v.y-u.y*v.x,den=cross(ab,cd);
    if(Math.abs(den)<1e-9)continue;
    const ac={x:c.x-a.x,y:c.y-a.y},t=cross(ac,cd)/den,u=cross(ac,ab)/den;
    if(t>=0&&t<=1&&u>=0&&u<=1){const p={x:a.x+ab.x*t,y:a.y+ab.y*t},key=Math.round(p.x)+','+Math.round(p.y);junctions.set(key,p)}
  }
  for(const p of junctions.values()){ctx.fillStyle='#454b4d';ctx.beginPath();ctx.arc(p.x,p.y,9,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d7bd72';ctx.beginPath();ctx.arc(p.x,p.y,2.2,0,Math.PI*2);ctx.fill()}

  // Trucks with shadows, cab, cargo and wheels
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
  const factory=b.kind==='factory',warehouse=b.kind==='warehouse',w=factory?72:warehouse?84:64,h=factory?58:warehouse?60:52;
  ctx.save();ctx.translate(b.x,b.y);

  // Ground shadow and paved plot.
  ctx.fillStyle='rgba(32,40,34,.20)';
  ctx.beginPath();ctx.ellipse(3,18,w*.72,13,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=factory?'#8e9587':warehouse?'#97958b':'#b6aa8c';
  ctx.fillRect(-w/2-9,-h/2-9,w+18,h+18);
  ctx.fillStyle='rgba(255,255,255,.22)';ctx.fillRect(-w/2-7,-h/2-7,w+14,3);

  // Building shell with a darker foundation and roof.
  ctx.fillStyle=factory?'#d3d8d0':warehouse?'#c9c8c0':'#ded8c8';
  ctx.fillRect(-w/2,-h/2,w,h);
  ctx.fillStyle='rgba(40,48,48,.18)';ctx.fillRect(-w/2,h/2-6,w,6);
  ctx.strokeStyle='rgba(46,57,56,.45)';ctx.lineWidth=1.5;ctx.strokeRect(-w/2,-h/2,w,h);

  // Roof.
  ctx.fillStyle=factory?'#59646a':warehouse?'#5d625f':'#6c655c';
  ctx.beginPath();ctx.moveTo(-w/2-3,-h/2);ctx.lineTo(0,-h/2-13);ctx.lineTo(w/2+3,-h/2);ctx.closePath();ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,.16)';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(-w*.42,-h/2-2);ctx.lineTo(0,-h/2-10);ctx.lineTo(w*.42,-h/2-2);ctx.stroke();

  if(factory){
    // Industrial cladding and windows.
    ctx.fillStyle='#778187';ctx.fillRect(-w*.38,-h*.13,w*.76,h*.50);
    for(let i=0;i<4;i++){
      ctx.fillStyle=i%2?'#b9d0d1':'#8fa8aa';
      ctx.fillRect(-w*.32+i*w*.21,-h*.04,w*.13,h*.20);
    }
    // Roller door.
    ctx.fillStyle='#4b5559';ctx.fillRect(-w*.18,h*.05,w*.36,h*.30);
    ctx.strokeStyle='#849095';ctx.lineWidth=1;
    for(let y=h*.10;y<h*.34;y+=5){ctx.beginPath();ctx.moveTo(-w*.18,y);ctx.lineTo(w*.18,y);ctx.stroke()}
    // Smokestack and exhaust.
    ctx.fillStyle='#68737a';ctx.fillRect(w*.22,-h*.62,9,h*.38);
    ctx.fillStyle='#879197';ctx.fillRect(w*.18,-h*.67,17,5);
    ctx.fillStyle='rgba(224,231,225,.28)';
    ctx.beginPath();ctx.arc(w*.265,-h*.75,6+Math.sin(b.pulse||0)*1.5,0,Math.PI*2);ctx.fill();
    // Active machinery glow.
    if(b.active>0){
      ctx.fillStyle='#f2a93b';ctx.globalAlpha=.75+.25*Math.sin(b.pulse||0);
      ctx.fillRect(w*.31,-h*.20,7,7);ctx.globalAlpha=1;
    }
    // Exterior tanks.
    ctx.fillStyle='#9ba5a6';ctx.fillRect(-w*.43,-h*.10,7,h*.40);
    ctx.fillStyle='#c4ccca';ctx.beginPath();ctx.arc(-w*.395,-h*.10,3.5,0,Math.PI*2);ctx.fill();
  }else if(warehouse){
    // Large logistics warehouse: loading bays, dock roof and parked pallets.
    ctx.fillStyle='#a9adb0';ctx.fillRect(-w*.42,-h*.16,w*.84,h*.53);
    ctx.fillStyle='#747d80';ctx.fillRect(-w*.45,-h*.23,w*.90,6);
    for(let i=-1;i<=1;i++){
      ctx.fillStyle='#495358';ctx.fillRect(i*w*.20-9,h*.03,18,h*.27);
      ctx.fillStyle='#aab5b6';ctx.fillRect(i*w*.20-6,h*.08,12,h*.04);
    }
    ctx.fillStyle='#d9c27a';ctx.fillRect(-w*.30,-h*.34,w*.18,6);ctx.fillRect(w*.12,-h*.34,w*.18,6);
    ctx.fillStyle='#7a7d78';ctx.fillRect(-w*.43,h*.29,w*.18,5);ctx.fillRect(w*.25,h*.29,w*.18,5);
  }else{
    // Retail storefront with awning, glass frontage and side entrance.
    ctx.fillStyle='#b78350';ctx.fillRect(-w*.43,-h*.05,w*.86,h*.43);
    ctx.fillStyle='#dbe7e2';ctx.fillRect(-w*.34,-h*.01,w*.48,h*.28);
    ctx.fillStyle='rgba(70,84,86,.28)';ctx.fillRect(-w*.30,h*.03,w*.19,h*.20);
    ctx.fillStyle='rgba(70,84,86,.45)';ctx.fillRect(-w*.08,h*.03,w*.18,h*.20);
    ctx.fillStyle=b.color;ctx.fillRect(-w*.43,-h*.20,w*.86,9);
    // Awning stripes.
    for(let i=0;i<6;i++){ctx.fillStyle=i%2?'rgba(255,255,255,.68)':'rgba(255,255,255,.22)';ctx.fillRect(-w*.43+i*w*.143,-h*.20,w*.071,9)}
    ctx.fillStyle='#6e6255';ctx.fillRect(w*.27,h*.01,8,h*.30);
    ctx.fillStyle='#f2df9a';ctx.fillRect(w*.31,h*.08,2,4);
    // Rooftop HVAC.
    ctx.fillStyle='#8c9694';ctx.fillRect(w*.20,-h*.50,15,10);
    ctx.fillStyle='#c3cbca';ctx.fillRect(w*.23,-h*.55,9,5);
    if(b.contract){
      ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,13+2*Math.sin(b.pulse||0),0,Math.PI*2);ctx.stroke();
    }
  }

  // Parking/loading marks make the lot read as a developed site.
  ctx.strokeStyle='rgba(238,226,184,.58)';ctx.lineWidth=1;
  for(let i=-1;i<=1;i++){ctx.beginPath();ctx.moveTo(i*14,h/2+1);ctx.lineTo(i*14+7,h/2+9);ctx.stroke()}

  if(selected){
    ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.setLineDash([6,4]);
    ctx.beginPath();ctx.arc(0,0,Math.max(w,h)/2+15,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
  }

  // Live stock/demand bar and compact label.
  ctx.fillStyle='rgba(35,45,43,.82)';ctx.fillRect(-34,-h/2-22,68,6);
  const ratio=factory?b.stock/Math.max(1,b.max):warehouse?b.storage/Math.max(1,b.max):Math.min(1,b.demand/8);
  ctx.fillStyle=b.color;ctx.fillRect(-34,-h/2-22,68*Math.max(0,Math.min(1,ratio)),6);
  ctx.fillStyle='#29352f';ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.fillText(b.type,0,h/2+17);
  if(factory){ctx.font='10px system-ui';ctx.fillStyle='#59665d';ctx.fillText('Lv '+b.level,0,h/2+30)}
  else if(warehouse){ctx.font='10px system-ui';ctx.fillStyle='#59665d';ctx.fillText((b.storage||0)+' / '+b.max+' stored',0,h/2+30)}
  else if(b.contract){ctx.font='10px system-ui';ctx.fillStyle='#8b6b24';ctx.fillText('JOB '+b.contract.remaining+'/'+b.contract.qty,0,h/2+30)}
  ctx.restore();
}
function road(ctx,pts,color,width){
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);ctx.stroke();
}
function roadDashed(ctx,pts,color,width,dash){
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([dash,dash*1.5]);ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);ctx.stroke();ctx.setLineDash([]);
}