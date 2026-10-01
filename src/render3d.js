import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/+esm';
import {riverY,isInsideWorldBounds,WORLD_BOUNDS,WORLD_MARGIN,roadTopology,buildingConnectionPoint} from './world.js';

let renderer=null,scene=null,camera3d=null,root=null,previewGroup=null,buildingPreviewGroup=null,roadEditGroup=null,roadEndpointGroup=null;
let target={x:0,z:0,yaw:0,pitch:.82,distance:620};
let desired={...target};
let home={x:0,z:0};
let cameraReady=false;
let viewport={width:1,height:1};
let previewKey='';
let buildingPreviewKey='';
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
  width:28,
  bridgeWidth:26,
  shoulderWidth:34,
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

function addLaneEntryExitPaths(group,center,connections){
  if(connections.length<3)return;
  const radius=ROAD.width*.66+Math.min(9,connections.length*1.6);
  for(const from of connections){
    const a=roadDirection(from.inner,from.outer); if(!a)continue;
    for(const to of connections){
      if(to===from)continue;
      const b=roadDirection(to.inner,to.outer); if(!b)continue;
      const cross=a.x*b.y-a.y*b.x, dot=a.x*b.x+a.y*b.y;
      // Only draw the visible corner path for genuine turns; straight-through
      // traffic stays on the normal centreline.
      if(Math.abs(cross)<.18||dot<-.9)continue;
      const turnRadius=radius*.72;
      const start={x:center.x+a.x*turnRadius,y:center.y+a.y*turnRadius};
      const end={x:center.x-b.x*turnRadius,y:center.y-b.y*turnRadius};
      const control={x:center.x+(a.x-b.x)*turnRadius*.42,y:center.y+(a.y-b.y)*turnRadius*.42};
      addFlatCurve(group,start,control,end,2.1,ROAD.markingY+.03,roadMaterials.edge,8);
    }
  }
}

function addDedicatedApproachLanes(group,center,connections){
  if(connections.length<3)return;
  const L=58,W=ROAD.width*1.5,lane=W/3;
  for(const con of connections){
    const out=roadDirection(con.inner,con.outer);
    if(!out)continue;
    const travel={x:-out.x,y:-out.y},side={x:-travel.y,y:travel.x};
    // Taper from the normal two-lane width into the three-lane junction
    // approach. The added width starts gradually rather than appearing at
    // the junction as a hard rectangular step.
    const taperStart=58,taperEnd=30;
    const widthAt=d=>ROAD.width+(W-ROAD.width)*Math.max(0,Math.min(1,(taperStart-d)/(taperStart-taperEnd)));
    const sections=[58,48,38,30,20,10,2];
    for(let i=1;i<sections.length;i++){
      const da=sections[i-1],db=sections[i];
      const wa=widthAt(da),wb=widthAt(db);
      const a={x:center.x+travel.x*da,y:center.y+travel.y*da};
      const b={x:center.x+travel.x*db,y:center.y+travel.y*db};
      addRoadBox(group,a,b,(wa+wb)/2,.12,ROAD.surfaceY,roadMaterials.asphalt);
    }
    // Lane separators are dashed through the taper, then continuous in the
    // dedicated approach. This visually merges the turn pocket into normal
    // road geometry.
    for(const n of [1,2]){
      const off=-W/2+lane*n;
      for(let d=46;d>=8;d-=7){
        const blend=Math.max(0,Math.min(1,(58-d)/28));
        const currentWidth=ROAD.width+(W-ROAD.width)*blend;
        const currentOff=-currentWidth/2+(currentWidth/3)*n;
        const a={x:center.x+travel.x*d+side.x*currentOff,y:center.y+travel.y*d+side.y*currentOff};
        const q={x:center.x+travel.x*(d-3.4)+side.x*currentOff,y:center.y+travel.y*(d-3.4)+side.y*currentOff};
        addRoadBox(group,a,q,.42,.075,ROAD.markingY,roadMaterials.edge);
      }
    }
    // Turn-pocket edge line on the centre-side lane.
    const edgeOff=W/2-lane*.12;
    for(let d=46;d>=10;d-=6){
      const blend=Math.max(0,Math.min(1,(58-d)/28));
      const currentWidth=ROAD.width+(W-ROAD.width)*blend;
      const currentOff=-currentWidth/2+currentWidth-edgeOff;
      const a={x:center.x+travel.x*d+side.x*currentOff,y:center.y+travel.y*d+side.y*currentOff};
      const q={x:center.x+travel.x*(d-2.8)+side.x*currentOff,y:center.y+travel.y*(d-2.8)+side.y*currentOff};
      addRoadBox(group,a,q,.55,.075,ROAD.markingY+.01,roadMaterials.center);
    }
    // Lane-specific arrows: left, straight and right. The approach is
    // left-hand traffic, so the three widened lanes have distinct movements
    // instead of three identical straight arrows.
    const drawArrow=(p,kind)=>{
      const shaftLength=kind==='straight'?7:5;
      const shaft={x:p.x+travel.x*shaftLength,y:p.y+travel.y*shaftLength};
      addRoadBox(group,p,shaft,.72,.08,ROAD.markingY+.025,roadMaterials.edge);
      const tip={x:shaft.x+travel.x*2.8,y:shaft.y+travel.y*2.8};
      if(kind==='straight'){
        const leftTip={x:shaft.x+side.x*2.2+travel.x*1.4,y:shaft.y+side.y*2.2+travel.y*1.4};
        const rightTip={x:shaft.x-side.x*2.2+travel.x*1.4,y:shaft.y-side.y*2.2+travel.y*1.4};
        addRoadBox(group,leftTip,tip,.58,.08,ROAD.markingY+.025,roadMaterials.edge);
        addRoadBox(group,rightTip,tip,.58,.08,ROAD.markingY+.025,roadMaterials.edge);
      }else{
        const turnSide=kind==='left'?side:{x:-side.x,y:-side.y};
        const bend={x:shaft.x+travel.x*1.5+turnSide.x*2.8,y:shaft.y+travel.y*1.5+turnSide.y*2.8};
        const outer={x:bend.x+turnSide.x*2.1,y:bend.y+turnSide.y*2.1};
        addRoadBox(group,shaft,bend,.58,.08,ROAD.markingY+.025,roadMaterials.edge);
        addRoadBox(group,bend,outer,.58,.08,ROAD.markingY+.025,roadMaterials.edge);
      }
    };
    for(const n of [0,1,2]){
      const off=-W/2+lane*(n+.5);
      const p={x:center.x+travel.x*25+side.x*off,y:center.y+travel.y*25+side.y*off};
      drawArrow(p,n===0?'left':n===1?'straight':'right');
    }
  }
}
function addTurnLaneMarking(group,start,control,end,width=1.05){
  const steps=10; let prev=start;
  for(let i=1;i<=steps;i++){
    const t=i/steps,m=1-t;
    const next={x:m*m*start.x+2*m*t*control.x+t*t*end.x,y:m*m*start.y+2*m*t*control.y+t*t*end.y};
    if(i%2===0||i===steps){
      const dx=next.x-prev.x,dy=next.y-prev.y,len=Math.hypot(dx,dy);
      if(len>1){
        const dash=new THREE.Mesh(new THREE.BoxGeometry(Math.max(2,len*.82),.09,width),roadMaterials.center);
        dash.position.set((prev.x+next.x)/2,ROAD.markingY+.025,(prev.y+next.y)/2);
        dash.rotation.y=-Math.atan2(dy,dx); group.add(dash);
      }
    }
    prev=next;
  }
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

  const dirs=connections.map(c=>({c,d:roadDirection(c.inner,c.outer)})).filter(x=>x.d).sort((a,b)=>Math.atan2(a.d.y,a.d.x)-Math.atan2(b.d.y,b.d.x));
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
        addTurnLaneMarking(group,
          {x:start.x+(control.x-start.x)*.12,y:start.y+(control.y-start.y)*.12},
          control,
          {x:end.x+(control.x-end.x)*.12,y:end.y+(control.y-end.y)*.12}
        );
      }
    }
  }

  // Short centre separators point toward the usable approach lanes.
  if(dirs.length>=3){
    for(const {d} of dirs){
      const marker=new THREE.Mesh(new THREE.BoxGeometry(7,.10,.85),roadMaterials.center);
      marker.position.set(center.x+d.x*(radius*.66),ROAD.markingY+.02,center.y+d.y*(radius*.66));
      marker.rotation.y=-Math.atan2(d.y,d.x);
      group.add(marker);
    }
  }
}

function addJunctionControlLines(group,center,connections,radius){
  const lineMaterial=roadMaterials.edge;
  for(const connection of connections){
    const d=roadDirection(connection.inner,connection.outer);
    if(!d)continue;
    // Stop lines sit on the approach in the actual left-hand travel lane.
    const travel={x:-d.x,y:-d.y};
    const left={x:-travel.y,y:travel.x};
    const laneOffset=7.0;
    const distance=radius+9;
    const p={
      x:center.x+d.x*distance+left.x*laneOffset,
      y:center.y+d.y*distance+left.y*laneOffset
    };
    const line=new THREE.Mesh(new THREE.BoxGeometry(.85,.12,ROAD.width*1.48),lineMaterial);
    line.position.set(p.x,ROAD.markingY+.025,p.y);
    line.rotation.y=-Math.atan2(travel.y,travel.x);
    group.add(line);

    // Small dashed approach marker gives a visible cue before the stop line.
    const dash=new THREE.Mesh(new THREE.BoxGeometry(.55,.10,3.2),roadMaterials.edge);
    const dashDistance=distance+7;
    dash.position.set(
      center.x+d.x*dashDistance+left.x*laneOffset,
      ROAD.markingY+.024,
      center.y+d.y*dashDistance+left.y*laneOffset
    );
    dash.rotation.y=-Math.atan2(travel.y,travel.x);
    group.add(dash);
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
    if(unique.length>=3){const active=unique.slice(0,4);const center={x:node.x,y:node.y};const junctionRadius=ROAD.width*.66+Math.min(9,active.length*1.6);addDedicatedApproachLanes(group,center,active);addLaneAwareJunction(group,center,active);addLaneEntryExitPaths(group,center,active);addJunctionControlLines(group,center,active,junctionRadius);}
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
  const palette={
    factory:{base:'#aeb7b2',roof:'#465158',accent:b.color||'#8bd5ff',glass:'#6f9ba5'},
    warehouse:{base:'#b4b7b3',roof:'#4d5658',accent:b.color||'#e9c46a',glass:'#708589'},
    shop:{base:'#c7b89f',roof:'#5a5149',accent:b.color||'#d58f65',glass:'#8ba9aa'}
  }[factory?'factory':warehouse?'warehouse':'shop'];

  const add=(mesh,x=0,y=0,z=0)=>{
    mesh.position.set(x,y,z);
    mesh.castShadow=true;
    mesh.receiveShadow=true;
    g.add(mesh);
    return mesh;
  };
  const panel=(width,height,depth,color,x,y,z)=>{
    return add(box(width,height,depth,color),x,y,z);
  };

  // Main mass: layered plinth + wall + roof gives the buildings a stronger
  // silhouette without using expensive imported models.
  panel(w+4,2,d+4,'#727b78',0,1,0);
  panel(w,h,d,palette.base,0,h/2+2,0);
  panel(w+7,2.4,d+7,palette.roof,0,h+3.2,0);
  panel(w*.72,1.1,.9,palette.accent,0,h*.62+2,d/2+.65);

  // Roof equipment makes factories/warehouses readable from the elevated
  // camera while keeping the model entirely procedural.
  if(factory){
    panel(w*.28,2.2,d*.42,'#3e474b',-w*.22,h+4.8,0);
    panel(w*.20,1.8,d*.28,'#596468',w*.18,h+4.6,0);
    for(const x of [-w*.30,-w*.10,w*.10,w*.30]){
      const vent=new THREE.Mesh(new THREE.CylinderGeometry(2.8,2.8,5.5,10),mat('#657176'));
      add(vent,x,h+7.5,-d*.12);
    }
    const chimney=panel(9,32,9,'#667176',w*.28,35,d*.15);
    panel(12,2,12,'#7f898d',w*.28,51,d*.15);
    const tank=new THREE.Mesh(new THREE.CylinderGeometry(7,7,18,16),mat('#7f898b'));
    add(tank,-w*.27,13,d*.1);
    // Loading dock.
    panel(32,3,10,'#6c7472',0,3.5,d/2+5);
    panel(22,10,1,'#354247',0,9,d/2+.7);
    for(let i=-2;i<=2;i++)panel(8,6,.7,palette.glass,i*13,13,d/2+.7);
  }else if(warehouse){
    // Large loading doors and canopy distinguish logistics buildings from shops.
    panel(w*.82,2.2,6,'#68716f',0,h+4.8,d*.08);
    for(let i=-2;i<=2;i++){
      panel(14,10,.9,'#465156',i*17,8,d/2+.7);
      panel(10,6,.55,palette.glass,i*17,8,d/2+1.2);
      panel(17,1.4,2.5,'#737c79',i*17,2.1,d/2+3.0);
    }
    panel(56,5,.9,palette.accent,0,h*.72+2,d/2+.75);
    // Small roof vents.
    for(const x of [-26,0,26]){
      const vent=new THREE.Mesh(new THREE.CylinderGeometry(3.5,3.5,4,10),mat('#697271'));
      add(vent,x,h+6,0);
    }
  }else{
    // Shops get a more recognisable storefront: glazing, door, canopy and sign.
    panel(w*.62,8,.8,palette.glass,-4,9,d/2+.65);
    panel(9,10,.9,'#536466',w*.30,8,d/2+.7);
    panel(w*.92,2.5,6,palette.accent,0,h*.70+2.2,d/2+2.6);
    panel(w*.58,3.2,.9,'#f3ead1',-w*.04,h*.70+5.1,d/2+.8);
    // Awning supports.
    for(const x of [-w*.34,w*.34])panel(1.8,5,1.8,'#777b74',x,h*.48+2,d/2+3.2);
  }

  // Corner trim adds depth and makes the simple block construction read as a
  // deliberate low-poly building rather than a placeholder cube.
  for(const side of [-1,1]){
    panel(1.8,h*.72,1.8,'#747d7a',side*(w/2-.9),h*.50+2,d/2+.35);
  }

  g.position.set(Number(b.x)||0,0,Number(b.y)||0);
  g.userData.building=b;
  scene.add(g);
  meshes.set(b.id,g);
  worldObjects.add(g);
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
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(len,.22,28),material);
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
  scene=new THREE.Scene();scene.background=new THREE.Color('#9eaf88');root=new THREE.Group();scene.add(root);previewGroup=new THREE.Group();scene.add(previewGroup);buildingPreviewGroup=new THREE.Group();scene.add(buildingPreviewGroup);roadEditGroup=new THREE.Group();scene.add(roadEditGroup);roadEndpointGroup=new THREE.Group();scene.add(roadEndpointGroup);
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

function ensureCamera(){
  if(!camera3d){
    camera3d=new THREE.PerspectiveCamera(48,viewport.width/Math.max(1,viewport.height),1,5000);
    cameraReady=false;
  }
  const yaw=target.yaw;
  const pitch=Math.max(.35,Math.min(1.35,target.pitch));
  const horizontal=Math.cos(pitch)*target.distance;
  camera3d.position.set(
    target.x+Math.sin(yaw)*horizontal,
    Math.sin(pitch)*target.distance,
    target.z+Math.cos(yaw)*horizontal
  );
  camera3d.lookAt(target.x,0,target.z);
  camera3d.updateProjectionMatrix();
  cameraReady=true;
}

function syncCamera(){
  const lerp=(a,b,t)=>a+(b-a)*t;
  target.x=lerp(target.x,desired.x,.16);
  target.z=lerp(target.z,desired.z,.16);
  target.yaw=lerp(target.yaw,desired.yaw,.16);
  target.pitch=lerp(target.pitch,desired.pitch,.16);
  target.distance=lerp(target.distance,desired.distance,.16);
  ensureCamera();
}

function clearPreview(group){
  while(group.children.length){
    const child=group.children[0];
    group.remove(child);
    disposeObject(child);
  }
}

function addPolylinePreview(group,points,color='#ffd45a'){
  if(!Array.isArray(points)||points.length<2)return;
  const material=roadMat(color);
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    addRoadBox(group,a,b,ROAD.width*.72,.18,ROAD.surfaceY+.25,material);
  }
}

function setPreview(path,start,end,blocked=false){
  if(!previewGroup)return;
  const key=JSON.stringify([path||null,start?.x,start?.y,end?.x,end?.y,!!blocked]);
  if(key===previewKey)return;
  previewKey=key;
  clearPreview(previewGroup);
  if(Array.isArray(path)&&path.length>1){
    addPolylinePreview(previewGroup,path,blocked?'#d85a52':'#ffd45a');
  }
}

function setBuildingPreview(type,point,blocked=false){
  if(!buildingPreviewGroup)return;
  clearPreview(buildingPreviewGroup);
  if(!point||!type)return;
  const fp=type.kind==='warehouse'?{w:96,d:66}:type.kind==='factory'?{w:78,d:62}:{w:70,d:56};
  const material=new THREE.MeshBasicMaterial({
    color:blocked?'#d85a52':'#7fd8a8',
    transparent:true,
    opacity:.38,
    depthWrite:false
  });
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(fp.w,8,fp.d),material);
  mesh.position.set(point.x,4,point.y);
  buildingPreviewGroup.add(mesh);
}

function updateWorld(s){
  clearDynamic();
  root.clear();
  for(const road of s.roads||[]){
    const g=makeRoad(road.points,!!road.bridge,s);
    g.userData.road=road;
    root.add(g);
    worldObjects.add(g);
  }
  const junctions=makeRoadJunctions(s.roads||[]);
  root.add(junctions);
  worldObjects.add(junctions);
  for(const building of s.buildings||[])addBuilding(building);
}

function truckPoint(truck){
  const route=Array.isArray(truck?.route)?truck.route:truck?.route?.points;
  if(!Array.isArray(route)||route.length<2)return null;
  const progress=Number.isFinite(truck.progress)?truck.progress:0;
  return pointOnRoute(route,Math.max(0,Math.min(1,progress)));
}

function updateTrucks(s){
  const live=new Set();
  for(const truck of s.trucks||[]){
    if(!truck?.id)continue;
    live.add(truck.id);
    let mesh=truckMeshes.get(truck.id);
    if(!mesh){
      mesh=new THREE.Group();
      const body=new THREE.Mesh(new THREE.BoxGeometry(13,7,7),mat('#d97b45'));
      body.position.y=5;
      const cab=new THREE.Mesh(new THREE.BoxGeometry(5,6.5,7.2),mat('#9ec5d8'));
      cab.position.set(4,6,0);
      mesh.add(body,cab);
      mesh.userData.truck=truck;
      scene.add(mesh);
      truckMeshes.set(truck.id,mesh);
    }
    const p=truckPoint(truck);
    if(!p)continue;
    const route=Array.isArray(truck.route)?truck.route:truck.route?.points;
    const q=pointOnRoute(route,Math.min(1,(Number(truck.progress)||0)+.002));
    mesh.position.set(p.x,0,p.y);
    if(q){
      mesh.rotation.y=-Math.atan2(q.y-p.y,q.x-p.x);
    }
  }
  for(const [id,mesh] of truckMeshes){
    if(live.has(id))continue;
    scene.remove(mesh);
    disposeObject(mesh);
    truckMeshes.delete(id);
  }
}

function updateCameraBounds(){
  const limit=WORLD_HALF_SIZE-WORLD_MARGIN;
  desired.x=Math.max(-limit,Math.min(limit,desired.x));
  desired.z=Math.max(-limit,Math.min(limit,desired.z));
}

function render(s,W,H,canvas=document.querySelector('#game')){
  if(!canvas)return;
  if(!renderer)init(canvas);
  resize(W||innerWidth,H||innerHeight);
  if(!scene)return;
  ensureCamera();
  if(render.lastVersion!==s.renderVersion){
    updateWorld(s);
    render.lastVersion=s.renderVersion;
  }
  updateTrucks(s);
  updateSelectionVisual(s);
  updateRoadEditVisual(s);
  updateRoadEndpointVisual(s);
  syncCamera();
  renderer.render(scene,camera3d);
}

function screenToWorld(x,y,w=viewport.width,h=viewport.height){
  ensureCamera();
  const ndc=new THREE.Vector2((x/w)*2-1,-(y/h)*2+1);
  const raycaster=new THREE.Raycaster();
  raycaster.setFromCamera(ndc,camera3d);
  const plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  const hit=new THREE.Vector3();
  return raycaster.ray.intersectPlane(plane,hit)?{x:hit.x,y:hit.z}:{x:0,y:0};
}

function worldToScreen(x,y,w=viewport.width,h=viewport.height){
  ensureCamera();
  const p=new THREE.Vector3(x,0,y).project(camera3d);
  return{x:(p.x+1)*.5*w,y:(1-p.y)*.5*h};
}

function panScreen(dx,dy,w=viewport.width,h=viewport.height){
  const a=screenToWorld(w*.5,h*.5,w,h);
  const b=screenToWorld(w*.5-dx,h*.5-dy,w,h);
  desired.x+=b.x-a.x;
  desired.z+=b.y-a.y;
  updateCameraBounds();
}

function zoomAtScreen(x,y,nextZoom,w=viewport.width,h=viewport.height){
  const before=screenToWorld(x,y,w,h);
  desired.distance=Math.max(180,Math.min(1250,620/Math.max(.55,Math.min(2.4,nextZoom))));
  ensureCamera();
  const after=screenToWorld(x,y,w,h);
  desired.x+=before.x-after.x;
  desired.z+=before.y-after.y;
  updateCameraBounds();
}

function controlCamera(dx,dy,distanceDelta=0,yawDelta=0,pitchDelta=0){
  desired.x+=dx;
  desired.z+=dy;
  desired.distance=Math.max(180,Math.min(1250,desired.distance+distanceDelta));
  desired.yaw+=yawDelta;
  desired.pitch=Math.max(.35,Math.min(1.35,desired.pitch+pitchDelta));
  updateCameraBounds();
}

function resetCamera(){
  desired={x:0,z:0,yaw:0,pitch:.82,distance:620};
}

function focusCamera(x,y){
  desired.x=Number(x)||0;
  desired.z=Number(y)||0;
  updateCameraBounds();
}

export {
  render,
  setPreview,
  setBuildingPreview,
  resize,
  controlCamera,
  screenToWorld,
  worldToScreen,
  panScreen,
  zoomAtScreen,
  resetCamera,
  focusCamera
};
