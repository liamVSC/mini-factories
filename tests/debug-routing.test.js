import test from 'node:test';
const {freshState,makeBuilding}=await import('../src/state.js');
const {routeOnRoadNetwork}=await import('../src/world/roads/routing.js');
const {buildingRoadAttachment}=await import('../src/world/buildings/connections.js');
const {roadNetwork,nearestGraphNode,shortestRoadPath}=await import('../src/world/roads/topology.js');
test('debug routing state',()=>{
 const s=freshState();
 const f=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'factory-1');
 const sh=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},200,0,'shop-1');
 s.buildings.push(f,sh);
 s.roads=[
 {id:'upper-a',points:[{x:0,y:0},{x:0,y:100}],bridge:false,condition:1,age:0},
 {id:'upper-b',points:[{x:0,y:100},{x:200,y:100}],bridge:false,condition:1,age:0},
 {id:'upper-c',points:[{x:200,y:100},{x:200,y:0}],bridge:false,condition:1,age:0}
 ];
 console.log('ATT',buildingRoadAttachment(s,f),buildingRoadAttachment(s,sh));
 const a=buildingRoadAttachment(s,f),b=buildingRoadAttachment(s,sh);
 const ap=a.roadPoint||a.point,bp=b.roadPoint||b.point; const n=roadNetwork(s,[ap,bp]),start=nearestGraphNode(n,ap),end=nearestGraphNode(n,bp);
 console.log('GRAPH',n.nodes.map(p=>[p.x,p.y]),n.edges.map(e=>[[e.a.x,e.a.y],[e.b.x,e.b.y],e.d]),'near',start,end,'short',shortestRoadPath(n,start,end));
 console.log('ROUTE',routeOnRoadNetwork(s,f,sh));
});
