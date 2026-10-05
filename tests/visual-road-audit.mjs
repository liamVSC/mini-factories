import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {extname,join,normalize,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};

function startServer(){return new Promise((resolveServer,reject)=>{const server=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=join(ROOT,normalize(pathname==='/'?'/index.html':pathname));if(!file.startsWith(ROOT)){res.writeHead(403);res.end();return;}const info=await stat(file);if(!info.isFile())throw new Error('not a file');res.writeHead(200,{'content-type':MIME[extname(file)]||'application/octet-stream','cache-control':'no-store'});createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end('Not found');}});server.listen(0,'127.0.0.1',()=>resolveServer({server,url:'http://127.0.0.1:'+server.address().port}));server.on('error',reject);});}

async function savedState(page){return page.evaluate(()=>{const raw=localStorage.getItem('miniFactoriesSaveV6');if(!raw)return null;try{return JSON.parse(raw)?.state||null}catch{return null}});}
function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}

async function exerciseRoad(page,points,beforeRoadCount){const canvas=page.locator('#game');await page.getByRole('button',{name:'Build'}).click();await page.locator('#road').click();const box=await canvas.boundingBox();assert.ok(box,'3D canvas must be present');const [a,b]=points;await page.mouse.move(box.x+box.width*a[0],box.y+box.height*a[1]);await page.mouse.down();await page.mouse.move(box.x+box.width*b[0],box.y+box.height*b[1],{steps:12});await page.mouse.up();await page.waitForFunction(expected=>{const raw=localStorage.getItem('miniFactoriesSaveV6');if(!raw)return false;try{return (JSON.parse(raw)?.state?.roads?.length||0)>expected}catch{return false}},beforeRoadCount,{timeout:5000});await page.waitForFunction(()=>typeof window.__miniFactoriesRenderDiagnostics==='function',{timeout:5000});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}

async function assertRenderedState(page,name,beforeState){
 const state=await savedState(page);assert.ok(state,name+': save state is missing');
 const d=await page.evaluate(()=>window.__miniFactoriesRenderDiagnostics());assert.ok(d.rendererReady&&d.sceneReady,name+': renderer/scene not ready');
 assert.equal(d.roadObjectCount,state.roads.length,name+': logical road count does not match rendered road object count');
 const byId=new Map(d.roadObjects.map(r=>[r.id,r]));assert.equal(byId.size,state.roads.length,name+': rendered road IDs are duplicated');
 for(const road of state.roads){const r=byId.get(road.id);assert.ok(r,name+': road '+road.id+' has no rendered object');assert.ok(r.objectChildren>0,name+': road '+road.id+' has no direct rendered children');assert.ok(r.objectDescendants>0,name+': road '+road.id+' has no rendered mesh/object descendants');assert.ok(r.visible,name+': road '+road.id+' render object is hidden');assert.ok(Array.isArray(road.points)&&road.points.length>=2,name+': road '+road.id+' has invalid logical geometry');assert.equal(r.logicalPoints.length,road.points.length,name+': road '+road.id+' rendered/logical point count mismatch');for(let i=0;i<road.points.length;i++)assert.ok(distance(r.logicalPoints[i],road.points[i])<.001,name+': road '+road.id+' rendered/logical point mismatch at '+i);const box=r.bounds;for(const p of [road.points[0],road.points.at(-1)])assert.ok(p.x>=box.min.x-25&&p.x<=box.max.x+25&&p.y>=box.min.z-25&&p.y<=box.max.z+25,name+': road '+road.id+' endpoint lies outside rendered bounds');}
 const buildings=new Map((state.buildings||[]).map(b=>[b.id,b]));const rendered=new Map(d.buildingObjects.map(b=>[b.id,b]));assert.equal(rendered.size,buildings.size,name+': logical building count does not match rendered building count');for(const b of buildings.values()){const r=rendered.get(b.id);assert.ok(r,name+': building '+b.id+' has no rendered anchor');assert.ok(Math.abs(r.position.x-b.x)<.001&&Math.abs(r.position.z-b.y)<.001,name+': building '+b.id+' rendered position does not match logical position');}
 if(beforeState)assert.ok(state.roads.length>beforeState.roads.length,name+': road count did not increase after creation');
}

async function assertUiControls(page,name){
 const panel=page.locator('#panel');
 const buildMenu=page.locator('#buildMenu');
 await page.getByRole('button',{name:'Build'}).click();
 await page.waitForFunction(()=>document.querySelector('#buildMenu')?.classList.contains('open'));
 assert.ok(await buildMenu.isVisible(),name+': Build menu did not open');
 assert.ok(await page.locator('#road').isVisible(),name+': road tool is missing from Build menu');
 await page.locator('#buildMenuClose').click();
 await page.waitForFunction(()=>{const el=document.querySelector('#buildMenu');if(!el)return true;const style=getComputedStyle(el);return !el.classList.contains('open')&&style.pointerEvents==='none'&&style.opacity==='0'},{timeout:2000});
 await page.getByRole('button',{name:'Research'}).click();
 assert.ok(await panel.isVisible(),name+': Research panel did not open');
 assert.equal(await page.locator('#name').textContent(),'Research',name+': Research panel title is incorrect');
 await page.locator('#panelClose').click();
 await page.getByRole('button',{name:'Company'}).click();
 assert.ok(await panel.isVisible(),name+': Company panel did not open');
 assert.equal(await page.locator('#name').textContent(),'Company',name+': Company panel title is incorrect');
 await page.locator('#panelClose').click();
 await page.getByRole('button',{name:'Settings'}).click();
 assert.equal(await page.locator('#settingsMenu').evaluate(el=>getComputedStyle(el).display),'flex',name+': Settings menu did not open');
 assert.ok((await page.locator('#gameVersion').textContent())?.trim(),name+': Settings did not populate game version');
 await page.locator('#settingsClose').click();
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('#settingsMenu')).display!=='flex',{timeout:2000});
 assert.notEqual(await page.locator('#settingsMenu').evaluate(el=>getComputedStyle(el).display),'flex',name+': Settings menu did not close');
 await page.getByRole('button',{name:'Reset camera'}).click();
}

async function audit(viewport,name,points){const browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:viewport.width<700,hasTouch:viewport.width<700,serviceWorkers:'block'});await context.addInitScript(()=>localStorage.clear());const page=await context.newPage();const consoleErrors=[],pageErrors=[];page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});page.on('pageerror',e=>pageErrors.push(String(e?.stack||e)));await page.goto('http://127.0.0.1:'+process.env.MINI_FACTORIES_PORT+'/',{waitUntil:'networkidle'});await page.waitForFunction(()=>document.querySelector('#startupGuard')?.style.display==='none',{timeout:20000});await page.waitForFunction(()=>{const c=document.querySelector('#game');return !!c?.getContext('webgl2')||!!c?.getContext('webgl')},{timeout:10000});await page.waitForFunction(()=>typeof window.__miniFactoriesRenderDiagnostics==='function',{timeout:5000});await assertUiControls(page,name);const before=await savedState(page);const initial=await page.evaluate(()=>window.__miniFactoriesRenderDiagnostics());assert.equal(initial.roadObjectCount,before?.roads?.length||0,name+': initial logical/rendered road count mismatch');await page.screenshot({path:'test-results/road-'+name+'-before.png',fullPage:false});await exerciseRoad(page,points,before?.roads?.length||0);await assertRenderedState(page,name,before);await page.screenshot({path:'test-results/road-'+name+'-after.png',fullPage:false});assert.equal(consoleErrors.length,0,name+': console errors: '+consoleErrors.join(' | '));assert.equal(pageErrors.length,0,name+': page errors: '+pageErrors.join(' | '));const size=await page.locator('#game').evaluate(el=>({width:el.width,height:el.height}));assert.ok(size.width>0&&size.height>0,name+': invalid canvas size');await context.close();await browser.close();}

const {server,url}=await startServer();process.env.MINI_FACTORIES_PORT=new URL(url).port;try{await audit({width:1280,height:800},'desktop',[[.42,.50],[.58,.50]]);await audit({width:390,height:844},'mobile',[[.42,.50],[.58,.50]]);console.log('Visual road audit passed: logical/rendered road count, geometry, endpoints, mesh/object presence, building positions and runtime error checks are consistent on desktop + mobile.')}finally{server.close();}