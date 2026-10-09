import type { GameContext } from './types.js';

const boundContexts = new WeakSet<object>();

export function bindLifecycle(ctx:GameContext,loop:{resume():void;suspend():void}){
  if(boundContexts.has(ctx))return;
  boundContexts.add(ctx);

  window.addEventListener('pagehide',loop.suspend,{capture:true});
  window.addEventListener('beforeunload',()=>ctx.save(true),{capture:true});
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden')loop.suspend();
    else loop.resume();
  },{passive:true});
  window.addEventListener('freeze',loop.suspend,{passive:true});
  window.addEventListener('pageshow',loop.resume,{capture:true});
  window.addEventListener('online',()=>{
    ctx.save(true);
    loop.resume();
    ctx.flash('Back online — game state recovered');
  },{passive:true});
  window.addEventListener('offline',()=>{
    ctx.save(true);
    ctx.flash('Offline mode — progress is saved locally');
  },{passive:true});

  if('serviceWorker' in navigator){
    // Begin installation as soon as the game bootstraps so the first background/resume cycle is cache-ready.
    navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).catch(()=>{});
  }
}
