import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createApartmentView } from './apartment-view.js';
import { roundedOutline } from './tower-config.js';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .85, ...extra });
const materials = {
  slab: mat('#ddd7c8'), edge: mat('#b7b5a3'), wall: mat('#f1efe4'), core: mat('#c6c4b5'),
  coreWall: mat('#e0dcd0'), mint: mat('#bed8c5'), mint2: mat('#cbe0cf'), mint3: mat('#aecdbb'),
  glass: mat('#90c8b6', { transparent: true, opacity: .35, depthWrite: false, side: THREE.DoubleSide }),
  frame: mat('#8a947e'), oak: mat('#bdac8f'), white: mat('#eeeade'), bed: mat('#d9dbca'),
  sofa: mat('#566d79'), rug: mat('#adb5b0'), terrace: mat('#aaa596'), foliage: mat('#647f52'),
  metal: mat('#909f98', { metalness: .25 }), tile: mat('#d5d8cb'), dark: mat('#647969'),
};
const outline = roundedOutline();
const box = new THREE.BoxGeometry(1,1,1);
const round = new THREE.CylinderGeometry(1,1,1,20);
function oakTexture(){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#c8b595';ctx.fillRect(0,0,512,512);ctx.translate(256,256);ctx.rotate(Math.PI/4);
  for(let row=-36;row<36;row++)for(let col=-6;col<6;col++){
    const x=col*88+(row%3)*29,y=row*15,shade=((row*13+col*7)%9+9)%9;
    ctx.fillStyle=`hsl(36 24% ${65+shade}%)`;ctx.fillRect(x,y,87,14);
    ctx.strokeStyle='#8f785525';ctx.strokeRect(x,y,87,14);
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(.16,.16);return texture;
}
function shape(points) { return new THREE.Shape(points.map(([x,z]) => new THREE.Vector2(x,-z))); }
function extrude(points, height) {
  const g=new THREE.ExtrudeGeometry(shape(points),{depth:height,bevelEnabled:false});g.rotateX(-Math.PI/2);return g;
}
function clip(points, [minX,minZ,maxX,maxZ]) {
  let p=points;
  for(const [axis,limit,sign] of [[0,minX,1],[0,maxX,-1],[1,minZ,1],[1,maxZ,-1]]) {
    const out=[];
    for(let i=0;i<p.length;i++) {
      const a=p[i],b=p[(i+1)%p.length],ai=(a[axis]-limit)*sign>=0,bi=(b[axis]-limit)*sign>=0;
      if(ai)out.push(a);
      if(ai!==bi){const t=(limit-a[axis])/(b[axis]-a[axis]);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
    }
    p=out;
  }
  return p;
}
function inside(x,z,points) {
  let result=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const [ax,az]=points[i],[bx,bz]=points[j];
    if((az>z)!==(bz>z)&&x<(bx-ax)*(z-az)/(bz-az)+ax)result=!result;
  }
  return result;
}
function label(text,x,z,width=1.5) {
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=96;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#526c5b';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='500 35px Arial';ctx.fillText(text,128,48,240);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(width,width*96/256),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));
  m.rotation.x=-Math.PI/2;m.position.set(x,.17,z);return m;
}

export function createFloorPlan() {
  const root=new THREE.Group();root.name='Reference-based full-floor cutaway';root.visible=false;
  const structure=new THREE.Group();root.add(structure);
  const batches=new Map();
  function add(geo,material,x=0,y=0,z=0,ry=0){
    const m=new THREE.Mesh(geo,material);m.position.set(x,y,z);m.rotation.y=ry;m.updateMatrix();
    if(!batches.has(material))batches.set(material,[]);
    batches.get(material).push(geo.clone().applyMatrix4(m.matrix));
  }
  function cube(material,x,y,z,w,h,d,ry=0){
    const g=box.clone();g.scale(w,h,d);add(g,material,x,y,z,ry);g.dispose();
  }
  function wall(a,b,material=materials.wall,height=1.65,thickness=.16){
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<.025)return;
    cube(material,(a[0]+b[0])/2,height/2+.08,(a[1]+b[1])/2,length,height,thickness,-Math.atan2(b[1]-a[1],b[0]-a[0]));
  }
  function doorway(a,b,material=materials.wall){
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]),dx=(b[0]-a[0])/length,dz=(b[1]-a[1])/length;
    const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    wall(a,[mid[0]-dx*.5,mid[1]-dz*.5],material);wall([mid[0]+dx*.5,mid[1]+dz*.5],b,material);
    cube(materials.oak,mid[0],.12,mid[1],1,.07,.18,-Math.atan2(dz,dx));
  }
  const slabGeo=extrude(outline,.5);add(slabGeo,materials.slab,0,-.5);slabGeo.dispose();
  const plinthGeo=extrude(roundedOutline(34.2,29.2,8.5),.25);add(plinthGeo,materials.edge,0,-.75);plinthGeo.dispose();
  cube(materials.core,0,.025,0,14,.05,10);
  const wood=oakTexture();
  const apartments=[],picks=[],walls=new Set();
  // Corners extend along both façades and reach the compact central corridor.
  const definitions=[];
  const spans=[[-16.5,-4.5],[-4.5,0],[0,4.5],[4.5,16.5]];
  for(const [i,[lo,hi]] of spans.entries())definitions.push({side:'north',bounds:[lo,-14,hi,-5],type:i===0||i===3?'corner':i===1?'studio':'one-bedroom',mirror:i===3});
  definitions.push({side:'east',bounds:[7,-5,16.5,-1],type:'studio'},{side:'east',bounds:[7,-1,16.5,5],type:'one-bedroom'});
  for(const [i,[lo,hi]] of [...spans].reverse().entries())definitions.push({side:'south',bounds:[lo,5,hi,14],type:i===0||i===3?'corner':i===1?'studio':'one-bedroom',mirror:i===3});
  definitions.push({side:'west',bounds:[-16.5,1,-7,5],type:'studio'},{side:'west',bounds:[-16.5,-5,-7,1],type:'one-bedroom'});
  definitions.forEach(({bounds,side,type,mirror=false},i)=>{
    const points=clip(outline,bounds),[minX,minZ,maxX,maxZ]=bounds;
    const center=[points.reduce((n,p)=>n+p[0],0)/points.length,points.reduce((n,p)=>n+p[1],0)/points.length];
    const unitMaterial=mat(['#f2e4cc','#e9d8ba','#eddfc8'][i%3],{map:wood});
    const floor=new THREE.Mesh(extrude(points,.065),unitMaterial);floor.receiveShadow=true;
    floor.userData.apartment=i+1;root.add(floor);picks.push(floor);
    const highlightGeometry=new THREE.ShapeGeometry(shape(points));highlightGeometry.rotateX(-Math.PI/2);
    const highlight=new THREE.Mesh(highlightGeometry,new THREE.MeshBasicMaterial({color:'#81dcb3',transparent:true,opacity:.28,depthWrite:false,side:THREE.DoubleSide}));
    highlight.position.y=1.86;highlight.visible=false;highlight.renderOrder=4;root.add(highlight);
    const area=Math.abs(points.reduce((sum,p,j)=>{const q=points[(j+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2;
    const apartment={area,type,bedrooms:type==='corner'?2:type==='studio'?0:1,highlight,number:i+1,id:`A${String(i+1).padStart(2,'0')}`,points,center,mesh:floor,material:unitMaterial};apartments.push(apartment);
    for(let j=0;j<points.length;j++) {
      const a=points[j],b=points[(j+1)%points.length];
      const key=[a,b].map(p=>p.map(n=>n.toFixed(3)).join(',')).sort().join('|');
      if(walls.has(key))continue;walls.add(key);
      const facade=outline.some((p,k)=>{
        const q=outline[(k+1)%outline.length],dx=q[0]-p[0],dz=q[1]-p[1],len=Math.hypot(dx,dz);
        const on=c=>Math.abs(dx*(c[1]-p[1])-dz*(c[0]-p[0]))/len<.01 && c[0]>=Math.min(p[0],q[0])-.01 && c[0]<=Math.max(p[0],q[0])+.01 && c[1]>=Math.min(p[1],q[1])-.01 && c[1]<=Math.max(p[1],q[1])+.01;
        return on(a)&&on(b);
      });
      let corridor=null;
      if(Math.abs(Math.abs(a[1])-5)<.01&&Math.abs(a[1]-b[1])<.01)corridor={axis:0,low:-7,high:7};
      if(Math.abs(Math.abs(a[0])-7)<.01&&Math.abs(a[0]-b[0])<.01)corridor={axis:1,low:-5,high:5};
      if(facade)wall(a,b,materials.glass,1.8,.08);
      else if(corridor){
        const {axis,low,high}=corridor,lo=Math.max(Math.min(a[axis],b[axis]),low),hi=Math.min(Math.max(a[axis],b[axis]),high);
        if(hi-lo>1.2){
          const start=a[axis]<b[axis]?a:b,end=a[axis]<b[axis]?b:a,c=[...start],d=[...end];c[axis]=lo;d[axis]=hi;
          wall(start,c);doorway(c,d);wall(d,end);apartment.entrance=[(c[0]+d[0])/2,(c[1]+d[1])/2];
        }else wall(a,b);
      }else wall(a,b);
    }
    const horizontal=side==='north'||side==='south',W=horizontal?maxX-minX:maxZ-minZ,D=horizontal?maxZ-minZ:maxX-minX;
    function point(u,v){if(mirror)u=W-u;return side==='north'?[minX+u,-5-v]:side==='south'?[maxX-u,5+v]:side==='east'?[7+v,maxZ-u]:[-7-v,minZ+u];}
    function part(u,v,w,h,d,material,y=h/2+.08){
      const corners=[[u-w/2,v-d/2],[u+w/2,v-d/2],[u+w/2,v+d/2],[u-w/2,v+d/2]].map(([x,z])=>point(x,z));
      if(!corners.every(p=>inside(...p,points)))return;
      const [x,z]=point(u,v);cube(material,x,y,z,horizontal?w:d,h,horizontal?d:w);
    }
    function partition(u1,v1,u2,v2,door=false){
      const a=point(u1,v1),b=point(u2,v2);
      if(inside(...a,points)&&inside(...b,points))(door?doorway:wall)(a,b);
    }
    function zone(u1,v1,u2,v2,material){
      const a=point(u1,v1),b=point(u2,v2),poly=clip(points,[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])]);
      if(poly.length<3)return;const geo=extrude(poly,.035);add(geo,material,0,.075);geo.dispose();
    }
    function bed(u,v){
      part(u,v,2.2,.025,2.8,materials.rug,.115);part(u,v,1.65,.26,2.12,materials.oak);
      part(u,v,1.6,.22,2.02,materials.white,.43);part(u,v+.7,1.45,.08,.46,materials.bed,.59);
      part(u-.95,v+.65,.35,.4,.45,materials.oak);part(u+.95,v+.65,.35,.4,.45,materials.oak);
    }
    function bathroom(u,v){
      zone(u,v,u+1.8,v+2.1,materials.tile);
      partition(u,v,u+1.8,v);partition(u,v,u,v+2.1);partition(u+1.8,v,u+1.8,v+2.1);partition(u,v+2.1,u+1.8,v+2.1,true);
      part(u+.45,v+.55,.55,.5,.72,materials.white);part(u+1.35,v+.4,.6,.2,.45,materials.white,.7);
      part(u+1.2,v+1.5,.8,.04,.8,materials.metal,.13);
    }
    function dining(u,v){
      const [x,z]=point(u,v);if(!inside(x,z,points))return;
      const g=round.clone();g.scale(.55,.08,.55);add(g,materials.oak,x,.8,z);g.dispose();
      for(const [du,dv]of [[-.78,0],[.78,0],[0,-.78],[0,.78]])part(u+du,v+dv,.42,.42,.42,materials.white);
    }
    function living(u,v){
      part(u,v,2.5,.025,2.45,materials.rug,.115);part(u,v+.78,2.15,.42,.78,materials.sofa);
      part(u,v+1.12,2.15,.32,.15,materials.sofa,.62);part(u,v,1.05,.3,.6,materials.oak);
      part(u,v-1.1,1.6,.48,.3,materials.oak);part(u,v-1.14,1.1,.5,.08,materials.dark,.95);
    }
    function kitchen(u,v,length){
      part(u,v,length,.84,.65,materials.oak);part(u,v,length,.06,.68,materials.white,.95);
      part(u-.55,v,.55,.025,.46,materials.dark,.995);part(u+.5,v,.55,.025,.44,materials.metal,.995);
    }
    function terrace(u1,u2){
      zone(u1,D-1.5,u2,D,materials.terrace);
      partition(u1+.1,D-1.5,u2-.1,D-1.5,true);
      const middle=(u1+u2)/2;part(middle-.6,D-.75,.45,.42,.5,materials.sofa);part(middle+.6,D-.75,.45,.42,.5,materials.sofa);
      part(middle,D-.75,.45,.5,.45,materials.oak);
    }
    if(type==='corner'){
      // Two bedrooms step along the curved façade; the living room gets the broad outlook.
      partition(4.1,.2,4.1,4.1);partition(.4,4.1,4.1,4.1,true);bed(2.3,2.5);
      partition(4.1,4.1,7.7,4.1,true);partition(7.7,4.1,7.7,D-1.5);bed(5.9,5.8);
      bathroom(5,.25);kitchen(9.4,2.1,3.5);dining(9.7,3.9);living(9.6,6.1);terrace(7.8,W);
    }else if(type==='one-bedroom'){
      bathroom(.2,.2);kitchen(W-.55,3.6,1);
      partition(.1,D-4.35,W-.1,D-4.35,true);bed(W/2,D-2.95);
      living(W/2,3.5);dining(W-1.1,1.1);terrace(.05,W-.05);
    }else{
      bathroom(.2,.2);kitchen(W/2,3,Math.min(2.8,W-.5));bed(W/2,D-3.1);
      dining(W-.95,4.1);part(W-.5,1.2,.7,.6,1.5,materials.sofa);terrace(.05,W-.05);
    }
    const [lx,lz]=point(type==='corner'?8.5:W/2,type==='corner'?1.1:2.55);
    root.add(label(apartment.id,lx,lz,1.4));
  });
  // Compact 10.4 × 6.8 m core; two stairs flank four lifts and a central lobby.
  const core=[[-5.2,-3.4],[5.2,-3.4],[5.2,3.4],[-5.2,3.4]];
  for(let i=0;i<4;i++)doorway(core[i],core[(i+1)%4],materials.coreWall);
  for(const x of [-.95,.95])for(const z of [-2.15,2.15]){
    cube(materials.metal,x,.08,z,1.6,.08,1.8);
    const back=z<0?z-.9:z+.9;
    wall([x-.8,back],[x+.8,back],materials.coreWall);
    wall([x-.8,z-.9],[x-.8,z+.9],materials.coreWall);wall([x+.8,z-.9],[x+.8,z+.9],materials.coreWall);
  }
  for(const x of [-3.65,3.65]){
    wall([x-1.1,-2.7],[x-1.1,2.7],materials.coreWall);wall([x+1.1,-2.7],[x+1.1,2.7],materials.coreWall);
    for(let j=0;j<10;j++){
      cube(materials.white,x-.5,.12+j*.07,-2+j*.4,.85,.14+j*.14,.4);
      cube(materials.white,x+.5,.12+(9-j)*.07,-2+j*.4,.85,.14+(9-j)*.14,.4);
    }
    cube(materials.coreWall,x,.85,0,.12,1.7,4.2);
  }
  root.add(label('LIFT LOBBY',0,0,2.5));root.add(label('CORRIDOR',0,4.2,2.8));root.add(label('CORRIDOR',0,-4.2,2.8));
  for(let i=0;i<outline.length;i++){
    const a=outline[i],b=outline[(i+1)%outline.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const count=Math.max(1,Math.ceil(len/1.25));
    for(let j=0;j<count;j++)cube(materials.frame,a[0]+(b[0]-a[0])*j/count,.92,a[1]+(b[1]-a[1])*j/count,.055,1.84,.055);
  }
  for(const [material,geometries]of batches){const m=new THREE.Mesh(mergeGeometries(geometries),material);m.castShadow=!material.transparent;m.receiveShadow=true;structure.add(m);geometries.forEach(g=>g.dispose());}
  const light=new THREE.DirectionalLight('#fff5db',1.3);light.position.set(-15,35,18);light.castShadow=true;light.shadow.mapSize.set(1024,1024);
  Object.assign(light.shadow.camera,{left:-26,right:26,top:26,bottom:-26,near:1,far:90});light.shadow.bias=-.0003;light.shadow.normalBias=.03;light.shadow.camera.updateProjectionMatrix();root.add(light,light.target);
  root.add(new THREE.HemisphereLight('#fffdf4','#bdc9b1',.65));
  return {root,apartments,picks,createApartment(number){return createApartmentView(structure,apartments.find(a=>a.number===number));},stats:{sharedArea:140,coreArea:10.4*6.8,apartmentArea:apartments.reduce((sum,a)=>sum+a.area,0)},highlight(number){apartments.forEach(a=>{a.highlight.visible=a.number===number;a.material.emissive.set(a.number===number?'#377b58':'#000000');a.material.emissiveIntensity=a.number===number?.35:0;});}};
}
