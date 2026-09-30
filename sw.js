const CACHE='mini-factories-v1';
const APP_SHELL=[
  './',
  './index.html',
  './styles.css?v=1.0.6',
  './src/game.js?v=1.0.7',
  './src/state.js',
  './src/world.js',
  './src/economy.js',
  './src/render.js',
  './src/render3d.js',
  './src/three.module.js',
  './icon.svg',
  './manifest.webmanifest'
];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  event.respondWith(caches.match(event.request).then(cached=>{
    if(cached)return cached;
    return fetch(event.request).then(response=>{
      if(response.ok)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));
      return response;
    }).catch(()=>caches.match('./index.html'));
  }));
});
