// Reduce software-rendering cost in CI while preserving CSS viewport and interaction coordinates.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.SITE_URL||'http://localhost:5183/demo-v2',output=process.env.ARTIFACT_DIR||'artifacts';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[];await mkdir(output,{recursive:true});
try{
 const page=await browser.newPage({deviceScaleFactor:process.env.CI ? 0.5 : 1,viewport:{width:1280,height:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/`);await page.waitForFunction(()=>window.demo2&&!window.demo2.state.transitioning);
 await page.locator('#focus-place').click();await page.waitForFunction(()=>!window.demo2.state.transitioning);
 const start=await page.evaluate(()=>{
  const v=window.demo2;let lights=0;v.scene.traverse(o=>{if(o.isLight)lights++;});
  const before=v.scene.background.toArray();document.querySelector('[data-light=night]').click();
  window.nightSamples=[];const start=performance.now();const timer=setInterval(()=>{
   nightSamples.push({elapsed:performance.now()-start,color:v.scene.background.toArray(),sun:v.scene.children.find(o=>o.isDirectionalLight).intensity,counts:v.nightWindows.map(b=>b.mesh.count)});
   if(!v.state.lightingTransitioning)clearInterval(timer);
  },250);
  return {before,after:v.scene.background.toArray(),counts:v.nightWindows.map(b=>b.mesh.count),lights};
 });
 assert(start.after.every((x,i)=>Math.abs(x-start.before[i])<.0001),'Night starts without a color jump');assert(start.counts.every(c=>c===0));
 await page.waitForFunction(()=>!window.demo2.state.lightingTransitioning,{},{timeout:30000});
 await page.waitForTimeout(300);
 const result=await page.evaluate(()=>{
  const v=window.demo2;let lights=0;v.scene.traverse(o=>{if(o.isLight)lights++;});
  return {samples:nightSamples,lights,batches:v.nightWindows.map(b=>({total:b.total,count:b.mesh.count,capacity:b.capacity,castShadow:b.mesh.castShadow,basic:b.mesh.material.isMeshBasicMaterial,instanced:b.mesh.isInstancedMesh})),frame:v.renderer.info.render.frame};
 });
 assert.equal(result.lights,start.lights,'No new lights');
 for(const [i,b] of result.batches.entries()){assert.equal(b.count,Math.round(b.total*(i===1?.2:.4)));assert(b.basic&&b.instanced&&!b.castShadow);}
 const totals=result.samples.map(s=>s.counts.reduce((a,b)=>a+b,0));assert(new Set(totals).size>3,'Windows switch on in stages');
 assert(result.samples.some(s=>s.elapsed>8000&&s.counts.some((c,i)=>c<result.batches[i].capacity)),'Windows continue switching on near the end of ten seconds');
 for(let i=1;i<totals.length;i++)assert(totals[i]>=totals[i-1]);
 assert(result.samples.some(s=>s.sun>.65&&s.sun<2.5),'Existing light intensity fades between day and night');
 await page.screenshot({path:`${output}/night-windows-tower.png`});
 const idle=await page.evaluate(()=>window.demo2.renderer.info.render.frame);await page.waitForTimeout(650);
 assert.equal(await page.evaluate(()=>window.demo2.renderer.info.render.frame),idle,'Rendering becomes idle after the transition');
 await page.locator('[data-light=day]').click();await page.waitForTimeout(1000);
 const reverse=await page.evaluate(()=>{const v=window.demo2,before=v.scene.background.toArray(),counts=v.nightWindows.map(b=>b.mesh.count);document.querySelector('[data-light=night]').click();return {before,after:v.scene.background.toArray(),counts,afterCounts:v.nightWindows.map(b=>b.mesh.count)};});
 assert(reverse.after.every((x,i)=>Math.abs(x-reverse.before[i])<.0001));assert.deepEqual(reverse.counts,reverse.afterCounts);
 await page.locator('[data-light=day]').click();await page.waitForFunction(()=>!window.demo2.state.lightingTransitioning);
 assert(await page.evaluate(()=>window.demo2.nightWindows.every(b=>b.mesh.count===0&&!b.mesh.visible)));
 await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.waitForFunction(()=>window.demo2);
 await page.locator('[data-light=night]').click();assert.equal(await page.evaluate(()=>window.demo2.state.lightingTransitioning),false);
 await page.locator('[data-section="3"]').click();await page.locator('[data-floor="40"]').click();
 assert(await page.evaluate(()=>{const v=window.demo2,m=v.nightWindows[1].mesh;return m.material.clippingPlanes[0].constant===v.explorer.state.cutHeight&&m.count===Math.round(v.nightWindows[1].total*.2);}),'Lit tower windows share the selected floor cut plane');
 await page.locator('#reset').click();await page.screenshot({path:`${output}/night-windows-neighborhood.png`});
 assert.deepEqual(errors,[]);await writeFile(`${output}/night-validation.json`,JSON.stringify({result:'PASS',...result,errors},null,2));
 console.log('PASS: smooth lighting, 20% tower / 40% neighborhood staggered windows over ten seconds, interruption, day reset, reduced motion, cutaway clipping, no added lights/shadows, idle rendering.');
}finally{await browser.close();}
