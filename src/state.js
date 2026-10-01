import {TYPES} from './core/types.js';
export {TYPES};
export function freshState(){return{gameSeed:Math.floor(Math.random()*0x7fffffff),layoutSeed:Math.floor(Math.random()*0x7fffffff),cash:500,orders:0,companyLevel:1,xp:0,xpToNext:100,reputation:100,roads:[],buildings:[],trucks:[],particles:[],selected:null,mode:'select',paused:false,gameOver:false,congestion:0,objective:0,goals:goalList(),deliveryIncome:0,deliveredBy:{},longContracts:0,contractId:1,renderVersion:0,research:{automation:0,logistics:0,industry:0},trafficSignals:{enabled:false,cycle:12},trafficSettings:{laneChanges:true,priority:'arrival'},roadNetworkRevision:0,buildMode:null,camera:{x:(globalThis.innerWidth||1280)/2,y:(globalThis.innerHeight||720)/2,zoom:1}}}
export function goalList(){return[
 {text:'Deliver 10 Food orders',target:10,progress:s=>s.deliveredBy.Food||0,done:s=>(s.deliveredBy.Food||0)>=10},
 {text:'Earn £1,000 from deliveries',target:1000,progress:s=>s.deliveryIncome,done:s=>s.deliveryIncome>=1000},
 {text:'Upgrade a factory to Level 3',target:1,progress:s=>s.buildings.some(b=>b.kind==='factory'&&b.level>=3)?1:0,done:s=>s.buildings.some(b=>b.kind==='factory'&&b.level>=3)},
 {text:'Complete 3 long-distance deliveries',target:3,progress:s=>s.longContracts,done:s=>s.longContracts>=3},
 {text:'Keep congestion below 30%',target:1,progress:s=>s.congestion<.3?1:0,done:s=>s.congestion<.3},
 {text:'Reach Company Level 5',target:5,progress:s=>s.companyLevel,done:s=>s.companyLevel>=5}
]}
export function makeBuilding(type,x,y,id){return{id,x,y,r:25,storage:type.kind==='warehouse'?0:0,type:type.name,kind:type.kind,need:type.need||null,color:type.color,level:1,stock:0,max:type.kind==='factory'?4:type.kind==='warehouse'?24:8,production:0,demand:type.kind==='shop'?3:0,served:0,satisfaction:type.kind==='shop'?100:0,inventory:type.kind==='warehouse'?{}:null,loading:0,logistics:0,contract:null,district:'',pulse:Math.random()*6.28,active:0}}
