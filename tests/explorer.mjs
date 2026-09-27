// Reduce software-rendering cost in CI while preserving CSS viewport and interaction coordinates.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { TOWER_SECTIONS, floorAtHeight } from '../src/tower-config.js';

const base=process.env.SITE_URL||'http://localhost:5183/demo-v2';
const output=process.env.ARTIFACT_DIR||'artifacts';
const errors=[],external=[];
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
await mkdir(output,{recursive:true});
async function ready(page){
  page.setDefaultTimeout(30000);
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.route('**/*',route=>{if(new URL(route.request().url()).origin===new URL(base).origin)return route.continue();external.push(route.request().url());return route.abort();});
  await page.goto(`${base}/`);
  await page.waitForFunction(()=>window.demo2&&document.querySelector('canvas').dataset.rendered==='true');
  await settled(page);
}
async function settled(page){await page.waitForFunction(()=>!window.demo2.state.transitioning);await page.waitForTimeout(200);}
const state=page=>page.evaluate(()=>({...window.demo2.explorer.state}));
const project=(page,point)=>page.evaluate(point=>{
  const {camera}=window.demo2,p=camera.position.clone().fromArray(point).project(camera);
  return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};
},point);
try{
  for(const s of TOWER_SECTIONS){assert.equal(floorAtHeight(s,s.bottom),s.firstFloor);assert.equal(floorAtHeight(s,s.top),s.lastFloor);assert.equal(floorAtHeight(s,s.bottom-.01),null);}
  const page=await browser.newPage({deviceScaleFactor:process.env.CI ? 0.5 : 1,viewport:{width:1440,height:1000}});await ready(page);
  assert(await page.evaluate(()=>{
    const tower=window.demo2.scene.getObjectByName('demo2 tower');
    const glass=tower.children.find(m=>m.isMesh&&!m.isInstancedMesh&&m.material.color.getHexString()==='658a92');
    const p=glass.geometry.attributes.position;let top=-Infinity;for(let i=0;i<p.count;i++)top=Math.max(top,p.getY(i));
    return top<259.8;
  }),'The glass top sits below the opaque roof cap, preventing coplanar flicker');
  await page.locator('#focus-place').click();await settled(page);
  await page.locator('[data-layer=vegetation]').uncheck();
  for(const s of TOWER_SECTIONS){
    const p=await project(page,[0,s.bottom+(s.top-s.bottom)*(s.id===1?.8:.5),14]);await page.mouse.move(p.x,p.y);
    await expect.poll(async()=>(await state(page)).hoverSection).toBe(s.id);
    assert.equal((await state(page)).hoverFloor,null);
    assert.equal(await page.evaluate(()=>window.demo2.explorer.overlays.hover.visible),true);
  }
  const p=await project(page,[0,153,14]);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+65,p.y+12,{steps:8});await page.mouse.up();
  assert.equal((await state(page)).level,'sections','Dragging over a section must orbit without selecting it');
  await page.locator('#focus-place').click();await settled(page);
  const block=await project(page,[0,153,14]);await page.mouse.click(block.x,block.y);await settled(page);
  assert.equal((await state(page)).sectionId,3);assert.equal((await state(page)).level,'section');
  assert(await page.evaluate(()=>window.demo2.scene.getObjectByName('demo2 tower').children.filter(m=>m.isMesh).every(m=>!m.material.clippingPlanes?.length)));
  await expect(page.locator('[data-floor]')).toHaveCount(16);
  await page.screenshot({path:`${output}/explorer-section.png`});
  const s=TOWER_SECTIONS[2];
  for(const floor of [33,40,48]){
    const point=await project(page,[0,s.bottom+(floor-s.firstFloor+.5)*s.floorHeight,14]);await page.mouse.move(point.x,point.y);
    await expect.poll(async()=>(await state(page)).hoverFloor).toBe(floor);
  }
  const floorPoint=await project(page,[0,s.bottom+(40-s.firstFloor+.5)*s.floorHeight,14]);await page.mouse.move(floorPoint.x,floorPoint.y);
  await page.screenshot({path:`${output}/explorer-floor-hover.png`});
  await page.mouse.click(floorPoint.x,floorPoint.y);await settled(page);
  assert.equal((await state(page)).floor,40);assert.equal((await state(page)).level,'floor');
  assert.equal(await page.evaluate(()=>window.demo2.explorer.floorPlan.apartments.length),12);
  assert(await page.evaluate(()=>Math.abs(Math.acos(window.demo2.camera.position.clone().sub(window.demo2.controls.target).normalize().y)-Math.PI/4)<1e-8));
  assert(await page.evaluate(()=>{
    const {explorer,controls,scene}=window.demo2;
    const tower=scene.getObjectByName('demo2 tower');
    return explorer.floorPlan.root.position.y===explorer.state.cutHeight&&controls.target.y===explorer.state.cutHeight&&tower.parent.parent.visible&&tower.children.filter(m=>m.isMesh).every(m=>m.material.clippingPlanes?.[0].constant===explorer.state.cutHeight&&m.material.clipShadows);
  }),'Tower is clipped at the selected floor, with landscape and lower building retained');
  await page.screenshot({path:`${output}/explorer-floor-top.png`});
  const apartment=await page.evaluate(()=>{
    const {camera,explorer}=window.demo2,p=camera.position.clone().set(-2.75,.08,-10);
    explorer.floorPlan.root.localToWorld(p);p.project(camera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};
   });
  await page.mouse.move(apartment.x,apartment.y);
  await expect.poll(()=>page.evaluate(()=>window.demo2.explorer.floorPlan.apartments.filter(a=>a.highlight.visible).length)).toBe(1);
  await page.screenshot({path:`${output}/explorer-apartment-hover.png`});
  const floorDistance=await page.evaluate(()=>window.demo2.camera.position.distanceTo(window.demo2.controls.target));
  await page.mouse.click(apartment.x,apartment.y);await settled(page);
  assert((await state(page)).apartment,'Apartment floor geometry is clickable');
  assert(await page.evaluate(()=>window.demo2.camera.position.distanceTo(window.demo2.controls.target))<floorDistance*.6,'Selecting an apartment zooms closer');
  const apartmentTarget=await page.evaluate(()=>window.demo2.controls.target.toArray());
  assert(Math.hypot(apartmentTarget[0],apartmentTarget[2])>5,'Camera center moves from tower center to selected apartment');
  await page.screenshot({path:`${output}/explorer-apartment-focused.png`});
  const aptRotation=await page.evaluate(()=>window.demo2.explorer.stage.rotation.y);
  await page.mouse.move(760,510);await page.mouse.down();await page.mouse.move(1000,510,{steps:8});await page.mouse.up();await settled(page);
  assert.notEqual(await page.evaluate(()=>window.demo2.explorer.stage.rotation.y),aptRotation);
  assert.deepEqual(await page.evaluate(()=>window.demo2.controls.target.toArray()),apartmentTarget);
  await page.locator('#viewport').focus();
  for(let i=0;i<12;i++)await page.keyboard.press('ArrowDown');await settled(page);
  assert(await page.evaluate(()=>Math.abs(Math.acos(window.demo2.camera.position.clone().sub(window.demo2.controls.target).normalize().y)-Math.PI/2)<1e-8),'Apartment tilt stops at 90 degrees');
  assert.deepEqual(await page.evaluate(()=>window.demo2.controls.target.toArray()),apartmentTarget);
  await page.screenshot({path:`${output}/explorer-apartment-outlook.png`});
  await page.keyboard.press('Escape');await settled(page);assert.equal((await state(page)).apartment,null);assert.equal((await state(page)).level,'floor');
  await page.locator('#apartment-picker').selectOption('12');await settled(page);assert.equal((await state(page)).apartment,12);
  await page.locator('#apartment-picker').selectOption('');await settled(page);assert.equal((await state(page)).apartment,null);
  const frozen=await page.evaluate(()=>({position:window.demo2.camera.position.toArray(),target:window.demo2.controls.target.toArray()}));
  await page.mouse.move(760,510);await page.mouse.down();await page.mouse.move(980,510,{steps:10});await page.mouse.up();await settled(page);
  assert(await page.evaluate(()=>Math.abs(window.demo2.explorer.stage.rotation.y)>.3));
  assert.deepEqual(await page.evaluate(()=>({position:window.demo2.camera.position.toArray(),target:window.demo2.controls.target.toArray()})),frozen,'Horizontal dragging rotates the scene while retaining the camera target');
  await page.mouse.move(760,510);await page.mouse.down({button:'right'});await page.mouse.move(850,560,{steps:4});await page.mouse.up({button:'right'});
  assert.deepEqual(await page.evaluate(()=>window.demo2.controls.target.toArray()),frozen.target,'Panning cannot move the floor center');
  await page.locator('#rotate').click();const angle=await page.evaluate(()=>window.demo2.explorer.stage.rotation.y);await page.waitForTimeout(350);await page.locator('#rotate').click();
  assert.notEqual(await page.evaluate(()=>window.demo2.explorer.stage.rotation.y),angle);
  assert.deepEqual(await page.evaluate(()=>window.demo2.camera.position.toArray()),frozen.position);
  await page.locator('#viewport').focus();
  await page.mouse.move(850,580);await page.mouse.down();await page.mouse.move(850,360,{steps:8});await page.mouse.up();await settled(page);
  assert(await page.evaluate(()=>Math.acos(window.demo2.camera.position.clone().sub(window.demo2.controls.target).normalize().y)>Math.PI/4+.1),'Vertical mouse drag changes tilt');
  for(let i=0;i<12;i++)await page.keyboard.press('ArrowDown');await settled(page);
  assert(await page.evaluate(()=>Math.abs(Math.acos(window.demo2.camera.position.clone().sub(window.demo2.controls.target).normalize().y)-Math.PI/2)<1e-8));
  for(let i=0;i<24;i++)await page.keyboard.press('ArrowUp');await settled(page);
  assert(await page.evaluate(()=>Math.acos(window.demo2.camera.position.clone().sub(window.demo2.controls.target).normalize().y)<.00001));
  assert.deepEqual(await page.evaluate(()=>window.demo2.controls.target.toArray()),frozen.target);
  const flight=await page.evaluate(()=>{
    const {camera,state}=window.demo2, before=camera.position.toArray();
    document.querySelector('[data-floor="41"]').click();
    return {before,after:camera.position.toArray(),animating:state.transitioning,cutHeight:state.explorer.cutHeight};
  });
  assert(flight.animating,'Floor navigation starts a camera flight');assert.deepEqual(flight.after,flight.before,'The camera does not jump at the start of a transition');
  assert.equal(flight.cutHeight,s.bottom+(41-s.firstFloor)*s.floorHeight,'The upper tower disappears immediately');
  await settled(page);assert.equal((await state(page)).cutHeight,s.bottom+(41-s.firstFloor)*s.floorHeight);
  assert.equal(await page.evaluate(()=>window.demo2.controls.target.y),(await state(page)).cutHeight);
  await page.locator('[data-floor="40"]').click();await settled(page);
  await page.screenshot({path:`${output}/explorer-floor-cutaway.png`});
  await page.locator('#viewport').focus();await page.keyboard.press('Escape');await settled(page);assert.equal((await state(page)).level,'section');
  assert(await page.evaluate(()=>window.demo2.scene.getObjectByName('demo2 tower').children.filter(m=>m.isMesh).every(m=>!m.material.clippingPlanes?.length)));
  await page.keyboard.press('Escape');await settled(page);assert.equal((await state(page)).level,'sections');
  assert.equal(await page.evaluate(()=>window.demo2.groups.vegetation.visible),false,'Layer preferences survive exploration');
  await page.locator('[data-section="4"]').click();await settled(page);await page.locator('[data-floor="70"]').click();await settled(page);assert.equal((await state(page)).floor,70);
  await page.locator('#viewport').focus();await page.keyboard.press('Home');await settled(page);assert.equal((await state(page)).level,'sections');
  await page.close();
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const mobile=await context.newPage();await ready(mobile);await mobile.locator('#place-toggle').tap();await mobile.locator('[data-section="2"]').tap();await settled(mobile);
  await mobile.locator('[data-floor="24"]').tap();await settled(mobile);assert.equal((await state(mobile)).floor,24);
  await expect(mobile.locator('#floor-buttons')).toBeHidden();await expect(mobile.locator('#compact-floor-picker')).toBeVisible();
  const picker=await mobile.locator('#floor-picker').boundingBox();const topEdge=await project(mobile,[0,(await state(mobile)).cutHeight,-14]);assert(picker.y+picker.height<topEdge.y,'Mobile floor controls must not cover the floor plate');
  await mobile.locator('#compact-floor-picker').selectOption('32');assert.equal((await state(mobile)).floor,32);
  await mobile.screenshot({path:`${output}/explorer-floor-mobile.png`});
  const mobileCamera=await mobile.evaluate(()=>window.demo2.camera.position.toArray());
  const cdp=await context.newCDPSession(mobile);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:160,y:410}]});
  for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:160+i*18,y:410}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settled(mobile);
  assert(await mobile.evaluate(()=>Math.abs(window.demo2.explorer.stage.rotation.y)>.1));
  assert.deepEqual(await mobile.evaluate(()=>window.demo2.camera.position.toArray()),mobileCamera);
  await mobile.setViewportSize({width:844,height:390});await settled(mobile);assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth),844);
  await mobile.screenshot({path:`${output}/explorer-floor-horizontal.png`});
  await mobile.locator('#reset').tap();await settled(mobile);assert.equal((await state(mobile)).level,'sections');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  await writeFile(`${output}/explorer-validation.json`,JSON.stringify({result:'PASS',errors,external,checks:['four section hover targets','canvas section zoom','first/interior/last floor raycasts','drag vs click','tower clipped at actual floor height','12 varied apartments','apartment picking','0–90 degree tilt limits','apartment hover overlay','apartment camera focus','apartment 360 rotation','apartment back to floor','mouse/touch scene rotation','auto rotation','pan locked','floor height updates','restored full tower','animated camera with immediate cut','Escape/Home/back','layer persistence','floor 70','mobile floor selection and controls','mobile landscape']},null,2));
  console.log('PASS: section → floor → apartment explorer, desktop and mobile, no runtime errors or external requests.');
}finally{await browser.close();}
