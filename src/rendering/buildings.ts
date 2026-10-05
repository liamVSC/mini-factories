import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/+esm?v=6';
import {buildingSitePlan} from './sitePlan.js';
import {box,cyl,container,dockStrip,dumpster,fence,foundation,frontWindows,forklift,gate,glass,loadingDoor,material,parkedMarkings,palletStack,roofRibs,siteLights,sideWindows,surface} from './three.js';

function yard(g:any,plan:any,metal:any,accent:any){
  const concrete=material('#818681',.96),asphalt=material('#4d5554',.98),darkPave=material('#3c4443',.99),gravel=material('#6d716c',1),paint=material('#dedfd8',.7),wood=material('#8a6847',.95),lightMat=material('#d8d0a8',.6,.08);
  const lotZ=plan.lotZ,backZ=plan.rearZ,gateZ=plan.gateZ,dir=plan.direction;
  surface(g,plan.lotWidth,plan.lotDepth,gravel,0,lotZ,.04);surface(g,plan.courtWidth,plan.courtDepth,asphalt,0,plan.courtZ,.14);
  for(const side of[-1,1])box(g,1,.3,plan.courtDepth,concrete,side*plan.courtWidth/2,.25,plan.courtZ,0,false);
  const parkingDepth=Math.max(28,plan.parkingDepth);surface(g,plan.parkingWidth,parkingDepth,darkPave,0,plan.parkingZ,.14);parkedMarkings(g,plan,paint);
  const serviceWidth=16,serviceDepth=Math.abs(gateZ-plan.parkingZ);surface(g,serviceWidth,serviceDepth,concrete,plan.serviceX,(gateZ+plan.parkingZ)/2,.15);
  const loadingWidth=plan.kind==='warehouse'?132:plan.kind==='factory'?88:74;surface(g,loadingWidth,18,concrete,0,plan.dockZ+dir*9,.18);
  const turnGeometry=new THREE.CylinderGeometry(plan.turnRadius,plan.turnRadius,.2,32),turn=new THREE.Mesh(turnGeometry,darkPave);turn.position.set(plan.turnX,.27,plan.turnZ);turn.receiveShadow=true;g.add(turn);
  for(const side of[-1,1])fence(g,side*plan.fenceX,backZ,side*plan.fenceX,gateZ,metal);
  fence(g,-plan.fenceX,backZ,plan.fenceX,backZ,metal);fence(g,-plan.fenceX,gateZ,-plan.gateWidth/2,gateZ,metal);fence(g,plan.gateWidth/2,gateZ,plan.fenceX,gateZ,metal);
  gate(g,gateZ,plan.gateWidth,metal);box(g,plan.gateWidth-3,.08,1.2,paint,0,.27,gateZ-dir,0,false);siteLights(g,plan,metal,lightMat);
  for(const side of[-1,1]){const x=side*(plan.width/2+8),z=plan.dockZ+dir*12;box(g,10,.18,10,darkPave,x,.25,z,0,false);palletStack(g,x,z,wood);}
  const propZ=plan.parkingZ-dir*5;
  if(plan.kind==='factory'){
    const tankSide=-plan.serviceSide,x=tankSide*Math.min(plan.width/2+10,plan.site.halfWidth-19);surface(g,24,34,gravel,x,-dir*18,.16);
    for(const z of[-dir*10,-dir*26]){cyl(g,5.5,15,material('#828b85',.78,.16),x,8,z,20);cyl(g,5.7,.8,metal,x,15.6,z,20);for(const side of[-1,1])box(g,.8,5,.8,metal,x+side*4.1,2.5,z);}
    const pipe=cyl(g,.8,30,material('#88928c',.7,.25),x+plan.serviceSide*8,5,-dir*18,12);pipe.rotation.z=Math.PI/2;container(g,plan.serviceSide*(plan.site.halfWidth-20),propZ,metal,accent);
  }else if(plan.kind==='warehouse'){
    container(g,-plan.serviceSide*(plan.site.halfWidth-20),propZ,metal,accent);container(g,-plan.serviceSide*(plan.site.halfWidth-20),propZ-dir*14,material('#727b77',.83,.12),paint);
  }else{
    for(let i=-2;i<=2;i++){const x=i*11;box(g,8,.08,17,paint,x,.25,propZ,0,false);}box(g,5,8,2,material('#638071',.9),plan.serviceSide*(plan.width/2+9),4,propZ,0,false);
  }
  dumpster(g,-plan.serviceSide*(plan.site.halfWidth-19),plan.parkingZ+dir*14,metal,darkPave);forklift(g,plan.turnX+plan.serviceSide*21,plan.turnZ-dir*6,metal,darkPave,glass('#4d6e72'));
}

function facadeFrame(g:any,w:number,d:number,h:number,dir:number,metal:any,accent:any,centerX=0,centerZ=0){
  const front=centerZ+dir*d/2,bodyTop=1.5+h;
  for(const x of[centerX-w/2+2,centerX+w/2-2])box(g,1.5,h-2,1.2,metal,x,1.5+(h-2)/2,front+dir*.3);
  box(g,w,.8,1.4,accent,centerX,bodyTop-3,front+dir*.45);
  for(const side of[-1,1])for(const z of[-d/2+3,d/2-3])box(g,1.1,h-2,1.4,metal,centerX+side*(w/2-1.5),1.5+(h-2)/2,centerZ+z);
}

function factoryModel(b:any,plan:any){
  const g=new THREE.Group(),{width:w,depth:d,height:h,direction:dir,variant}=plan;
  const body=material('#747d79',.9),dark=material('#343b39',.97),metal=material('#59635f',.8,.18),accent=material(b.color||'#789a86',.55,.16),gl=glass(),roofMat=material('#414947',.96),foundationMat=material('#939891',.95);
  const front=dir*d/2,bodyTop=1.5+h,roofY=bodyTop+.55;
  yard(g,plan,metal,accent);foundation(g,w,d,foundationMat,dark);box(g,w,h,d,body,0,1.5+h/2,0);facadeFrame(g,w,d,h,dir,metal,accent);
  for(const x of[-w*.31,0,w*.31])box(g,2.5,h-5,.8,metal,x,1.5+(h-5)/2,front+dir*.55);box(g,w*.42,1.2,.9,accent,0,10,front+dir*.65);
  const officeX=w*.31,officeW=w*.31,officeH=24,officeD=32,officeZ=front-dir*officeD*.38;box(g,officeW,officeH,officeD,material('#626e69',.86),officeX,1.5+officeH/2+4,officeZ);
  frontWindows(g,officeW-5,15,front+dir*.8,dir,4,gl,dark,5,5,officeX);frontWindows(g,w*.48,25,front+dir*.55,dir,5,gl,dark,7,5);
  loadingDoor(g,plan.dockX,front,29,21,dir,metal,dark);loadingDoor(g,-w*.33,front,18,15,dir,metal,dark);loadingDoor(g,w*.33,-front,18,14,-dir,metal,dark);dockStrip(g,plan.dockX,front,74,dir,metal);
  box(g,80,2,11,roofMat,plan.dockX,bodyTop+5,front+dir*7);for(const x of[plan.dockX-34,plan.dockX+34])box(g,1.3,5,1.3,metal,x,bodyTop+2.5,front+dir*8);
  box(g,w+4,1.5,d+4,roofMat,0,roofY,0);roofRibs(g,w,d,roofY+1.1,metal,6);
  for(const x of[-w*.25,0,w*.25]){box(g,14,.65,d*.62,gl,x,roofY+1.7,0,0,false);box(g,16,.7,1.2,metal,x,roofY+1.55,-d*.32);box(g,16,.7,1.2,metal,x,roofY+1.55,d*.32);}
  const processX=w*[-.22,-.16,-.26,-.12][variant],processZ=d*[-.15,-.2,-.1,-.18][variant],processH=h+18;
  box(g,w*.28,processH,d*.42,dark,processX,1.5+processH/2,processZ);box(g,w*.28+2,1.2,d*.42+2,metal,processX,1.5+processH+.6,processZ);box(g,w*.22,8,d*.2,body,processX,bodyTop+processH*.42,processZ-d*.31);
  for(let i=0;i<3;i++){const z=-d*.18+i*11;box(g,1,7,.8,accent,processX+w*.14,bodyTop+9,z);}
  for(const x of[-w*.36,w*.36]){const z=-dir*d*.22;cyl(g,5.2,24,material('#87918a',.78,.18),x,13,z,20);cyl(g,5.8,1.4,metal,x,25.4,z,20);for(const side of[-1,1])box(g,.8,10,.8,metal,x+side*4.1,5,z);}
  for(let i=0;i<3;i++){const x=-w*.08+i*18;box(g,16,3,10,dark,x,bodyTop+4,-d*.02);box(g,12,1,7,metal,x,bodyTop+6,-d*.02);}
  const sidePipe=cyl(g,.75,d*.72,material('#9b9e8f',.62,.24),w/2+1,14,0,12);sidePipe.rotation.x=Math.PI/2;return g;
}

function warehouseModel(b:any,plan:any){
  const g=new THREE.Group(),{width:w,depth:d,height:h,direction:dir,variant}=plan;
  const body=material('#8a928e',.93),dark=material('#3b4240',.98),metal=material('#626a66',.82,.12),accent=material(b.color||'#b7a25f',.56,.14),gl=glass(),roofMat=material('#4c5350',.96),foundationMat=material('#9a9d96',.95);
  const front=dir*d/2,bodyTop=1.5+h,roofY=bodyTop+.6;
  yard(g,plan,metal,accent);foundation(g,w,d,foundationMat,dark);box(g,w,h,d,body,0,1.5+h/2,0);facadeFrame(g,w,d,h,dir,metal,accent);
  box(g,w*.28,21,d*.28,dark,-w*.28,14,front-dir*d*.18);frontWindows(g,w*.28-4,14,front+dir*.6,dir,4,gl,dark,5,5,-w*.28);frontWindows(g,w*.22,27,front+dir*.48,dir,4,gl,dark,6,4);
  const doorXs=[-w*.29,0,w*.29],doorWidths=[22,30,22];for(let i=0;i<doorXs.length;i++)loadingDoor(g,doorXs[i],front,doorWidths[i],i===1?21:17,dir,metal,dark);
  dockStrip(g,0,front,132,dir,metal);box(g,132,2,12,roofMat,0,bodyTop+5,front+dir*7);for(const x of[-61,-22,22,61])box(g,1.3,5,1.3,metal,x,bodyTop+2.5,front+dir*8);
  box(g,w+4,2,d+4,roofMat,0,roofY,0);roofRibs(g,w,d,roofY+1.4,metal,7);
  const roofWingX=(variant%2?1:-1)*w*.07;box(g,w*.52,9,d*.74,body,roofWingX,bodyTop+5.5,-dir*d*.03);box(g,w*.52+3,1.3,d*.74+3,metal,roofWingX,bodyTop+10.6,-dir*d*.03);box(g,w*.18,15,d*.42,dark,-roofWingX*4.8,bodyTop+8,0);
  for(const x of[-w*.3,-w*.05,w*.2]){box(g,15,3.2,9,dark,x,bodyTop+4,0);box(g,11,1.2,6,metal,x,bodyTop+6,0);}
  const officeZ=-dir*d*.3,officeSide=variant%2?1:-1,officeX=officeSide*(w/2+11);box(g,26,20,30,material('#6d7772',.86),officeX,12,officeZ);sideWindows(g,officeSide*(w/2+24),officeSide,30,13,gl,dark,4,officeZ);
  for(const side of[-1,1]){const vent=box(g,15,3,8,metal,side*w*.28,bodyTop+3,dir*d*.14);vent.rotation.z=-.16;}return g;
}

function shopModel(b:any,plan:any){
  const g=new THREE.Group(),{width:w,depth:d,height:h,direction:dir}=plan;
  const body=material('#7c8581',.88),dark=material('#303735',.97),metal=material('#68716d',.78,.14),accent=material(b.color||'#c39a45',.5,.16),gl=glass('#315c63'),roofMat=material('#454c49',.94),foundationMat=material('#92958e',.95);
  const mainW=w*.85,mainD=d-4,mainX=-w*.04,mainZ=plan.dockZ-dir*mainD/2,front=mainZ+dir*mainD/2,retailFront=mainZ-dir*mainD/2,bodyTop=1.5+h,roofY=bodyTop+1.4;
  yard(g,plan,metal,accent);foundation(g,mainW,mainD,foundationMat,dark,mainX,mainZ);box(g,mainW,h,mainD,body,mainX,1.5+h/2,mainZ);box(g,w*.29,h*.7,d*.48,dark,w*.34,1.5+h*.35,-dir*d*.07);facadeFrame(g,mainW,mainD,h,dir,metal,accent,mainX,mainZ);
  box(g,mainW,1.3,.9,accent,mainX,10,retailFront-dir*.55);frontWindows(g,mainW*.72,15,retailFront-dir*.58,-dir,7,gl,dark,9,7,mainX);
  const entranceX=mainX-mainW*.2;box(g,34,1.4,12,accent,entranceX,bodyTop-5,retailFront-dir*8);for(const x of[entranceX-15,entranceX+15])box(g,1,6,1,metal,x,bodyTop-8,retailFront-dir*12);box(g,5,10,.4,gl,entranceX,7,retailFront-dir*.78,0,false);
  loadingDoor(g,plan.dockX,front,20,15,dir,metal,dark);dockStrip(g,plan.dockX,plan.dockZ,68,dir,metal);box(g,70,1.8,10,roofMat,plan.dockX,bodyTop+4,front+dir*6);box(g,w*.23,15,d*.45,dark,w*.34,bodyTop+7,dir*d*.03);box(g,w*.51,3,d*.35,metal,mainX,roofY,mainZ);
  for(const side of[-1,1])sideWindows(g,mainX+side*mainW/2+side*.42,side,mainD,13,gl,dark,4,mainZ);for(const x of[-w*.28,w*.18])cyl(g,1.7,10,metal,x,bodyTop+6,0,14);return g;
}

export function makeBuilding(b:any){
  const plan=buildingSitePlan(b);
  if(!plan)return new THREE.Group();
  if(plan.kind==='factory')return factoryModel(b,plan);
  if(plan.kind==='warehouse')return warehouseModel(b,plan);
  return shopModel(b,plan);
}
