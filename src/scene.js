import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import neighborhood from './data/neighborhood.json';
import { createNightWindows } from './night-windows.js';
import { TOWER_SECTIONS } from './tower-config.js';

const box = new THREE.BoxGeometry(1, 1, 1);
const sphere = new THREE.IcosahedronGeometry(1, 1);
const cone = new THREE.ConeGeometry(1, 1, 7);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .82, ...extra });
const M = {
  earth: material('#c4c3af'), grass: material('#a5b58b'), park: material('#a4b789'), forest: material('#8ea57c'),
  road: material('#aaa99a'), path: material('#d7d2bb'), paving: material('#e3dfcf'), curb: material('#d7d5c6'),
  cream: material('#d4d3c0'), light: material('#e6e3d4'), roof: material('#b4b9a8'), window: material('#84938c'),
  glass: material('#658a92', { metalness: .58, roughness: .26 }), glassLight: material('#a2bbba', { metalness: .5, roughness: .24 }),
  mullion: material('#d2c7a4', { metalness: .38, roughness: .45 }), slab: material('#d6d8c3'),
  dark: material('#30463c'), leaf: material('#72875c'), leaf2: material('#8f9e68'), leaf3: material('#5d7955'), trunk: material('#8c7c60'),
  water: material('#71acb0', { metalness: .5, roughness: .18 }), sand: material('#c9b999'), pitch: material('#8ba273'),
  line: material('#dfdfc9'), car: material('#d5d7c7'), carDark: material('#5e736b'), carWarm: material('#9f7761'),
  warm: material('#e0cda1', { emissive: '#ffd59b', emissiveIntensity: 0 }),
};
// Metres, X east and Z south. The continuous terrain is illustrative, not DEM data.
export function groundHeight(x, z) {
  const south = Math.max(0, z - 65);
  const west = Math.max(0, -x - 230);
  return south * south * .00014 + west * west * .00007 + (Math.sin(x / 150) * Math.sin(z / 160)) * 1.7;
}
let seed = 43871;
function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
class Batches {
  constructor(root) { this.root = root; this.items = new Map(); }
  add(geometry, mat, x, y, z, sx, sy, sz, ry = 0, rx = 0) {
    const key = geometry.uuid + mat.uuid;
    if (!this.items.has(key)) this.items.set(key, { geometry, mat, values: [] });
    this.items.get(key).values.push([x, y, z, sx, sy, sz, ry, rx]);
  }
  box(mat, x, y, z, sx, sy, sz, ry = 0) { this.add(box, mat, x, y, z, sx, sy, sz, ry); }
  flush() {
    const dummy = new THREE.Object3D();
    for (const { geometry, mat, values } of this.items.values()) {
      const mesh = new THREE.InstancedMesh(geometry, mat, values.length);
      values.forEach(([x, y, z, sx, sy, sz, ry, rx], i) => {
        dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(rx, ry, 0);
        dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.computeBoundingSphere(); this.root.add(mesh);
    }
    this.items.clear();
  }
}
function mesh(geometry, mat, root, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, mat); m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true; root.add(m); return m;
}
function shape(points) { return new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z))); }
function inside(x, z, points) {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, zi] = points[i], [xj, zj] = points[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) result = !result;
  }
  return result;
}
function centroid(points) {
  const p = points.slice(0, -1); return [p.reduce((a, p) => a + p[0], 0) / p.length, p.reduce((a, p) => a + p[1], 0) / p.length];
}
function closed(points) { return points.length > 3 && points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1]; }
// Clip mapped polygons to the local model tile, preserving their geographical orientation.
function clipPolygon(points, bounds = [-500, -470, 500, 470]) {
  let p = points.slice();
  for (const [axis, limit, sign] of [[0, bounds[0], 1], [0, bounds[2], -1], [1, bounds[1], 1], [1, bounds[3], -1]]) {
    const out = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length], ai = (a[axis] - limit) * sign >= 0, bi = (b[axis] - limit) * sign >= 0;
      if (ai) out.push(a);
      if (ai !== bi) { const t = (limit - a[axis]) / (b[axis] - a[axis]); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
    }
    p = out;
  }
  return p;
}
function polygonSurface(points, mat, root, lift = .12, holes = []) {
  const p = clipPolygon(points); if (p.length < 3) return;
  const surfaceShape = shape(p);
  for (const hole of holes) { const clipped = clipPolygon(hole); if (clipped.length > 2) surfaceShape.holes.push(new THREE.Path(clipped.map(([x,z])=>new THREE.Vector2(x,-z)))); }
  const flat = new THREE.ShapeGeometry(surfaceShape).toNonIndexed();
  const source = flat.attributes.position, vertices = [];
  function drape(a,b,c,depth=0) {
    const distance=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1]);
    if(depth<8 && Math.max(distance(a,b),distance(b,c),distance(c,a))>22) {
      const mid=(p,q)=>[(p[0]+q[0])/2,(p[1]+q[1])/2];
      const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);
      drape(a,ab,ca,depth+1);drape(ab,b,bc,depth+1);drape(ca,bc,c,depth+1);drape(ab,bc,ca,depth+1);
    } else for(const [x,y] of [a,b,c])vertices.push(x,groundHeight(x,-y)+lift,-y);
  }
  for(let i=0;i<source.count;i+=3)drape([source.getX(i),source.getY(i)],[source.getX(i+1),source.getY(i+1)],[source.getX(i+2),source.getY(i+2)]);
  flat.dispose();
  const geo = new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geo.computeVertexNormals(); const m = mesh(geo, mat, root); m.castShadow = false; return m;
}
function roundedShape(w, d, r) {
  const s = new THREE.Shape(), x = -w / 2, z = -d / 2;
  s.moveTo(x + r, z); s.lineTo(x + w - r, z); s.quadraticCurveTo(x + w, z, x + w, z + r);
  s.lineTo(x + w, z + d - r); s.quadraticCurveTo(x + w, z + d, x + w - r, z + d);
  s.lineTo(x + r, z + d); s.quadraticCurveTo(x, z + d, x, z + d - r);
  s.lineTo(x, z + r); s.quadraticCurveTo(x, z, x + r, z); return s;
}
function roundedGeometry(w, d, r, height) {
  const g = new THREE.ExtrudeGeometry(roundedShape(w, d, r), { depth: height, bevelEnabled: false, curveSegments: 10 });
  g.rotateX(-Math.PI / 2); return g;
}
function tree(batch, x, z, h, base = groundHeight(x, z), variant = 0) {
  batch.add(cylinder, M.trunk, x, base + h * .3, z, .22, h * .6, .22);
  if (variant % 4 === 0) {
    batch.add(cone, M.leaf3, x, base + h * .58, z, h * .25, h * .95, h * .25);
    batch.add(cone, M.leaf, x, base + h * .8, z, h * .16, h * .65, h * .16);
  } else {
    batch.add(sphere, variant % 2 ? M.leaf : M.leaf2, x, base + h * .7, z, h * .31, h * .39, h * .3, random() * Math.PI);
    batch.add(sphere, M.leaf3, x + h * .16, base + h * .56, z, h * .21, h * .27, h * .24);
  }
}
function segmentDistance(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], d = dx * dx + dz * dz;
  const t = d ? THREE.MathUtils.clamp(((x - a[0]) * dx + (z - a[1]) * dz) / d, 0, 1) : 0;
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}
function roadWidth(tags) {
  return { primary: 12, secondary: 10, tertiary: 8, residential: 6, service: 4, unclassified: 6, footway: 2, path: 1.6, steps: 2.4, pedestrian: 4, cycleway: 2, track: 2.5 }[tags.highway] || 4;
}
function roadGeometry(points, width, lift) {
  const verts = [], indices = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    if (len < .1) continue;
    const count = Math.ceil(len / 8), nx = -dz / len * width / 2, nz = dx / len * width / 2;
    for (let j = 0; j < count; j++) {
      const p = [a[0] + dx * j / count, a[1] + dz * j / count], q = [a[0] + dx * (j + 1) / count, a[1] + dz * (j + 1) / count];
      if (Math.abs((p[0] + q[0]) / 2) > 494 || Math.abs((p[1] + q[1]) / 2) > 464) continue;
      const base = verts.length / 3;
      for (const [x, z] of [[p[0] + nx, p[1] + nz], [q[0] + nx, q[1] + nz], [q[0] - nx, q[1] - nz], [p[0] - nx, p[1] - nz]]) verts.push(x, groundHeight(x, z) + lift, z);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  if (!verts.length) return null;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setIndex(indices); g.computeVertexNormals(); return g;
}
function makeTower(root, vegetation) {
  const tower = new THREE.Group(); tower.name = 'demo2 tower'; root.add(tower);
  tower.rotation.y = -.22;
  const b = new Batches(tower), plants = new Batches(vegetation);
  mesh(roundedGeometry(57, 48, 9, 1), M.paving, tower);
  mesh(roundedGeometry(44, 36, 8, 10), M.glass, tower, 0, 1, 0);
  mesh(roundedGeometry(46, 38, 8.5, 1.2), M.slab, tower, 0, 10.5, 0);
  // Four rounded curtain-wall volumes separated by three open sky gardens.
  const sections = TOWER_SECTIONS;
  const perimeter = roundedShape(33, 28, 8).getSpacedPoints(76);
  for (const { bottom, top, floorHeight, firstFloor, lastFloor } of sections) {
    // End the glass inside the opaque cap so its top face cannot fight the roof.
    mesh(roundedGeometry(33, 28, 8, top - bottom - .35), M.glass, tower, 0, bottom, 0);
    for (let i = 0; i < perimeter.length - 1; i++) {
      const p = perimeter[i];
      b.box(i % 5 === 0 ? M.light : M.mullion, p.x, (bottom + top) / 2, -p.y, .16, top - bottom, .16);
      // Alternating glass panels catch light without thousands of draw calls.
      if (i % 4 === 0) {
        const q = perimeter[i + 1], dx = q.x - p.x, dz = -q.y + p.y;
        b.box(M.glassLight, (p.x + q.x) / 2, (bottom + top) / 2, -(p.y + q.y) / 2, Math.hypot(dx, dz) * .88, top - bottom - 1, .08, -Math.atan2(dz, dx));
      }
    }
    for (let floor = firstFloor; floor <= lastFloor; floor++) {
      const y = bottom + (floor - firstFloor) * floorHeight;
      mesh(roundedGeometry(33.5, 28.5, 8.2, .28), M.mullion, tower, 0, y, 0);
    }
    mesh(roundedGeometry(34.1, 29.1, 8.4, .7), M.slab, tower, 0, top - .7, 0);
  }
  for (const y of [65, 122, 179]) {
    mesh(roundedGeometry(27, 22, 6, 5), M.dark, tower, 0, y, 0);
    mesh(roundedGeometry(35, 30, 8.8, .8), M.slab, tower, 0, y, 0);
    mesh(roundedGeometry(35, 30, 8.8, .45), M.warm, tower, 0, y + 4.5, 0);
    for (const p of roundedShape(30, 25, 7).getSpacedPoints(44)) {
      b.add(sphere, M.leaf2, p.x, y + 1.55, -p.y, 1.1, .95, 1.1);
    }
    for (const x of [-10, 0, 10]) for (const z of [-9, 9]) b.box(M.mullion, x, y + 2.5, z, .3, 5, .3);
  }
  // Inset pool stays below the 260 m roof datum.
  mesh(roundedGeometry(20, 12, 3, .25), M.water, tower, 0, 259.5, 0);
  for (let x = -18; x <= 18; x += 3) for (const z of [-18, 18]) b.box(M.mullion, x, 5.6, z, .22, 10, .22);
  b.box(M.dark, 0, 3.6, 18.2, 9, 6, .4); b.box(M.slab, 0, 8, 22, 15, .7, 9);
  for (let i = 0; i < 5; i++) b.box(M.paving, 0, .18 * (i + 1), 27 - i * 1.3, 22, .2, 1.5);
  // Plaza, planters, benches and cafe furniture are illustrative.
  for (let i = 0; i < 20; i++) {
    const angle = i / 20 * Math.PI * 2, x = Math.cos(angle) * 35, z = Math.sin(angle) * 31;
    if (z > 24 && Math.abs(x) < 15) continue;
    b.box(M.cream, x, .9, z, 3.5, 1.3, 3.5);
    tree(plants, x, z, 5 + random() * 3, .6, i);
    b.box(M.trunk, x * 1.15, 1, z * 1.15, 3, .35, 1, -angle);
  }
  for (let i = 0; i < 7; i++) {
    const x = -26, z = -20 + i * 6;
    b.add(cylinder, M.light, x, 1.5, z, 1.2, .2, 1.2);
    b.box(M.dark, x, .8, z, .2, 1.4, .2);
    b.add(cone, M.sand, x, 4, z, 2.2, .5, 2.2);
    b.box(M.mullion, x, 2.5, z, .1, 3, .1);
  }
  b.flush(); plants.flush();
  const towerBatches = new Map();
  for (const child of [...tower.children]) {
    if (!child.isMesh || child.isInstancedMesh) continue;
    child.updateMatrix();
    if (!towerBatches.has(child.material)) towerBatches.set(child.material, []);
    towerBatches.get(child.material).push(child.geometry.clone().applyMatrix4(child.matrix));
    tower.remove(child); child.geometry.dispose();
  }
  for (const [mat, geometries] of towerBatches) {
    mesh(mergeGeometries(geometries), mat, tower);
    geometries.forEach(g=>g.dispose());
  }
  tower.userData.placeId = 'tower';
  return tower;
}
export function createLandscape() {
  seed = 43871;
  const root = new THREE.Group(); root.name = 'demo2 neighborhood';
  const groups = {};
  for (const name of ['terrain', 'buildings', 'vegetation', 'roads', 'project']) { groups[name] = new THREE.Group(); groups[name].name = name; root.add(groups[name]); }
  const g = new THREE.PlaneGeometry(1000, 940, 100, 94); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, colors = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, groundHeight(x, z));
    const c = new THREE.Color('#c9ceb6'); c.lerp(new THREE.Color('#adb997'), Math.max(0, z / 600));
    c.multiplyScalar(.985 + random() * .03); colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.computeVertexNormals();
  mesh(g, material('#ffffff', { vertexColors: true }), groups.terrain).castShadow = false;
  // Vertical tile edge gives the landscape a readable architectural-model base.
  const edge = [], edgeIndex = [];
  const corners = [[-500,-470],[500,-470],[500,470],[-500,470],[-500,-470]];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 100; j++) {
    const a = corners[i], b = corners[i+1], x = a[0]+(b[0]-a[0])*j/100, z = a[1]+(b[1]-a[1])*j/100;
    const xx = a[0]+(b[0]-a[0])*(j+1)/100, zz = a[1]+(b[1]-a[1])*(j+1)/100, n=edge.length/3;
    edge.push(x,groundHeight(x,z),z,xx,groundHeight(xx,zz),zz,xx,-12,zz,x,-12,z);edgeIndex.push(n,n+2,n+1,n,n+3,n+2);
  }
  const eg = new THREE.BufferGeometry();eg.setAttribute('position',new THREE.Float32BufferAttribute(edge,3));eg.setIndex(edgeIndex);eg.computeVertexNormals();mesh(eg,M.earth,groups.terrain);
  const features = neighborhood.features;
  const greenFeatures = features.filter(f => closed(f.points) && (['wood', 'scrub', 'grassland'].includes(f.tags.natural) || ['forest', 'grass', 'meadow', 'recreation_ground'].includes(f.tags.landuse) || ['park', 'garden'].includes(f.tags.leisure)));
  for (const f of greenFeatures) polygonSurface(f.points, f.tags.natural === 'wood' ? M.forest : M.park, groups.terrain, .12, f.holes || []);
  const surfaces = features.filter(f => closed(f.points) && ['pitch', 'playground', 'swimming_pool'].includes(f.tags.leisure) && Math.hypot(...centroid(f.points)) > 55);
  for (const f of surfaces) polygonSurface(f.points, f.tags.leisure === 'swimming_pool' ? M.water : M.pitch, groups.terrain, .2);
  const roads = features.filter(f => f.tags.highway && !['proposed', 'construction', 'platform'].includes(f.tags.highway));
  const roadGeo = [], pathGeo = [], curbGeo = [], roadSegments = [], roadBatch = new Batches(groups.roads);
  for (const f of roads) {
    const w = roadWidth(f.tags), walking = ['footway', 'path', 'steps', 'pedestrian', 'cycleway', 'track'].includes(f.tags.highway);
    const geo = roadGeometry(f.points, w, walking ? .23 : .29); if (geo) (walking ? pathGeo : roadGeo).push(geo);
    if (!walking) { const curb = roadGeometry(f.points, w + 2.2, .19); if (curb) curbGeo.push(curb); }
    for (let i = 0; i < f.points.length - 1; i++) {
      const a = f.points[i], b = f.points[i+1], dx = b[0]-a[0], dz = b[1]-a[1], length = Math.hypot(dx,dz), angle = Math.atan2(dx,dz);
      roadSegments.push({a,b,width:w});
      if (walking || length < 10 || w < 7) continue;
      for (let d = 4; d < length; d += 13) {
        const t = d/length, x = a[0]+dx*t, z = a[1]+dz*t;
        if (Math.abs(x)>480 || Math.abs(z)>450) continue;
        roadBatch.box(M.line,x,groundHeight(x,z)+.34,z,.18,.04,4,angle);
        if (random() > .63) {
          const lane = random()>.5?1:-1, cx=x+Math.cos(angle)*w*.24*lane, cz=z-Math.sin(angle)*w*.24*lane;
          roadBatch.box([M.car,M.carDark,M.carWarm][Math.floor(random()*3)],cx,groundHeight(cx,cz)+1,cz,1.8,1.3,4.2,angle);
          roadBatch.box(M.window,cx,groundHeight(cx,cz)+1.9,cz,1.55,.65,2.1,angle);
        }
        if (d % 39 < 14) {
          const lx = x+Math.cos(angle)*(w/2+1.6), lz=z-Math.sin(angle)*(w/2+1.6), h=groundHeight(lx,lz);
          roadBatch.box(M.dark,lx,h+4,lz,.18,8,.18);roadBatch.box(M.warm,lx,h+8,lz,1.4,.2,.6);
        }
      }
    }
  }
  for (const [geos,mat] of [[curbGeo,M.curb],[roadGeo,M.road],[pathGeo,M.path]]) if (geos.length) { const merged=mergeGeometries(geos);mesh(merged,mat,groups.roads).castShadow=false;geos.forEach(g=>g.dispose()); }
  roadBatch.flush();
  const buildings = [], picks = [], windowPositions = [], details = new Batches(groups.buildings);
  for (const f of features.filter(f => f.tags.building && closed(f.points))) {
    const p = clipPolygon(f.points); if (p.length < 3) continue;
    const [cx,cz]=centroid(f.points);
    // The proposal replaces the immediate pin location; surrounding mapped blocks remain.
    if (Math.hypot(cx,cz)<34 || p.some(([x,z])=>Math.abs(x)<20&&Math.abs(z)<18)) continue;
    const levels = parseFloat(f.tags['building:levels']);
    const mappedHeight = parseFloat(f.tags.height);
    const height = Number.isFinite(mappedHeight) && mappedHeight > 0 ? mappedHeight : Number.isFinite(levels) && levels > 0 ? levels*3.2 : f.tags.building==='apartments'?28:14+(f.id%5)*3;
    const base = Math.max(...p.map(([x,z])=>groundHeight(x,z)));
    const geometry = new THREE.ExtrudeGeometry(shape(p),{depth:height,bevelEnabled:false});geometry.rotateX(-Math.PI/2);
    const mat = [M.cream,M.light,M.slab][f.id%3]; const m = mesh(geometry,mat,groups.buildings,0,base,0);
    const name = `Neighborhood building ${buildings.length+1}`;
    m.userData = {placeId:`osm-${f.id}`,name,osmId:f.id,height,heightSource:Number.isFinite(mappedHeight)?'Mapped height':Number.isFinite(levels)?'Mapped floor count × 3.2 m':'Estimated height',center:[cx,base+height,cz]};
    buildings.push({points:p,center:[cx,cz],height,base,mesh:m});picks.push(m);
    const roofGeo = new THREE.ExtrudeGeometry(shape(p),{depth:.55,bevelEnabled:false});roofGeo.rotateX(-Math.PI/2);mesh(roofGeo,M.roof,groups.buildings,0,base+height,0);
    // Windows and slab bands retain each mapped façade's angle.
    for (let j=0;j<p.length;j++) {
      const a=p[j],b=p[(j+1)%p.length],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),ry=-Math.atan2(dz,dx);
      if (len<3 || len>220) continue;
      for(let d=2;d<len-1;d+=3.8) for(let y=3;y<height-1;y+=3.8) {
        details.box(M.window,a[0]+dx*d/len,base+y,a[1]+dz*d/len,1.55,1.9,.15,ry);
        windowPositions.push([a[0]+dx*d/len,base+y,a[1]+dz*d/len,1.56,1.91,.18,ry]);
      }
      for(let y=4;y<height;y+=7.6)details.box(M.light,(a[0]+b[0])/2,base+y,(a[1]+b[1])/2,len,.18,.28,ry);
    }
    if(height>20)details.box(M.cream,cx,base+height+1.2,cz,4,2.4,3);
  }
  details.flush();
  // Stadium stands follow the mapped stadium polygon rather than a relocated icon.
  const stadium = features.find(f=>f.tags.leisure==='stadium' && f.id===25753200);
  let stadiumCenter=[130,240];
  if(stadium){
    stadiumCenter=centroid(stadium.points);
    const p=clipPolygon(stadium.points), sb=new Batches(groups.buildings);
    for(let j=0;j<p.length;j++){
      const a=p[j],b=p[(j+1)%p.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<1)continue;
      const x=(a[0]+b[0])/2,z=(a[1]+b[1])/2;
      sb.box(M.light,x,groundHeight(x,z)+5,z,len,10,9,-Math.atan2(b[1]-a[1],b[0]-a[0]));
    }sb.flush();
  }
  const staticBatches = new Map();
  for (const child of [...groups.buildings.children]) {
    if (!child.isMesh || child.isInstancedMesh) continue;
    child.updateMatrixWorld(true);
    const copy = child.geometry.clone().applyMatrix4(child.matrixWorld);
    if (!staticBatches.has(child.material)) staticBatches.set(child.material, []);
    staticBatches.get(child.material).push(copy);
    groups.buildings.remove(child);
    child.updateMatrixWorld(true);
    if (!child.userData.osmId) child.geometry.dispose();
  }
  for (const [mat, geometries] of staticBatches) {
    mesh(mergeGeometries(geometries), mat, groups.buildings);
    geometries.forEach(g=>g.dispose());
  }
  const plants = new Batches(groups.vegetation); let treeCount=0;
  const buildingBoxes=buildings.map(b=>({...b,minX:Math.min(...b.points.map(p=>p[0]))-3,maxX:Math.max(...b.points.map(p=>p[0]))+3,minZ:Math.min(...b.points.map(p=>p[1]))-3,maxZ:Math.max(...b.points.map(p=>p[1]))+3}));
  for(let i=0;i<6500;i++){
    const x=-483+random()*966,z=-452+random()*904;
    if(Math.hypot(x,z)<46)continue;
    const green=greenFeatures.some(f=>inside(x,z,f.points)&&!(f.holes||[]).some(h=>inside(x,z,h)));
    if(!green&&random()>.095)continue;
    if(buildingBoxes.some(b=>x>b.minX&&x<b.maxX&&z>b.minZ&&z<b.maxZ&&inside(x,z,b.points)))continue;
    if(surfaces.some(f=>inside(x,z,f.points)))continue;
    if(stadium&&inside(x,z,stadium.points))continue;
    if(roadSegments.some(s=>segmentDistance(x,z,s.a,s.b)<s.width/2+2))continue;
    tree(plants,x,z,5+random()*8,groundHeight(x,z),i);treeCount++;
  }
  plants.flush();
  const tower=makeTower(groups.project,groups.vegetation);
  tower.traverse(m=>{if(m.isMesh)picks.push(m);});
  const towerWindows=[],perimeter=roundedShape(33.2,28.2,8.1).getSpacedPoints(76);
  for(const {bottom,floorHeight,firstFloor,lastFloor} of TOWER_SECTIONS){
    for(let floor=firstFloor;floor<=lastFloor;floor++)for(let i=0;i<perimeter.length-1;i++){
      const p=perimeter[i],q=perimeter[i+1],dx=q.x-p.x,dz=p.y-q.y;
      towerWindows.push([(p.x+q.x)/2,bottom+(floor-firstFloor+.5)*floorHeight,-(p.y+q.y)/2,Math.hypot(dx,dz)*.82,floorHeight*.74,.12,-Math.atan2(dz,dx)]);
    }
  }
  const nightWindows=[createNightWindows(groups.buildings,windowPositions,4271),createNightWindows(tower,towerWindows,9137,.2)];
  const places = [
    {id:'tower',name:'demo2',label:'demo2',category:'THE CENTER OF IT ALL',description:'A sculptural glass tower with planted sky terraces, above the neighborhood park.',address:'Tower plaza',position:[0,265,0],target:[0,122,0],number:'01'},
    {id:'stadium',name:'Neighborhood stadium',label:'Neighborhood stadium',category:'SPORT & COMMUNITY',description:'The mapped stadium and its sports grounds sit south of the tower, beside Neighborhood park. The stands are an illustrative reconstruction.',address:'Mapped OpenStreetMap location · wider context',position:[stadiumCenter[0],groundHeight(...stadiumCenter)+17,stadiumCenter[1]],target:[stadiumCenter[0],15,stadiumCenter[1]],number:'02'},
    {id:'park',name:'Neighborhood park',label:'Neighborhood park',category:'ROOM TO BREATHE',description:'Explore the green, park-side setting and pedestrian paths. The park continues east and south beyond the local study area.',address:'Wider neighborhood · illustrative planting',position:[350,groundHeight(350,240)+15,240],target:[300,12,240],number:'03'},
    {id:'avenue',name:'Central avenue',label:'Central avenue',category:'CONNECTED TO THE CITY',description:'The avenue connects the project to the wider neighborhood. Road centerlines follow OpenStreetMap; lane widths and street details are illustrative.',address:'Neighborhood avenue',position:[-140,8,92],target:[-100,8,80],number:'04'},
  ];
  const sports = features.find(f=>f.id===92193048);
  if(sports){const [x,z]=centroid(sports.points);places.push({id:'sports',name:'Sports center',label:'Sports center',category:'IN THE NEIGHBORHOOD',description:'An existing sports complex west of the project, shown at its mapped footprint with height derived from the mapped floor count.',address:'Sports district',position:[x,18,z],target:[x,10,z],number:'05'});}
  return {root,groups,tower,picks,places,buildings,stats:{buildings:buildings.length,trees:treeCount,roads:roads.length,contextWidth:1000,contextDepth:940},nightWindows,setNight(progress){
    M.warm.emissiveIntensity=progress*2;
    return nightWindows.reduce((changed,batch)=>batch.setProgress(progress)||changed,false);
  }};
}
