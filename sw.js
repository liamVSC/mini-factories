const CACHE='mini-factories-v271';
const VERSION='2.1.60';
const APP_SHELL=[
  './','./index.html','./styles.css?v=1','./dist/game.js?v=28','./dist/version.js?v=28','./dist/state.js','./dist/world.js','./dist/economy.js',
  './dist/core/types.js','./dist/core/rng.js','./dist/core/ids.js','./dist/commands.js','./dist/junctionControl.js',
  './dist/world/terrain.js','./dist/world/buildings/spawning.js','./dist/world/buildings/index.js','./dist/world/buildings/layout.js','./dist/world/buildings/geometry.js','./dist/world/buildings/connections.js','./dist/world/buildings/placement.js','./dist/world/buildings/operations.js',
  './dist/world/roads/index.js','./dist/world/roads/creation.js','./dist/world/roads/editing.js','./dist/world/roads/geometry.js','./dist/world/roads/intersections.js','./dist/world/roads/placement.js','./dist/world/roads/routing.js','./dist/world/roads/topology.js','./dist/world/roads/validation.js',
  './dist/laneGraph.js','./dist/persistence/save.js','./dist/persistence/load.js','./dist/persistence/recovery.js',
  './dist/render.js?v=5','./dist/render3d-clean.js?v=9','./dist/rendering/buildingTransform.js','./dist/rendering/sitePlan.js','./icon.svg','./manifest.webmanifest',
  'https://cdn.jsdelivr.net/npm/three@0.180.0/+esm?v=6'
];
const EXTERNAL_ASSETS=new Set(['https://cdn.jsdelivr.net/npm/three@0.180.0/+esm?v=6']);

async function cacheShell(){
  const cache=await caches.open(CACHE);
  await Promise.allSettled(APP_SHELL.map(url=>cache.add(url)));
}

async function notifyClients(){
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of clients)client.postMessage({type:'mini-factories-update',version:VERSION});
}

self.addEventListener('install',event=>{
  event.waitUntil(cacheShell().then(notifyClients));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});

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
    throw new Error('Offline navigation unavailable');
  }finally{
    clearTimeout(timer);
  }
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

  if(cached){
    refresh.catch(()=>{});
    return cached;
  }

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
  event.respondWith(isNavigation?networkFirst(event.request):staleWhileRevalidate(event.request));
});
