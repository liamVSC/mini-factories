import {TYPES,makeBuilding} from '../../state.js';
import {newId} from '../../core/ids.js';
export function smartSpawnBuilding(s,kind,forced,placementReason){
  const pool=TYPES.filter(t=>t.kind===kind&&(!forced||t.name===forced));
  if(!pool.length)return null;
  return null;
}
