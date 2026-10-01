export const TYPES=[
 {name:'Steel',kind:'factory',need:null,color:'#8bd5ff',price:24,speed:.84,value:1.08,qty:1.25},
 {name:'Food',kind:'factory',need:null,color:'#a7e66f',price:18,speed:1.28,value:.96,qty:.85},
 {name:'Parts',kind:'factory',need:null,color:'#c5a7ff',price:30,speed:.72,value:1.25,qty:1},
 {name:'Plastics',kind:'factory',need:null,color:'#f6a6ff',price:38,speed:.62,value:1.42,qty:1.1,unlock:'industry',unlockLevel:1},
 {name:'Glass',kind:'factory',need:null,color:'#7ee7e7',price:44,speed:.55,value:1.55,qty:.95,unlock:'industry',unlockLevel:2},
 {name:'Market',kind:'shop',need:'Food',color:'#ffd166',icon:'M',role:'Food retailer',desc:'Sells food to local customers.'},
 {name:'Garage',kind:'shop',need:'Parts',color:'#ff8f8f',icon:'G',role:'Vehicle service',desc:'Consumes parts for repairs.'},
 {name:'Builder',kind:'shop',need:'Steel',color:'#f4a261',icon:'B',role:'Construction supply',desc:'Consumes steel for building jobs.'},
 {name:'Electronics',kind:'shop',need:'Plastics',color:'#d6a8ff',icon:'E',role:'Electronics retailer',desc:'Consumes plastics for electronics demand.',unlock:'industry',unlockLevel:1},
 {name:'Furniture',kind:'shop',need:'Glass',color:'#90d9b4',icon:'F',role:'Furniture retailer',desc:'Consumes glass for furniture demand.',unlock:'industry',unlockLevel:2},
 {name:'Warehouse',kind:'warehouse',need:null,color:'#e9c46a',icon:'W',role:'Storage hub',desc:'Stores goods and connects production to retail.',unlock:'logistics',unlockLevel:1}
];
export function freshState(){return{cash:500,orders:0,companyLevel:1,xp:0,xpToNext:100,reputation:100,roads:[],buildings:[],trucks:[],particles:[],selected:null,mode:'select',paused:false,gameOver:false,congestion:0,objective:0,goals:goalList(),deliveryIncome:0,deliveredBy:{},longContracts:0,contractId:1,renderVersion:0,research:{automation:0,logistics:0,industry:0},trafficSignals:{enabled:false,cycle:12},buildMode:null,camera:{x:innerWidth/2,y:innerHeight/2,zoom:1}}}
export function goalList(){return[
 {text:'Deliver 10 Food orders',target:10,progress:s=>s.deliveredBy.Food||0,done:s=>(s.deliveredBy.Food||0)>=10},
 {text:'Earn £1,000 from deliveries',target:1000,progress:s=>s.deliveryIncome,done:s=>s.deliveryIncome>=1000},
 {text:'Upgrade a factory to Level 3',target:1,progress:s=>s.buildings.some(b=>b.kind==='factory'&&b.level>=3)?1:0,done:s=>s.buildings.some(b=>b.kind==='factory'&&b.level>=3)},
 {text:'Complete 3 long-distance deliveries',target:3,progress:s=>s.longContracts,done:s=>s.longContracts>=3},
 {text:'Keep congestion below 30%',target:1,progress:s=>s.congestion<.3?1:0,done:s=>s.congestion<.3},
 {text:'Reach Company Level 5',target:5,progress:s=>s.companyLevel,done:s=>s.companyLevel>=5}
]}
export function makeBuilding(type,x,y,id){return{id,x,y,r:25,storage:type.kind==='warehouse'?0:0,type:type.name,kind:type.kind,need:type.need||null,color:type.color,level:1,stock:0,max:type.kind==='factory'?4:type.kind==='warehouse'?24:8,production:0,demand:type.kind==='shop'?3:0,served:0,satisfaction:type.kind==='shop'?100:0,inventory:type.kind==='warehouse'?{}:null,loading:0,logistics:0,contract:null,district:'',pulse:Math.random()*6.28,active:0}}
export function serialise(s){const d={...s};delete d.week;delete d.weekTime;delete d.version;return{version:6,...d,selected:null,trucks:[],particles:[]}}
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
function clampNumber(value,min,max,fallback=min){return Math.max(min,Math.min(max,finite(value,fallback)))}
export function hydrate(d){if(!d||d.version<2||!Array.isArray(d.buildings)||!Array.isArray(d.roads))return null;const s=freshState();const keys=Object.keys(s);for(const k of keys)if(Object.prototype.hasOwnProperty.call(d,k)&&k!=='week'&&k!=='weekTime'&&k!=='version')s[k]=d[k];s.version=6;s.renderVersion=Math.max(0,Math.floor(finite(s.renderVersion,0)));s.selected=null;s.trucks=[];s.particles=[];s.goals=goalList();
s.cash=clampNumber(s.cash,0,Number.MAX_SAFE_INTEGER,500);
s.orders=Math.max(0,Math.floor(finite(s.orders,0)));
s.companyLevel=Math.max(1,Math.floor(finite(s.companyLevel,1)));
s.xp=Math.max(0,finite(s.xp,0));
s.xpToNext=Math.max(100,finite(s.xpToNext,100));

s.reputation=clampNumber(s.reputation,0,100,100);
s.deliveryIncome=Math.max(0,finite(s.deliveryIncome,0));
s.longContracts=Math.max(0,Math.floor(finite(s.longContracts,0)));
s.contractId=Math.max(1,Math.floor(finite(s.contractId,1)));
s.deliveredBy=s.deliveredBy&&typeof s.deliveredBy==='object'?s.deliveredBy:{};
for(const key of Object.keys(s.deliveredBy))s.deliveredBy[key]=Math.max(0,Math.floor(finite(s.deliveredBy[key],0)));
s.objective=Math.max(0,Math.min(5,Math.floor(finite(d.objective,0))));
s.research={...freshState().research,...(d.research||{})};
s.trafficSignals={...freshState().trafficSignals,...(d.trafficSignals||{})};
s.trafficSignals.enabled=!!s.trafficSignals.enabled;
s.trafficSignals.cycle=Math.max(8,Math.min(30,finite(s.trafficSignals.cycle,12)));
for(const key of Object.keys(s.research))s.research[key]=clampNumber(s.research[key],0,3,0);
s.buildings=s.buildings.filter(b=>b&&Number.isFinite(Number(b.x))&&Number.isFinite(Number(b.y))&&b.type&&b.kind).map(b=>{
  b.x=finite(b.x);b.y=finite(b.y);b.r=clampNumber(b.r,20,60,25);b.level=Math.max(1,Math.floor(finite(b.level,1)));
  b.max=Math.max(1,Math.floor(finite(b.max,b.kind==='factory'?4:b.kind==='warehouse'?24:8)));
  b.stock=Math.max(0,finite(b.stock,0));b.production=Math.max(0,finite(b.production,0));b.demand=Math.max(0,finite(b.demand,0));
  b.served=Math.max(0,finite(b.served,0));b.satisfaction=clampNumber(b.satisfaction,0,100,b.kind==='shop'?100:0);
  b.loading=Math.max(0,Math.floor(finite(b.loading,0)));b.logistics=Math.max(0,Math.floor(finite(b.logistics,0)));
  b.active=clampNumber(b.active,0,1,0);b.pulse=finite(b.pulse,Math.random()*6.28);
  if(b.kind==='warehouse'){b.storage=Math.max(0,finite(b.storage,0));b.storage=Math.min(b.storage,b.max);b.inventory=b.inventory&&typeof b.inventory==='object'?b.inventory:{}}
  return b;
});s.roads=s.roads.filter(r=>r&&Array.isArray(r.points)&&r.points.length>=2&&r.points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y))).map(r=>({...r,points:r.points.map(p=>({x:Number(p.x),y:Number(p.y)})),bridge:!!r.bridge,condition:Number.isFinite(r.condition)?r.condition:1,age:Number.isFinite(r.age)?r.age:0}));s.buildMode=null;return s}