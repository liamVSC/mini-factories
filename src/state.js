export const TYPES=[
 {name:'Steel',kind:'factory',need:null,color:'#8bd5ff',price:24,speed:.84,value:1.08,qty:1.25},
 {name:'Food',kind:'factory',need:null,color:'#a7e66f',price:18,speed:1.28,value:.96,qty:.85},
 {name:'Parts',kind:'factory',need:null,color:'#c5a7ff',price:30,speed:.72,value:1.25,qty:1},
 {name:'Market',kind:'shop',need:'Food',color:'#ffd166',icon:'M',role:'Food retailer',desc:'Sells food to local customers.'},
 {name:'Garage',kind:'shop',need:'Parts',color:'#ff8f8f',icon:'G',role:'Vehicle service',desc:'Consumes parts for repairs.'},
 {name:'Builder',kind:'shop',need:'Steel',color:'#f4a261',icon:'B',role:'Construction supply',desc:'Consumes steel for building jobs.'}
];
export function freshState(){return{cash:500,orders:0,companyLevel:1,xp:0,xpToNext:100,roadBudget:10,reputation:100,roads:[],buildings:[],trucks:[],particles:[],selected:null,mode:'select',paused:false,gameOver:false,nextBuilding:20,congestion:0,objective:0,goals:goalList(),deliveryIncome:0,deliveredBy:{},longContracts:0,contractId:1,research:{automation:0,logistics:0,industry:0},camera:{x:innerWidth/2,y:innerHeight/2,zoom:1}}}
export function goalList(){return[
 {text:'Deliver 10 Food orders',target:10,progress:s=>s.deliveredBy.Food||0,done:s=>(s.deliveredBy.Food||0)>=10},
 {text:'Earn £1,000 from deliveries',target:1000,progress:s=>s.deliveryIncome,done:s=>s.deliveryIncome>=1000},
 {text:'Upgrade a factory to Level 3',target:1,progress:s=>s.buildings.some(b=>b.kind==='factory'&&b.level>=3)?1:0,done:s=>s.buildings.some(b=>b.kind==='factory'&&b.level>=3)},
 {text:'Complete 3 long-distance deliveries',target:3,progress:s=>s.longContracts,done:s=>s.longContracts>=3},
 {text:'Keep congestion below 30%',target:1,progress:s=>s.congestion<.3?1:0,done:s=>s.congestion<.3},
 {text:'Reach Company Level 5',target:5,progress:s=>s.companyLevel,done:s=>s.companyLevel>=5}
]}
export function makeBuilding(type,x,y,id){return{id,x,y,r:25,type:type.name,kind:type.kind,need:type.need||null,color:type.color,level:1,stock:0,max:type.kind==='factory'?4:8,production:0,demand:type.kind==='shop'?3:0,served:0,satisfaction:type.kind==='shop'?100:0,sales:0,loading:0,logistics:0,contract:null,district:'',pulse:Math.random()*6.28,active:0}}
export function serialise(s){return{version:5,...s,selected:null,trucks:[],particles:[]}}
export function hydrate(d){if(!d||d.version<2||!Array.isArray(d.buildings)||!Array.isArray(d.roads))return null;const s=freshState();Object.assign(s,d);s.version=5;s.selected=null;s.trucks=[];s.particles=[];s.goals=goalList();for(const b of s.buildings){b.r??=25;b.active??=0;b.pulse??=Math.random()*6.28}s.objective=Math.max(0,Math.min(5,Number(d.objective)||0));s.companyLevel=Math.max(1,Number(d.companyLevel)||1);s.xp=Math.max(0,Number(d.xp)||0);s.xpToNext=Math.max(100,Number(d.xpToNext)||100);s.research={...freshState().research,...(d.research||{})};return s}