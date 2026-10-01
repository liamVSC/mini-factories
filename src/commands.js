import {
  addRoad,
  eraseRoad,
  editRoadEndpoint,
  placeBuilding,
  roadEndpointPreview,
  buildingAtPoint,
  roadSegmentAtPoint
} from './world.js';

function clone(value){
  if(typeof structuredClone==='function')return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function snapshot(state,keys){
  const out={};
  for(const key of keys)out[key]=clone(state[key]);
  return out;
}

function restore(state,data){
  for(const [key,value] of Object.entries(data))state[key]=clone(value);
}

export class CommandHistory{
  constructor(limit=100){this.limit=limit;this.undoStack=[];this.redoStack=[]}
  execute(state,command){
    const result=command.execute(state);
    if(!result?.ok)return result;
    this.undoStack.push({command,snapshot:result.snapshot});
    if(this.undoStack.length>this.limit)this.undoStack.shift();
    this.redoStack.length=0;
    return result;
  }
  undo(state){
    const entry=this.undoStack.pop();
    if(!entry)return false;
    restore(state,entry.snapshot);
    this.redoStack.push(entry);
    return true;
  }
  clear(){this.undoStack.length=0;this.redoStack.length=0}
}

class MutationCommand{
  constructor(label,keys){this.label=label;this.keys=keys}
  execute(state){
    const validation=this.validate(state);
    if(!validation.ok)return validation;
    const before=snapshot(state,this.keys);
    const result=this.apply(state);
    if(result===false||result==null)return{ok:false,reason:'mutation-failed',result};
    return{ok:true,result,snapshot:before,label:this.label};
  }
  validate(){return{ok:true}}
  apply(){return false}
}

export class AddRoadCommand extends MutationCommand{
  constructor(points,meta={}){super('add-road',['roads','cash','trucks']);this.points=points;this.meta=meta}
  validate(state){
    if(!Array.isArray(this.points)||this.points.length<2)return{ok:false,reason:'invalid'};
    return{ok:true};
  }
  apply(state){const result=addRoad(state,this.points,this.meta);return result===true?result:false}
}

export class DeleteRoadCommand extends MutationCommand{
  constructor(point){super('delete-road',['roads','trucks']);this.point=point}
  validate(state){return roadSegmentAtPoint(state,this.point)?{ok:true}:{ok:false,reason:'no-road'}}
  apply(state){return eraseRoad(state,this.point)}
}

export class MoveRoadEndpointCommand extends MutationCommand{
  constructor(roadId,index,point){super('move-road-endpoint',['roads','trucks']);this.roadId=roadId;this.index=index;this.point=point}
  validate(state){
    const road=(state.roads||[]).find(r=>r?.id===this.roadId);
    if(!road)return{ok:false,reason:'road-not-found'};
    const preview=roadEndpointPreview(state,road,this.index,this.point);
    return preview&&!preview.blocked&&!preview.duplicate?{ok:true}:{ok:false,reason:'invalid-endpoint'};
  }
  apply(state){return editRoadEndpoint(state,this.roadId,this.index,this.point)||false}
}

export class PlaceBuildingCommand extends MutationCommand{
  constructor(type,x,y){super('place-building',['buildings','cash']);this.type=type;this.x=x;this.y=y}
  validate(state){
    if(!this.type||!Number.isFinite(this.x)||!Number.isFinite(this.y))return{ok:false,reason:'invalid-placement'};
    return{ok:true};
  }
  apply(state){return placeBuilding(state,this.type,this.x,this.y)||false}
}

export class SelectBuildingCommand{
  execute(state,buildingId){
    const building=(state.buildings||[]).find(b=>b?.id===buildingId)||null;
    state.selected=building;
    return building;
  }
}

export function executeCommand(history,state,command){
  return history.execute(state,command);
}

export function createCommandHistory(limit=100){
  return new CommandHistory(limit);
}
