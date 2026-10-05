import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {extname,join,normalize,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};

function startServer(){
  return new Promise((resolveServer,reject)=>{
    const server=createServer(async(req,res)=>{
      try{
        const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
        const file=join(ROOT,normalize(pathname==='/'?'/index.html':pathname));
        if(!file.startsWith(ROOT)){res.writeHead(403);res.end();return;}
        const info=await stat(file);
        if(!info.isFile())throw new Error('not a file');
        res.writeHead(200,{'content-type':MIME[extname(file)]||'application/octet-stream','cache-control':'no-store'});
        createReadStream(file).pipe(res);
      }catch{res.writeHead(404);res.end('Not found');}
    });
    server.listen(0,'127.0.0.1',()=>resolveServer({server,url:`http://127.0.0.1:${server.address().port}`}));
    server.on('error',reject);
  });
}

async function savedRoadCount(page){
  return page.evaluate(()=>{
    const raw=localStorage.getItem('miniFactoriesSaveV6');
    if(!raw)return 0;
    try{return JSON.parse(raw)?.state?.roads?.length||0}catch{return 0}
  });
}

async function exerciseRoad(page,points,beforeRoadCount){
  const canvas=page.locator('#game');
  await page.getByRole('button',{name:'Build'}).click();
  await page.locator('#road').click();
  const box=await canvas.boundingBox();
  assert.ok(box,'3D canvas must be present');
  const [a,b]=points;
  await page.mouse.move(box.x+box.width*a[0],box.y+box.height*a[1]);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width*b[0],box.y+box.height*b[1],{steps:12});
  await page.mouse.up();
  await page.waitForFunction(
    expected=>{
      const raw=localStorage.getItem('miniFactoriesSaveV6');
      if(!raw)return false;
      try{return (JSON.parse(raw)?.state?.roads?.length||0)>expected}catch{return false}
    },
    beforeRoadCount,
    {timeout:5000}
  );
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  return canvas.evaluate(el=>el.toDataURL('image/png'));
}

async function audit(viewport,name,points){
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:viewport.width<700,hasTouch:viewport.width<700,serviceWorkers:'block'});
  await context.addInitScript(()=>localStorage.clear());
  const page=await context.newPage();
  const consoleErrors=[];
  const pageErrors=[];
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
  page.on('pageerror',e=>pageErrors.push(String(e?.stack||e)));
  await page.goto('http://127.0.0.1:'+process.env.MINI_FACTORIES_PORT+'/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.querySelector('#startupGuard')?.style.display==='none',{timeout:20000});
  await page.waitForFunction(()=>{
    const c=document.querySelector('#game');
    return !!c?.getContext('webgl2')||!!c?.getContext('webgl');
  },{timeout:10000});
  const before=await page.locator('#game').evaluate(el=>el.toDataURL('image/png'));
  const beforeRoadCount=await savedRoadCount(page);
  await page.screenshot({path:`test-results/road-${name}-before.png`,fullPage:false});
  const after=await exerciseRoad(page,points,beforeRoadCount);
  await page.screenshot({path:`test-results/road-${name}-after.png`,fullPage:false});
  assert.notEqual(after,before,`${name}: rendered canvas did not change after successful road creation`);
  assert.equal(consoleErrors.length,0,`${name}: console errors: ${consoleErrors.join(' | ')}`);
  assert.equal(pageErrors.length,0,`${name}: page errors: ${pageErrors.join(' | ')}`);
  const canvasSize=await page.locator('#game').evaluate(el=>({width:el.width,height:el.height}));
  assert.ok(canvasSize.width>0&&canvasSize.height>0,`${name}: invalid canvas size`);
  await context.close();
  await browser.close();
}

const {server,url}=await startServer();
process.env.MINI_FACTORIES_PORT=new URL(url).port;
try{
  // Keep the browser gesture in the central construction area. Starter buildings
  // are deliberately distributed around the outer ring, so this avoids making the
  // visual audit depend on a particular seeded building arrangement.
  await audit({width:1280,height:800},'desktop',[[.42,.50],[.58,.50]]);
  await audit({width:390,height:844},'mobile',[[.42,.50],[.58,.50]]);
  console.log('Visual road audit passed: desktop + mobile rendered road creation, WebGL startup, screenshots and runtime error checks.');
}finally{server.close();}
