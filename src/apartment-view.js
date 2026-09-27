import * as THREE from 'three';

// Clip the existing furnished floor geometry to one apartment's convex footprint.
// This keeps its rooms identical in the building and the standalone view.
function clipGeometry(geometry,points){
  const attributes=['position','normal','uv'].filter(name=>geometry.getAttribute(name));
  const sizes=attributes.map(name=>geometry.getAttribute(name).itemSize);
  const index=geometry.index,count=index?index.count:geometry.attributes.position.count;
  const output=attributes.map(()=>[]);
  const vertex=i=>attributes.flatMap(name=>{const a=geometry.getAttribute(name);return Array.from({length:a.itemSize},(_,j)=>a.array[i*a.itemSize+j]);});
  for(let t=0;t<count;t+=3){
    let polygon=[0,1,2].map(j=>vertex(index?index.getX(t+j):t+j));
    for(let e=0;e<points.length&&polygon.length;e++){
      const a=points[e],b=points[(e+1)%points.length],dx=b[0]-a[0],dz=b[1]-a[1];
      const distance=v=>dx*(v[2]-a[1])-dz*(v[0]-a[0]);
      const next=[];
      for(let i=0;i<polygon.length;i++){
        const p=polygon[i],q=polygon[(i+1)%polygon.length],dp=distance(p),dq=distance(q),insideP=dp>=-1e-7,insideQ=dq>=-1e-7;
        if(insideP)next.push(p);
        if(insideP!==insideQ){const r=dp/(dp-dq);next.push(p.map((v,k)=>v+(q[k]-v)*r));}
      }
      polygon=next;
    }
    for(let j=1;j+1<polygon.length;j++)for(const v of [polygon[0],polygon[j],polygon[j+1]]){
      let offset=0;sizes.forEach((size,k)=>{output[k].push(...v.slice(offset,offset+size));offset+=size;});
    }
  }
  if(!output[0].length)return null;
  const result=new THREE.BufferGeometry();attributes.forEach((name,i)=>result.setAttribute(name,new THREE.Float32BufferAttribute(output[i],sizes[i])));result.normalizeNormals();return result;
}

export function createApartmentView(structure,apartment){
  const root=new THREE.Group();root.name=`Standalone apartment ${apartment.id}`;
  const contents=new THREE.Group();contents.position.set(-apartment.center[0],0,-apartment.center[1]);root.add(contents);
  for(const original of structure.children){
    if(!original.isMesh)continue;
    const geometry=clipGeometry(original.geometry,apartment.points);if(!geometry)continue;
    const mesh=new THREE.Mesh(geometry,original.material);mesh.castShadow=original.castShadow;mesh.receiveShadow=true;contents.add(mesh);
  }
  const material=apartment.material.clone();material.emissive.set('#000000');
  const floor=new THREE.Mesh(apartment.mesh.geometry.clone(),material);floor.receiveShadow=true;contents.add(floor);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.ShadowMaterial({opacity:.12}));ground.rotation.x=-Math.PI/2;ground.position.y=-.77;ground.receiveShadow=true;root.add(ground);
  const sun=new THREE.DirectionalLight('#fff5db',1.3);sun.position.set(-12,25,15);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera,{left:-22,right:22,top:22,bottom:-22,near:1,far:70});sun.shadow.normalBias=.02;sun.shadow.bias=-.0002;sun.shadow.camera.updateProjectionMatrix();root.add(sun,sun.target,new THREE.HemisphereLight('#fffdf4','#bdc9b1',.65));
  root.userData.apartment=apartment.number;
  return {root,dispose(){root.traverse(object=>{if(object.isMesh)object.geometry.dispose();});material.dispose();ground.material.dispose();sun.shadow.dispose();root.removeFromParent();}};
}
