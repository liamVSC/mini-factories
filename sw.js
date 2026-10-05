const CACHE='mini-factories-v214';
const VERSION='2.1.4';
const APP_SHELL=[
  './','./index.html','./styles.css?v=1','./src/game.js?v=8','./src/version.js','./src/state.js','./src/world.js','./src/economy.js',
  './src/core/types.js','./src/core/rng.js','./src/core/ids.js','./src/commands.js','./src/junctionControl.js',
  './src/world/terrain.js','./src/world/buildings/spawning.js','./src/world/buildings/index.js','./src/world/buildings/layout.js','./src/world/buildings/geometry.js','./src/world/buildings/connections.js','./src/world/buildings/placement.js','./src/world/buildings/operations.js',
  './src/world/roads/index.js','./src/world/roads/creation.js','./src/world/roads/editing.js','./src/world/roads/geometry.js','./src/world/roads/intersections.js','./src/world/roads/placement.js','./src/world/roads/routing.js','./src/world/roads/topology.js','./src/world/roads/validation.js',
  './src/laneGraph.js','./src/persistence/save.js','./src/persistence/load.js','./src/persistence/recovery.js',
  './src/render.js?v=4','./src/render3d-clean.js?v=8','./src/rendering/buildingTransform.js','./src/rendering/sitePlan.js','./icon.svg','./manifest.webmanifest',
  'https://cdn.jsdelivr.net/npm/three@0.180.0/+esm'
];
const EXTERNAL_ASSETS=new Set(['https://cdn.jsdelivr.net/npm/three@0.180.0/+esm']);

async function cacheShell(){
  const cache=await caches.open(CACHE);
  await Promise.allSettled(APP_SHELL.map(url=>cache.add(url)));
}
self.addEventListener('install',event=>{event.waitUntil(cacheShell().then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim())
    .then(async()=>{
      const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
      for(const client of clients)client.postMessage({type:'mini-factories-update',version:VERSION});
    })
);});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});

async function networkFirst(request){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),2500);
  try{
    const response=await fetch(request,{cache:'no-store',signal:controller.signal});
    if(response.ok){
      const cache=await caches.open(CACHE);
      await cache.put(request,response.clone());
    }
    return response;
  }catch{
    const cached=await caches.match(request);
    if(cached)return cached;
    return caches.match('./index.html');
  }finally{clearTimeout(timer);}
}
async function staleWhileRevalidate(request){
  const cached=await caches.match(request);
  const refresh=fetch(request,{cache:'no-store'}).then(async response=>{
    if(response.ok||response.type==='opaque'){
      const cache=await caches.open(CACHE);
      await cache.put(request,response.clone());
    }
    return response;
  }).catch(()=>null);
  if(cached){refresh.catch(()=>{});return cached;}
  const response=await refresh;
  if(response)return response;
  throw new Error('Offline asset unavailable');
}
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  const external=EXTERNAL_ASSETS.has(event.request.url);
  if(url.origin!==self.location.origin&&!external)return;
  const isNavigation=event.request.mode==='navigate'||event.request.destination==='document';
  event.respondWith(networkFirst(event.request));
});
