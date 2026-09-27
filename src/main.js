import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createLandscape, groundHeight } from './scene.js';
import { createTowerExplorer } from './explorer.js';

const $ = selector => document.querySelector(selector);
const viewport = $('#viewport');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
} catch {
  $('#loading').replaceChildren(Object.assign(document.createElement('p'), { textContent: 'This landscape needs WebGL 2. Try a browser with hardware acceleration enabled.' }));
  $('#loading').append(Object.assign(document.createElement('a'), { textContent: 'View the project and reference images ↗', href: 'https://vrvake.ge/' }));
}
if (renderer) start();
function start() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 700 ? 1.4 : 1.75));
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);
  renderer.localClippingEnabled = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .9;
  viewport.append(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#e8eae0'); scene.fog = new THREE.Fog('#e8eae0', 950, 2150);
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
  const env = pmrem.fromScene(room, .04); scene.environment = env.texture; scene.environmentIntensity = .35;
  room.dispose(); pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(39, viewport.clientWidth / viewport.clientHeight, 1, 4000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .075; controls.minDistance = 75; controls.maxDistance = 1500;
  controls.minPolarAngle = .025; controls.maxPolarAngle = Math.PI / 2 - .08; controls.maxTargetRadius = 540;
  controls.screenSpacePanning = false; controls.autoRotateSpeed = .45; controls.target.set(0, 70, 0);
  const ambient = new THREE.HemisphereLight('#fff9e9', '#819271', 1.3); scene.add(ambient);
  const sun = new THREE.DirectionalLight('#fff1cd', 2.5); sun.position.set(-280, 500, -280); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -670, right: 670, top: 670, bottom: -670, near: 1, far: 1800 });
  sun.shadow.bias = -.0004; sun.shadow.normalBias = .7; sun.shadow.camera.updateProjectionMatrix(); scene.add(sun);
  const fill = new THREE.DirectionalLight('#b9d6dc', .45); fill.position.set(300, 200, 100); scene.add(fill);
  const landscape = createLandscape(); scene.add(landscape.root);
  const state = { view: 'overview', light: 'day', selected: 'tower', transitioning: false, layers: {buildings:true,vegetation:true,labels:true} };
  let dirty = true, tween = null, lightTween = null, windowProgress = 0, lastTime = 0, selectedPlace = landscape.places[0];
  state.lightingTransitioning=false;
  const labelNodes = landscape.places.map(place => {
    const el = document.createElement('button'); el.className = `map-label${place.id==='tower'?' tower':''}`;el.textContent=place.label;
    el.dataset.place=place.id;el.setAttribute('aria-label',`Select ${place.name}`);el.onclick=()=>selectPlace(place);
    $('#labels').append(el); return {el,place};
  });
  const explorer = createTowerExplorer({
    scene, camera, controls, landscape, moveCamera,
    invalidate: (shadows=false) => { dirty=true; if(shadows)renderer.shadowMap.needsUpdate=true; },
    onModeChange: level => {
      $('#labels').hidden=level!=='sections'||!state.layers.labels;
      if(level!=='sections'){
        state.view=level;document.body.dataset.view=level;
        document.querySelectorAll('button[data-view]').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false');});
      }
      $('.interaction-hint').textContent=level==='floor'?'Drag to rotate & tilt · Scroll to zoom · Select an apartment':level==='section'?'Hover a floor · Click to view all apartments':'Drag to explore · Hover a tower section · Click to zoom';
    },
    showTower:()=>setView('tower'),showNeighborhood:()=>setView('overview'),
  });
  state.explorer=explorer.state;
  function presets(name) {
    const mobile=viewport.clientWidth<700;
    const v = {
      overview: {position:mobile?[700,560,880]:[555,390,640],target:mobile?[25,145,15]:[25,80,15]},
      neighborhood: {position:[480,540,580],target:[20,20,20]},
      park: {position:[420,225,410],target:[30,95,20]},
      map: {position:[0,mobile?1420:1150,1],target:[0,0,0]},
      tower: {position:mobile?[285,230,340]:[250,200,290],target:[0,132,0]},
    };
    return v[name];
  }
  function moveCamera(position,target,instant=false) {
    controls.autoRotate=false;explorer.state.autoRotate=false;$('#rotate').setAttribute('aria-pressed','false');
    // Drain any damped gesture momentum before flying, preserving the visible pose.
    const currentPosition=camera.position.clone(),currentTarget=controls.target.clone(),damping=controls.enableDamping;
    controls.enableDamping=false;controls.update();controls.enableDamping=damping;
    camera.position.copy(currentPosition);controls.target.copy(currentTarget);camera.lookAt(controls.target);
    if(instant||reducedMotion){controls.enabled=true;camera.position.fromArray(position);controls.target.fromArray(target);controls.update();tween=null;state.transitioning=false;}
    else {controls.enabled=false;tween={from:camera.position.clone(),fromTarget:controls.target.clone(),to:new THREE.Vector3(...position),target:new THREE.Vector3(...target),start:performance.now()};state.transitioning=true;}
    dirty=true;
  }
  function setView(name,instant=false) {
    if(explorer.isDetailed())explorer.reset();
    explorer.clearHover();
    const preset=presets(name);state.view=name;document.body.dataset.view=name;
    document.querySelectorAll('button[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===name);b.setAttribute('aria-pressed',String(b.dataset.view===name));});
    moveCamera(preset.position,preset.target,instant);$('#announcement').textContent=`${name} view`;
  }
  function selectPlace(place) {
    selectedPlace=place;state.selected=place.id;
    $('#section-shortcuts').hidden=place.id!=='tower';
    $('#place-category').textContent=place.category;$('#place-name').textContent=place.name;
    $('#place-description').textContent=place.description;$('#place-address').textContent=place.address;$('#place-number').textContent=place.number||'↗';
    $('#focus-place').replaceChildren(document.createTextNode(place.id==='tower'?'Explore the tower':'Focus on this place'),Object.assign(document.createElement('span'),{textContent:'↗'}));
    labelNodes.forEach(({el,place:p})=>el.classList.toggle('selected',p.id===place.id));
    setDisclosure('place',true);$('#announcement').textContent=`Selected ${place.name}`;dirty=true;
  }
  $('#focus-place').onclick=()=>{
    if(selectedPlace.id==='tower')setView('tower');
    else {const [x,y,z]=selectedPlace.target;moveCamera([x+150,y+165,z+210],[x,y,z]);state.view='place';document.querySelectorAll('button[data-view]').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false');});}
  };
  document.querySelectorAll('button[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
  function lightingSnapshot(){
    return {background:scene.background.clone(),sunColor:sun.color.clone(),ambientColor:ambient.color.clone(),
      sun:sun.intensity,ambient:ambient.intensity,exposure:renderer.toneMappingExposure,
      environment:scene.environmentIntensity,fill:fill.intensity};
  }
  function updateLighting(now){
    if(!lightTween)return;
    const {from,to,start,windowsFrom,windowsTo}=lightTween;
    const t=reducedMotion?1:Math.min((now-start)/4000,1),ease=t*t*(3-2*t);
    scene.background.lerpColors(from.background,to.background,ease);scene.fog.color.copy(scene.background);
    sun.color.lerpColors(from.sunColor,to.sunColor,ease);ambient.color.lerpColors(from.ambientColor,to.ambientColor,ease);
    sun.intensity=THREE.MathUtils.lerp(from.sun,to.sun,ease);ambient.intensity=THREE.MathUtils.lerp(from.ambient,to.ambient,ease);
    renderer.toneMappingExposure=THREE.MathUtils.lerp(from.exposure,to.exposure,ease);
    scene.environmentIntensity=THREE.MathUtils.lerp(from.environment,to.environment,ease);fill.intensity=THREE.MathUtils.lerp(from.fill,to.fill,ease);
    const windowTime=reducedMotion?1:Math.min((now-start)/(windowsTo?10000:4000),1);
    windowProgress=THREE.MathUtils.lerp(windowsFrom,windowsTo,windowTime);
    const windowsChanged=landscape.setNight(windowProgress);
    if(t<1||windowsChanged||!lightTween.atmosphereDone)dirty=true;
    lightTween.atmosphereDone=t===1;
    if(t===1&&windowTime===1){lightTween=null;state.lightingTransitioning=false;}
  }
  function setLight(name) {
    if(name===state.light)return;
    const settings={day:['#e8eae0','#fff1cd',2.5,1.3,.9,[-280,500,-280]],sunset:['#e8d6be','#ffc183',2.4,1.1,.95,[-450,190,150]],night:['#243a3e','#afc5e9',.65,.28,.75,[-280,500,-280]]}[name];
    const night=name==='night';
    lightTween={from:lightingSnapshot(),to:{background:new THREE.Color(settings[0]),sunColor:new THREE.Color(settings[1]),
      ambientColor:new THREE.Color(night?'#a5bdd0':'#fff9e9'),sun:settings[2],ambient:settings[3],exposure:settings[4],environment:night?.12:.35,fill:night?.15:.45},
      start:performance.now(),windowsFrom:windowProgress,windowsTo:night?1:0};
    // Reuse the existing sun and cached shadows; window colors never cast shadows.
    const sunPosition=new THREE.Vector3(...settings[5]);
    if(!sun.position.equals(sunPosition)){sun.position.copy(sunPosition);renderer.shadowMap.needsUpdate=true;}
    state.light=name;state.lightingTransitioning=true;document.body.dataset.light=name;
    $('#time-name').textContent={day:'Daylight',sunset:'Golden hour',night:'After dark'}[name];
    document.querySelectorAll('button[data-light]').forEach(b=>{b.classList.toggle('active',b.dataset.light===name);b.setAttribute('aria-pressed',String(b.dataset.light===name));});
    updateLighting(performance.now());dirty=true;
  }
  document.querySelectorAll('button[data-light]').forEach(b=>b.onclick=()=>setLight(b.dataset.light));
  document.querySelectorAll('[data-layer]').forEach(input=>input.onchange=()=>{
    const layer=input.dataset.layer;state.layers[layer]=input.checked;
    if(layer==='labels')$('#labels').hidden=!input.checked;else landscape.groups[layer].visible=input.checked;
    renderer.shadowMap.needsUpdate=true;dirty=true;
  });
  function setDisclosure(name,open){
    const button=$(`#${name}-toggle`),body=$(name==='layers'?'#layer-options':'#place-body');
    button.setAttribute('aria-expanded',String(open));body.hidden=!open;$(`#${name}-chevron`).textContent=open?'−':'+';
  }
  for(const name of ['layers','place'])$(`#${name}-toggle`).onclick=()=>setDisclosure(name,$(`#${name}-toggle`).getAttribute('aria-expanded')!=='true');
  if(innerWidth<700){setDisclosure('layers',false);setDisclosure('place',false);}
  if(innerHeight<520)setDisclosure('place',false);
  $('#sources-close').onclick=()=>$('#sources-dialog').close();
  $('#sources-dialog').addEventListener('click',e=>{if(e.target===$('#sources-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
  function zoom(factor){
    if(state.transitioning)return;
    const offset=camera.position.clone().sub(controls.target);offset.setLength(THREE.MathUtils.clamp(offset.length()*factor,controls.minDistance,controls.maxDistance));
    moveCamera(controls.target.clone().add(offset).toArray(),controls.target.toArray());
  }
  $('#zoom-in').onclick=()=>zoom(.82);$('#zoom-out').onclick=()=>zoom(1.22);
  $('#reset').onclick=()=>{selectPlace(landscape.places[0]);if(innerWidth<700||innerHeight<520)setDisclosure('place',false);setView('overview');};
  $('#rotate').onclick=()=>{if(state.transitioning)return;if(explorer.isFloor()){explorer.state.autoRotate=!explorer.state.autoRotate;$('#rotate').setAttribute('aria-pressed',String(explorer.state.autoRotate));dirty=true;return;}tween=null;state.transitioning=false;controls.autoRotate=!controls.autoRotate;$('#rotate').setAttribute('aria-pressed',String(controls.autoRotate));dirty=true;};
  controls.addEventListener('start',()=>{tween=null;state.transitioning=false;explorer.clearHover();});
  controls.addEventListener('change',()=>{dirty=true;});
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let pointerStart=null;const activePointers=new Map();
  function pickAt(event){
    const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
    const candidates=explorer.isFloor()?explorer.floorPlan.picks:landscape.picks.filter(m=>{if(m.userData.osmId&&!landscape.groups.buildings.visible)return false;for(let p=m;p;p=p.parent)if(!p.visible)return false;return true;});
    return raycaster.intersectObjects(candidates,false)[0];
  }
  function isTower(hit){for(let p=hit.object;p;p=p.parent)if(p===landscape.tower)return true;return false;}
  renderer.domElement.addEventListener('pointerdown',e=>{if(state.transitioning)return;activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(e.isPrimary&&e.button===0)pointerStart={x:e.clientX,y:e.clientY,time:performance.now()};else pointerStart=null;});
  renderer.domElement.addEventListener('pointermove',e=>{
    if(state.transitioning){pointerStart=null;return;}
    const previous=activePointers.get(e.pointerId);
    if(pointerStart&&Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>6)pointerStart=null;
    if(previous){
      if(explorer.isFloor()&&activePointers.size===1&&!pointerStart&&(e.pointerType==='touch'||e.buttons===1))explorer.rotateFloor((e.clientX-previous.x)/renderer.domElement.clientWidth*Math.PI*2);
      activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    }
    if(e.pointerType!=='mouse'||e.buttons||state.transitioning){explorer.clearHover();return;}
    if(explorer.state.isolated)return;
    const hit=pickAt(e);
    if(explorer.isFloor()){explorer.hoverApartment(hit?.object.userData.apartment||null);return;}
    if(hit&&isTower(hit))explorer.hoverTower(hit.point,e);else explorer.clearHover();
  });
  renderer.domElement.addEventListener('pointerleave',e=>{activePointers.delete(e.pointerId);pointerStart=null;explorer.clearHover();});
  renderer.domElement.addEventListener('pointercancel',e=>{activePointers.delete(e.pointerId);pointerStart=null;explorer.clearHover();});
  renderer.domElement.addEventListener('pointerup',e=>{
    activePointers.delete(e.pointerId);
    if(!pointerStart||performance.now()-pointerStart.time>700)return;pointerStart=null;
    if(state.transitioning)return;
    if(explorer.state.isolated)return;
    const hit=pickAt(e);if(!hit)return;
    if(explorer.isFloor()){explorer.selectApartment(hit.object.userData.apartment);return;}
    if(isTower(hit)){
      if(explorer.activateTower(hit.point)){state.selected='tower';return;}
      if(!explorer.isDetailed())selectPlace(landscape.places[0]);
    }else if(!explorer.isDetailed()&&hit.object.userData.osmId){
      const d=hit.object.userData;
      selectPlace({id:d.placeId,name:d.name,category:'MAPPED NEIGHBORHOOD',description:`${d.heightSource}: approximately ${Math.round(d.height)} m. Footprint from OpenStreetMap; façade details are illustrative.`,address:`OpenStreetMap building ${d.osmId}`,target:[d.center[0],d.center[1]/2,d.center[2]],number:'↗'});
    }
  });
  viewport.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&explorer.isDetailed()){e.preventDefault();explorer.back();return;}
    if(state.transitioning)return;
    if(['+','=','-','_','Home','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))e.preventDefault();else return;
    if(e.key==='Home'){setView('overview');return;}if(['+','='].includes(e.key)){zoom(.85);return;}if(['-','_'].includes(e.key)){zoom(1.18);return;}
    if(explorer.isFloor()){
      if(e.key==='ArrowLeft')explorer.rotateFloor(-.12);if(e.key==='ArrowRight')explorer.rotateFloor(.12);
      if(e.key==='ArrowUp'||e.key==='ArrowDown'){
        const angle=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
        angle.phi=THREE.MathUtils.clamp(angle.phi+(e.key==='ArrowUp'?-.08:.08),controls.minPolarAngle,controls.maxPolarAngle);
        camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(angle));controls.update();dirty=true;
      }
      return;
    }
    tween=null;state.transitioning=false;const s=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    if(e.key==='ArrowLeft')s.theta-=.12;if(e.key==='ArrowRight')s.theta+=.12;if(e.key==='ArrowUp')s.phi-=.09;if(e.key==='ArrowDown')s.phi+=.09;
    s.phi=THREE.MathUtils.clamp(s.phi,controls.minPolarAngle,controls.maxPolarAngle);camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));dirty=true;
  });
  const projected=new THREE.Vector3();
  function updateLabels(){
    const width=viewport.clientWidth,height=viewport.clientHeight,occupied=[];
    for(const {el,place} of labelNodes){
      projected.set(...place.position).project(camera);
      const x=(projected.x+1)*width/2,y=(1-projected.y)*height/2;
      const collision=occupied.some(p=>Math.abs(x-p.x)<125&&Math.abs(y-p.y)<35);
      const invisible=projected.z>1||projected.z< -1||x<65||x>width-65||y<85||y>height-100||collision;
      el.hidden=invisible;
      if(!invisible){el.style.left=`${x}px`;el.style.top=`${y}px`;occupied.push({x,y});}
    }
    const direction=camera.position.clone().sub(controls.target);
    $('#north-needle').style.transform=`rotate(${Math.atan2(direction.x,direction.z)*180/Math.PI}deg)`;
    // A horizontal scale measured at the orbit target; changes with zoom.
    const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0);right.y=0;right.normalize();
    const a=controls.target.clone().project(camera),b=controls.target.clone().addScaledVector(right,100).project(camera);
    const px=Math.abs(b.x-a.x)*width/2;const meters=px>150?25:px>85?50:100;
    $('#scale-label').textContent=`${meters} m`;$('#scale-bar').style.width=`${px*meters/100}px`;
  }
  function resize(){
    const w=viewport.clientWidth,h=viewport.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();explorer.resize();dirty=true;
  }
  new ResizeObserver(resize).observe(viewport);
  document.addEventListener('visibilitychange',()=>{lastTime=0;dirty=true;});
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();$('#loading').classList.remove('loaded');$('#loading p').textContent='The 3D view was interrupted. Restoring the landscape…';});
  renderer.domElement.addEventListener('webglcontextrestored',()=>{renderer.shadowMap.needsUpdate=true;dirty=true;$('#loading').classList.add('loaded');});
  setView('overview',true);
  function animate(now){
    requestAnimationFrame(animate);if(document.hidden)return;
    updateLighting(now);
    const delta=lastTime?Math.min((now-lastTime)/1000,.05):0;lastTime=now;
    if(tween){const t=Math.min((now-tween.start)/1100,1),ease=t*t*(3-2*t);camera.position.lerpVectors(tween.from,tween.to,ease);controls.target.lerpVectors(tween.fromTarget,tween.target,ease);camera.lookAt(controls.target);dirty=true;if(t===1){tween=null;state.transitioning=false;controls.enabled=true;}}
    if(!state.transitioning){explorer.update(delta);controls.update(delta);}
    // Keep ground navigation above the illustrative terrain.
    const minY=groundHeight(camera.position.x,camera.position.z)+6;
    if(!explorer.isFloor()&&camera.position.y<minY){camera.position.y=minY;dirty=true;}
    if(dirty||controls.autoRotate){renderer.render(scene,camera);updateLabels();dirty=false;renderer.domElement.dataset.rendered='true';}
  }
  requestAnimationFrame(animate);
  $('#loading').classList.add('loaded');
  // Read-only scene handles aid regression checks and downstream reuse.
  window.vakeLandscape={scene,camera,controls,renderer,state,explorer,stats:landscape.stats,nightWindows:landscape.nightWindows,groups:landscape.groups,places:landscape.places};
}
