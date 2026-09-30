const CACHE='mini-factories-v1.0';
const APP_SHELL=[
  './',
  './index.html',
  './styles.css?v=1.0.22',
  './src/game.js?v=1.0.22',
  './src/state.js',
  './src/world.js',
  './src/economy.js',
  './src/render.js',
  './src/render3d.js',
  './icon.svg',
  './manifest.webmanifest',
  'https://cdn.jsdelivr.net/npm/three@0.180.0/+esm'
];
const EXTERNAL_ASSETS=new Set(['https://cdn.jsdelivr.net/npm/three@0.180.0/+esm']);
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(async cache=>{await Promise.allSettled(APP_SHELL.map(url=>cache.add(url)));}).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url),external=EXTERNAL_ASSETS.has(event.request.url);
  if(url.origin!==self.location.origin&&!external)return;
  event.respondWith((async()=>{
    const cached=await caches.match(event.request);
    try{
      const response=await fetch(event.request);
      if(response.ok||response.type==='opaque'){const cache=await caches.open(CACHE);await cache.put(event.request,response.clone());}
      return response;
    }catch{
      if(cached)return cached;
      if(url.origin===self.location.origin)return caches.match('./index.html');
      throw new Error('Offline external asset unavailable');
    }
  })());
});
