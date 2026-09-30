import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/+esm';
import {riverY,isInsideWorldBounds,WORLD_BOUNDS,WORLD_MARGIN,roadTopology,buildingConnectionPoint} from './world.js';

let renderer=null,scene=null,camera3d=null,root=null,previewGroup=null,roadEditGroup=null,roadEndpointGroup=null;
let target={x:0,z:0,yaw:0,pitch:.82,distance:620};
let desired={...target};
let home={x:0,z:0};
let cameraReady=false;
let viewport={width:1,height:1};
let previewKey='';
let roadEditKey='';
let lastBuildingSelection=null;
const meshes=new Map();
const worldObjects=new Set();
const truckMeshes=new Map();
const routeMetrics=new WeakMap();

function mat(color,roughness=.8,metalness=0){return new THREE.MeshStandardMaterial({color,roughness,metalness});}
function box(w,h,d,color){return new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));}
function roadMat(color){return new THREE.MeshStandardMaterial({color,roughness:.9,metalness:0,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});}
function roadIntersection(a,b,c,d){
  const abx=b.x-a.x,aby=b.y-a.y,cdx=d.x-c.x,cdy=d.y-c.y;
  const den=abx*cdy-aby*cdx;
  if(Math.abs(den)<1e-8)return null;
  const acx=c.x-a.x,acy=c.y-a.y;
  const t=(acx*cdy-acy*cdx)/den,u=(acx*aby-acy*abx)/den;
  if(t<0.0001||t>0.9999||u<0.0001||u>0.9999)return null;
  return{x:a.x+abx*t,y:a.y+aby*t};
}

const ROAD = Object.freeze({
  width:18,
  bridgeWidth:16,
  shoulderWidth:23,
  surfaceY:.68,
  shoulderY:.59,
  markingY:.80,
  curbY:.79,
  bridgeY:.72,
  railY:1.48
});
const roadMaterials={
  asphalt:roadMat('#343a3c'),
  shoulder:roadMat('#697173'),
  curb:roadMat('#9aa09f'),
  center:mat('#e4c95f'),
  edge:mat('#d6dcda'),
  bridgeDeck:roadMat('#735334'),
  bridgeRail:mat('#b58a52'),
  bridgeSupport:mat('#5f4631')
};

function addRoadBox(group,a,b,width,height,y,material){
  const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
  if(len<1)return null;
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(len,height,width),material);
  mesh.position.set((a.x+b.x)/2,y,(a.y+b.y)/2);
  mesh.rotation.y=-Math.atan2(dy,dx);
  group.add(mesh);
  return {mesh,len,dx,dy,angle:Math.atan2(dy,dx)};
}

function addRoadMarkings(group,points,width=ROAD.width,markingY=ROAD.markingY){
  if(!Array.isArray(points)||points.length<2)return;
  const segments=[];
  let total=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],len=Math.hypot(b.x-a.x,b.y-a.y);
    if(len<.5)continue;
    segments.push({a,b,len,start:total});
    total+=len;
  }
  if(total<4)return;

  // Edge lines follow the rounded centreline rather than being separate straight strips.
  for(const side of [-1,1]){
    for(const s of segments){
      const angle=Math.atan2(s.b.y-s.a.y,s.b.x-s.a.x),nx=-Math.sin(angle),nz=Math.cos(angle);
      const edge=new THREE.Mesh(new THREE.BoxGeometry(Math.max(1,s.len),.10,.62),roadMaterials.edge);
      edge.position.set(
        (s.a.x+s.b.x)/2+nx*side*(width/2-1.5),
        markingY,
        (s.a.y+s.b.y)/2+nz*side*(width/2-1.5)
      );
      edge.rotation.y=-angle;
      group.add(edge);
    }
  }

  // Centre dashes are placed by distance along the curved route.
  const dashLen=12,gap=18;
  for(let along=10;along<total-6;along+=dashLen+gap){
    const wanted=Math.min(total-3,along+dashLen/2);
    let seg=segments[segments.length-1];
    for(const candidate of segments){
      if(wanted<=candidate.start+candidate.len){seg=candidate;break;}
    }
    const q=(wanted-seg.start)/seg.len;
    const x=seg.a.x+(seg.b.x-seg.a.x)*q;
    const z=seg.a.y+(seg.b.y-seg.a.y)*q;
    const angle=Math.atan2(seg.b.y-seg.a.y,seg.b.x-seg.a.x);
    const dash=new THREE.Mesh(new THREE.BoxGeometry(dashLen,.11,1.02),roadMaterials.center);
    dash.position.set(x,markingY+.015,z);
    dash.rotation.y=-angle;
    group.add(dash);
  }
}

function addRoadEndCap(group,p,radius,material,y){
  const cap=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,.11,28),material);
  cap.position.set(p.x,y,p.y);
  group.add(cap);
}

function roundedRoadPoints(points){
  const clean=[];
  for(const p of points||[]){
    if(!Number.isFinite(p?.x)||!Number.isFinite(p?.y))continue;
    const last=clean.at(-1);
    if(last&&Math.hypot(last.x-p.x,last.y-p.y)<.5)continue;
    clean.push({x:p.x,y:p.y});
  }
  if(clean.length<3)return clean;

  const result=[clean[0]];
  const radius=Math.min(30,Math.max(10,ROAD.width*1.35));
  for(let i=1;i<clean.length-1;i++){
    const prev=clean[i-1],cur=clean[i],next=clean[i+1];
    const inLen=Math.hypot(cur.x-prev.x,cur.y-prev.y);
    const outLen=Math.hypot(next.x-cur.x,next.y-cur.y);
    if(inLen<1||outLen<1){result.push(cur);continue;}

    const trim=Math.min(radius,inLen*.32,outLen*.32);
    const inT={x:cur.x+(prev.x-cur.x)*(trim/inLen),y:cur.y+(prev.y-cur.y)*(trim/inLen)};
    const outT={x:cur.x+(next.x-cur.x)*(trim/outLen),y:cur.y+(next.y-cur.y)*(trim/outLen)};
    result.push(inT);

    const steps=Math.max(3,Math.min(10,Math.ceil(trim/5)));
    for(let s=1;s<=steps;s++){
      const t=s/steps,mt=1-t;
      result.push({
        x:mt*mt*inT.x+2*mt*t*cur.x+t*t*outT.x,
        y:mt*mt*inT.y+2*mt*t*cur.y+t*t*outT.y
      });
    }
  }
  result.push(clean.at(-1));
  return result;
}

function addRoadSurface(group,points,width,y,material){
  for(let i=1;i<points.length;i++)addRoadBox(group,points[i-1],points[i],width,.12,y,material);
}

function addRoadCurbs(group,points,width){
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],len=Math.hypot(b.x-a.x,b.y-a.y);
    if(len<.5)continue;
    const angle=Math.atan2(b.y-a.y,b.x-a.x),nx=-Math.sin(angle),nz=Math.cos(angle);
    for(const side of [-1,1]){
      const curb=new THREE.Mesh(new THREE.BoxGeometry(Math.max(1,len),.20,1.05),roadMaterials.curb);
      curb.position.set((a.x+b.x)/2+nx*side*(width/2+.45),ROAD.curbY,(a.y+b.y)/2+nz*side*(width/2+.45));
      curb.rotation.y=-angle;
      group.add(curb);
    }
  }
}

function addFlatCurve(group,start,control,end,width,y,material,steps=8){
  let prev=start;
  for(let i=1;i<=steps;i++){
    const t=i/steps,mt=1-t;
    const next={x:mt*mt*start.x+2*mt*t*control.x+t*t*end.x,y:mt*mt*start.y+2*mt*t*control.y+t*t*end.y};
    addRoadBox(group,prev,next,width,.11,y,material);
    prev=next;
  }
}
function addRoadRails(group,points,width){
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],len=Math.hypot(b.x-a.x,b.y-a.y);
    if(len<1)continue;
    const angle=Math.atan2(b.y-a.y,b.x-a.x),nx=-Math.sin(angle),nz=Math.cos(angle);
    for(const side of [-1,1]){
      const rail=new THREE.Mesh(new THREE.BoxGeometry(len+.8,1.45,.75),roadMaterials.bridgeRail);
      rail.position.set((a.x+b.x)/2+nx*side*(width/2),(ROAD.railY),(a.y+b.y)/2+nz*side*(width/2));
      rail.rotation.y=-angle;
      group.add(rail);
    }
  }
}
function addBridgeSupports(group,points){
  const total=points.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-points[i].x,p.y-points[i].y),0);
  if(total<55)return;
  const count=Math.max(1,Math.floor(total/100));
  for(let s=1;s<=count;s++){
    const target=total*s/(count+1);let run=0;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],seg=Math.hypot(b.x-a.x,b.y-a.y);
      if(run+seg<target){run+=seg;continue}
      const t=(target-run)/Math.max(1,seg);
      const x=a.x+(b.x-a.x)*t,z=a.y+(b.y-a.y)*t;
      const support=new THREE.Mesh(new THREE.CylinderGeometry(2.2,2.8,ROAD.bridgeY,10),roadMaterials.bridgeSupport);
      support.position.set(x,ROAD.bridgeY/2,z);
      group.add(support);break;
    }
  }
}
function addBoundaryRoadEnd(group,p,width,y){
  const minX=WORLD_BOUNDS.minX+WORLD_MARGIN,maxX=WORLD_BOUNDS.maxX-WORLD_MARGIN;
  const minY=WORLD_BOUNDS.minY+WORLD_MARGIN,maxY=WORLD_BOUNDS.maxY-WORLD_MARGIN;
  const nearX=Math.abs(p.x-minX)<2||Math.abs(p.x-maxX)<2;
  const nearY=Math.abs(p.y-minY)<2||Math.abs(p.y-maxY)<2;
  if(!nearX&&!nearY)return;
  const lineMaterial=roadMaterials.edge;
  const line=new THREE.Mesh(new THREE.BoxGeometry(width+.8,.12,1.2),lineMaterial);
  if(nearY){
    line.position.set(p.x,y+.06,p.y);
    line.rotation.y=0;
  }else{
    line.position.set(p.x,y+.06,p.y);
    line.rotation.y=Math.PI/2;
  }
  group.add(line);
  // Small reflective posts make the playable boundary legible without adding
  // heavy geometry to the mobile scene.
  for(const side of [-1,1]){
    const post=new THREE.Mesh(new THREE.BoxGeometry(1.4,7,1.4),roadMaterials.edge);
    if(nearY)post.position.set(p.x+side*Math.min(7,width*.35),y+3.5,p.y);
    else post.position.set(p.x,y+3.5,p.y+side*Math.min(7,width*.35));
    group.add(post);
  }
}

function buildingForRoadEndpoint(s,p){
  let best=null,bd=9;
  for(const b of s.buildings||[]){
    const q=buildingConnectionPoint(b,p,0);
    const d=Math.hypot(q.x-p.x,q.y-p.y);
    if(d<bd){bd=d;best={building:b,facade:q}}
  }
  return best;
}
function addBuildingAccessApron(group,building,roadPoint,facade,bridge){
  if(!building||bridge)return;
  const dx=roadPoint.x-facade.x,dy=roadPoint.y-facade.y,len=Math.hypot(dx,dy);
  if(len<1)return;
  const ux=dx/len,uy=dy/len;
  const apronLength=Math.max(10,Math.min(22,len+7));
  const outer={x:facade.x+ux*apronLength,y:facade.y+uy*apronLength};
  const width=ROAD.shoulderWidth+2;
  addRoadBox(group,facade,outer,width,.10,ROAD.shoulderY+.018,roadMaterials.shoulder);
  addRoadBox(group,facade,{x:facade.x+ux*Math.min(8,apronLength),y:facade.y+uy*Math.min(8,apronLength)},ROAD.width+3,.08,ROAD.surfaceY+.018,roadMaterials.asphalt);
}
function makeRoad(points,bridge,s=null){
  if(!Array.isArray(points)||points.length<2)return new THREE.Group();
  const group=new THREE.Group();
  const clean=roundedRoadPoints(points);
  if(clean.length<2)return group;

  const width=bridge?ROAD.bridgeWidth:ROAD.width;
  const shoulder=bridge?width+1.5:ROAD.shoulderWidth;

  if(bridge){
    addRoadSurface(group,clean,shoulder,ROAD.bridgeY,roadMaterials.bridgeDeck);
    addRoadSurface(group,clean,width,ROAD.surfaceY,roadMaterials.asphalt);
    addRoadMarkings(group,clean,width);
    addRoadRails(group,clean,width);
    addBridgeSupports(group,clean);
  }else{
    addRoadSurface(group,clean,shoulder,ROAD.shoulderY,roadMaterials.shoulder);
    addRoadSurface(group,clean,width,ROAD.surfaceY,roadMaterials.asphalt);
    addRoadMarkings(group,clean,width);
    addRoadCurbs(group,clean,width);
  }

  if(!bridge&&s){
    for(const p of [clean[0],clean.at(-1)]){
      const connection=buildingForRoadEndpoint(s,p);
      if(connection)addBuildingAccessApron(group,connection.building,p,connection.facade,bridge);
    }
  }

  const capRadius=(bridge?width:shoulder)/2;
  addRoadEndCap(group,clean[0],capRadius,bridge?roadMaterials.bridgeDeck:roadMaterials.shoulder,bridge?ROAD.bridgeY:ROAD.shoulderY);
  addRoadEndCap(group,clean.at(-1),capRadius,bridge?roadMaterials.bridgeDeck:roadMaterials.shoulder,bridge?ROAD.bridgeY:ROAD.shoulderY);
  if(!bridge){
    addBoundaryRoadEnd(group,clean[0],width,ROAD.shoulderY);
    addBoundaryRoadEnd(group,clean.at(-1),width,ROAD.shoulderY);
  }
  return group;
}

function roadDirection(a,b){
  const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
  return len?{x:dx/len,y:dy/len}:null;
}

function addLaneAwareJunction(group,center,connections){
  if(connections.length<2)return;
  const radius=ROAD.width*.66+Math.min(9,connections.length*1.6);
  const apronRadius=radius+ROAD.shoulderWidth*.18;
  const apron=new THREE.Mesh(new THREE.CylinderGeometry(apronRadius,apronRadius,.10,48),roadMaterials.shoulder);
  apron.position.set(center.x,ROAD.shoulderY-.015,center.y);
  group.add(apron);
  const asphalt=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,.16,48),roadMaterials.asphalt);
  asphalt.position.set(center.x,ROAD.surfaceY-.015,center.y);
  group.add(asphalt);

  const dirs=connections.map(c=>({c,d:roadDirection(c.inner,c.outer)})).filter(x=>x.d);
  for(const {d} of dirs){
    const len=radius+ROAD.width*.95;
    addRoadBox(group,center,{x:center.x+d.x*len,y:center.y+d.y*len},ROAD.width,.12,ROAD.surfaceY,roadMaterials.asphalt);
  }

  if(dirs.length>=3){
    const ring=new THREE.Mesh(new THREE.RingGeometry(radius-1.1,radius+.95,48),roadMaterials.curb);
    ring.rotation.x=-Math.PI/2;ring.position.set(center.x,ROAD.curbY+.01,center.y);group.add(ring);

    // Flat curved corner connectors make the junction read as a continuous road
    // instead of a square patch, while remaining mobile-GPU friendly.
    const turnRadius=radius*.72;
    for(let i=0;i<dirs.length;i++){
      const a=dirs[i].d,b=dirs[(i+1)%dirs.length].d;
      const angleA=Math.atan2(a.y,a.x),angleB=Math.atan2(b.y,b.x);
      let delta=((angleB-angleA+Math.PI*3)%(Math.PI*2))-Math.PI;
      if(Math.abs(delta)>.15&&Math.abs(delta)<Math.PI*0.92){
        const mid=angleA+delta*.5;
        const start={x:center.x+a.x*turnRadius,y:center.y+a.y*turnRadius};
        const end={x:center.x+b.x*turnRadius,y:center.y+b.y*turnRadius};
        const control={x:center.x+Math.cos(mid)*turnRadius*1.12,y:center.y+Math.sin(mid)*turnRadius*1.12};
        addFlatCurve(group,start,control,end,ROAD.width*.82,ROAD.surfaceY,roadMaterials.asphalt,6);
      }
    }
  }

  // Short centre separators point toward the usable approach lanes.
  if(dirs.length>=3){
    for(const {d} of dirs){
      const marker=new THREE.Mesh(new THREE.BoxGeometry(5,.10,.85),roadMaterials.center);
      marker.position.set(center.x+d.x*(radius*.66),ROAD.markingY+.02,center.y+d.y*(radius*.66));
      marker.rotation.y=-Math.atan2(d.y,d.x);
      group.add(marker);
    }
  }
}

function makeRoadJunctions(roads){
  const group=new THREE.Group();
  // Use the same canonical topology as routing/editing so a visual junction
  // cannot disagree with the road graph about whether roads are connected.
  const network=roadTopology({roads:(roads||[]).filter(road=>!road?.bridge)});
  for(const node of network.nodes){
    const links=network.adjacency.get(node)||[];
    if(links.length<3)continue;
    const connections=[];
    for(const link of links){
      const dx=link.node.x-node.x,dy=link.node.y-node.y,len=Math.hypot(dx,dy)||1;
      connections.push({
        inner:{x:node.x,y:node.y},
        outer:{x:node.x+(dx/len)*20,y:node.y+(dy/len)*20}
      });
    }
    const unique=[];
    for(const connection of connections){
      if(!unique.some(existing=>Math.abs(existing.outer.x-connection.outer.x)<8&&Math.abs(existing.outer.y-connection.outer.y)<8))unique.push(connection);
    }
    if(unique.length>=3)addLaneAwareJunction(group,{x:node.x,y:node.y},unique.slice(0,4));
  }
  return group;
}

function distPointToSegment(p,a,b){
  const dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy;
  if(!len2)return Math.hypot(p.x-a.x,p.y-a.y);
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len2));
  return Math.hypot(p.x-(a.x+dx*t),p.y-(a.y+dy*t));
}

function addBuilding(b){
  const g=new THREE.Group(),factory=b.kind==='factory',warehouse=b.kind==='warehouse';
  const w=factory?78:warehouse?96:70,d=factory?62:warehouse?66:56,h=factory?22:warehouse?18:14;
  const base=box(w,h,d,factory?'#aeb7b2':warehouse?'#b4b7b3':'#c7b89f');base.position.y=h/2;g.add(base);
  const roof=box(w+6,2,d+6,factory?'#465158':warehouse?'#4d5658':'#5a5149');roof.position.y=h+1;g.add(roof);
  const trim=box(w*.82,1.2,.8,b.color||'#d9c46a');trim.position.set(0,h*.58,d/2+.6);g.add(trim);
  if(factory){for(let i=-2;i<=2;i++){const win=box(8,6,.7,'#6f9ba5');win.position.set(i*13,h*.55,d/2+.5);g.add(win);}const door=box(20,10,.8,'#354247');door.position.set(0,5,d/2+.5);g.add(door);const chimney=box(9,32,9,'#667176');chimney.position.set(w*.28,32,d*.15);g.add(chimney);const cap=box(12,2,12,'#7f898d');cap.position.set(w*.28,48,d*.15);g.add(cap);const tank=new THREE.Mesh(new THREE.CylinderGeometry(7,7,18,16),mat('#7f898b'));tank.position.set(-w*.27,9,d*.1);g.add(tank);}
  else if(warehouse){for(let i=-2;i<=2;i++){const door=box(14,9,.8,'#465156');door.position.set(i*17,5,d/2+.5);g.add(door);}const sign=box(52,5,.8,'#d9b95f');sign.position.set(0,h*.72,d/2+.6);g.add(sign);}
  else{const glass=box(w*.58,7,.7,'#8ba9aa');glass.position.set(-4,6,d/2+.5);g.add(glass);const door=box(9,9,.8,'#536466');door.position.set(w*.30,5,d/2+.5);g.add(door);const awning=box(w*.9,2.2,5,b.color||'#d58f65');awning.position.set(0,h*.67,d/2+2.2);g.add(awning);}
  g.position.set(Number(b.x)||0,0,Number(b.y)||0);g.userData.building=b;g.traverse(o=>{if(o.isMesh)o.castShadow=true});scene.add(g);meshes.set(b.id,g);worldObjects.add(g);
}
function updateBuilding(b,selected){
  const g=meshes.get(b.id);
  if(!g)return;
  const x=Number(b.x)||0,y=Number(b.y)||0;
  if(g.position.x!==x||g.position.z!==y){g.position.set(x,0,y);}
  const scale=selected?1.035:1;
  if(g.scale.x!==scale)g.scale.setScalar(scale);
}
function updateRoadEndpointVisual(s){
  if(!roadEndpointGroup)return;
  while(roadEndpointGroup.children.length){const child=roadEndpointGroup.children[0];roadEndpointGroup.remove(child);disposeObject(child);}
  const endpoint=s.roadEditEndpoint;
  const preview=s.roadEditEndpointPreview;
  if(!endpoint&&!preview)return;
  const road=(s.roads||[]).find(x=>x?.id===(endpoint?.roadId||preview?.roadId));
  if(!road?.points)return;
  const index=endpoint?.index??preview?.index;
  const base=road.points[index];
  if(!base)return;
  const target=preview?.point||preview?.target||base;
  const invalid=!!preview?.invalid||!!preview?.blocked||!!preview?.duplicate;
  const material=new THREE.MeshBasicMaterial({color:invalid?'#d85a52':'#ffd45a',transparent:true,opacity:.95,depthWrite:false,side:THREE.DoubleSide});
  const ring=new THREE.Mesh(new THREE.RingGeometry(7,10,24),material);
  ring.rotation.x=-Math.PI/2;
  ring.position.set(target.x,1.2,target.y);
  roadEndpointGroup.add(ring);
  if(preview&&Math.hypot(target.x-base.x,target.y-base.y)>1){
    const dx=target.x-base.x,dy=target.y-base.y,len=Math.hypot(dx,dy);
    const line=new THREE.Mesh(new THREE.BoxGeometry(len,.18,4),material);
    line.position.set((base.x+target.x)/2,1.1,(base.y+target.y)/2);
    line.rotation.y=-Math.atan2(dy,dx);
    roadEndpointGroup.add(line);
  }
}
function updateRoadEditVisual(s){
  if(!roadEditGroup)return;
  const hover=s.roadEditHover, selected=s.roadEditSelection;
  const key=JSON.stringify([
    hover?.roadId||null,hover?.segment??null,
    selected?.roadId||null,selected?.segment??null
  ]);
  if(key===roadEditKey)return;
  roadEditKey=key;
  while(roadEditGroup.children.length){
    const child=roadEditGroup.children[0];
    roadEditGroup.remove(child);
    disposeObject(child);
  }
  const items=[];
  if(hover)items.push({state:hover});
  if(selected&&(!hover||selected.roadId!==hover.roadId||selected.segment!==hover.segment))items.push({state:selected});
  for(const item of items){
    const hit=item.state;
    const road=(s.roads||[]).find(r=>r?.id===hit.roadId);
    if(!road?.points||hit.segment<0||hit.segment>=road.points.length-1)continue;
    const a=road.points[hit.segment],b=road.points[hit.segment+1];
    if(!Number.isFinite(a?.x)||!Number.isFinite(a?.y)||!Number.isFinite(b?.x)||!Number.isFinite(b?.y))continue;
    const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    if(len<1)continue;
    const selectedState=selected&&hit.roadId===selected.roadId&&hit.segment===selected.segment;
    const material=new THREE.MeshBasicMaterial({
      color:selectedState?'#ffd45a':'#63d7ff',
      transparent:true,
      opacity:selectedState?.72:.52,
      depthWrite:false,
      side:THREE.DoubleSide
    });
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(len,.22,22),material);
    mesh.position.set((a.x+b.x)/2,.92,(a.y+b.y)/2);
    mesh.rotation.y=-Math.atan2(dy,dx);
    roadEditGroup.add(mesh);
    const markerMaterial=new THREE.MeshBasicMaterial({
      color:selectedState?'#fff0a6':'#9ceaff',
      transparent:true,
      opacity:.9,
      depthWrite:false
    });
    for(const p of [a,b]){
      const ring=new THREE.Mesh(new THREE.RingGeometry(4.5,6.5,20),markerMaterial);
      ring.rotation.x=-Math.PI/2;
      ring.position.set(p.x,1.12,p.y);
      roadEditGroup.add(ring);
    }
  }
}
function updateSelectionVisual(s){
  const selected=s.selected?.id||null;
  if(selected===lastBuildingSelection)return;
  for(const [id,g] of meshes){
    const scale=id===selected?1.035:1;
    if(g.scale.x!==scale)g.scale.setScalar(scale);
  }
  lastBuildingSelection=selected;
}
function disposeMaterial(material){if(Array.isArray(material))material.forEach(disposeMaterial);else material?.dispose?.()}
function disposeObject(g){g.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)disposeMaterial(o.material);});}
function clearDynamic(){for(const g of worldObjects){scene.remove(g);disposeObject(g);}worldObjects.clear();meshes.clear();for(const g of truckMeshes.values()){scene.remove(g);disposeObject(g);}truckMeshes.clear();}
function init(canvas){
  if(renderer)return;
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color('#9eaf88');root=new THREE.Group();scene.add(root);previewGroup=new THREE.Group();scene.add(previewGroup);roadEditGroup=new THREE.Group();scene.add(roadEditGroup);roadEndpointGroup=new THREE.Group();scene.add(roadEndpointGroup);
  scene.add(new THREE.HemisphereLight('#f7f2df','#68745e',2.1));
  const sun=new THREE.DirectionalLight('#fff1cf',3.2);sun.position.set(-240,320,180);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);scene.add(sun);
  const ground=box(2600,2,2600,'#b7c79d');ground.position.y=-1;ground.receiveShadow=true;scene.add(ground);
  const edgeOffset=WORLD_MARGIN*.5,edgeDepth=.22;
  const edgeLeft=box(edgeDepth,.12,2600-edgeOffset*2,'#6d775f');edgeLeft.position.set(WORLD_BOUNDS.minX+edgeOffset,.08,0);scene.add(edgeLeft);
  const edgeRight=box(edgeDepth,.12,2600-edgeOffset*2,'#6d775f');edgeRight.position.set(WORLD_BOUNDS.maxX-edgeOffset,.08,0);scene.add(edgeRight);
  const edgeTop=box(2600-edgeOffset*2,.12,edgeDepth,'#6d775f');edgeTop.position.set(0,.08,WORLD_BOUNDS.minY+edgeOffset);scene.add(edgeTop);
  const edgeBottom=box(2600-edgeOffset*2,.12,edgeDepth,'#6d775f');edgeBottom.position.set(0,.08,WORLD_BOUNDS.maxY-edgeOffset);scene.add(edgeBottom);
  const river=new THREE.Group();
  const riverWidth=82,riverStart=-1300,riverStep=44;
  for(let x=riverStart;x<=1300;x+=riverStep){
    const x2=Math.min(1300,x+riverStep+8),mid=(x+x2)/2,dy=riverY(x2)-riverY(x),angle=Math.atan2(dy,x2-x);
    const segment=box(Math.hypot(x2-x,dy)+10,.7,riverWidth,'#5f9db3');
    segment.position.set(mid,.1,(riverY(x)+riverY(x2))/2);
    segment.rotation.y=-angle;
    river.add(segment);
  }
  scene.add(river);
  resize(canvas.clientWidth||innerWidth,canvas.clientHeight||innerHeight);
}
function resize(w,h){
  if(!renderer)return;
  viewport.width=Math.max(1,w);viewport.height=Math.max(1,h);
  const changed=renderer.domElement.width!==Math.round(viewport.width*renderer.getPixelRatio())||renderer.domElement.height!==Math.round(viewport.height*renderer.getPixelRatio());
  if(changed)renderer.setSize(viewport.width,viewport.height,false);
  if(camera3d)camera3d.updateProjectionMatrix();
}
function syncWorld(s){
  if(!scene)return;clearDynamic();
  const pts=[];for(const b of s.buildings||[]){addBuilding(b);if(Number.isFinite(b.x)&&Number.isFinite(b.y))pts.push({x:b.x,z:b.y});}
  for(const r of s.roads||[]){const points=(r.points||[]).filter(p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&isInsideWorldBounds(p));if(points.length<2)continue;const g=makeRoad(points,!!r.bridge,s);scene.add(g);worldObjects.add(g);for(const p of points)pts.push({x:p.x,z:p.y});}
  const junctions=makeRoadJunctions(s.roads||[]);
  scene.add(junctions);worldObjects.add(junctions);
  if(pts.length){home={x:pts.reduce((n,p)=>n+p.x,0)/pts.length,z:pts.reduce((n,p)=>n+p.z,0)/pts.length};if(!cameraReady){desired.x=home.x;desired.z=home.z;target.x=home.x;target.z=home.z;}}
}
function updateCamera(s,W,H){
  const zoom=Math.max(.55,Math.min(2.4,s.camera.zoom||1));
  desired.distance=Math.max(320,Math.min(980,Math.max(W,H)*1.05))/zoom;
  if(!cameraReady){desired.x=home.x;desired.z=home.z;target={...desired,yaw:0,pitch:.82};cameraReady=true;}
  const ease=1-Math.pow(.001,1/60);for(const k of ['x','z','distance','yaw','pitch'])target[k]=THREE.MathUtils.lerp(target[k],desired[k],ease);
  const aspect=Math.max(.1,W/H),half=Math.max(150,target.distance*.55);if(!camera3d)camera3d=new THREE.OrthographicCamera(-half*aspect,half*aspect,half,-half,.1,3000);applyCameraTransform(W,H);
}
export function resetCamera(){desired.x=home.x;desired.z=home.z;desired.yaw=0;desired.pitch=.82;desired.distance=620;target={...desired};}
export function focusCamera(x,z){desired.x=Number(x)||home.x;desired.z=Number(z)||home.z;}
export function controlCamera(dx,dy,distanceDelta=0,yawDelta=0,pitchDelta=0){desired.x+=dx;desired.z+=dy;desired.distance=Math.max(280,Math.min(1100,desired.distance+distanceDelta));desired.yaw+=yawDelta;desired.pitch=Math.max(.52,Math.min(1.18,desired.pitch+pitchDelta));}
export function screenToWorld(x,y,W=viewport.width,H=viewport.height){const p=cameraPointFromScreen(x,y,W,H);return{x:p.x,y:p.z};}
export function worldToScreen(x,z,W=viewport.width,H=viewport.height){if(!camera3d)return{x:W/2,y:H/2,visible:false};const p=new THREE.Vector3(Number(x)||0,0,Number(z)||0).project(camera3d);return{x:(p.x+1)*.5*W,y:(1-p.y)*.5*H,visible:p.z>=-1&&p.z<=1};}
export function panScreen(dx,dy,W=viewport.width,H=viewport.height){if(!camera3d)return {x:0,z:0};const a=cameraPointFromScreen(W/2,H/2,W,H),b=cameraPointFromScreen(W/2-dx,H/2-dy,W,H);const mx=b.x-a.x,mz=b.z-a.z;controlCamera(mx,mz);return{x:mx,z:mz};}
export function zoomAtScreen(x,y,nextZoom,W=viewport.width,H=viewport.height){
  if(!camera3d)return Math.max(.55,Math.min(2.4,nextZoom));
  const zoom=Math.max(.55,Math.min(2.4,Number(nextZoom)||1));
  const before=cameraPointFromScreen(x,y,W,H);
  desired.distance=Math.max(320,Math.min(980,Math.max(W,H)*1.05))/zoom;
  target.x=desired.x;target.z=desired.z;target.distance=desired.distance;target.yaw=desired.yaw;target.pitch=desired.pitch;
  applyCameraTransform(W,H);
  const after=cameraPointFromScreen(x,y,W,H);
  const dx=before.x-after.x,dz=before.z-after.z;
  desired.x+=dx;desired.z+=dz;target.x+=dx;target.z+=dz;
  applyCameraTransform(W,H);
  return zoom;
}
function applyCameraTransform(W,H){
  if(!camera3d)return;
  const aspect=Math.max(.1,W/H),half=Math.max(150,target.distance*.55);
  camera3d.left=-half*aspect;camera3d.right=half*aspect;camera3d.top=half;camera3d.bottom=-half;
  const cp=Math.cos(target.pitch);
  camera3d.position.set(target.x+Math.sin(target.yaw)*target.distance*cp,Math.sin(target.pitch)*target.distance,target.z+Math.cos(target.yaw)*target.distance*cp);
  camera3d.lookAt(target.x,0,target.z);camera3d.updateProjectionMatrix();camera3d.updateMatrixWorld();
}
export function cameraPointFromScreen(x,y,W=viewport.width,H=viewport.height){
  if(!camera3d)return{x:home.x,z:home.z};
  const ndc=new THREE.Vector3((x/W)*2-1,-(y/H)*2+1,0).unproject(camera3d);
  const dir=ndc.sub(camera3d.position).normalize();
  const t=-camera3d.position.y/dir.y;
  return{x:camera3d.position.x+dir.x*t,z:camera3d.position.z+dir.z*t};
}
function createTruckMesh(t){const g=new THREE.Group();const body=box(14,6,25,t.longDistance?'#8755c7':'#d79234');body.position.y=5;g.add(body);const cab=box(12,7,9,'#d9b75e');cab.position.set(0,6,8);g.add(cab);const wm=mat('#202729');for(const x of [-7,7])for(const z of [-7,7]){const wh=new THREE.Mesh(new THREE.CylinderGeometry(2.7,2.7,1.8,12),wm);wh.rotation.z=Math.PI/2;wh.position.set(x,2.7,z);g.add(wh);}scene.add(g);return g;}
function routeMetric(route){
  let metric=routeMetrics.get(route);
  if(metric&&metric.count===route.length)return metric;
  const cumulative=[0];
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i];
    cumulative.push(cumulative[i-1]+Math.hypot(b.x-a.x,b.y-a.y));
  }
  metric={count:route.length,cumulative,total:cumulative.at(-1)||0};
  routeMetrics.set(route,metric);
  return metric;
}
function truckPoint(route,t){
  if(!Array.isArray(route)||!route.length)return null;
  if(route.length===1)return{x:route[0].x,y:route[0].y,next:route[0]};
  const clamped=Math.max(0,Math.min(1,Number(t)||0));
  const metric=routeMetric(route);
  if(!metric.total)return{x:route[0].x,y:route[0].y,next:route[1]};
  const wanted=metric.total*clamped;
  let lo=1,hi=route.length-1;
  while(lo<hi){
    const mid=(lo+hi)>>1;
    if(metric.cumulative[mid]>=wanted)hi=mid;
    else lo=mid+1;
  }
  const i=lo,a=route[i-1],b=route[i],run=metric.cumulative[i-1],seg=metric.cumulative[i]-run;
  const q=seg?(wanted-run)/seg:0;
  return{x:a.x+(b.x-a.x)*q,y:a.y+(b.y-a.y)*q,next:b};
}
function drawTrucks(s){
  const active=new Set();
  for(const t of s.trucks||[]){
    if(!t.route?.length||!t.id)continue;
    active.add(t.id);
    let g=truckMeshes.get(t.id);
    if(!g){g=createTruckMesh(t);truckMeshes.set(t.id,g);}
    const p=truckPoint(t.route,t.t);
    if(!p)continue;
    // UK-style left-hand traffic: keep each truck on the left side of its
    // travel direction instead of placing every vehicle on the centreline.
    const dx=p.next.x-p.x,dy=p.next.y-p.y,len=Math.hypot(dx,dy);
    const laneOffset=4.3;
    const nx=len>1e-6?-dy/len:0,nz=len>1e-6?dx/len:0;
    g.position.set(p.x+nx*laneOffset,.86,p.y+nz*laneOffset);
    g.lookAt(p.next.x+nx*laneOffset,.86,p.next.y+nz*laneOffset);
  }
  for(const [id,g] of truckMeshes){
    if(active.has(id))continue;
    scene.remove(g);
    disposeObject(g);
    truckMeshes.delete(id);
  }
}
export function setPreview(path,start,end,blocked=false){
  if(!previewGroup)return;
  const snapStart=start?.building?'building':start?.road?'road':start?.gridSnapped?'grid':'free';
  const snapEnd=end?.building?'building':end?.road?'road':end?.gridSnapped?'grid':'free';
  const key=path&&path.length>=2?JSON.stringify([path,start,end,blocked,snapStart,snapEnd]):'';
  if(key===previewKey)return;
  previewKey=key;
  while(previewGroup.children.length){
    const child=previewGroup.children[0];
    previewGroup.remove(child);
    disposeObject(child);
  }
  if(!path||path.length<2)return;

  const previewSurface=new THREE.MeshStandardMaterial({
    color:blocked?'#d85a52':'#58a6d8',
    transparent:true,
    opacity:.58,
    depthWrite:false,
    side:THREE.DoubleSide
  });
  const previewShoulder=new THREE.MeshStandardMaterial({
    color:blocked?'#b14c48':'#8ac4e2',
    transparent:true,
    opacity:.38,
    depthWrite:false,
    side:THREE.DoubleSide
  });
  const previewMarking=new THREE.MeshBasicMaterial({
    color:blocked?'#ffb0a8':'#eaf7ff',
    transparent:true,
    opacity:.88,
    depthWrite:false
  });

  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i];
    const segment=addRoadBox(previewGroup,a,b,ROAD.shoulderWidth,.15,.66,previewShoulder);
    if(!segment)continue;
    addRoadBox(previewGroup,a,b,ROAD.width,.14,.74,previewSurface);

    const nx=-Math.sin(segment.angle),nz=Math.cos(segment.angle);
    for(const side of [-1,1]){
      const edge=new THREE.Mesh(new THREE.BoxGeometry(Math.max(1,segment.len-2),.1,.65),previewMarking);
      edge.position.set(
        (a.x+b.x)/2+nx*side*(ROAD.width/2-1.5),
        .84,
        (a.y+b.y)/2+nz*side*(ROAD.width/2-1.5)
      );
      edge.rotation.y=-segment.angle;
      previewGroup.add(edge);
    }
    for(let along=10;along<segment.len-6;along+=30){
      const dashLen=Math.min(14,segment.len-along-4);
      if(dashLen<4)break;
      const t=(along+dashLen/2)/segment.len;
      const dash=new THREE.Mesh(new THREE.BoxGeometry(dashLen,.1,1),previewMarking);
      dash.position.set(a.x+segment.dx*t,.85,a.y+segment.dy*t);
      dash.rotation.y=-segment.angle;
      previewGroup.add(dash);
    }
  }

  const endpointMaterial=kind=>new THREE.MeshBasicMaterial({
    color:blocked?'#d85a52':kind==='building'?'#f4e5a8':kind==='road'?'#67d5e8':kind==='grid'?'#b8c7ff':'#ffffff',
    transparent:true,
    opacity:.95,
    depthWrite:false,
    side:THREE.DoubleSide
  });
  for(const [q,kind] of [[start,snapStart],[end,snapEnd]]){
    if(!q)continue;
    const ring=new THREE.Mesh(
      new THREE.RingGeometry(kind==='building'?7:6,kind==='building'?9:8,24),
      endpointMaterial(kind)
    );
    ring.rotation.x=-Math.PI/2;
    ring.position.set(q.x,1.12,q.y);
    previewGroup.add(ring);
    const core=new THREE.Mesh(
      new THREE.CircleGeometry(kind==='building'?3.5:3,16),
      endpointMaterial(kind)
    );
    core.rotation.x=-Math.PI/2;
    core.position.set(q.x,1.14,q.y);
    previewGroup.add(core);
  }
  for(let i=1;i<path.length-1;i++){
    const q=path[i];
    if(!q)continue;
    const turn=new THREE.Mesh(
      new THREE.RingGeometry(3.5,4.5,16),
      endpointMaterial('grid')
    );
    turn.rotation.x=-Math.PI/2;
    turn.position.set(q.x,1.10,q.y);
    previewGroup.add(turn);
  }
}

export function render(ctx,s,W,H,canvas=document.querySelector('#game')){
  init(canvas);
  resize(W,H);
  if(render.lastState!==s||render.lastWorldVersion!==s.renderVersion){
    syncWorld(s);
    render.lastState=s;
    render.lastWorldVersion=s.renderVersion;
    lastBuildingSelection=null;
    roadEditKey='';
  }
  if(render.lastState===s){
    if(render.lastWorldBuildingSignature!==s.buildings?.length){
      render.lastWorldBuildingSignature=s.buildings?.length||0;
      for(const b of s.buildings||[])updateBuilding(b,false);
    }
    updateSelectionVisual(s);
    updateRoadEditVisual(s);
    updateRoadEndpointVisual(s);
  }
  updateCamera(s,W,H);
  drawTrucks(s);
  renderer.render(scene,camera3d);
}
export function resizeRenderer(W,H){resize(W,H)}
