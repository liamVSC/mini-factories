import type { GameState, Building, BuildingType } from '../state.js';
import type { Point } from '../world/worldTypes.js';
import type { CommandHistory } from '../commands.js';

export interface Viewport { width:number; height:number; }

export interface GameContext {
  state: GameState;
  commands: CommandHistory;
  viewport: Viewport;
  canvas: HTMLCanvasElement;
  buildFilter: string;
  buildMenuOpen: boolean;
  roadEditAction: 'remove'|null;
  drag: RoadDragState | null;
  markWorldDirty():void;
  save(force?:boolean):void;
  sync(force?:boolean):void;
  flash(message:string):void;
  setMenuActive(id:string|null):void;
  showPanel(building:Building):void;
  hidePanel():void;
  closeBuildMenu():void;
  closeRoadEditor():void;
  startRoadFromPoint(point:Point):void;
  setRoadEditAction(action:'remove'):void;
  setRoadEditorOpen(open:boolean):void;
  toggleRoadMode():void;
  reset():void;
  resize():void;
  resetCamera():void;
  resumeGameLoop():void;
  suspendGameLoop():void;
  updatePlacementPreview(point:Point|null):void;
  clearPlacementPreview():void;
}

export interface RoadDragState { start:Point; current:Point; }
export interface RoadBuildEntry { name:'Road'; kind:'road'; role:string; desc:string; }
export interface BuildDragState {
  type:BuildingType|RoadBuildEntry;
  pointerId:number;
  startX:number;
  startY:number;
  dragging:boolean;
  cancelled:boolean;
}
export type PanelMode = 'none'|'building'|'build'|'company'|'research';
