const CACHE='mini-factories-v1-r2';
const APP_SHELL=[
  './','./index.html','./styles.css?v=1','./dist/game.js?v=1','./dist/version.js?v=1','./dist/state.js','./dist/world.js','./dist/economy.js',
  './dist/core/types.js','./dist/core/rng.js','./dist/core/ids.js','./dist/commands.js','./dist/junctionControl.js',
  './dist/world/terrain.js','./dist/world/buildings/spawning.js','./dist/world/buildings/index.js','./dist/world/buildings/layout.js','./dist/world/buildings/geometry.js','./dist/world/buildings/connections.js','./dist/world/buildings/placement.js','./dist/world/buildings/operations.js',
  './dist/world/roads/index.js','./dist/world/roads/creation.js','./dist/world/roads/editing.js','./dist/world/roads/geometry.js','./dist/world/roads/intersections.js','./dist/world/roads/placement.js','./dist/world/roads/routing.js','./dist/world/roads/topology.js','./dist/world/roads/validation.js',
  './dist/laneGraph.js','./dist/persistence/save.js','./dist/persistence/load.js','./dist/persistence/recovery.js',
  './dist/game/bootstrap.js','./dist/game/build-ui.js','./dist/game/camera.js','./dist/game/input.js','./dist/game/lifecycle.js','./dist/game/loop.js','./dist/game/road-ui.js','./dist/game/ui.js',
  './dist/render.js','./dist/render.js?v=1','./dist/render3d-clean.js','./dist/render3d-clean.js?v=1','./dist/render3d.js',
  './dist/rendering/buildingTransform.js','./dist/rendering/buildings.js','./dist/rendering/camera.js','./dist/rendering/preview.js','./dist/rendering/roads.js','./dist/rendering/scene.js','./dist/rendering/sitePlan.js','./dist/rendering/surfaceHeights.js','./dist/rendering/three.js','./dist/rendering/trucks.js',
  './dist/version.js','./dist/world/worldTypes.js','./icon.svg','./manifest.webmanifest'
];
const EXTERNAL_ASSETS=new Set(['https://cdn.jsdelivr.net/npm/three@0.180.0/+esm?v=6']);

async function cacheExternalAsset(url,cache){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),4000);
  try{
    const response=await fetch(url,{mode:'cors',cache:'no-store',signal:controller.signal});
    if(response.ok)await cache.put(url,response.clone());
  }catch{
    // A slow CDN must not keep the service worker stuck in the installing state.
  }finally{
    clearTimeout(timer);
  }
}

async function cacheShell(){
  const cache=await caches.open(CACHE);
  const localCaching=Promise.allSettled(APP_SHELL.map(url=>cache.add(url)));
  // Never let one stalled local asset prevent the worker from activating and claiming the page.
  await Promise.race([localCaching,new Promise(resolve=>setTimeout(resolve,5000))]);
  const externalCaching=Promise.allSettled([...EXTERNAL_ASSETS].map(url=>cacheExternalAsset(url,cache)));
  // Cache writes can stall independently of fetch aborts; keep installation bounded as well.
  await Promise.race([externalCaching,new Promise(resolve=>setTimeout(resolve,4500))]);
}

self.addEventListener('install',event=>{
  event.waitUntil(cacheShell());
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
