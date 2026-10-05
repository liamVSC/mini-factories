export interface SavedBuilding { x?: unknown; y?: unknown; [key:string]: unknown }
export interface WorldPosition { x:number; z:number }
export interface NdcPosition { x:number; y:number; w:number }
export interface BuildingRenderTrace { saved:{x:number;y:number}; world:{x:number;z:number}; ndc:{x:number;y:number}; clipW:number }

export function savedBuildingToWorldPosition(building:SavedBuilding|null|undefined):WorldPosition|null {
  const x=Number(building?.x),z=Number(building?.y);
  if(!Number.isFinite(x)||!Number.isFinite(z))return null;
  return{x,z};
}

export function projectWorldPointToNdc(position:WorldPosition|null|undefined,matrixElements:number[]|null|undefined):NdcPosition|null {
  if(!position||!Array.isArray(matrixElements)||matrixElements.length!==16)return null;
  const {x,z}=position,m=matrixElements;
  const clipX=m[0]*x+m[8]*z+m[12];
  const clipY=m[1]*x+m[9]*z+m[13];
  const clipW=m[3]*x+m[11]*z+m[15];
  if(!Number.isFinite(clipW)||Math.abs(clipW)<1e-9)return null;
  return{x:clipX/clipW,y:clipY/clipW,w:clipW};
}

export function buildingRenderTrace(building:SavedBuilding|null|undefined,worldPosition:WorldPosition|null|undefined,matrixElements:number[]|null|undefined):BuildingRenderTrace|null {
  const saved=savedBuildingToWorldPosition(building);
  const ndc=projectWorldPointToNdc(worldPosition,matrixElements);
  if(!saved||!worldPosition||!ndc)return null;
  return{saved:{x:saved.x,y:saved.z},world:{x:worldPosition.x,z:worldPosition.z},ndc:{x:ndc.x,y:ndc.y},clipW:ndc.w};
}
