import {addRoad,eraseRoad,editRoadEndpoint,roadEndpointPreview,roadSegmentAtPoint} from './world/roads/index.js';
import {placeBuilding} from './world/buildings/index.js';
import type { GameState } from './state.js';
import type { Point } from './world/worldTypes.js';

type Snapshot = Record<string,unknown>;
export interface CommandResult { ok:boolean; reason?:string; result?:unknown; snapshot?:Snapshot; label?:string }

function clone<T>(value:T):T{
  if(typeof structuredClone==='function')return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}
function snapshot(state:GameState,keys:string[]):Snapshot{
  const out:Snapshot={};
  for(const key of keys)out[key]=clone((state as unknown as Record<string,unknown>)[key]);
  return out;
}
function restore(state:GameState,data:Snapshot):void{
  const target=state as unknown as Record<string,unknown>;
  for(const [key,value] of Object.entries(data))target[key]=clone(value);
}

export class CommandHistory{
  limit:number; undoStack:{command:MutationCommand;snapshot:Snapshot}[]=[]; redoStack:{command:MutationCommand;snapshot:Snapshot}[]=[];
  constructor(limit=100){this.limit=limit}
  execute(state:GameState,command:MutationCommand):CommandResult{
    const result=command.execute(state);if(!result.ok)return result;
    this.undoStack.push({command,snapshot:result.snapshot!});if(this.undoStack.length>this.limit)this.undoStack.shift();this.redoStack.length=0;return result;
  }
  undo(state:GameState):boolean{
    const entry=this.undoStack.pop();if(!entry)return false;restore(state,entry.snapshot);this.redoStack.push(entry);return true;
  }
  clear():void{this.undoStack.length=0;this.redoStack.length=0}
}

class MutationCommand{
  label:string;keys:string[];
  constructor(label:string,keys:string[]){this.label=label;this.keys=keys}
  execute(state:GameState):CommandResult{
    const validation=this.validate(state);if(!validation.ok)return validation;
    const before=snapshot(state,this.keys),result=this.apply(state);
    if(result===false||result==null)return{ok:false,reason:'mutation-failed',result};
    return{ok:true,result,snapshot:before,label:this.label};
  }
  validate(_state:GameState):CommandResult{return{ok:true}}
  apply(_state:GameState):unknown{return false}
}

export class AddRoadCommand extends MutationCommand{
  points:Point[];meta:Record<string,unknown>;
  constructor(points:Point[],meta:Record<string,unknown>={}){super('add-road',['roads','cash','trucks','roadNetworkRevision','trafficReservations']);this.points=points;this.meta=meta}
  validate(_state:GameState):CommandResult{return!Array.isArray(this.points)||this.points.length<2?{ok:false,reason:'invalid'}:{ok:true}}
  apply(state:GameState):unknown{const result=addRoad(state,this.points,this.meta);return result===true?result:false}
}
export class DeleteRoadCommand extends MutationCommand{
  point:Point;
  constructor(point:Point){super('delete-road',['roads','trucks','roadNetworkRevision','trafficReservations']);this.point=point}
  validate(state:GameState):CommandResult{return roadSegmentAtPoint(state,this.point)?{ok:true}:{ok:false,reason:'no-road'}}
  apply(state:GameState):unknown{return eraseRoad(state,this.point)}
}
export class MoveRoadEndpointCommand extends MutationCommand{
  roadId:string;index:number;point:Point;
  constructor(roadId:string,index:number,point:Point){super('move-road-endpoint',['roads','trucks','roadNetworkRevision','trafficReservations']);this.roadId=roadId;this.index=index;this.point=point}
  validate(state:GameState):CommandResult{
    const road=state.roads.find(r=>r?.id===this.roadId);if(!road)return{ok:false,reason:'road-not-found'};
    const preview=roadEndpointPreview(state,road,this.index,this.point);
    return preview&&!preview.blocked&&!preview.duplicate?{ok:true}:{ok:false,reason:'invalid-endpoint'};
  }
  apply(state:GameState):unknown{return editRoadEndpoint(state,this.roadId,this.index,this.point)||false}
}
export class PlaceBuildingCommand extends MutationCommand{
  type:string;x:number;y:number;
  constructor(type:string,x:number,y:number){super('place-building',['buildings','cash']);this.type=type;this.x=x;this.y=y}
  validate(_state:GameState):CommandResult{return!this.type||!Number.isFinite(this.x)||!Number.isFinite(this.y)?{ok:false,reason:'invalid-placement'}:{ok:true}}
  apply(state:GameState):unknown{return placeBuilding(state,this.type,this.x,this.y)||false}
}
export function executeCommand(history:CommandHistory,state:GameState,command:MutationCommand):CommandResult{return history.execute(state,command)}
export function createCommandHistory(limit=100):CommandHistory{return new CommandHistory(limit)}
