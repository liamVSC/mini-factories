import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/+esm?v=6';
import {riverY} from '../world.js';
import {box,disposeObjectGroup,material} from './three.js';

export interface SceneSize{width:number;height:number}

function addForest(scene:any){
  const trunk=new THREE.MeshStandardMaterial({color:'#6b4b32',roughness:.98});
  const leavesA=new THREE.MeshStandardMaterial({color:'#3e6b45',roughness:.96});
  const leavesB=new THREE.MeshStandardMaterial({color:'#527c4e',roughness:.96});
  const trunkGeo=new THREE.CylinderGeometry(1.15,1.4,8,7), lowerGeo=new THREE.ConeGeometry(6,12,8), upperGeo=new THREE.ConeGeometry(4.4,10,8);
  const positions:Array<{x:number;z:number;s:number}>=[];
  const patches:[number,number,number][]=[[-930,-760,210],[760,-900,190],[980,720,190],[-1040,300,170]];
  let seed=173;
  for(const [cx,cz,radius] of patches)for(let i=0;i<28;i++){
    seed=(seed*1664525+1013904223)>>>0;const angle=seed/4294967296*Math.PI*2;
    seed=(seed*1664525+1013904223)>>>0;const d=Math.sqrt(seed/4294967296)*radius;
    const x=cx+Math.cos(angle)*d,z=cz+Math.sin(angle)*d;if(Math.abs(z-riverY(x))<72)continue;positions.push({x,z,s:.78+((seed>>>8)%40)/100});
  }
  const make=(geo:any,mat:any,y:number)=>{const mesh=new THREE.InstancedMesh(geo,mat,positions.length),matrix=new THREE.Matrix4();for(let i=0;i<positions.length;i++){const p=positions[i];matrix.compose(new THREE.Vector3(p.x,y*p.s,p.z),new THREE.Quaternion(),new THREE.Vector3(p.s,p.s,p.s));mesh.setMatrixAt(i,matrix);}mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=true;mesh.receiveShadow=true;return mesh;};
  const forest=new THREE.Group();forest.name='forest-resource-layer';forest.add(make(trunkGeo,trunk,4),make(lowerGeo,leavesA,11),make(upperGeo,leavesB,17));scene.add(forest);
}

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
    box(scene,2600,2,2600,material('#708762',1),0,-7,0,0,false);box(scene,2600,.12,2600,material('#78996a',1),0,.20,0,0,false);
    const river=material('#65929d',.7,.05);
    for(let x=-1300;x<1300;x+=44){const x2=Math.min(1300,x+52),mid=(x+x2)/2,dy=riverY(x2)-riverY(x),ang=Math.atan2(dy,x2-x);box(scene,Math.hypot(x2-x,dy)+12,.08,82,river,mid,.10,(riverY(x)+riverY(x2))/2,-ang,false);}
    addForest(scene);this.renderer=renderer;this.scene=scene;
  }
  resize(width:number,height:number){this.renderer?.setSize(Math.max(1,width),Math.max(1,height),false);}
  get ready(){return !!this.renderer&&!!this.scene;}
  get recovering(){return this.contextRecoveryPending;}
  clearRoot(){for(const child of[...this.root.children]){this.root.remove(child);disposeObjectGroup(child);}}
  render(camera:any){if(!this.renderer||!this.scene||this.contextRecoveryPending)return;this.renderer.render(this.scene,camera);}
}
