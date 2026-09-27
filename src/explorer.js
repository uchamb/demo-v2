import * as THREE from 'three';
import { TOWER_SECTIONS, floorAtHeight, roundedOutline } from './tower-config.js';
import { createFloorPlan } from './floor-plan.js';

export function createTowerExplorer({scene,camera,controls,landscape,moveCamera,invalidate,onModeChange,showTower,showNeighborhood}) {
  const $=selector=>document.querySelector(selector);
  const state={level:'sections',sectionId:null,floor:null,hoverSection:null,hoverFloor:null,apartment:null,hoverApartment:null,floorCamera:'cutaway',cutHeight:null,autoRotate:false,isolated:false};
  const floorPlan=createFloorPlan();
  let standalone=null,savedFloorCamera=null;
  const stage=new THREE.Group();stage.name='Floor-centered landscape rotation';scene.add(stage);stage.add(landscape.root,floorPlan.root);
  floorPlan.root.rotation.y=landscape.tower.rotation.y;
  const cutPlane=new THREE.Plane(new THREE.Vector3(0,-1,0),0);
  const localCutPlane=cutPlane.clone(),pivotLocal=new THREE.Vector3(),pivotWorld=new THREE.Vector3();
  function updateStage(){
    stage.position.copy(pivotWorld).sub(pivotLocal.clone().applyQuaternion(stage.quaternion));
    stage.updateMatrixWorld(true);
    localCutPlane.constant=state.cutHeight||0;cutPlane.copy(localCutPlane).applyMatrix4(stage.matrixWorld);
  }
  function resetPivot(){stage.rotation.x=0;stage.rotation.z=0;pivotLocal.set(0,0,0);pivotWorld.set(0,0,0);updateStage();}
  const towerMaterials=[];
  landscape.tower.traverse(object=>{
    if(!object.isMesh)return;
    const original=object.material;
    const clipped=original.clone();clipped.clippingPlanes=[cutPlane];clipped.clipShadows=true;
    towerMaterials.push({object,original,clipped});
  });
  function closeStandalone(){
    standalone?.dispose();standalone=null;state.isolated=false;stage.visible=true;
  }
  function restoreTower(){
    closeStandalone();
    for(const {object,original} of towerMaterials)object.material=original;
    stage.rotation.set(0,0,0);state.cutHeight=null;state.autoRotate=false;resetPivot();
    controls.enableRotate=true;controls.enablePan=true;controls.enableDamping=true;controls.minAzimuthAngle=-Infinity;controls.maxAzimuthAngle=Infinity;controls.cursor.set(0,0,0);
  }
  function rotateFloor(angle){
    if(state.level!=='floor')return;
    if(state.isolated){standalone.root.rotation.y+=angle;invalidate(true);return;}
    stage.rotation.y+=angle;
    updateStage();invalidate(true);
  }
  const panel=$('#explorer-panel'),picker=$('#floor-picker'),tooltip=$('#explorer-tooltip');
  function overlay(opacity,color){
    const group=new THREE.Group(),outline=roundedOutline(34.2,29.2,8.4);
    const shape=new THREE.Shape(outline.map(([x,z])=>new THREE.Vector2(x,-z)));
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:1,bevelEnabled:false});geometry.rotateX(-Math.PI/2);
    const body=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:THREE.FrontSide}));
    body.renderOrder=5;group.add(body);
    for(const y of [0,1]){const line=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(outline.map(([x,z])=>new THREE.Vector3(x,y,z))),new THREE.LineBasicMaterial({color,transparent:true,opacity:.95,depthWrite:false}));line.renderOrder=6;group.add(line);}
    group.visible=false;landscape.tower.add(group);return group;
  }
  const hoverOverlay=overlay(.28,'#a7efce'),selectedOverlay=overlay(.08,'#d3dfb4');
  function positionOverlay(group,bottom,height){group.position.y=bottom;group.scale.y=height;group.visible=true;}
  function section(){return TOWER_SECTIONS.find(s=>s.id===state.sectionId);}
  function sync(){
    document.body.dataset.explore=state.level;document.body.dataset.isolated=String(state.isolated);
    $('#view-apartment').hidden=!state.apartment||state.isolated;
    const detailed=state.level!=='sections';panel.hidden=!detailed;picker.hidden=!detailed;
    $('#exploration-nav').hidden=!detailed;$('#floor-view-options').hidden=state.level!=='floor';$('#apartment-card').hidden=state.level!=='floor';
    document.querySelectorAll('.floor-crumb').forEach(el=>el.hidden=state.level!=='floor');
    onModeChange(state.level);invalidate(true);
  }
  function clearHover(){
    const changed=hoverOverlay.visible||!tooltip.hidden||state.hoverSection!==null||state.hoverFloor!==null;
    state.hoverSection=null;state.hoverFloor=null;state.hoverApartment=null;hoverOverlay.visible=false;tooltip.hidden=true;
    $('#viewport').style.cursor='';
    document.querySelectorAll('[data-floor]').forEach(b=>b.classList.remove('hovered'));
    if(state.level==='floor')floorPlan.highlight(state.apartment);
    if(changed||state.level==='floor')invalidate();
  }
  function reset(){
    state.level='sections';state.sectionId=null;state.floor=null;state.apartment=null;
    restoreTower();clearHover();selectedOverlay.visible=false;floorPlan.root.visible=false;landscape.root.visible=true;
    controls.minDistance=75;controls.maxDistance=1500;controls.maxTargetRadius=540;controls.minPolarAngle=.025;controls.maxPolarAngle=Math.PI/2-.08;
    sync();
  }
  function renderFloorButtons(){
    const s=section();$('#floor-range').textContent=`${s.firstFloor}–${s.lastFloor}`;
    $('#floor-buttons').replaceChildren();$('#compact-floor-picker').replaceChildren();
    for(let floor=s.lastFloor;floor>=s.firstFloor;floor--){
      const button=document.createElement('button');button.dataset.floor=floor;button.textContent=String(floor).padStart(2,'0');button.setAttribute('aria-label',`Open floor ${floor}`);button.setAttribute('aria-pressed',String(state.floor===floor));
      button.classList.toggle('active',state.floor===floor);button.onclick=()=>selectFloor(floor);
      button.onpointerenter=()=>{if(state.level==='section')highlightFloor(floor);};button.onpointerleave=clearHover;
      button.onfocus=()=>{if(state.level==='section')highlightFloor(floor);};button.onblur=clearHover;
      $('#floor-buttons').append(button);
      const option=document.createElement('option');option.value=floor;option.textContent=String(floor);option.selected=state.floor===floor;$('#compact-floor-picker').append(option);
    }
  }
  function selectSection(id){
    const s=TOWER_SECTIONS.find(s=>s.id===id);if(!s)return;
    state.level='section';state.sectionId=id;state.floor=null;state.apartment=null;
    restoreTower();floorPlan.root.visible=false;landscape.root.visible=true;clearHover();
    positionOverlay(selectedOverlay,s.bottom,s.top-s.bottom);
    controls.minDistance=50;controls.maxDistance=700;controls.maxTargetRadius=540;controls.minPolarAngle=.025;controls.maxPolarAngle=Math.PI/2-.08;
    $('#explorer-eyebrow').textContent='02 / CHOOSE YOUR FLOOR';$('#explorer-title').textContent=s.name;
    $('#explorer-description').textContent='Move over the façade to highlight a floor. Select it to open the entire floor and its apartments.';
    $('#explorer-summary').textContent=`Floors ${s.firstFloor}–${s.lastFloor} · ${s.lastFloor-s.firstFloor+1} floors`;
    $('#explore-section').textContent=s.name;$('#explore-section').setAttribute('aria-current','step');$('#explorer-back').textContent='← All sections';
    renderFloorButtons();sync();
    const middle=(s.bottom+s.top)/2;
    moveCamera([120,middle+22,160],[0,middle,0]);
    $('#announcement').textContent=`${s.name} selected. Choose a floor from ${s.firstFloor} to ${s.lastFloor}.`;
  }
  function floorCamera(instant=false){
    const aspect=camera.aspect,tan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
    const distance=Math.max(32/.60,38/(aspect*.72))/(2*tan);
    const tilt=Math.PI/4,azimuth=.5;
    controls.minAzimuthAngle=azimuth;controls.maxAzimuthAngle=azimuth;
    moveCamera([distance*Math.sin(tilt)*Math.sin(azimuth),state.cutHeight+distance*Math.cos(tilt),distance*Math.sin(tilt)*Math.cos(azimuth)],[0,state.cutHeight,0],instant);
  }
  function selectFloor(floor){
    const s=section();if(!s||floor<s.firstFloor||floor>s.lastFloor)return;
    closeStandalone();state.level='floor';state.floor=floor;state.apartment=null;state.autoRotate=false;clearHover();
    state.cutHeight=s.bottom+(floor-s.firstFloor)*s.floorHeight;
    resetPivot();
    for(const {object,original,clipped} of towerMaterials){
      clipped.copy(original);clipped.clippingPlanes=[cutPlane];clipped.clipShadows=true;object.material=clipped;
    }
    selectedOverlay.visible=false;landscape.root.visible=true;floorPlan.root.visible=true;floorPlan.root.position.y=state.cutHeight;
    controls.enablePan=false;controls.enableRotate=true;controls.enableDamping=false;controls.cursor.set(0,state.cutHeight,0);
    controls.minDistance=40;controls.maxDistance=220;controls.maxTargetRadius=0;controls.minPolarAngle=0;controls.maxPolarAngle=Math.PI/2;
    $('#explorer-eyebrow').textContent=`03 / ${s.name.toUpperCase()}`;$('#explorer-title').textContent=`Floor ${floor}`;
    $('#explorer-description').textContent='The tower opens at this floor. Drag to turn the building around its center and explore the apartments.';
    $('#explorer-summary').textContent=`${floorPlan.apartments.length} apartments · compact lifts & stairs`;
    $('#explore-floor').textContent=`Floor ${floor}`;$('#explore-section').removeAttribute('aria-current');$('#explorer-back').textContent=`← Back to ${s.name.toLowerCase()}`;
    $('#apartment-picker').value='';selectApartment(null);renderFloorButtons();
    $('#announcement').textContent=`Floor ${floor}. Full-floor cutaway with ${floorPlan.apartments.length} concept apartments.`;
  }
  function apartmentCamera(instant=false){
    const apartment=floorPlan.apartments.find(a=>a.number===state.apartment);if(!apartment)return;
    const width=Math.max(...apartment.points.map(p=>p[0]))-Math.min(...apartment.points.map(p=>p[0]));
    const depth=Math.max(...apartment.points.map(p=>p[1]))-Math.min(...apartment.points.map(p=>p[1]));
    const span=Math.hypot(width,depth),tan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
    const distance=Math.max(span/.65,span/(camera.aspect*.64))/(2*tan),tilt=Math.PI/4,azimuth=.5;
    controls.minDistance=10;controls.cursor.copy(pivotWorld);
    moveCamera([pivotWorld.x+distance*Math.sin(tilt)*Math.sin(azimuth),pivotWorld.y+distance*Math.cos(tilt),pivotWorld.z+distance*Math.sin(tilt)*Math.cos(azimuth)],pivotWorld.toArray(),instant);
  }
  function selectApartment(number){
    if(state.level!=='floor')return;
    const apartment=floorPlan.apartments.find(a=>a.number===number);if(number&&!apartment)return;
    closeStandalone();state.apartment=number;state.hoverApartment=null;state.autoRotate=false;resetPivot();
    floorPlan.highlight(number);$('#apartment-picker').value=number||'';
    const name=number?`Apartment ${String(state.floor).padStart(2,'0')}.${String(number).padStart(2,'0')}`:`All ${floorPlan.apartments.length} apartments`;
    $('#apartment-name').textContent=name;
    $('#apartment-description').textContent=number?'Drag to rotate or tilt around this apartment. Choose “All apartments” to return to the floor.':'Hover an apartment, then click to explore it.';
    if(number){
      pivotLocal.set(apartment.center[0],.08,apartment.center[1]).applyMatrix4(floorPlan.root.matrix);
      pivotWorld.copy(pivotLocal);stage.localToWorld(pivotWorld);updateStage();
      $('#explorer-title').textContent=name;$('#explorer-description').textContent='Explore the apartment within the building. Drag around its center to explore the apartment and its outlook.';
      $('#explorer-summary').textContent=`${apartment.type==='corner'?'Corner · 2 bedrooms':apartment.type==='studio'?'Studio':'1 bedroom'} · ~${Math.round(apartment.area)} m² concept area`;$('#explorer-back').textContent=`← All apartments on floor ${state.floor}`;
      apartmentCamera();
    }else{
      controls.minDistance=40;controls.cursor.set(0,state.cutHeight,0);
      $('#explorer-title').textContent=`Floor ${state.floor}`;$('#explorer-description').textContent='The tower opens at this floor. Drag to turn the building around its center and explore the apartments.';
      $('#explorer-summary').textContent=`${floorPlan.apartments.length} apartments · compact lifts & stairs`;$('#explorer-back').textContent=`← Back to ${section().name.toLowerCase()}`;
      floorCamera();
    }
    sync();
    $('.interaction-hint').textContent=number?'Drag to rotate & tilt · Scroll to zoom · Back to see all apartments':'Drag to rotate & tilt · Scroll to zoom · Select an apartment';
    $('#announcement').textContent=number?`${name} selected. Drag to rotate and tilt around its center.`:`Floor ${state.floor}. All apartments.`;
  }
  function viewApartment(){
    if(!state.apartment||state.isolated)return;
    savedFloorCamera={position:camera.position.toArray(),target:controls.target.toArray()};
    standalone=floorPlan.createApartment(state.apartment);scene.add(standalone.root);standalone.root.position.copy(pivotWorld);standalone.root.rotation.y=floorPlan.root.rotation.y;
    stage.visible=false;state.isolated=true;state.autoRotate=false;clearHover();
    $('#explorer-eyebrow').textContent='INSIDE YOUR APARTMENT';
    $('#explorer-description').textContent='Your apartment, on its own. Explore the rooms, living spaces and terrace from any angle.';
    $('#explorer-back').textContent=`← Back to floor ${state.floor}`;
    sync();apartmentCamera();
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches)$('#viewport').animate([{opacity:.1},{opacity:1}],{duration:400,easing:'ease-out'});
    $('.interaction-hint').textContent='Drag to rotate & tilt · Scroll to zoom · Escape to return to the floor';
    $('#explorer-back').focus({preventScroll:true});
  }
  function returnToFloor(){
    closeStandalone();selectApartment(state.apartment);
    $('#explorer-eyebrow').textContent=`03 / ${section().name.toUpperCase()}`;
    if(savedFloorCamera){controls.cursor.fromArray(savedFloorCamera.target);moveCamera(savedFloorCamera.position,savedFloorCamera.target);}
    $('#view-apartment').focus({preventScroll:true});
  }
  $('#view-apartment').onclick=viewApartment;
  panel.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&state.isolated){event.preventDefault();returnToFloor();}
  });
  function highlightFloor(floor){
    const s=section();state.hoverFloor=floor;state.hoverSection=null;
    positionOverlay(hoverOverlay,s.bottom+(floor-s.firstFloor)*s.floorHeight,s.floorHeight);
    document.querySelectorAll('[data-floor]').forEach(b=>b.classList.toggle('hovered',Number(b.dataset.floor)===floor));invalidate();
  }
  function towerSectionAt(point){return TOWER_SECTIONS.find(s=>point.y>=s.bottom&&point.y<=s.top);}
  function hoverTower(point,event){
    const s=towerSectionAt(point);
    if(!s||(state.level==='section'&&s.id!==state.sectionId)){clearHover();return;}
    if(state.level==='sections'){
      state.hoverSection=s.id;state.hoverFloor=null;positionOverlay(hoverOverlay,s.bottom,s.top-s.bottom);
      tooltip.textContent=`${s.name} · Floors ${s.firstFloor}–${s.lastFloor}  ↗`;
    }else if(state.level==='section'){
      const floor=floorAtHeight(s,point.y);highlightFloor(floor);tooltip.textContent=`Floor ${floor} · View all apartments  ↗`;
    }else return;
    if(event){tooltip.hidden=false;tooltip.style.left=`${Math.min(event.clientX+18,innerWidth-240)}px`;tooltip.style.top=`${Math.max(90,event.clientY-38)}px`;}
    $('#viewport').style.cursor='pointer';invalidate();
  }
  function activateTower(point){
    const s=towerSectionAt(point);if(!s)return false;
    if(state.level==='sections')selectSection(s.id);
    else if(state.level==='section'&&s.id===state.sectionId)selectFloor(floorAtHeight(s,point.y));
    return true;
  }
  function back(){if(state.isolated){returnToFloor();return;}if(state.level==='floor'&&state.apartment)selectApartment(null);else if(state.level==='floor')selectSection(state.sectionId);else{reset();showTower();}}
  $('#explorer-back').onclick=back;$('#explore-section').onclick=()=>selectSection(state.sectionId);
  $('#explore-sections').onclick=()=>{reset();showTower();};$('#explore-neighborhood').onclick=()=>{reset();showNeighborhood();};
  const shortcuts=document.createElement('div');shortcuts.id='section-shortcuts';shortcuts.setAttribute('aria-label','Tower sections');
  for(const s of TOWER_SECTIONS){const button=document.createElement('button');button.dataset.section=s.id;button.textContent=String(s.id).padStart(2,'0');button.title=`${s.name} · Floors ${s.firstFloor}–${s.lastFloor}`;button.setAttribute('aria-label',`Explore ${s.name.toLowerCase()}, floors ${s.firstFloor} to ${s.lastFloor}`);button.onclick=()=>selectSection(s.id);shortcuts.append(button);}
  const caption=document.createElement('span');caption.textContent='SELECT A SECTION';shortcuts.prepend(caption);$('#place-body').append(shortcuts);
  for(const apartment of floorPlan.apartments){const option=document.createElement('option');option.value=apartment.number;option.textContent=`Apartment ${String(apartment.number).padStart(2,'0')} · ${apartment.type==='corner'?'2 bed corner':apartment.type==='studio'?'Studio':'1 bed'}`;$('#apartment-picker').append(option);}
  $('#compact-floor-picker').onchange=e=>selectFloor(Number(e.target.value));
  $('#apartment-picker').onchange=e=>selectApartment(Number(e.target.value)||null);
  sync();
  return {state,floorPlan,stage,viewApartment,returnToFloor,get standalone(){return standalone;},rotateFloor,update(delta){if(state.level==='floor'&&state.autoRotate)rotateFloor(delta*.18);},sections:TOWER_SECTIONS,reset,back,selectSection,selectFloor,selectApartment,hoverTower,activateTower,clearHover,
    hoverApartment(number){state.hoverApartment=number;floorPlan.highlight(number||state.apartment);$('#viewport').style.cursor=number?'pointer':'';invalidate();},
    resize(){if(state.level==='floor'){if(state.apartment)apartmentCamera();else floorCamera();}},
    isFloor(){return state.level==='floor';},isDetailed(){return state.level!=='sections';},
    get overlays(){return {hover:hoverOverlay,selected:selectedOverlay};},
  };
}
