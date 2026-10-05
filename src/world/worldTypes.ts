import type { Point } from './roads/geometry.js';
export type { Point };
export interface Road { id:string; points:Point[]; age?:number; condition?:number; bridge?:boolean; [key:string]:unknown }
export interface Truck { route?:Point[]; routeSegments?:Road[]; routeInvalidated?:boolean; [key:string]:unknown }
export interface RoadEdge { a:Point; b:Point; d:number; road?:Road }
export interface RoadNetwork { nodes:Point[]; edges:RoadEdge[]; adjacency:Map<Point,{node:Point;d:number;road?:Road}[]>; junctions:Point[] }
