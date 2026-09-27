import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {roundedOutline} from '../src/tower-config.js';
const output=process.env.ARTIFACT_DIR||'artifacts',base=process.env.SITE_URL||'http://localhost:5183/demo-v2';
const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
await mkdir(output,{recursive:true});const errors=[];
try{
 const p=await b.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});p.on('pageerror',e=>errors.push(e.message));
 await p.goto(`${base}/`);await p.waitForFunction(()=>window.vakeLandscape&&document.querySelector('canvas').dataset.rendered==='true');
 await p.locator('[data-section="3"]').click();await p.locator('[data-floor="40"]').click();
 const layout=await p.evaluate(()=>{const {floorPlan}=window.vakeLandscape.explorer;return {stats:floorPlan.stats,units:floorPlan.apartments.map(({number,type,area,entrance,points})=>({number,type,area,entrance,points}))};});
 assert.equal(layout.units.length,12);assert.equal(layout.stats.sharedArea,140);
 for(const type of ['corner','one-bedroom','studio'])assert.equal(layout.units.filter(a=>a.type===type).length,4);
 for(const a of layout.units){assert(a.area>35);assert(a.entrance,`Apartment ${a.number} needs direct corridor access`);if(a.type==='corner')assert(a.area>90);}
 const outline=roundedOutline(),area=Math.abs(outline.reduce((s,p,i)=>{const q=outline[(i+1)%outline.length];return s+p[0]*q[1]-q[0]*p[1];},0))/2;
 assert(Math.abs(layout.stats.apartmentArea+layout.stats.sharedArea-area)<.001,'Apartments and shared core cover the full floor');
 assert(layout.stats.apartmentArea/12>(area-243.6)/20*1.8,'Average apartment is at least 80% larger');
 // Sample every part of the plate to catch overlaps or gaps between apartments.
 const inside=(x,z,poly)=>{let result=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])result=!result;}return result;};
 for(let x=-16.4;x<16.5;x+=.31)for(let z=-13.9;z<14;z+=.31){if(!inside(x,z,outline))continue;const count=layout.units.filter(a=>inside(x,z,a.points)).length;assert.equal(count,Math.abs(x)<7&&Math.abs(z)<5?0:1);}
 await p.screenshot({path:`${output}/larger-floor-plan.png`});
 for(const number of [1,2,3,4,5,6,7,8,9,10,11,12]){
  await p.locator('#apartment-picker').selectOption(String(number));
  await expect(p.locator('#apartment-name')).toContainText(`40.${String(number).padStart(2,'0')}`);
  assert.equal(await p.evaluate(()=>window.vakeLandscape.explorer.floorPlan.apartments.filter(a=>a.highlight.visible).length),1);
  if([1,2,3].includes(number)){
   await p.screenshot({path:`${output}/larger-apartment-${number}.png`});
   await p.locator('#view-apartment').click();
   assert(await p.evaluate(()=>window.vakeLandscape.explorer.state.isolated));
   assert.equal(await p.evaluate(()=>window.vakeLandscape.explorer.stage.visible),false);
   await expect(p.locator('#floor-picker')).toBeHidden();await expect(p.locator('#view-apartment')).toBeHidden();
   const isolated=await p.evaluate(()=>{const {standalone,state,floorPlan}=window.vakeLandscape.explorer;const unit=floorPlan.apartments.find(a=>a.number===state.apartment);let vertices=0,outside=0;for(const m of standalone.root.children[0].children){const p=m.geometry.attributes.position;vertices+=p.count;for(let i=0;i<p.count;i++){if(p.getX(i)<Math.min(...unit.points.map(p=>p[0]))-.001||p.getX(i)>Math.max(...unit.points.map(p=>p[0]))+.001||p.getZ(i)<Math.min(...unit.points.map(p=>p[1]))-.001||p.getZ(i)>Math.max(...unit.points.map(p=>p[1]))+.001)outside++;}}return {vertices,outside};});
   assert(isolated.vertices>100);assert.equal(isolated.outside,0,'Standalone furniture stays within the selected apartment');
   await p.screenshot({path:`${output}/standalone-apartment-${number}.png`});
   await p.locator('#viewport').focus();for(let i=0;i<24;i++)await p.keyboard.press('ArrowUp');
   assert(await p.evaluate(()=>Math.acos(window.vakeLandscape.camera.position.clone().sub(window.vakeLandscape.controls.target).normalize().y)<.00001));
   await p.screenshot({path:`${output}/standalone-apartment-${number}-top.png`});
   for(let i=0;i<24;i++)await p.keyboard.press('ArrowDown');
   assert(await p.evaluate(()=>Math.abs(Math.acos(window.vakeLandscape.camera.position.clone().sub(window.vakeLandscape.controls.target).normalize().y)-Math.PI/2)<.00001));
   if(number===3){await p.locator('#explorer-back').focus();await p.keyboard.press('Escape');}else await p.locator('#explorer-back').click();
   assert.equal(await p.evaluate(()=>window.vakeLandscape.explorer.state.isolated),false);
   assert.equal(await p.evaluate(()=>window.vakeLandscape.explorer.state.apartment),number);await expect(p.locator('#view-apartment')).toBeVisible();
  }
 }
 assert.deepEqual(errors,[]);await writeFile(`${output}/layout-validation.json`,JSON.stringify({result:'PASS',...layout,errors},null,2));
 console.log('PASS: 12 varied apartments, compact core, no gaps/overlaps, direct entrances, all units selectable.');console.log(layout.stats);await p.close();
 const context=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),mobile=await context.newPage();
 mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(`${base}/`);await mobile.waitForFunction(()=>window.vakeLandscape);
 await mobile.locator('#place-toggle').tap();await mobile.locator('[data-section="3"]').tap();await mobile.locator('[data-floor="40"]').tap();
 await mobile.locator('#apartment-picker').selectOption('1');await mobile.locator('#view-apartment').tap();
 await expect(mobile.locator('#floor-picker')).toBeHidden();assert(await mobile.evaluate(()=>window.vakeLandscape.explorer.state.isolated));
 await mobile.screenshot({path:`${output}/standalone-apartment-mobile.png`});
 await mobile.locator('#explorer-back').tap();assert.equal(await mobile.evaluate(()=>window.vakeLandscape.explorer.state.isolated),false);
 await expect(mobile.locator('#view-apartment')).toBeVisible();assert.deepEqual(errors,[]);console.log('PASS: mobile standalone apartment entry and return.');
}finally{await b.close();}
