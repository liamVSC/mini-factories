import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/+esm?v=6';
import {riverY} from '../world.js';
import {box,disposeObjectGroup,material} from './three.js';

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
    box(scene,2600,2,2600,material('#708762',1),0,-7,0,0,false);box(scene,2600,.12,2600,material('#78996a',1),0,.02,0,0,false);
    const river=material('#65929d',.7,.05);
    for(let x=-1300;x<1300;x+=44){const x2=Math.min(1300,x+52),mid=(x+x2)/2,dy=riverY(x2)-riverY(x),ang=Math.atan2(dy,x2-x);box(scene,Math.hypot(x2-x,dy)+12,.65,82,river,mid,.05,(riverY(x)+riverY(x2))/2,-ang,false);}
    this.renderer=renderer;this.scene=scene;
  }
  resize(width:number,height:number){this.renderer?.setSize(Math.max(1,width),Math.max(1,height),false);}
  get ready(){return !!this.renderer&&!!this.scene;}
  get recovering(){return this.contextRecoveryPending;}
  clearRoot(){for(const child of[...this.root.children]){this.root.remove(child);disposeObjectGroup(child);}}
  render(camera:any){if(!this.renderer||!this.scene||this.contextRecoveryPending)return;this.renderer.render(this.scene,camera);}
}
