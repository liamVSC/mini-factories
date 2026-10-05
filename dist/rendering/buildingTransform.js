export function savedBuildingToWorldPosition(building){
  const x=Number(building?.x),z=Number(building?.y);
  if(!Number.isFinite(x)||!Number.isFinite(z))return null;
  return{x,z};
}

export function projectWorldPointToNdc(position,matrixElements){
  if(!position||!Array.isArray(matrixElements)||matrixElements.length!==16)return null;
  const x=position.x,y=0,z=position.z,m=matrixElements;
  const clipX=m[0]*x+m[4]*y+m[8]*z+m[12];
  const clipY=m[1]*x+m[5]*y+m[9]*z+m[13];
  const clipW=m[3]*x+m[7]*y+m[11]*z+m[15];
  if(!Number.isFinite(clipW)||Math.abs(clipW)<1e-9)return null;
  return{x:clipX/clipW,y:clipY/clipW,w:clipW};
}

export function buildingRenderTrace(building,worldPosition,matrixElements){
  const saved=savedBuildingToWorldPosition(building);
  const ndc=projectWorldPointToNdc(worldPosition,matrixElements);
  if(!saved||!worldPosition||!ndc)return null;
  return{
    saved:{x:saved.x,y:saved.z},
    world:{x:worldPosition.x,z:worldPosition.z},
    ndc:{x:ndc.x,y:ndc.y},
    clipW:ndc.w
  };
}
