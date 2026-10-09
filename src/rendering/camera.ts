import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/+esm?v=6';
import {WORLD_BOUNDS,WORLD_MARGIN} from '../world.js';

export interface CameraViewport{width:number;height:number}
export interface CameraSnapshot{x:number;z:number;yaw:number;pitch:number;distance:number}

const MIN_DISTANCE=180;
const MAX_DISTANCE=1250;
const MIN_PITCH=.35;
const MAX_PITCH=1.35;
const DEFAULT_DISTANCE=620;
const DEFAULT_PITCH=.82;
const DAMPING=.16;

function shortestAngleDelta(from:number,to:number){
  return Math.atan2(Math.sin(to-from),Math.cos(to-from));
}

export class RenderCamera{
  private readonly viewport:CameraViewport={width:1,height:1};
  private target:CameraSnapshot={x:0,z:0,yaw:0,pitch:DEFAULT_PITCH,distance:DEFAULT_DISTANCE};
  private desired:CameraSnapshot={...this.target};
  private camera:any|null=null;

  resize(width:number,height:number){this.viewport.width=Math.max(1,width||globalThis.innerWidth);this.viewport.height=Math.max(1,height||globalThis.innerHeight);if(this.camera){this.camera.aspect=this.viewport.width/this.viewport.height;this.camera.updateProjectionMatrix();}}
  get threeCamera(){if(!this.camera)this.camera=new THREE.PerspectiveCamera(46,this.viewport.width/this.viewport.height,2,3400);return this.camera;}
  update(){const p=Math.max(MIN_PITCH,Math.min(MAX_PITCH,this.target.pitch)),h=Math.cos(p)*this.target.distance,camera=this.threeCamera;camera.position.set(this.target.x+Math.sin(this.target.yaw)*h,Math.sin(p)*this.target.distance,this.target.z+Math.cos(this.target.yaw)*h);camera.lookAt(this.target.x,0,this.target.z);}
  interpolate(){
    this.target.x+=(this.desired.x-this.target.x)*DAMPING;
    this.target.z+=(this.desired.z-this.target.z)*DAMPING;
    this.target.yaw+=shortestAngleDelta(this.target.yaw,this.desired.yaw)*DAMPING;
    this.target.pitch+=(this.desired.pitch-this.target.pitch)*DAMPING;
    this.target.distance+=(this.desired.distance-this.target.distance)*DAMPING;
    this.update();
  }
  private bounds(){const limit=(WORLD_BOUNDS.maxX-WORLD_BOUNDS.minX)/2-WORLD_MARGIN;this.desired.x=Math.max(-limit,Math.min(limit,this.desired.x));this.desired.z=Math.max(-limit,Math.min(limit,this.desired.z));}
  control(dx:number,dy:number,distanceDelta=0,yawDelta=0,pitchDelta=0){
    this.desired.x+=dx;
    this.desired.z+=dy;
    this.desired.distance=Math.max(MIN_DISTANCE,Math.min(MAX_DISTANCE,this.desired.distance+distanceDelta));
    this.desired.yaw+=yawDelta;
    this.desired.pitch=Math.max(MIN_PITCH,Math.min(MAX_PITCH,this.desired.pitch+pitchDelta));
    this.bounds();
  }
  screenToWorld(x:number,y:number,width=this.viewport.width,height=this.viewport.height){this.update();const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(x/width*2-1,-y/height*2+1),this.threeCamera);const hit=new THREE.Vector3();return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),hit)?{x:hit.x,y:hit.z}:{x:0,y:0};}
  worldToScreen(x:number,y:number,width=this.viewport.width,height=this.viewport.height){this.update();const point=new THREE.Vector3(x,0,y).project(this.threeCamera);return{x:(point.x+1)*.5*width,y:(1-point.y)*.5*height};}
  panScreen(dx:number,dy:number,width=this.viewport.width,height=this.viewport.height){
    const a=this.screenToWorld(width/2,height/2,width,height),b=this.screenToWorld(width/2-dx,height/2-dy,width,height);
    this.desired.x+=b.x-a.x;
    this.desired.z+=b.y-a.y;
    this.bounds();
  }
  zoomAtScreen(x:number,y:number,zoom:number,width=this.viewport.width,height=this.viewport.height){
    const before=this.screenToWorld(x,y,width,height);
    const factor=Math.max(.55,Math.min(2.4,zoom));
    this.desired.distance=Math.max(MIN_DISTANCE,Math.min(MAX_DISTANCE,this.desired.distance/factor));
    this.update();
    const after=this.screenToWorld(x,y,width,height);
    this.desired.x+=before.x-after.x;
    this.desired.z+=before.y-after.y;
    this.bounds();
  }
  snapshot():CameraSnapshot{return {...this.desired};}
  restore(snapshot:CameraSnapshot){this.desired={...snapshot};this.target={...snapshot};this.bounds();this.update();}
  frame(x:number,z:number,distance=DEFAULT_DISTANCE,yaw=0,pitch=DEFAULT_PITCH){
    this.desired={x:Number(x)||0,z:Number(z)||0,yaw:Number(yaw)||0,pitch:Math.max(MIN_PITCH,Math.min(MAX_PITCH,Number(pitch)||DEFAULT_PITCH)),distance:Math.max(MIN_DISTANCE,Math.min(MAX_DISTANCE,Number(distance)||DEFAULT_DISTANCE))};
    this.target={...this.desired};
    this.bounds();
    this.update();
  }
  reset(){this.frame(0,0,DEFAULT_DISTANCE,0,DEFAULT_PITCH);}
  focus(x:number,y:number){this.desired.x=Number(x)||0;this.desired.z=Number(y)||0;this.bounds();}
}