import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/+esm?v=6';
import {riverY} from '../world.js';
import {GRASS_SURFACE_Y,WATER_CENTER_Y,WATER_THICKNESS} from './surfaceHeights.js';
import {box,disposeObjectGroup,material} from './three.js';

function addForest(scene:any){
  const groves=[[-1080,-1080],[1080,-1080],[-1080,1080],[1080,1080]] as const;
  const trees:Array<{x:number;z:number;trunkHeight:number;radius:number;height:number}>=[];
  for(let grove=0;grove<groves.length;grove++){
    const [cx,cz]=groves[grove];
    for(let ix=0;ix<6;ix++)for(let iz=0;iz<6;iz++){
      if((ix*13+iz*7+grove*5)%5===0)continue;
      const jitterX=(((ix*17+iz*11+grove*19)%9)-4)*1.7;
      const jitterZ=(((ix*7+iz*23+grove*13)%9)-4)*1.7;
      trees.push({x:cx+(ix-2.5)*22+jitterX,z:cz+(iz-2.5)*22+jitterZ,trunkHeight:10+((ix*3+iz*5+grove)%5),radius:8+((ix*7+iz*3+grove)%5),height:19+((ix*5+iz*2+grove)%7)});
    }
  }
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,7),material('#6e5038',.98),trees.length);
  const crowns=new THREE.InstancedMesh(new THREE.ConeGeometry(1,1,7),material('#3f6845',.96),trees.length);
  const upperCrowns=new THREE.InstancedMesh(new THREE.ConeGeometry(1,1,7),material('#527c4d',.96),trees.length);
  const matrix=new THREE.Matrix4(),quaternion=new THREE.Quaternion();
  for(let i=0;i<trees.length;i++){
    const tree=trees[i],ground=GRASS_SURFACE_Y;
    matrix.compose(new THREE.Vector3(tree.x,ground+tree.trunkHeight/2,tree.z),quaternion,new THREE.Vector3(1,tree.trunkHeight,1));trunks.setMatrixAt(i,matrix);
    matrix.compose(new THREE.Vector3(tree.x,ground+tree.trunkHeight+tree.height*.42,tree.z),quaternion,new THREE.Vector3(tree.radius,tree.height*.72,tree.radius));crowns.setMatrixAt(i,matrix);
    matrix.compose(new THREE.Vector3(tree.x,ground+tree.trunkHeight+tree.height*.78,tree.z),quaternion,new THREE.Vector3(tree.radius*.68,tree.height*.55,tree.radius*.68));upperCrowns.setMatrixAt(i,matrix);
  }
  for(const mesh of[trunks,crowns,upperCrowns]){mesh.castShadow=true;mesh.receiveShadow=true;mesh.instanceMatrix.needsUpdate=true;scene.add(mesh);}
  scene.userData.environmentTreeCount=trees.length;
}

export interface SceneSize{width:number;height:number}

export class RenderScene{
  renderer:any|null=null;
  scene:any|null=null;
  root=new THREE.Group();
  previewGroup=new THREE.Group();
  buildingPreviewGroup=new THREE.Group();
  private contextRecoveryPending=false;

  init(canvas:HTMLCanvasElement){
    if(this.renderer)return;
    const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance',stencil:false,depth:true});
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,globalThis.innerWidth<700?1.25:2));
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.contextRecoveryPending=true;},{passive:false});
    canvas.addEventListener('webglcontextrestored',()=>{this.contextRecoveryPending=false;},{passive:true});
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    const scene=new THREE.Scene();scene.background=new THREE.Color('#b9c6b0');scene.fog=new THREE.Fog('#b9c6b0',900,2600);
    this.root=new THREE.Group();this.previewGroup=new THREE.Group();this.buildingPreviewGroup=new THREE.Group();
    scene.add(this.root,this.previewGroup,this.buildingPreviewGroup,new THREE.HemisphereLight('#f5f8f4','#536057',1.55));
    const sun=new THREE.DirectionalLight('#fff5dc',2);sun.position.set(-300,480,260);sun.castShadow=true;sun.shadow.mapSize.set(globalThis.innerWidth<700?1024:2048,globalThis.innerWidth<700?1024:2048);sun.shadow.camera.near=10;sun.shadow.camera.far=1600;sun.shadow.camera.left=-600;sun.shadow.camera.right=600;sun.shadow.camera.top=600;sun.shadow.camera.bottom=-600;scene.add(sun);
    box(scene,2600,2,2600,material('#708762',1),0,-7,0,0,false);
    const grass=material('#78996a',1),grassCenterY=GRASS_SURFACE_Y-.06,riverBankHalfWidth=42;
    // Split the grass surface around the curved river; one instanced mesh keeps mobile draw calls low.
    const grassStrips:Array<{x:number;width:number;depth:number;z:number}>=[];
    for(let x=-1300;x<1300;x+=52){
      const x2=Math.min(1300,x+52),width=x2-x+1,riverCenter=(riverY(x)+riverY(x2))/2;
      const northEnd=riverCenter-riverBankHalfWidth,southStart=riverCenter+riverBankHalfWidth;
      const northDepth=northEnd+1300,southDepth=1300-southStart;
      if(northDepth>0)grassStrips.push({x:(x+x2)/2,width,depth:northDepth,z:(-1300+northEnd)/2});
      if(southDepth>0)grassStrips.push({x:(x+x2)/2,width,depth:southDepth,z:(southStart+1300)/2});
    }
    const grassMesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),grass,grassStrips.length),grassMatrix=new THREE.Matrix4(),grassQuaternion=new THREE.Quaternion();
    for(let i=0;i<grassStrips.length;i++){
      const strip=grassStrips[i];
      grassMatrix.compose(new THREE.Vector3(strip.x,grassCenterY,strip.z),grassQuaternion,new THREE.Vector3(strip.width,.12,strip.depth));
      grassMesh.setMatrixAt(i,grassMatrix);
    }
    grassMesh.instanceMatrix.needsUpdate=true;grassMesh.receiveShadow=true;scene.add(grassMesh);
    const river=material('#65929d',.7,.05);
    for(let x=-1300;x<1300;x+=44){const x2=Math.min(1300,x+52),mid=(x+x2)/2,dy=riverY(x2)-riverY(x),ang=Math.atan2(dy,x2-x);box(scene,Math.hypot(x2-x,dy)+12,WATER_THICKNESS,82,river,mid,WATER_CENTER_Y,(riverY(x)+riverY(x2))/2,-ang,false);}
    addForest(scene);
    this.renderer=renderer;this.scene=scene;
  }
  resize(width:number,height:number){this.renderer?.setSize(Math.max(1,width),Math.max(1,height),false);}
  get ready(){return !!this.renderer&&!!this.scene;}
  get recovering(){return this.contextRecoveryPending;}
  clearRoot(){for(const child of[...this.root.children]){this.root.remove(child);disposeObjectGroup(child);}}
  render(camera:any){if(!this.renderer||!this.scene||this.contextRecoveryPending)return;this.renderer.render(this.scene,camera);}
}
