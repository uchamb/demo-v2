import * as THREE from 'three';

// Two instanced batches for the whole neighborhood: no lights or shadow passes.
export function createNightWindows(root, windows, seed, litFraction=.4) {
  const order=windows.map((_,i)=>i);
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
  const capacity=Math.round(windows.length*litFraction);
  const material=new THREE.MeshBasicMaterial({color:'#ffffff',toneMapped:false});
  const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material,capacity);
  mesh.name='Warm window colors';mesh.userData.nightWindows=true;
  const dummy=new THREE.Object3D(),colors=['#ffdcaa','#f6c97e','#ffe6bb'].map(c=>new THREE.Color(c));
  order.slice(0,capacity).forEach((index,i)=>{
    const [x,y,z,w,h,d,ry=0]=windows[index];
    dummy.position.set(x,y,z);dummy.scale.set(w,h,d);dummy.rotation.set(0,ry,0);dummy.updateMatrix();
    mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,colors[Math.floor(random()*colors.length)]);
  });
  mesh.computeBoundingSphere();mesh.count=0;mesh.visible=false;root.add(mesh);
  return {mesh,total:windows.length,capacity,setProgress(progress){
    const count=Math.round(capacity*THREE.MathUtils.clamp(progress,0,1));
    const changed=mesh.count!==count;mesh.count=count;mesh.visible=count>0;return changed;
  }};
}
