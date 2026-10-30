import * as THREE from 'three';
import { loadGLBAssets, applyEnvironment } from './assets-3d.js';
const LON0 = 100, LON1 = 126.5, LAT0 = 21.5, LAT1 = 43;
function toWorld(lon, lat) {
const x = (lon - (LON0+LON1)/2) * 3.1;
const z = -((lat - (LAT0+LAT1)/2)) * 3.7;
return [x, z];
}
function toLonLat(x, z) {
return [x/3.1 + (LON0+LON1)/2, -z/3.7 + (LAT0+LAT1)/2];
}
const OUTLINE = [
[101,28],[101.5,31],[103,33.5],[104,36],[105.5,37.5],[107,39],[109,40.2],[111,40.8],[114,41.2],[117,41.2],[120,41.8],[123,42.3],[125.5,41.5],[125,40.3],[124,39.7],[122.5,38.7],[121.5,38.8],[119,38.3],[117.8,38.5],[117.5,37.7],[118.5,37.3],[119.5,36.8],[120.8,36.5],[121,35.3],[120.2,34.4],[120.3,33],[120.8,31.8],[121.6,31.1],[121.6,29.8],[120.8,28.3],[119.8,27],[118.7,25.8],[117.5,24.6],[115.8,23.3],[113.8,22.6],[111.5,21.9],[109.8,21.8],[108.2,22.3],[106.5,23.2],[104.5,23.8],[102.5,24.8],[101.2,26.2]];
const RIVERS = [
[[102.5,36.5],[105,36.8],[106.5,38.5],[108.5,40.1],[110.5,40.1],[111.8,39.2],[112.3,37.8],[111.3,36],[110.6,34.7],[111.8,34.6],[113.5,34.9],[115,35.4],[116.5,36.6],[118,37.4],[118.9,37.7]],
[[104.1,28.8],[105.5,29.2],[106.6,29.6],[107.8,30.3],[109.3,31],[110.5,30.8],[111.5,30.2],[112.6,29.9],[114.3,30.5],[115.8,29.7],[117,30.6],[118.2,31.4],[119.3,32.1],[120.6,32.1],[121.4,31.5]],
[[110.5,26],[112,26.8],[113,28.2],[112.9,29.3]],
];
const MOUNTAINS = [
[114,37.8,1.8,2.2],[109,33.6,2.4,2.6],[108.6,31.6,1.6,2.2],[110.6,30.6,1.2,1.6],[113,25,2.2,1.8],
[110.5,27.3,1.5,1.5],[104.5,25.8,2.4,1.4],[123.8,41.2,1.2,1.8],[117,40.4,1.2,1.6],[115.5,31.1,1.1,1.5],
[118.2,27.6,1.2,1.5],[108.3,36.6,2.2,0.9],[101.6,37.8,1.4,2.4],[106,34.3,1.2,2.0],[112.8,32.8,0.9,0.9]];
function inOutline(lon, lat) {
let inside = false;
for (let i = 0, j = OUTLINE.length-1; i < OUTLINE.length; j = i++) {
const [xi,yi] = OUTLINE[i], [xj,yj] = OUTLINE[j];
if (((yi>lat)!==(yj>lat)) && (lon < (xj-xi)*(lat-yi)/(yj-yi)+xi)) inside = !inside;
}
return inside;
}
const EAST_COAST = OUTLINE.slice(12, 38);
const SOUTH_COAST = OUTLINE.slice(37, 43);
function _chainLonAtLat(chain, lat) {
for (let i = 0; i < chain.length-1; i++) {
const [x1,y1] = chain[i], [x2,y2] = chain[i+1];
if ((y1 >= lat && y2 <= lat) || (y2 >= lat && y1 <= lat)) {
return y1 === y2 ? Math.max(x1,x2) : x1 + (x2-x1)*(lat-y1)/(y2-y1);
}
}
return chain[chain.length-1][0];
}
function _chainLatAtLon(chain, lon) {
for (let i = 0; i < chain.length-1; i++) {
const [x1,y1] = chain[i], [x2,y2] = chain[i+1];
if ((x1 <= lon && x2 >= lon) || (x2 <= lon && x1 >= lon)) {
return x1 === x2 ? Math.max(y1,y2) : y1 + (y2-y1)*(lon-x1)/(x2-x1);
}
}
return chain[0][1];
}
function isSea(lon, lat) {
if (inOutline(lon, lat)) return false;
if (lat <= EAST_COAST[0][1]) {
const coastLon = lat <= 21.8 ? 109.8 : _chainLonAtLat(EAST_COAST, lat);
if (lon > coastLon) return true;
}
if (lon >= SOUTH_COAST[SOUTH_COAST.length-1][0] && lon <= SOUTH_COAST[0][0]) {
if (lat < _chainLatAtLon(SOUTH_COAST, lon)) return true;
}
return false;
}
function hash(x, z) { const s = Math.sin(x*127.1+z*311.7)*43758.5453; return s - Math.floor(s); }
function noise(x, z) { return hash(Math.floor(x*3.1), Math.floor(z*3.1))*0.6 + hash(Math.floor(x*7.7), Math.floor(z*7.7))*0.4; }
const CELL = 1.8, STEP = 0.85, WATER_Y = 0.45;
const GX0 = -41.4, GZ0 = -41.4, GN = 47;
const MGN = 8, GN2 = GN + 2*MGN;
const GX2 = GX0 - MGN*CELL, GZ2 = GZ0 - MGN*CELL;
const CASTLE_SCALE = 0.075, CASTLE_CELL = 10 * CASTLE_SCALE;
const CITY_FLAT_R = 2.3, CITY_RIVER_R = 2.4, RIVER_R = 1.35;
const RIVER_PTS = [];
for (const line of RIVERS) {
for (let i = 0; i < line.length-1; i++) {
const [x0,z0] = toWorld(line[i][0], line[i][1]);
const [x1,z1] = toWorld(line[i+1][0], line[i+1][1]);
const len = Math.hypot(x1-x0, z1-z0), n = Math.max(2, Math.ceil(len/0.4));
for (let k = 0; k < n; k++) RIVER_PTS.push([x0+(x1-x0)*k/n, z0+(z1-z0)*k/n]);
}
}
function rawHeight(lon, lat) {
let h = 0.25;
for (const [mlon,mlat,r,mh] of MOUNTAINS) {
const d = Math.hypot(lon-mlon, lat-mlat), rr = r*0.72;
if (d < rr) { const t = 1 - d/rr; h += mh * t*t * (0.7 + noise(lon,lat)*0.6) + (hash(lon*5.1, lat*7.3)-0.5)*0.5; }
}
return h + noise(lon*0.7, lat*0.7) * 0.35;
}
function centered(node) {
const box = new THREE.Box3().setFromObject(node);
const c = box.getCenter(new THREE.Vector3());
node.position.set(-c.x, -box.min.y, -c.z);
const g = new THREE.Group(); g.add(node); return g;
}
function instancedFromScene(srcScene, placements) {
srcScene.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(srcScene);
const c = box.getCenter(new THREE.Vector3());
const norm = new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z);
const group = new THREE.Group();
srcScene.traverse(m => {
if (!m.isMesh) return;
const mats = Array.isArray(m.material) ? m.material : [m.material];
for (const mat of mats) {
if (mat && mat.isMeshStandardMaterial) { mat.envMapIntensity = 0.2; }
}
const im = new THREE.InstancedMesh(m.geometry, m.material, placements.length);
const tmp = new THREE.Matrix4();
for (let i = 0; i < placements.length; i++) {
tmp.multiplyMatrices(placements[i], norm).multiply(m.matrixWorld);
im.setMatrixAt(i, tmp);
}
im.castShadow = true; im.receiveShadow = true;
group.add(im);
});
return group;
}
function placement(x, y, z, s, rotY) {
return new THREE.Matrix4().compose(
new THREE.Vector3(x, y, z),
new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), rotY),
new THREE.Vector3(s, s, s));
}
class Map3D {
constructor(canvas) {
this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
this.renderer.shadowMap.enabled = true;
this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
this.scene = new THREE.Scene();
this.scene.background = new THREE.Color(0x16374d);
this.az = Math.PI/4;
this.el = Math.atan(1/Math.SQRT2);
this.view = 84;
this.camTarget = new THREE.Vector3(8, 0, 4);
this.camera = new THREE.OrthographicCamera();
applyEnvironment(this.renderer, this.scene);
this.scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x3a2f1a, 1.0));
const sun = new THREE.DirectionalLight(0xfff2d8, 1.25);
sun.position.set(50, 70, 25);
const fill = new THREE.DirectionalLight(0xf2ede2, 0.25);
fill.position.set(-60, 40, -35);
this.scene.add(fill);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 10, far: 260 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0004;
this.scene.add(sun); this.scene.add(sun.target);
this.sun = sun;
this.terrainGroup = new THREE.Group();
this.castleGroup = new THREE.Group();
this.forestGroup = new THREE.Group();
this.cityGroup = new THREE.Group();
this.unitGroup = new THREE.Group();
this.scene.add(this.terrainGroup, this.castleGroup, this.forestGroup, this.cityGroup, this.unitGroup);
this.raycaster = new THREE.Raycaster();
this.cityMeshes = {}; this.unitMeshes = {};
this.sig = null; this.cityList = []; this.levels = null;
this.buildWater();
this.assets = null;
loadGLBAssets().then(a => {
this.assets = a;
if (this.sig) { this.buildCastles(); this.buildForest(); }
}).catch(() => {});
this.bindInput(canvas);
this.resize(); addEventListener('resize', () => this.resize());
this.time = 0;
}
syncScenario(cities) {
const sig = cities.map(c => c.id).join('|');
if (sig === this.sig) return;
this.sig = sig; this.cityList = cities;
this.buildTerrain();
if (this.assets) { this.buildCastles(); this.buildForest(); }
}
nearCity(x, z, r) {
for (const c of this.cityList) {
const [cx, cz] = toWorld(c.lon, c.lat);
if (Math.hypot(x-cx, z-cz) < r) return true;
}
return false;
}
levelAtWorld(x, z) {
if (!this.levels) return 1;
const ix = Math.round((x-GX2)/CELL - 0.5), iz = Math.round((z-GZ2)/CELL - 0.5);
if (ix < 0 || iz < 0 || ix >= GN2 || iz >= GN2) return 0;
return this.levels[iz*GN2+ix];
}
buildTerrain() {
this.terrainGroup.clear();
const levels = new Int8Array(GN2*GN2);
const colors = [];
const cPlain = new THREE.Color(0x6d8f4e), cLush = new THREE.Color(0x4d7a41), cDry = new THREE.Color(0x9a8f5a),
cMtn = new THREE.Color(0x7a7560), cSnow = new THREE.Color(0x8d8d84),
cSand = new THREE.Color(0xc2ab72), cBed = new THREE.Color(0x3d5a4a);
for (let iz = 0; iz < GN2; iz++) for (let ix = 0; ix < GN2; ix++) {
const x = GX2 + (ix+0.5)*CELL, z = GZ2 + (iz+0.5)*CELL;
const [lon, lat] = toLonLat(x, z);
let lv = 0;
if (inOutline(lon, lat)) {
lv = Math.min(3, Math.max(1, 1 + Math.floor((rawHeight(lon,lat)-0.25)/0.6)));
let dR = 1e9;
for (const [rx, rz] of RIVER_PTS) { const d = Math.hypot(x-rx, z-rz); if (d < dR) dR = d; }
if (dR < RIVER_R && !this.nearCity(x, z, CITY_RIVER_R)) lv = 0;
if (lv > 1 && this.nearCity(x, z, CITY_FLAT_R)) lv = 1;
} else if (!isSea(lon, lat)) {
lv = noise(lon*0.4+9, lat*0.4+2) > 0.8 ? 2 : 1;
}
levels[iz*GN2+ix] = lv;
}
this.levels = levels;
const geo = new THREE.BoxGeometry(CELL*0.98, 1, CELL*0.98);
const mat = new THREE.MeshLambertMaterial({ flatShading: true });
const im = new THREE.InstancedMesh(geo, mat, GN2*GN2);
const m4 = new THREE.Matrix4(), col = new THREE.Color();
const nearSea = (ix, iz) => {
for (const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
const jx = ix+dx, jz = iz+dz;
if (jx<0||jz<0||jx>=GN2||jz>=GN2) continue;
if (levels[jz*GN2+jx]===0) return true;
}
return false;
};
for (let iz = 0; iz < GN2; iz++) for (let ix = 0; ix < GN2; ix++) {
const i = iz*GN2+ix, lv = levels[i];
const x = GX2 + (ix+0.5)*CELL, z = GZ2 + (iz+0.5)*CELL;
const [lon, lat] = toLonLat(x, z);
const top = lv === 0 ? 0.1 : lv*STEP;
const h = top + 0.6;
m4.makeScale(1, h, 1).setPosition(x, top - h/2, z);
im.setMatrixAt(i, m4);
if (lv === 0) col.copy(cBed);
else if (lv === 3) col.copy(cSnow);
else if (lv === 2) col.copy(cMtn);
else if (lv === 1 && nearSea(ix, iz)) col.copy(cSand);
else if (lat > 34.5) col.copy(cDry).lerp(cPlain, noise(lon,lat));
else col.copy(cLush).lerp(cPlain, noise(lon,lat)*0.7);
im.setColorAt(i, col);
colors.push(col.r, col.g, col.b);
}
im.receiveShadow = true; im.castShadow = true;
this.terrainGroup.add(im);
this.terrainMesh = im;
}
buildWater() {
const w = GN2*CELL + 8, d = GN2*CELL + 8;
this.water = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
new THREE.MeshPhongMaterial({ color: 0x2e6f9e, transparent: true, opacity: 0.82, shininess: 140, specular: 0x99ccee }));
this.water.rotation.x = -Math.PI/2; this.water.position.y = WATER_Y;
this.scene.add(this.water);
const w2 = new THREE.Mesh(new THREE.PlaneGeometry(w*1.02, d*1.02),
new THREE.MeshBasicMaterial({ color: 0x9fd4ee, transparent: true, opacity: 0.08, depthWrite: false }));
w2.rotation.x = -Math.PI/2; w2.position.y = WATER_Y + 0.05;
this.scene.add(w2);
}
buildCastles() {
this.castleGroup.clear();
const A = this.assets, S = CASTLE_SCALE, C = CASTLE_CELL;
const walls = [], towers = [], keeps = [], flags = [];
for (const c of this.cityList) {
const [x, z] = toWorld(c.lon, c.lat);
const y = STEP;
const rot = 0;
for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
if (Math.max(Math.abs(dx), Math.abs(dz)) !== 1) continue;
if (dz === 1 && dx === 0) continue;
const p = placement(x + dx*C, y, z + dz*C, S, rot);
if (Math.abs(dx) === 1 && Math.abs(dz) === 1) towers.push(p); else walls.push(p);
}
keeps.push(placement(x, y, z, S*1.3, Math.PI/4));
const fy = y + 13.1 * S;
flags.push(placement(x, y + 10.7*S, z, S*1.5, 0));
flags.push(placement(x - C, fy, z + C, S*1.1, 0));
flags.push(placement(x + C, fy, z + C, S*1.1, 0));
}
if (walls.length) this.castleGroup.add(instancedFromScene(A.wall, walls));
if (towers.length) this.castleGroup.add(instancedFromScene(A.towerSquareBaseColor, towers));
if (keeps.length) this.castleGroup.add(instancedFromScene(A.towerSquareBaseColor, keeps));
if (flags.length) this.castleGroup.add(instancedFromScene(A.flagBlueWide, flags));
}
buildForest() {
this.forestGroup.clear();
const A = this.assets;
const per = { tree_default: [], tree_cone_dark: [], tree_detailed_dark: [], plant_bush: [], grass_large: [], stone_tallE: [] };
const isForest = new Uint8Array(GN2*GN2);
const nearSeaCell = (ix, iz) => {
for (const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) {
const jx = ix+dx, jz = iz+dz;
if (jx<0||jz<0||jx>=GN2||jz>=GN2) continue;
if (this.levels[jz*GN2+jx]===0) return true;
}
return false;
};
const eligible = (ix, iz) => {
if (ix<MGN+1||iz<MGN+1||ix>=MGN+GN-1||iz>=MGN+GN-1) return false;
if (this.levels[iz*GN2+ix] !== 1) return false;
const x = GX2 + (ix+0.5)*CELL, z = GZ2 + (iz+0.5)*CELL;
if (this.nearCity(x, z, CITY_FLAT_R + 0.6)) return false;
if (nearSeaCell(ix, iz)) return false;
return true;
};
for (let iz = MGN+1; iz < MGN+GN-1; iz++) for (let ix = MGN+1; ix < MGN+GN-1; ix++) {
if (!eligible(ix, iz)) continue;
const x = GX2 + (ix+0.5)*CELL, z = GZ2 + (iz+0.5)*CELL;
const [lon, lat] = toLonLat(x, z);
const cf = 0.65*noise(lon*0.2+31, lat*0.2+17) + 0.35*noise(lon*0.45+3, lat*0.45+5);
if (cf > 0.60) isForest[iz*GN2+ix] = 1;
}
const grown = new Uint8Array(isForest);
for (let iz = MGN+1; iz < MGN+GN-1; iz++) for (let ix = MGN+1; ix < MGN+GN-1; ix++) {
if (isForest[iz*GN2+ix]) continue;
if (!eligible(ix, iz)) continue;
let adj = 0;
for (const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) adj += isForest[(iz+dz)*GN2+(ix+dx)];
const x = GX2 + (ix+0.5)*CELL, z = GZ2 + (iz+0.5)*CELL;
const [lon, lat] = toLonLat(x, z);
if (adj >= 1 && noise(lon*0.3+11, lat*0.3+23) > 0.38) grown[iz*GN2+ix] = 1;
}
for (let iz = MGN+1; iz < MGN+GN-1; iz++) for (let ix = MGN+1; ix < MGN+GN-1; ix++) {
const lv = this.levels[iz*GN2+ix];
const x = GX2 + (ix+0.5)*CELL, z = GZ2 + (iz+0.5)*CELL;
const top = lv*STEP;
if (grown[iz*GN2+ix]) {
const n = 2 + Math.floor(hash(ix*7, iz*3)*3);
for (let k = 0; k < n; k++) {
const kinds = ['tree_default','tree_default','tree_cone_dark','tree_detailed_dark'];
const t = kinds[Math.floor(hash(ix*5+k, iz*11)*kinds.length)];
per[t].push(placement(
x + (hash(ix+k*9, iz)-0.5)*CELL*0.85, top,
z + (hash(ix, iz+k*13)-0.5)*CELL*0.85,
0.46 + hash(ix*17+k, iz*5)*0.18, hash(ix+k, iz*7+k)*6.28));
}
} else if (lv === 1 && eligible(ix, iz) && hash(ix*3, iz*7) > 0.92) {
const t = hash(ix, 7) > 0.5 ? 'plant_bush' : 'grass_large';
per[t].push(placement(x, top, z, 0.42, hash(ix, iz*23)*6.28));
if (hash(ix*19, iz*2) > 0.8) per.tree_default.push(placement(x+(hash(ix,iz)-0.5)*CELL*0.6, top, z+(hash(iz,ix)-0.5)*CELL*0.6, 0.42, hash(ix,iz*31)*6.28));
}
if (lv === 2 && hash(ix*13, iz*17) > 0.9) per.stone_tallE.push(placement(x, top, z, 0.45, hash(ix, iz*29)*6.28));
}
for (const k of Object.keys(per)) if (per[k].length) this.forestGroup.add(instancedFromScene(A[k], per[k]));
}
makeLabel(text, scale=1) {
const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
const ctx = cv.getContext('2d');
ctx.font = 'bold 40px "Noto Serif KR", serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.lineWidth = 7; ctx.strokeText(text, 128, 32);
ctx.fillStyle = '#fff'; ctx.fillText(text, 128, 32);
const tex = new THREE.CanvasTexture(cv);
const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
sp.scale.set(6*scale, 1.5*scale, 1); sp.renderOrder = 5;
return sp;
}
addCity(city, colorHex) {
const [x, z] = toWorld(city.lon, city.lat);
const y = STEP;
const g = new THREE.Group();
const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8),
new THREE.MeshBasicMaterial({ color: 0xdddddd }));
pole.position.set(0, y + 1.7, 0); g.add(pole);
const flag = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.5, 0.05),
new THREE.MeshBasicMaterial({ color: new THREE.Color(colorHex) }));
flag.position.set(0.45, y + 2.3, 0); g.add(flag);
const label = this.makeLabel(city.name_ko, 0.75); label.position.set(0, y + 3.1, 0); g.add(label);
const hit = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 6, 8),
new THREE.MeshBasicMaterial({ visible: false }));
hit.position.set(0, y + 2, 0); hit.userData.cityId = city.id; g.add(hit);
g.position.set(x, 0, z);
g.userData.cityId = city.id;
this.cityGroup.add(g);
this.cityMeshes[city.id] = { group: g, flag };
}
setCityColor(cityId, colorHex) {
const m = this.cityMeshes[cityId]; if (m) m.flag.material.color.set(colorHex);
}
addUnit(unit, colorHex) {
const g = new THREE.Group();
const body = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.0, 5),
new THREE.MeshLambertMaterial({ color: 0x5a4a3a, flatShading: true }));
body.position.y = 0.65; body.castShadow = true; g.add(body);
const banner = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.05),
new THREE.MeshBasicMaterial({ color: new THREE.Color(colorHex) }));
banner.position.set(0.35, 1.45, 0); g.add(banner);
const label = this.makeLabel(unit.label, 0.6); label.position.y = 2.1; g.add(label);
const y = this.levelAtWorld(unit.x, unit.z) * STEP;
g.position.set(unit.x, Math.max(y, WATER_Y + 0.2), unit.z);
g.userData.unitId = unit.id; body.userData.unitId = unit.id;
this.unitGroup.add(g);
this.unitMeshes[unit.id] = { group: g, banner };
}
updateUnit(unit, colorHex) {
const m = this.unitMeshes[unit.id]; if (!m) return;
const y = this.levelAtWorld(unit.x, unit.z) * STEP;
m.group.position.set(unit.x, Math.max(y, WATER_Y + 0.2), unit.z);
if (colorHex) m.banner.material.color.set(colorHex);
}
removeUnit(id) { const m = this.unitMeshes[id]; if (m) { this.unitGroup.remove(m.group); delete this.unitMeshes[id]; } }
pick(nx, ny) {
this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
const v = new THREE.Vector3();
let bestU = null, bestD = 1.3;
for (const id of Object.keys(this.unitMeshes)) {
const g = this.unitMeshes[id].group;
for (const h of [0.7, 1.7]) {
v.set(g.position.x, g.position.y + h, g.position.z);
const d = this.raycaster.ray.distanceToPoint(v);
if (d < bestD) { bestD = d; bestU = Number(id); }
}
}
if (bestU != null) return { type: 'unit', id: bestU };
const hits = this.raycaster.intersectObjects([this.cityGroup], true);
for (const h of hits) {
const o = h.object;
if (o.userData.cityId !== undefined) return { type: 'city', id: o.userData.cityId };
}
return null;
}
rotate90(dir) { this.az += dir * Math.PI/2; }
bindInput(el) {
let dragging = false, px = 0, py = 0, moved = 0; let pinch = 0;
el.addEventListener('pointerdown', e => { dragging = true; px = e.clientX; py = e.clientY; moved = 0; el.setPointerCapture(e.pointerId); });
el.addEventListener('pointermove', e => {
if (!dragging) return;
const dx = e.clientX - px, dy = e.clientY - py; moved += Math.abs(dx)+Math.abs(dy);
const s = this.view / el.clientHeight;
const fwd = new THREE.Vector3(); this.camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0,1,0));
this.camTarget.addScaledVector(right, -dx*s).addScaledVector(fwd, dy*s);
this.camTarget.x = Math.max(-44, Math.min(44, this.camTarget.x));
this.camTarget.z = Math.max(-44, Math.min(44, this.camTarget.z));
px = e.clientX; py = e.clientY;
});
el.addEventListener('pointerup', e => {
dragging = false;
if (moved < 6 && this.onPick) {
const r = el.getBoundingClientRect();
this.onPick(((e.clientX-r.left)/r.width)*2-1, -(((e.clientY-r.top)/r.height)*2-1));
}
});
el.addEventListener('wheel', e => { e.preventDefault(); this.view = Math.min(96, Math.max(8, this.view * (1 + e.deltaY*0.001))); this.updateFrustum(); }, { passive: false });
el.addEventListener('contextmenu', e => e.preventDefault());
el.addEventListener('touchstart', e => { if (e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY); }, { passive: true });
el.addEventListener('touchmove', e => {
if (e.touches.length === 2 && pinch > 0) {
const d = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
this.view = Math.min(96, Math.max(8, this.view * pinch / d)); pinch = d; this.updateFrustum();
}
}, { passive: true });
addEventListener('keydown', e => {
if (e.key === 'q' || e.key === 'Q') this.rotate90(1);
if (e.key === 'e' || e.key === 'E') this.rotate90(-1);
});
}
focusCity(city) { const [x,z] = toWorld(city.lon, city.lat); this.camTarget.set(x, 0, z); this.view = 26; this.updateFrustum(); }
updateFrustum() {
const aspect = innerWidth/innerHeight, v = this.view;
this.camera.left = -v*aspect/2; this.camera.right = v*aspect/2;
this.camera.top = v/2; this.camera.bottom = -v/2;
this.camera.near = -400; this.camera.far = 800;
this.camera.updateProjectionMatrix();
}
resize() {
const w = innerWidth, h = innerHeight;
this.renderer.setSize(w, h, false);
this.updateFrustum();
}
render() {
this.time += 0.016;
if (this.water) this.water.material.opacity = 0.80 + Math.sin(this.time*1.7)*0.05;
const d = 160;
this.camera.position.set(
this.camTarget.x + Math.sin(this.az)*Math.cos(this.el)*d,
this.camTarget.y + Math.sin(this.el)*d,
this.camTarget.z + Math.cos(this.az)*Math.cos(this.el)*d);
this.camera.lookAt(this.camTarget);
this.renderer.render(this.scene, this.camera);
}
}

const SAVE_KEY = 'cheonha-xi-web.save.v1';
const FORCE_COLORS = ['#4a7fd4','#d44a4a','#4ad47f','#d4a44a','#9a4ad4','#4ad4d4','#d44a8f','#8fd44a','#d47f4a','#6a6ad4','#d4d44a','#4a9a6a','#c46a4a','#7a4a2a','#2a7a8a','#8a2a4a','#5a8a2a','#aa6aaa','#4a5a9a','#9a8a3a','#3a7a4a','#b45a7a','#6aaac4','#c48a3a','#7a3a9a','#3a9a8a','#aa4a3a','#5a7a2a','#8a6aaa','#4a8aaa','#ca7a5a','#3a6a3a','#9a4a6a','#6a8a4a','#4a4aaa','#aa9a3a','#3a8a6a','#b46a8a','#5a9aca'];
function forceColor(fid) { const n = FORCE_COLORS.length; return FORCE_COLORS[((fid % n) + n) % n]; }
const UNIT_TYPES = {
sword: { name: '검병', atk: 0.7, def: 0.8, move: 1.0, cost: {} },
spear: { name: '창병', atk: 1.0, def: 1.0, move: 1.0, cost: { spears: 1 } },
pike:  { name: '극병', atk: 0.9, def: 1.2, move: 1.0, cost: { pikes: 1 } },
bow:   { name: '노병', atk: 0.8, def: 0.7, move: 1.0, cost: { bows: 1 } },
cav:   { name: '기병', atk: 1.2, def: 0.9, move: 1.6, cost: { horses: 1 } },
ram:      { name: '충거',   atk: 0.6, def: 0.9, move: 0.7, cost: { rams: 1 }, perUnit: true,      siege: 3.0 },
tower:    { name: '정란',   atk: 0.9, def: 0.8, move: 0.7, cost: { towers: 1 }, perUnit: true,    siege: 1.2 },
beast:    { name: '목수',   atk: 1.0, def: 0.7, move: 0.7, cost: { beasts: 1 }, perUnit: true,    siege: 1.5, burn: true },
catapult: { name: '투석기', atk: 0.7, def: 0.6, move: 0.6, cost: { catapults: 1 }, perUnit: true, siege: 2.4 },
junk: { name: '주가', atk: 0.7, def: 0.7, move: 1.2, cost: { junks: 1 }, perUnit: true, ship: true },
lou:  { name: '누선', atk: 0.9, def: 0.9, move: 1.1, cost: { lous: 1 }, perUnit: true,  ship: true },
dou:  { name: '투함', atk: 1.1, def: 1.0, move: 1.0, cost: { dous: 1 }, perUnit: true,  ship: true },
};
const SIEGE_TYPES = new Set(['ram', 'tower', 'beast', 'catapult']);
const SHIP_TYPES = new Set(['junk', 'lou', 'dou']);
const SIEGE_BUILD = { ram: { name: '충거', gold: 600, store: 'rams' }, tower: { name: '정란', gold: 500, store: 'towers' }, beast: { name: '목수', gold: 800, store: 'beasts' }, catapult: { name: '투석기', gold: 1000, store: 'catapults' } };
const SHIP_BUILD = { junk: { name: '주가', gold: 400, store: 'junks' }, lou: { name: '누선', gold: 700, store: 'lous' }, dou: { name: '투함', gold: 1100, store: 'dous' } };
const APT_IDX = { spear: 0, pike: 1, bow: 2, cav: 3, ram: 4, tower: 4, beast: 4, catapult: 4, junk: 5, lou: 5, dou: 5 };
const APT_LV = g => ({ S: 3, A: 2, B: 1 })[g] ?? 0;
const TACTICS = {
sword: { name: '분전', qi: 20, mult: 1.5 },
spear: { name: '창격', qi: 20, mult: 1.8 },
pike:  { name: '철벽', qi: 20, mult: 1.3, guard: 0.5 },
bow:   { name: '연사', qi: 20, mult: 1.6 },
cav:   { name: '돌격', qi: 25, mult: 2.0 },
ram:      { name: '파쇄',   qi: 20, mult: 2.4 },
tower:    { name: '불화살', qi: 15, mult: 1.7 },
beast:    { name: '방사',   qi: 20, mult: 1.6, burn: true },
catapult: { name: '투석',   qi: 25, mult: 2.4 },
junk: { name: '불화살', qi: 15, mult: 1.7 },
lou:  { name: '격돌',   qi: 20, mult: 2.0, minApt: 2 },
dou:  { name: '투석',   qi: 25, mult: 2.5, minApt: 3 },
};
const STRATS = {
fire:    { name: '화계', qi: 30, minInt: 75 },
confuse: { name: '혼란', cooldown: 3, minInt: 80, turns: 2 },
};
const TECH_BRANCHES = ['창병','극병','노병','기병','연병','발명','방위','화공'];
const TECH_P = [1000, 2000, 3000, 5000];
const TECH_GOLD = [1000, 2000, 5000, 10000];
const TECH_DESC = {
'창병': '창병 부대 공격력 단계당 +5%', '극병': '극병 부대 공격력 단계당 +5%',
'노병': '노병 부대 공격력 단계당 +5%', '기병': '기병 부대 공격력 단계당 +5%',
'연병': '부대가 받는 피해 단계당 -3%', '발명': '공성(성 공격) 피해 단계당 +10%',
'방위': '도시가 받는 피해 단계당 -5%', '화공': '화계 피해 단계당 +15%',
};
const TYPE2TECH = { spear: '창병', pike: '극병', bow: '노병', cav: '기병' };
const FACILITIES = {
'시장':   { cost: 200, turns: 2, desc: '매월 금 수입 +25%' },
'농장':   { cost: 200, turns: 2, desc: '매월 병량 수입 +25%' },
'조폐':   { cost: 300, turns: 3, desc: '이 도시 시장 효과 1.5배' },
'곡창':   { cost: 300, turns: 3, desc: '이 도시 농장 효과 1.5배' },
'병영':   { cost: 300, turns: 3, desc: '징병량 +30%' },
'대장간': { cost: 300, turns: 3, desc: '매월 창·극·노 자동 생산 (특색 병장은 대량)' },
'마구간': { cost: 400, turns: 3, desc: '매월 군마 자동 생산 (특색 군마는 대량)' },
'공방':   { cost: 300, turns: 3, desc: '병기 생산: 충거·정란·목수·투석기 (특색 병기 도시 할인)' },
'조선소': { cost: 300, turns: 3, desc: '선박 건조: 주가·누선·투함 (특색 선박 도시 할인)' },
};
const W_OUTLINE = [
[101,28],[101.5,31],[103,33.5],[104,36],[105.5,37.5],[107,39],[109,40.2],[111,40.8],[114,41.2],[117,41.2],[120,41.8],[123,42.3],[125.5,41.5],[125,40.3],[124,39.7],[122.5,38.7],[121.5,38.8],[119,38.3],[117.8,38.5],[117.5,37.7],[118.5,37.3],[119.5,36.8],[120.8,36.5],[121,35.3],[120.2,34.4],[120.3,33],[120.8,31.8],[121.6,31.1],[121.6,29.8],[120.8,28.3],[119.8,27],[118.7,25.8],[117.5,24.6],[115.8,23.3],[113.8,22.6],[111.5,21.9],[109.8,21.8],[108.2,22.3],[106.5,23.2],[104.5,23.8],[102.5,24.8],[101.2,26.2]];
const W_RIVERS = [
[[102.5,36.5],[105,36.8],[106.5,38.5],[108.5,40.1],[110.5,40.1],[111.8,39.2],[112.3,37.8],[111.3,36],[110.6,34.7],[111.8,34.6],[113.5,34.9],[115,35.4],[116.5,36.6],[118,37.4],[118.9,37.7]],
[[104.1,28.8],[105.5,29.2],[106.6,29.6],[107.8,30.3],[109.3,31],[110.5,30.8],[111.5,30.2],[112.6,29.9],[114.3,30.5],[115.8,29.7],[117,30.6],[118.2,31.4],[119.3,32.1],[120.6,32.1],[121.4,31.5]],
[[110.5,26],[112,26.8],[113,28.2],[112.9,29.3]],
];
function wInOutline(lon, lat) {
let inside = false;
for (let i = 0, j = W_OUTLINE.length-1; i < W_OUTLINE.length; j = i++) {
const [xi,yi] = W_OUTLINE[i], [xj,yj] = W_OUTLINE[j];
if (((yi>lat)!==(yj>lat)) && (lon < (xj-xi)*(lat-yi)/(yj-yi)+xi)) inside = !inside;
}
return inside;
}
const W_EAST_COAST = W_OUTLINE.slice(12, 38);
const W_SOUTH_COAST = W_OUTLINE.slice(37, 43);
function wChainLonAtLat(chain, lat) {
for (let i = 0; i < chain.length-1; i++) {
const [x1,y1] = chain[i], [x2,y2] = chain[i+1];
if ((y1 >= lat && y2 <= lat) || (y2 >= lat && y1 <= lat)) return y1 === y2 ? Math.max(x1,x2) : x1 + (x2-x1)*(lat-y1)/(y2-y1);
}
return chain[chain.length-1][0];
}
function wChainLatAtLon(chain, lon) {
for (let i = 0; i < chain.length-1; i++) {
const [x1,y1] = chain[i], [x2,y2] = chain[i+1];
if ((x1 <= lon && x2 >= lon) || (x2 <= lon && x1 >= lon)) return x1 === x2 ? Math.max(y1,y2) : y1 + (y2-y1)*(lon-x1)/(x2-x1);
}
return chain[0][1];
}
function isSeaAt(lon, lat) {
if (wInOutline(lon, lat)) return false;
if (lat <= W_EAST_COAST[0][1]) {
const coastLon = lat <= 21.8 ? 109.8 : wChainLonAtLat(W_EAST_COAST, lat);
if (lon > coastLon) return true;
}
if (lon >= W_SOUTH_COAST[W_SOUTH_COAST.length-1][0] && lon <= W_SOUTH_COAST[0][0]) {
if (lat < wChainLatAtLon(W_SOUTH_COAST, lon)) return true;
}
return false;
}
function wDistToSeg(px, py, x1, y1, x2, y2) {
const dx = x2-x1, dy = y2-y1, l2 = dx*dx + dy*dy;
const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px-x1)*dx + (py-y1)*dy) / l2));
return Math.hypot(px - (x1 + t*dx), py - (y1 + t*dy));
}
function isRiverAt(lon, lat) {
for (const line of W_RIVERS)
for (let i = 0; i < line.length-1; i++)
if (wDistToSeg(lon, lat, line[i][0], line[i][1], line[i+1][0], line[i+1][1]) < 0.55) return true;
return false;
}
function isWaterAt(lon, lat) { return isSeaAt(lon, lat) || isRiverAt(lon, lat); }
const ITEMS = [
{ id: 'fangtian', name: '방천화극', kind: 'weapon' }, { id: 'qinglong', name: '청룡언월도', kind: 'weapon' }, { id: 'shemao', name: '사모', kind: 'weapon' },
{ id: 'chitu', name: '적토마', kind: 'horse' }, { id: 'dilu', name: '적로', kind: 'horse' }, { id: 'jiaohuang', name: '조황', kind: 'horse' },
{ id: 'yangbow', name: '양기궁', kind: 'bow' },
{ id: 'qinggang', name: '청강검', kind: 'sword' }, { id: 'yitian', name: '의천검', kind: 'sword' },
{ id: 'laozi', name: '노자', kind: 'book' }, { id: 'sunzi', name: '손자병법', kind: 'book' },
{ id: 'yuxi', name: '전국옥새', kind: 'seal' },
];
const RANKS = [[2,'주자사'],[4,'주목'],[6,'우림중랑장'],[8,'오관중랑장'],[12,'대장군'],[14,'대사마'],[18,'공'],[20,'왕']];
const MERIT = { develop: 30, recruit: 80, facility: 100, tactic: 40, stratagem: 30, capture: 150 };
class Game {
constructor(scen, officers, skills, playerForceId) {
this.officers = officers;
this.skills = skills;
this.scenId = scen.id;
this.year = scen.year; this.month = scen.month; this.dan = 1;
this.turn = 1;
this.cities = scen.cities.map(c => ({ ...c, commerce: Math.round(c.revenue/10), farm: Math.round(c.harvest/100), hp: c.maxhp, officers: [], troops: c.troops, facilities: [] }));
this.cityById = {}; this.cities.forEach(c => this.cityById[c.id] = c);
this.forces = {};
for (const f of scen.forces) this.forces[f.id] = { id: f.id, ruler: f.ruler, alive: true, ap: 60, techP: 0, techs: Object.fromEntries(TECH_BRANCHES.map(b => [b, 0])), advisor: null, legions: [] };
for (const o of scen.officers) {
const rec = { idx: o.idx, status: o.status, force: o.force ?? null, city: o.city ?? null, loyal: o.loyal, found: o.status === 'free' ? false : true, items: [] };
this.officers[o.idx].state = rec;
if ((o.status === 'ruler' || o.status === 'taesu' || o.status === 'serving') && o.city != null && this.cityById[o.city]) this.cityById[o.city].officers.push(o.idx);
}
this.units = []; this.nextUnitId = 1;
this.diplo = {};
this.itemPool = ITEMS.map(i => i.id);
this.playerForce = playerForceId;
this.delegated = false;
this.pendingJoin = null;
this.logs = [];
this.over = false;
}
  log(msg, mine=false) { this.logs.push({ t: `${this.year}년 ${this.month}월`, msg, mine }); if (this.logs.length > 200) this.logs.shift(); }
forceName(fid) { const f = this.forces[fid]; return f ? this.officers[f.ruler].name_ko + '군' : '적병'; }
forceCities(fid) { return this.cities.filter(c => c.force === fid); }
forceOfficers(fid) { return Object.values(this.officers).filter(o => o.state && o.state.force === fid); }
aliveForces() { return Object.values(this.forces).filter(f => f.alive); }
totalGold(fid) { return this.forceCities(fid).reduce((s,c) => s + c.gold, 0); }
totalFood(fid) { return this.forceCities(fid).reduce((s,c) => s + c.food, 0); }
canUse(fid, ap) { return this.forces[fid].ap >= ap; }
unitHasSkill(u, sk) { return u.officers.some(i => this.officers[i]?.skill === sk); }
cityHasSkill(c, sk) { return c.officers.some(i => this.officers[i]?.skill === sk); }
aptMult(u) {
if (u.type === 'sword') return 1;
const lead = this.officers[u.officers[0]];
return 0.9 + APT_LV(lead?.apt?.[APT_IDX[u.type]]) * 0.1;
}
unitDmgMult(u, siege = false) {
let m = 1;
if (siege) { if (this.unitHasSkill(u, '파성')) m *= 1.2; return m; }
if ((u.type === 'spear' || u.type === 'pike') && this.unitHasSkill(u, '파진')) m *= 1.15;
if (u.type === 'bow' && this.unitHasSkill(u, '신궁')) m *= 1.15;
if (u.type === 'cav' && this.unitHasSkill(u, '맹돌')) m *= 1.2;
if (u.type !== 'bow' && this.unitHasSkill(u, '격전')) m *= 1.1;
return m;
}
unitDefMult(u) { return this.unitHasSkill(u, '강직') ? 0.85 : 1; }
techLv(fid, b) { return this.forces[fid]?.techs?.[b] ?? 0; }
unitTechAtk(u) { const b = TYPE2TECH[u.type]; return b ? 1 + 0.05 * this.techLv(u.force, b) : 1; }
gainTechP(fid, n) { const f = this.forces[fid]; if (f?.alive) f.techP = (f.techP ?? 0) + n; }
researchTech(fid, b) {
const f = this.forces[fid];
if (!f?.alive || !TECH_BRANCHES.includes(b)) return false;
const lv = this.techLv(fid, b); if (lv >= 4) return false;
const cap = this.forceCities(fid).sort((x, y) => y.gold - x.gold)[0];
if ((f.techP ?? 0) < TECH_P[lv] || !cap || cap.gold < TECH_GOLD[lv]) return false;
f.techs = f.techs ?? {};
f.techP -= TECH_P[lv]; cap.gold -= TECH_GOLD[lv]; f.techs[b] = lv + 1;
    this.log(`【기교】${this.forceName(fid)} ${b} ${lv + 1}단계 연구 완료 (기교P ${TECH_P[lv]}·금 ${TECH_GOLD[lv]} 소비)`, fid === this.playerForce);
return true;
}
gainMerit(i, n) { const st = this.officers[i]?.state; if (st) st.merit = (st.merit ?? 0) + n; }
meritGrade(i) { return Math.min(8, Math.floor((this.officers[i]?.state?.merit ?? 0) / 500)); }
salaryOf(i) { return 10 + this.meritGrade(i) * 5; }
forceRank(fid) {
const f = this.forces[fid];
if (!f?.alive || this.forceName(fid).includes('황건')) return null;
const n = this.cities.filter(c => c.force === fid).length;
let r = null;
for (const [need, name] of RANKS) if (n >= need) r = name;
return r;
}
appointAdvisor(officerIdx) {
const o = this.officers[officerIdx];
if (!o || o.int < 70 || !o.state || o.state.force == null) return false;
const f = this.forces[o.state.force];
f.advisor = officerIdx;
    this.log(`【군사】${this.forceName(f.id)}의 군사로 ${o.name_ko}을(를) 임명했습니다`, f.id === this.playerForce);
return true;
}
mindDefense(fid) {
const f = this.forces[fid];
if (!f?.alive) return 0;
const rulerInt = this.officers[f.ruler]?.int ?? 0;
const advInt = f.advisor != null ? (this.officers[f.advisor]?.int ?? 0) : 0;
return Math.max(rulerInt, advInt) / 500;
}
_blocked(c) { return c && c.force === this.playerForce && !this.delegated && !this._legionActing && !!this.cityLegion(c.id); }
cityLegion(cityId) { const f = this.forces[this.cityById[cityId]?.force]; return (f?.legions ?? []).find(l => l.cities.includes(cityId)) ?? null; }
createLegion(governorIdx, cityIds, policy, target = null) {
const o = this.officers[governorIdx];
const fid = o?.state?.force;
const f = this.forces[fid];
if (!o || fid == null || !f?.alive) return false;
if (!['delegate', 'attack_city', 'attack_force'].includes(policy)) return false;
const own = new Set(this.forceCities(fid).map(c => c.id));
const cities = [...new Set(cityIds)].filter(id => own.has(id) && !this.cityLegion(id));
if (!cities.length) return false;
f.legions = f.legions ?? [];
const id = f.legions.length + 2;
    f.legions.push({ id, name: `제${id}군단`, governor: governorIdx, cities, policy, target });
    this.log(`【군단】${this.forceName(fid)} ${`제${id}군단`} 편성 — 도독 ${o.name_ko}, 도시 ${cities.length}개, 방침: ${{ delegate: '위임', attack_city: '도시공략', attack_force: '세력공략' }[policy]}`, fid === this.playerForce);
return true;
}
disbandLegion(fid, legionId) {
const f = this.forces[fid];
const i = (f?.legions ?? []).findIndex(l => l.id === legionId);
if (i < 0) return false;
const [l] = f.legions.splice(i, 1);
    this.log(`【군단】${l.name} 해산 — 도시는 제1군단(직할)으로 복귀`, fid === this.playerForce);
return true;
}
searchCity(cityId) {
const c = this.cityById[cityId], f = this.forces[c?.force];
if (this._blocked(c)) return false;
if (!c || c.force == null || !f?.alive || f.ap < 20 || c.gold < 100 || !c.officers.length) return false;
c.gold -= 100; f.ap -= 20;
const bestOff = [...new Set(c.officers)].sort((a, b) => this.officers[b].pol - this.officers[a].pol)[0];
const pol = this.officers[bestOff].pol;
const suwan = this.officers[bestOff].skill === '수완';
const hidden = Object.values(this.officers).filter(o => o.state?.status === 'free' && o.state.city === cityId && o.state.found === false);
if (hidden.length && Math.random() < Math.min(0.9, 0.4 + pol / 200 + (suwan ? 0.2 : 0))) {
const t = hidden[Math.floor(Math.random() * hidden.length)];
t.state.found = true;
this.gainMerit(bestOff, 20);
      this.log(`【수색】${c.name_ko}에서 재야 무장 ${t.name_ko}을(를) 발견했습니다! 등용할 수 있습니다`, c.force === this.playerForce);
return true;
}
this.itemPool = this.itemPool ?? ITEMS.map(i => i.id);
if (this.itemPool.length && Math.random() < 0.25 + (suwan ? 0.15 : 0)) {
const id = this.itemPool.splice(Math.floor(Math.random() * this.itemPool.length), 1)[0];
const item = ITEMS.find(i => i.id === id);
const st = this.officers[bestOff].state;
st.items = (st.items ?? []).concat(id).slice(0, 3);
this.gainMerit(bestOff, 20);
      this.log(`【수색】${c.name_ko}에서 명품 ${item.name}을(를) 발견했습니다! ${this.officers[bestOff].name_ko}이(가) 소유합니다`, true);
return true;
}
    this.log(`${c.name_ko}을(를) 수색했지만 아무것도 발견하지 못했습니다`, c.force === this.playerForce);
return true;
}
tradeRate() { return 4000 + ((this.year * 12 + this.month) * 7 % 4) * 1000; }
trade(cityId, dir, lots = 1) {
const c = this.cityById[cityId], f = this.forces[c?.force];
if (this._blocked(c)) return false;
lots = Math.max(1, Math.min(5, lots | 0));
if (!c || c.force == null || !f?.alive || f.ap < 10) return false;
const rate = this.tradeRate();
if (dir === 'buy') {
if (c.gold < 1000 * lots) return false;
c.gold -= 1000 * lots; c.food += rate * lots;
} else {
if (c.food < rate * lots) return false;
c.food -= rate * lots; c.gold += 1000 * lots;
}
f.ap -= 10;
    this.log(`${c.name_ko} 상인과 거래: ${dir === 'buy' ? `금 ${1000 * lots} → 병량 ${rate * lots}` : `병량 ${rate * lots} → 금 ${1000 * lots}`} (환율 1:${rate / 1000})`, c.force === this.playerForce);
return true;
}
unitItemAtk(u) {
let n = 0;
for (const i of u.officers) for (const id of (this.officers[i]?.state?.items ?? [])) if (ITEMS.find(x => x.id === id)?.kind === 'weapon') n++;
return 1 + 0.05 * n;
}
  diploKey(a, b) { return a < b ? `${a}_${b}` : `${b}_${a}`; }
diploOf(a, b) { const k = this.diploKey(a, b); return (this.diplo ??= {})[k] ??= { v: 50, allianceUntil: 0, aidTurn: -99 }; }
relation(a, b) { return a === b ? 100 : this.diploOf(a, b).v; }
relStage(v) { return v >= 80 ? '친밀' : v >= 60 ? '호의' : v >= 40 ? '중립' : v >= 20 ? '불화' : '험악'; }
isAllied(a, b) { return a !== b && (this.diploOf(a, b).allianceUntil ?? 0) >= this.turn; }
isTruce(a, b) { return a !== b && (this.diploOf(a, b).truceUntil ?? 0) >= this.turn; }
isPeace(a, b) { return this.isAllied(a, b) || this.isTruce(a, b); }
changeRelation(a, b, n) { const d = this.diploOf(a, b); d.v = Math.max(0, Math.min(100, d.v + n)); return d.v; }
envoy(fid, tid, cityId) {
const c = this.cityById[cityId], f = this.forces[c?.force], t = this.forces[tid];
if (!c || c.force !== fid || !f?.alive || !t?.alive || f.ap < 20 || c.gold < 500) return false;
c.gold -= 500; f.ap -= 20;
const pol = Math.max(50, ...c.officers.map(i => this.officers[i].pol));
const negotiator = c.officers.some(i => this.officers[i].skill === '논객');
const gain = Math.round((8 + pol / 10) * (negotiator ? 1.5 : 1));
const v = this.changeRelation(fid, tid, gain);
    this.log(`【외교】${this.forceName(fid)} → ${this.forceName(tid)} 친선 사절 (관계 +${gain} → ${v} ${this.relStage(v)}${negotiator ? ', 논객' : ''})`, fid === this.playerForce || tid === this.playerForce);
return true;
}
proposeAlliance(fid, tid, cityId) {
const c = this.cityById[cityId], f = this.forces[c?.force], t = this.forces[tid];
if (!c || c.force !== fid || !f?.alive || !t?.alive || f.ap < 30 || c.gold < 1000) return false;
const d = this.diploOf(fid, tid);
if (d.v < 60 || this.isAllied(fid, tid)) return false;
c.gold -= 1000; f.ap -= 30;
const pol = Math.max(50, ...c.officers.map(i => this.officers[i].pol));
const p = Math.min(0.9, 0.4 + (d.v - 50) / 100 + pol / 300);
if (Math.random() < p) {
d.allianceUntil = this.turn + 24;
      this.log(`【외교】${this.forceName(fid)}과(와) ${this.forceName(tid)}이(가) 24턴 동맹을 맺었습니다!`, true);
return true;
}
    this.log(`【외교】${this.forceName(tid)}이(가) ${this.forceName(fid)}의 동맹 제의를 거절했습니다`, fid === this.playerForce || tid === this.playerForce);
return false;
}
requestTruce(fid, tid, cityId) {
const c = this.cityById[cityId], f = this.forces[c?.force], t = this.forces[tid];
if (!c || c.force !== fid || !f?.alive || !t?.alive || f.ap < 30 || c.gold < 2000) return false;
const d = this.diploOf(fid, tid);
if (d.v > 39) return false;
c.gold -= 2000; f.ap -= 30;
const pol = Math.max(50, ...c.officers.map(i => this.officers[i].pol));
if (Math.random() < Math.min(0.8, 0.3 + pol / 300 + d.v / 200)) {
d.truceUntil = this.turn + 12;
const v = this.changeRelation(fid, tid, 30);
      this.log(`【외교】${this.forceName(fid)}과(와) ${this.forceName(tid)}이(가) 정전했습니다 (12턴간 공격 금지, 관계 → ${v} ${this.relStage(v)})`, true);
return true;
}
    this.log(`【외교】${this.forceName(tid)}이(가) 정전 요청을 거절했습니다`, fid === this.playerForce || tid === this.playerForce);
return false;
}
demandSurrender(fid, tid, cityId) {
const c = this.cityById[cityId], f = this.forces[c?.force], t = this.forces[tid];
if (!c || c.force !== fid || !f?.alive || !t?.alive || f.ap < 30 || c.gold < 1000) return false;
const tCities = this.cities.filter(x => x.force === tid);
if (tCities.length > 2) return false;
c.gold -= 1000; f.ap -= 30;
const chr = Math.max(50, ...c.officers.map(i => this.officers[i].chr));
const myN = this.cities.filter(x => x.force === fid).length;
const p = Math.min(0.5, 0.05 + (chr - 50) / 200 + (myN - tCities.length) * 0.05);
if (Math.random() < p) {
for (const tc of tCities) { tc.force = fid; }
for (const u of this.units) if (u.force === tid) u.force = fid;
for (const o of Object.values(this.officers)) if (o.state?.force === tid) { o.state.force = fid; if (o.state.city != null) { const nc = this.cityById[o.state.city]; if (nc && !nc.officers.includes(o.idx)) nc.officers.push(o.idx); } }
t.alive = false;
      this.log(`【항복】${this.forceName(tid)}이(가) ${this.forceName(fid)}에 항복했습니다! 도시 ${tCities.length}개와 무장이 귀속됩니다`, true);
return true;
}
this.changeRelation(fid, tid, -20);
    this.log(`【외교】${this.forceName(tid)}이(가) 항복 권고를 거부했습니다 (관계 악화)`, fid === this.playerForce || tid === this.playerForce);
return false;
}
requestAid(fid, tid, cityId) {
const c = this.cityById[cityId], f = this.forces[c?.force], t = this.forces[tid];
if (!c || c.force !== fid || !f?.alive || !t?.alive || f.ap < 20 || !this.isAllied(fid, tid)) return false;
const d = this.diploOf(fid, tid);
if (this.turn - (d.aidTurn ?? -99) < 18) return false;
const src = this.cities.filter(x => x.force === tid && x.troops >= 6000).sort((a, b) => b.troops - a.troops)[0];
if (!src) return false;
f.ap -= 20;
src.troops -= 3000;
const dst = this.cities.filter(x => x.force === fid).sort((a, b) => a.troops - b.troops)[0];
dst.troops = Math.min(dst.metropolis ? 150000 : 100000, dst.troops + 3000);
d.aidTurn = this.turn;
    this.log(`【외교】동맹국 ${this.forceName(tid)}이(가) 원군 3000을 ${dst.name_ko}에 보냈습니다`, true);
return true;
}
breakAlliance(fid, tid) {
if (!this.isAllied(fid, tid)) return false;
this.diploOf(fid, tid).allianceUntil = 0;
const v = this.changeRelation(fid, tid, -40);
    this.log(`【외교】${this.forceName(fid)}이(가) ${this.forceName(tid)}과(와)의 동맹을 파기했습니다 (관계 → ${v} ${this.relStage(v)})`, true);
return true;
}
checkRanks() {
for (const f of Object.values(this.forces)) {
if (!f.alive) continue;
const r = this.forceRank(f.id);
if (r && r !== f.rank) {
f.rank = r;
for (const o of Object.values(this.officers)) if (o.state?.force === f.id) o.state.loyal = Math.min(100, (o.state.loyal ?? 70) + 5);
        this.log(`【관작】${this.forceName(f.id)}이(가) ${r}(으)로 승진했습니다! 소속 무장 충성 상승`, true);
}
}
}
facSlots(c) { return c.metropolis ? 12 : 8; }
cityFac(c, t) { return (c.facilities ?? []).filter(f => f.type === t && f.done); }
buildFacility(cityId, type, builders) {
const c = this.cityById[cityId], f = this.forces[c.force], spec = FACILITIES[type];
if (this._blocked(c)) return false;
if (!spec || !f?.alive || f.ap < 20) return false;
c.facilities = c.facilities ?? [];
if (c.facilities.length >= this.facSlots(c)) return false;
if (c.gold < spec.cost) return false;
const valid = [...new Set((builders ?? []).filter(i => c.officers.includes(i)))].slice(0, 3);
c.gold -= spec.cost; f.ap -= 20;
c.facilities.push({ type, progress: 0, builders: valid, done: false });
    this.log(`${c.name_ko}에 ${type} 건설 시작 (금 ${spec.cost}, 담당 ${valid.length}명)`, c.force === this.playerForce);
return true;
}
demolishFacility(cityId, fi) {
const c = this.cityById[cityId];
if (!c?.facilities?.[fi]) return false;
const [rm] = c.facilities.splice(fi, 1);
    this.log(`${c.name_ko}의 ${rm.type}을(를) 철거했습니다`, c.force === this.playerForce);
return true;
}
develop(cityId, kind) {
const c = this.cityById[cityId], f = this.forces[c.force];
if (this._blocked(c)) return false;
if (c.gold < 300 || f.ap < 30 || c[kind] >= 100) return false;
const bestOff = c.officers.length ? [...c.officers].sort((a, b) => this.officers[b].pol - this.officers[a].pol)[0] : null;
const best = Math.max(50, ...c.officers.map(i => this.officers[i].pol));
c.gold -= 300; f.ap -= 30;
if (bestOff != null) this.gainMerit(bestOff, MERIT.develop);
const gain = Math.round(4 + best/20);
c[kind] = Math.min(100, c[kind] + gain);
this.gainTechP(c.force, 25);
    this.log(`${c.name_ko} ${kind==='commerce'?'상업':'농업'} 개발 +${gain} (담당 정치 ${best})`, c.force === this.playerForce);
return true;
}
recruit(cityId) {
const c = this.cityById[cityId], f = this.forces[c.force];
if (this._blocked(c)) return false;
if (c.gold < 200 || c.food < 1000 || f.ap < 30) return false;
const best = Math.max(50, ...c.officers.map(i => this.officers[i].chr));
const n = Math.round((1500 + best*30) * (this.cityHasSkill(c, '명성') ? 1.3 : 1) * (this.cityFac(c, '병영').length ? 1.3 : 1));
c.gold -= 200; c.food -= 1000; f.ap -= 30;
const cap = c.metropolis ? 150000 : 100000;
c.troops = Math.min(cap, c.troops + n);
this.gainTechP(c.force, 25);
    this.log(`${c.name_ko} 징병 +${n} (담당 매력 ${best})`, c.force === this.playerForce);
return true;
}
freeOfficers(cityId) {
return Object.values(this.officers).filter(o => o.state?.status === 'free' && o.state.city === cityId);
}
recruitChance(cityId, officerIdx) {
const c = this.cityById[cityId], t = this.officers[officerIdx];
if (!c || c.force == null || !this.forces[c.force]?.alive || !c.officers.length) return 0;
if (!t?.state || t.state.status !== 'free' || t.state.city !== cityId) return 0;
if (t.state.found === false) return 0;
const envoy = Math.max(...c.officers.map(i => this.officers[i].chr));
const ruler = this.officers[this.forces[c.force].ruler]?.chr ?? 50;
const loyal = t.state.loyal ?? 70;
return Math.max(0.1, Math.min(0.9, 0.45 + (envoy - t.chr)/200 + (ruler - 50)/500 - loyal/400 + (this.cityHasSkill(c, '등용') ? 0.1 : 0)));
}
recruitOfficer(cityId, officerIdx) {
const c = this.cityById[cityId], f = this.forces[c.force];
if (this._blocked(c)) return false;
if (c.gold < 100 || f.ap < 20) return false;
const p = this.recruitChance(cityId, officerIdx);
if (p <= 0) return false;
const t = this.officers[officerIdx];
const envoy = Math.max(...c.officers.map(i => this.officers[i].chr));
c.gold -= 100; f.ap -= 20;
if (Math.random() < p) {
const envoyIdx = c.officers.length ? [...c.officers].sort((a, b) => this.officers[b].chr - this.officers[a].chr)[0] : null;
if (envoyIdx != null) this.gainMerit(envoyIdx, MERIT.recruit);
t.state.status = 'serving'; t.state.force = c.force;
if (!c.officers.includes(officerIdx)) c.officers.push(officerIdx);
      this.log(`【등용】${t.name_ko}이(가) 【${this.forceName(c.force)}】에 등용되었습니다 (${c.name_ko}, 사자 매력 ${envoy})`, true);
return true;
}
    this.log(`${c.name_ko}의 ${t.name_ko} 등용에 실패했습니다`, c.force === this.playerForce);
return false;
}
moveOfficers(fromCity, toCity, idxs) {
const a = this.cityById[fromCity], b = this.cityById[toCity], f = this.forces[a.force];
if (f.ap < 20 || this._blocked(a)) return false;
f.ap -= 20;
a.officers = a.officers.filter(i => !idxs.includes(i));
for (const i of new Set(idxs)) { if (!b.officers.includes(i)) b.officers.push(i); this.officers[i].state.city = toCity; }
    this.log(`${a.name_ko} → ${b.name_ko} 무장 ${idxs.length}명 이동`, a.force === this.playerForce);
return true;
}
produceSiege(cityId, kind) {
const c = this.cityById[cityId], f = this.forces[c.force];
if (this._blocked(c)) return false;
const spec = SIEGE_BUILD[kind];
if (!spec || !this.cityFac(c, '공방').length) return false;
const cost = Math.round(spec.gold * ((c.specialty ?? []).includes('병기') ? 0.75 : 1));
if (f.ap < 10 || c.gold < cost) return false;
c.gold -= cost; f.ap -= 10;
c[spec.store] = (c[spec.store] ?? 0) + 1;
    this.log(`${c.name_ko}에서 ${spec.name} 생산 (금 ${cost})`, c.force === this.playerForce);
return true;
}
produceShip(cityId, kind) {
const c = this.cityById[cityId], f = this.forces[c.force];
if (this._blocked(c)) return false;
const spec = SHIP_BUILD[kind];
if (!spec || !this.cityFac(c, '조선소').length) return false;
const cost = Math.round(spec.gold * ((c.specialty ?? []).includes('선박') ? 0.75 : 1));
if (f.ap < 10 || c.gold < cost) return false;
c.gold -= cost; f.ap -= 10;
c[spec.store] = (c[spec.store] ?? 0) + 1;
    this.log(`${c.name_ko}에서 ${spec.name} 건조 (금 ${cost})`, c.force === this.playerForce);
return true;
}
dispatch(cityId, officerIdxs, troops, type) {
officerIdxs = [...new Set(officerIdxs)];
const c = this.cityById[cityId], f = this.forces[c.force];
if (this._blocked(c)) return false;
if (f.ap < 40 || c.troops < troops || officerIdxs.length === 0) return false;
const ut = UNIT_TYPES[type];
for (const [k, per] of Object.entries(ut.cost)) {
const need = ut.perUnit ? per : per * troops;
if ((c[k] ?? 0) < need) return false;
}
for (const [k, per] of Object.entries(ut.cost)) c[k] -= ut.perUnit ? per : per * troops;
c.troops -= troops; f.ap -= 40;
c.officers = c.officers.filter(i => !officerIdxs.includes(i));
for (const i of officerIdxs) this.officers[i].state.city = null;
const unit = { id: this.nextUnitId++, force: c.force, officers: officerIdxs, troops, type,
x: c.lon, z: c.lat, path: [], tx: null, tz: null, targetCity: null, label: '', qi: 100, conf: 0 };
    unit.label = `${this.officers[officerIdxs[0]].name_ko} ${Math.round(troops/1000)}k`;
this.units.push(unit);
    this.log(`${c.name_ko}에서 ${this.officers[officerIdxs[0]].name_ko}의 ${ut.name} ${troops} 출진`, c.force === this.playerForce);
return unit;
}
orderUnit(unitId, targetCityId) {
const u = this.units.find(u => u.id === unitId);
const c = this.cityById[targetCityId];
if (!u || !c) return;
    if (c.force != null && c.force !== u.force && this.isPeace(u.force, c.force)) { this.log(`${this.forceName(c.force)}은(는) 동맹·정전 중이라 공격할 수 없습니다`, u.force === this.playerForce); return; }
u.targetCity = targetCityId; u.tx = c.lon; u.tz = c.lat;
}
endTurn(aiThink) {
for (const u of this.units) u.qi = Math.min(100, (u.qi ?? 100) + 10);
for (const u of [...this.units]) { if (u.force === -1) this.banditAct(u); else this.stepUnit(u); }
this.resolveFieldBattles();
if (this.dan === 3) {
for (const c of this.cities) {
if (c.force == null || !this.forces[c.force]?.alive) continue;
const mk = this.cityFac(c, '시장').length * (this.cityFac(c, '조폐').length ? 1.5 : 1);
const fm = this.cityFac(c, '농장').length * (this.cityFac(c, '곡창').length ? 1.5 : 1);
c.gold += Math.round((50 + c.commerce * 8 * (c.metropolis ? 1.5 : 1)) * (this.cityHasSkill(c, '통상') ? 1.3 : 1) * (1 + 0.25 * mk));
c.food += Math.round((300 + c.farm * 80) * (this.cityHasSkill(c, '부농') ? 1.3 : 1) * (1 + 0.25 * fm));
c.hp = Math.min(c.maxhp, c.hp + 200);
if (this.cityFac(c, '대장간').length) {
const sp = c.specialty ?? [];
if (sp.includes('창')) c.spears += 400; else if (sp.includes('극')) c.pikes += 400; else if (sp.includes('노')) c.bows += 400;
else { c.spears += 100; c.pikes += 100; c.bows += 100; }
}
if (this.cityFac(c, '마구간').length) c.horses += (c.specialty ?? []).includes('군마') ? 400 : 100;
for (const i of [...new Set(c.officers)]) {
const st = this.officers[i]?.state;
if (!st || st.force == null) continue;
const sal = this.salaryOf(i);
if (c.gold >= sal) { c.gold -= sal; st.loyal = Math.min(100, (st.loyal ?? 70) + 1); }
else {
st.loyal = Math.max(0, (st.loyal ?? 70) - 4);
            this.log(`${c.name_ko}의 ${this.officers[i].name_ko}에게 봉록 ${sal}금을 주지 못했습니다 (충성 하락)`, c.force === this.playerForce);
}
}
c.security = Math.max(0, Math.min(100, (c.security ?? 80) + (this.cityHasSkill(c, '치안') ? 0 : -1)));
if (c.disaster) {
c.troops = Math.max(0, Math.round(c.troops * 0.95));
c.gold = Math.max(0, Math.round(c.gold * 0.9));
c.food = Math.max(0, Math.round(c.food * 0.9));
          if (c.disaster.until <= this.turn) { this.log(`【재해】${c.name_ko}의 ${c.disaster.type}이(가) 지나갔습니다`, c.force === this.playerForce); c.disaster = null; }
} else if (Math.random() < 0.02) {
c.disaster = { type: '역병', until: this.turn + 6 };
          this.log(`【재해】${c.name_ko}에 역병이 돌고 있습니다! (2개월간 병사·금·병량 감소)`, true);
}
if ((c.security ?? 80) < 80 && !this.units.some(u => u.force === -1 && u.targetCity === c.id) && Math.random() < 0.25) this.spawnBandits(c);
}
for (const f of Object.values(this.forces)) {
if (!f.alive) continue;
if (Object.values(this.officers).some(o => o.state?.force === f.id && (o.state.items ?? []).includes('yuxi'))) {
f.techP = (f.techP ?? 0) + 10;
}
}
for (const [k, d] of Object.entries(this.diplo ?? {})) {
const [a, b] = k.split('_').map(Number);
if ((d.allianceUntil ?? 0) > 0 && d.allianceUntil < this.turn) {
d.allianceUntil = 0;
          this.log(`【외교】${this.forceName(a)}과(와) ${this.forceName(b)}의 동맹이 만료되었습니다`, true);
}
if ((d.truceUntil ?? 0) > 0 && d.truceUntil < this.turn) {
d.truceUntil = 0;
          this.log(`【외교】${this.forceName(a)}과(와) ${this.forceName(b)}의 정전이 끝났습니다`, true);
}
if (d.v > 50) d.v--; else if (d.v < 50) d.v++;
}
for (const c of this.cities) {
for (const i of [...c.officers]) {
const st = this.officers[i]?.state;
if (!st || (st.status !== 'serving' && st.status !== 'taesu')) continue;
if ((st.loyal ?? 70) <= 25 && Math.random() < 0.15) {
st.status = 'free'; st.force = null; st.city = null; st.found = false;
c.officers = c.officers.filter(x => x !== i);
            this.log(`【하야】${this.officers[i].name_ko}이(가) 충성이 낮아 【${this.forceName(c.force)}】을(를) 떠났습니다`, true);
}
}
}
}
for (const o of Object.values(this.officers)) {
if (o.state && o.state.status === 'not_yet' && this.year >= o.avail) {
o.state.status = 'free';
        if (o.state.city != null && this.cityById[o.state.city]) this.log(`${o.name_ko}이(가) ${this.cityById[o.state.city].name_ko}에 등장했습니다 (재야)`);
}
}
for (const f of Object.values(this.forces)) {
if (!f.alive) continue;
f.ap = Math.min(255, f.ap + 30);
if (f.id !== this.playerForce || this.delegated) aiThink(this, f.id);
else for (const l of f.legions ?? []) { this._legionActing = true; aiThink(this, f.id, l); this._legionActing = false; }
}
for (const f of Object.values(this.forces)) {
if (!f.alive) continue;
const hasCity = this.cities.some(c => c.force === f.id);
const hasUnit = this.units.some(u => u.force === f.id);
if (!hasCity && !hasUnit) {
f.alive = false;
        this.log(`【${this.forceName(f.id)}】이(가) 멸망했습니다!`, true);
for (const o of this.forceOfficers(f.id)) { o.state.force = null; o.state.status = 'free'; o.state.found = false; }
}
}
for (const c of this.cities) {
for (const fc of (c.facilities ?? [])) {
if (fc.done) continue;
fc.builders = (fc.builders ?? []).filter(i => c.officers.includes(i));
const polSum = fc.builders.reduce((s, i) => s + (this.officers[i]?.pol ?? 0), 0);
fc.progress += polSum >= 250 ? 2 : 1;
if (fc.progress >= FACILITIES[fc.type].turns) {
fc.done = true;
for (const b of fc.builders) this.gainMerit(b, MERIT.facility);
          this.log(`${c.name_ko}에 ${fc.type} 완성!`, c.force === this.playerForce);
}
}
}
this.checkRanks();
this.dan++;
if (this.dan > 3) { this.dan = 1; this.month++; if (this.month > 12) { this.month = 1; this.year++; } }
this.turn++;
if (this.pendingJoin != null && this.forces[this.pendingJoin]?.alive) {
this.playerForce = this.pendingJoin; this.delegated = false; this.pendingJoin = null;
      this.log(`【${this.forceName(this.playerForce)}】에 참가하여 지휘를 시작합니다.`, true);
}
this.autosave();
}
stepUnit(u) {
if ((u.conf ?? 0) > 0) {
u.conf--;
      this.log(`${u.label}이(가) 혼란에 빠져 움직이지 못합니다`, u.force === this.playerForce);
return;
}
if (u.tx == null) return;
const engaged = this.units.some(v => v !== u && v.force !== u.force && Math.hypot(v.x-u.x, v.z-u.z) < 2.2);
if (engaged) {
const tgt = u.targetCity != null ? this.cityById[u.targetCity] : null;
if (!tgt || tgt.force !== u.force) return;
}
const ut = UNIT_TYPES[u.type];
const speed = 0.55 * ut.move * (this.unitHasSkill(u, '질풍') ? 1.25 : 1);
const dx = u.tx - u.x, dz = u.tz - u.z;
const d = Math.hypot(dx, dz);
if (d > 1.2) {
const nx = u.x + dx/d*speed, nz = u.z + dz/d*speed;
if (SHIP_TYPES.has(u.type) && !isWaterAt(nx, nz)) {
        if (!u._landWarn) { u._landWarn = true; this.log(`${u.label}이(가) 수로를 벗어나 더 이상 나아갈 수 없습니다`, u.force === this.playerForce); }
return;
}
u._landWarn = false;
u.x = nx; u.z = nz; return;
}
const c = this.cityById[u.targetCity];
if (!c) { u.tx = null; return; }
if (c.force != null && c.force !== u.force && this.isPeace(u.force, c.force)) {
u.tx = null; u.targetCity = null;
return;
}
if (c.force === u.force) {
const cap = c.metropolis ? 150000 : 100000;
c.troops = Math.min(cap, c.troops + u.troops);
for (const i of u.officers) { if (!c.officers.includes(i)) c.officers.push(i); this.officers[i].state.city = c.id; }
this.units = this.units.filter(x => x !== u);
return;
}
if (SIEGE_TYPES.has(u.type) && (u.qi ?? 100) <= 0) {
      this.log(`${u.label}의 병기가 기력 부족으로 공격하지 못합니다`, u.force === this.playerForce);
return;
}
const lead = this.officers[u.officers[0]];
let dmg = Math.round(u.troops * 0.12 * ut.atk * (0.7 + lead.war/150) * this.aptMult(u) * this.unitDmgMult(u, true) * this.unitItemAtk(u) * this.unitTechAtk(u) * (1 + 0.1 * this.techLv(u.force, '발명')));
let loss = Math.round(c.troops * 0.06 / ut.def + 150);
const tac = TACTICS[u.type];
const aptLv = u.type === 'sword' ? 1 : APT_LV(lead.apt?.[APT_IDX[u.type]]);
if (aptLv >= (tac.minApt ?? 1) && u.qi >= tac.qi && Math.random() < Math.min(0.55, 0.15 + lead.war/250)) {
u.qi -= tac.qi;
this.gainMerit(u.officers[0], MERIT.tactic);
dmg = Math.round(dmg * tac.mult);
if (tac.guard) loss = Math.round(loss * tac.guard);
      this.log(`【전법】${lead.name_ko}의 ${tac.name}! ${c.name_ko}에 큰 피해`, u.force === this.playerForce);
}
const caster = u.officers.map(i => this.officers[i]).sort((a, b) => b.int - a.int)[0];
if (caster && caster.int >= STRATS.fire.minInt && u.qi >= STRATS.fire.qi && Math.random() < Math.min(0.5, 0.1 + caster.int/300 + (this.unitHasSkill(u, '풍계') ? 0.15 : 0)) * (1 - this.mindDefense(c.force))) {
u.qi -= STRATS.fire.qi;
this.gainMerit(caster.idx, MERIT.stratagem);
const burn = Math.round(c.troops * 0.08 * (1 + 0.15 * this.techLv(u.force, '화공')));
c.troops = Math.max(0, c.troops - burn);
c.hp = Math.max(0, c.hp - Math.round(burn * 0.5));
      this.log(`【계략】${caster.name_ko}의 화계! ${c.name_ko} 수비병 -${burn}`, u.force === this.playerForce);
}
if (c.officers.length && (c.lastStrat ?? 0) + STRATS.confuse.cooldown <= this.turn) {
const def = c.officers.map(i => this.officers[i]).sort((a, b) => b.int - a.int)[0];
const p = Math.max(0.05, Math.min(0.45, 0.15 + (def.int - lead.int)/250));
if (def.int >= STRATS.confuse.minInt && !this.unitHasSkill(u, '위장') && Math.random() < p * (1 - this.mindDefense(u.force))) {
c.lastStrat = this.turn; u.conf = STRATS.confuse.turns;
        this.log(`【계략】${def.name_ko}의 혼란! ${u.label}이(가) ${STRATS.confuse.turns}턴간 움직이지 못합니다`, c.force === this.playerForce);
}
}
if (ut.siege) dmg = Math.round(dmg * ut.siege);
    if (ut.burn) { const ex = Math.round(c.troops * 0.03); c.troops = Math.max(0, c.troops - ex); c.hp = Math.max(0, c.hp - Math.round(ex*0.5)); this.log(`${u.label}의 목수가 화염을 뿜어 추가 피해 -${ex}`, u.force === this.playerForce); }
if (this.cityHasSkill(c, '수성')) dmg = Math.round(dmg * 0.85);
if (c.force != null) dmg = Math.round(dmg * (1 - 0.05 * this.techLv(c.force, '방위')));
c.troops = Math.max(0, c.troops - dmg);
c.hp = Math.max(0, c.hp - Math.round(dmg*0.5));
u.troops = Math.max(0, u.troops - loss);
this.gainTechP(u.force, Math.min(50, Math.floor(dmg / 100)));
    this.log(`${u.label}이(가) ${c.name_ko}을(를) 공격 (적병 -${dmg}, 아군 -${loss})`, u.force === this.playerForce);
    if (u.troops <= 0) { this.units = this.units.filter(x => x !== u); this.log(`${u.label} 부대가 전멸했습니다`, false); return; }
if (c.troops <= 0 || c.hp <= 0) {
const old = c.force;
c.force = u.force; c.district = null;
c.hp = Math.round(c.maxhp * 0.4);
this.gainTechP(u.force, 200);
for (const i of u.officers) this.gainMerit(i, MERIT.capture);
      this.log(`【${c.name_ko}】함락! ${old != null ? this.forceName(old) : '공백지'} → ${this.forceName(u.force)}`, true);
u.tx = null; u.targetCity = null;
}
}
resolveFieldBattles() {
const us = [...this.units];
for (let i = 0; i < us.length; i++) for (let j = i+1; j < us.length; j++) {
const a = us[i], b = us[j];
if (!this.units.includes(a) || !this.units.includes(b)) continue;
if (a.force === b.force) continue;
if (this.isPeace(a.force, b.force)) continue;
if (Math.hypot(a.x-b.x, a.z-b.z) >= 2.2) continue;
this.fieldBattle(a, b);
}
}
fieldBattle(a, b) {
const strike = (att, def) => {
if ((att.conf ?? 0) > 0) return 0;
if (SIEGE_TYPES.has(att.type) && (att.qi ?? 100) <= 0) return 0;
const utA = UNIT_TYPES[att.type], utD = UNIT_TYPES[def.type];
const lead = this.officers[att.officers[0]] ?? { war: 60, int: 30, apt: null, name_ko: '적병 두목', idx: -1 };
let dmg = Math.round(att.troops * 0.05 * utA.atk * (0.7 + lead.war/150) / utD.def * this.aptMult(att) * this.unitDmgMult(att) * this.unitItemAtk(att) * this.unitDefMult(def) * this.unitTechAtk(att) * (1 - 0.03 * this.techLv(def.force, '연병')));
if (isWaterAt(att.x, att.z)) { dmg = Math.round(dmg * (utA.ship ? 1.3 : 0.7) * (this.unitHasSkill(att, '수완') ? 1.15 : 1)); }
const tac = TACTICS[att.type];
const aptLv = att.type === 'sword' ? 1 : APT_LV(lead.apt?.[APT_IDX[att.type]]);
if (aptLv >= (tac.minApt ?? 1) && (att.qi ?? 100) >= tac.qi && Math.random() < Math.min(0.55, 0.15 + lead.war/250)) {
att.qi -= tac.qi; dmg = Math.round(dmg * tac.mult);
if (tac.guard) att._guard = true;
        this.log(`【전법】${lead.name_ko}의 ${tac.name}! 야전에서 ${def.label}에 큰 피해`, att.force === this.playerForce);
}
const caster = att.officers.map(i => this.officers[i]).sort((x, y) => y.int - x.int)[0];
if (caster && caster.int >= STRATS.confuse.minInt && !this.unitHasSkill(def, '위장') && (att.qi ?? 100) >= 25 && Math.random() < Math.min(0.35, 0.08 + caster.int/400) * (1 - this.mindDefense(def.force))) {
att.qi -= 25; def.conf = Math.max(def.conf ?? 0, STRATS.confuse.turns);
        this.log(`【계략】${caster.name_ko}의 혼란! ${def.label}이(가) ${STRATS.confuse.turns}턴간 움직이지 못합니다`, att.force === this.playerForce);
}
if (caster && caster.int >= STRATS.fire.minInt && !this.unitHasSkill(def, '위장') && (att.qi ?? 100) >= STRATS.fire.qi && Math.random() < Math.min(0.5, 0.1 + caster.int/300 + (this.unitHasSkill(att, '풍계') ? 0.15 : 0)) * (1 - this.mindDefense(def.force))) {
att.qi -= STRATS.fire.qi;
const burn = Math.round(def.troops * 0.06 * (1 + 0.15 * this.techLv(att.force, '화공')));
def.troops = Math.max(0, def.troops - burn);
        this.log(`【계략】${caster.name_ko}의 화계! ${def.label} 병력 -${burn}`, att.force === this.playerForce);
}
return dmg;
};
a._guard = false; b._guard = false;
let da = strike(a, b), db = strike(b, a);
if (a._guard) db = Math.round(db * TACTICS[a.type].guard);
if (b._guard) da = Math.round(da * TACTICS[b.type].guard);
a.troops = Math.max(0, a.troops - db);
b.troops = Math.max(0, b.troops - da);
this.gainTechP(a.force, Math.min(40, Math.floor(db / 100))); this.gainTechP(b.force, Math.min(40, Math.floor(da / 100)));
    this.log(`【야전】${a.label} ↔ ${b.label} 교전 (${a.label} -${db} / ${b.label} -${da})`, a.force === this.playerForce || b.force === this.playerForce);
for (const u of [a, b]) {
if (u.troops <= 0) {
this.units = this.units.filter(x => x !== u);
        this.log(`${u.label} 부대가 전멸했습니다`, false);
} else if (u.troops < (this.unitHasSkill(u, '완강') ? 600 : 1200)) {
const home = this.forceCities(u.force).sort((pp, qq) => Math.hypot(pp.lon-u.x, pp.lat-u.z) - Math.hypot(qq.lon-u.x, qq.lat-u.z))[0];
if (home) {
u.targetCity = home.id; u.tx = home.lon; u.tz = home.lat;
          this.log(`${u.label}이(가) ${home.name_ko}(으)로 퇴각합니다`, u.force === this.playerForce);
}
}
}
}
patrol(cityId) {
const c = this.cityById[cityId];
if (!c || c.force == null || this._blocked(c)) return false;
const f = this.forces[c.force];
if ((f.ap ?? 0) < 20 || c.gold < 100 || (c.security ?? 80) >= 100) return false;
f.ap -= 20; c.gold -= 100;
c.security = Math.min(100, (c.security ?? 80) + 10);
    this.log(`【치안】${c.name_ko}에서 순찰을 실시했습니다 (치안 ${c.security})`, c.force === this.playerForce);
return true;
}
spawnBandits(c) {
let cell = null;
for (let r = 2; r <= 5 && !cell; r++)
for (let dx = -r; dx <= r && !cell; dx++) for (let dz = -r; dz <= r && !cell; dz++) {
if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
const x = c.lon + dx, z = c.lat + dz;
if (isWaterAt(x, z)) continue;
if (this.cities.some(o => Math.hypot(o.lon - x, o.lat - z) < 1.5)) continue;
if (this.units.some(u => Math.hypot(u.x - x, u.z - z) < 1)) continue;
cell = { x, z };
}
if (!cell) return;
const u = { id: this.nextUnitId++, force: -1, officers: [], troops: 3000, type: 'spear',
x: cell.x, z: cell.z, path: [], tx: null, tz: null, targetCity: c.id, label: '적병 3k', qi: 100, conf: 0, until: this.turn + 18 };
this.units.push(u);
    this.log(`【적】${c.name_ko} 주변에 적의 근거지가 출현했습니다! (치안 ${c.security ?? 80} — 순찰로 치안을 높이세요)`, true);
}
banditAct(u) {
if ((u.until ?? Infinity) <= this.turn || u.troops <= 0) { this.units = this.units.filter(x => x !== u); return; }
const c = this.cityById[u.targetCity];
if (!c || c.force == null) { this.units = this.units.filter(x => x !== u); return; }
const d = Math.hypot(c.lon - u.x, c.lat - u.z);
if (d < 1.6) {
const done = (c.facilities ?? []).filter(f => f.done);
if (done.length) {
const f = done[Math.floor(Math.random() * done.length)];
c.facilities = c.facilities.filter(x => x !== f);
        this.log(`【적】${c.name_ko}의 ${f.type}이(가) 적에게 파괴되었습니다!`, true);
} else {
const loot = Math.min(c.gold, 500);
c.gold -= loot;
        this.log(`【적】적병이 ${c.name_ko}을(를) 약탈했습니다 (금 -${loot})`, true);
}
c.security = Math.max(0, (c.security ?? 80) - 5);
this.units = this.units.filter(x => x !== u);
return;
}
const step = 0.55 * UNIT_TYPES[u.type].move;
const nx = u.x + (c.lon - u.x) / d * step, nz = u.z + (c.lat - u.z) / d * step;
if (isWaterAt(nx, nz)) return;
u.x = nx; u.z = nz;
}
autosave() {
try {
const data = {
scenId: this.scenId, year: this.year, month: this.month, dan: this.dan, turn: this.turn,
cities: this.cities, forces: this.forces, units: this.units, nextUnitId: this.nextUnitId,
playerForce: this.playerForce, delegated: this.delegated, deadAck: this.deadAck, logs: this.logs.slice(-60), diplo: this.diplo, itemPool: this.itemPool,
officerStates: Object.fromEntries(Object.entries(this.officers).filter(([,o]) => o.state).map(([i,o]) => [i, o.state])),
};
localStorage.setItem(SAVE_KEY, JSON.stringify(data));
} catch (e) { /* 용량 초과 등 무시 */ }
}
}
function josa(name, pair) {
const code = name.charCodeAt(name.length-1);
const jong = (code >= 0xAC00 && code <= 0xD7A3) ? (code-0xAC00)%28 : 0;
return name + (jong ? pair[0] : pair[1]);  }

function aiThink(game, fid, legion = null) {
const f = game.forces[fid];
if (!f || !f.alive) return;
let cities = game.forceCities(fid);
if (legion) cities = cities.filter(c => legion.cities.includes(c.id));
for (const c of cities) if ((c.security ?? 80) < 80) game.patrol(c.id);
if (cities.length === 0) return;
for (const c of cities) {
if (f.ap < 30) break;
if (c.gold > 1200) {
game.develop(c.id, c.commerce <= c.farm ? 'commerce' : 'farm');
}
}
for (const c of cities) {
if (f.ap < 20 || c.gold < 100 || !c.officers.length) continue;
const hasHidden = Object.values(game.officers).some(o => o.state?.status === 'free' && o.state.city === c.id && o.state.found === false);
if (hasHidden && Math.random() < 0.4) game.searchCity(c.id);
}
{
const rate = game.tradeRate();
const needFood = cities.filter(c => c.food < 3000 && c.gold >= 3000).sort((x, y) => x.food - y.food)[0];
if (needFood && f.ap >= 10) game.trade(needFood.id, 'buy', 2);
const richFood = cities.filter(c => c.food > 50000 && c.gold < 500 && c.food >= rate).sort((x, y) => y.food - x.food)[0];
if (richFood && f.ap >= 10) game.trade(richFood.id, 'sell', 2);
}
for (const c of cities) {
if (f.ap < 30) break;
const avgNbr = cities.reduce((s,x) => s + x.troops, 0) / cities.length;
if (c.troops < Math.min(avgNbr, 12000) && c.gold > 500 && c.food > 3000) game.recruit(c.id);
}
if (!legion) {
const from = cities.filter(c => c.gold >= 500 && c.officers.length).sort((x, y) => y.gold - x.gold)[0];
if (from) {
if (f.ap >= 20 && Math.random() < 0.3) {
const worst = Object.values(game.forces).filter(t => t.alive && t.id !== fid)
.map(t => ({ t, v: game.relation(fid, t.id) })).filter(x => x.v < 40).sort((x, y) => x.v - y.v)[0];
if (worst) game.envoy(fid, worst.t.id, from.id);
}
if (f.ap >= 30 && from.gold >= 1000 && Math.random() < 0.2) {
const cand = Object.values(game.forces).filter(t => t.alive && t.id !== fid && !game.isAllied(fid, t.id) && game.relation(fid, t.id) >= 60)
.sort((x, y) => game.relation(fid, y.id) - game.relation(fid, x.id))[0];
if (cand) game.proposeAlliance(fid, cand.id, from.id);
}
if (f.ap >= 30 && from.gold >= 2000 && Math.random() < 0.5) {
const threatened = cities.some(c => game.units.some(u => u.force !== fid && u.targetCity === c.id));
if (cities.length <= 2 || threatened) {
const foe = Object.values(game.forces).filter(t => t.alive && t.id !== fid && !game.isPeace(fid, t.id) && game.relation(fid, t.id) <= 39)
.sort((x, y) => game.relation(fid, x.id) - game.relation(fid, y.id))[0];
if (foe) game.requestTruce(fid, foe.id, from.id);
}
}
}
}
for (const c of cities) {
if (f.ap < 20) break;
c.facilities = c.facilities ?? [];
if (c.facilities.length >= game.facSlots(c) || c.gold < 900) continue;
const have = t => c.facilities.some(x => x.type === t);
const pick = !have('시장') ? '시장' : !have('농장') ? '농장' : !have('병영') && c.gold > 2000 ? '병영' : !have('대장간') && c.gold > 3000 ? '대장간' : !have('공방') && c.gold > 4500 ? '공방' : !have('조선소') && c.gold > 4500 ? '조선소' : null;
if (pick) {
const builders = [...new Set(c.officers)].sort((x, y) => (game.officers[y]?.pol ?? 0) - (game.officers[x]?.pol ?? 0)).slice(0, 3);
game.buildFacility(c.id, pick, builders);
}
}
for (const c of cities) {
if (f.ap < 20 || c.gold < 6000) continue;
if (game.cityFac(c, '공방').length && (c.rams ?? 0) + (c.towers ?? 0) + (c.beasts ?? 0) + (c.catapults ?? 0) < 4)
game.produceSiege(c.id, (c.catapults ?? 0) <= (c.rams ?? 0) ? 'catapult' : 'ram');
if (game.cityFac(c, '조선소').length && (c.junks ?? 0) + (c.lous ?? 0) + (c.dous ?? 0) < 3)
game.produceShip(c.id, (c.dous ?? 0) <= (c.lous ?? 0) ? 'dou' : 'lou');
}
for (const c of cities) {
if (f.ap < 20 || c.gold < 300 || !c.officers.length) continue;
const free = game.freeOfficers(c.id);
if (!free.length) continue;
const target = free.sort((a, b) => game.recruitChance(c.id, b.idx) - game.recruitChance(c.id, a.idx))[0];
if (game.recruitChance(c.id, target.idx) >= 0.3) game.recruitOfficer(c.id, target.idx);
}
if (!legion) {
const cnt = { spear: 0, pike: 0, bow: 0, cav: 0 };
for (const u of game.units) if (u.force === fid && cnt[u.type] != null) cnt[u.type]++;
const mainType = Object.entries(cnt).sort((x, y) => y[1] - x[1])[0][0];
const pref = { spear: '창병', pike: '극병', bow: '노병', cav: '기병' }[mainType];
for (const b of [pref, '연병', '방위', '화공', '발명', '창병', '극병', '노병', '기병']) {
if (game.researchTech(fid, b)) break;
}
}
let enemyCities = game.cities.filter(c => c.force !== fid && (c.force == null || !game.isAllied(fid, c.force)));
if (legion?.policy === 'attack_city' && legion.target != null) {
const t = game.cityById[legion.target];
enemyCities = t && t.force !== fid ? [t] : [];
} else if (legion?.policy === 'attack_force' && legion.target != null) {
enemyCities = enemyCities.filter(c => c.force === legion.target);
}
for (const c of cities) {
if (f.ap < 40) break;
if (c.officers.length === 0) continue;
let best = null, bd = 1e9;
for (const e of enemyCities) {
const d = Math.hypot(e.lon - c.lon, e.lat - c.lat);
if (d < bd) { bd = d; best = e; }
}
if (!best) continue;
const threatened = game.units.some(u => u.force !== fid && u.targetCity === c.id);
const threshold = Math.max(best.troops * 1.5, 6000);
if ((c.troops > threshold && bd < 12) || (threatened && c.troops > 4000)) {
const n = Math.min(c.troops - 3000, Math.round(best.troops * 1.6) + 3000);
if (n >= 3000) {
const offs = [...c.officers].sort((a,b) => game.officers[b].war - game.officers[a].war);
const pick = offs.slice(0, Math.min(2, offs.length - 1 || 1));
if (pick.length > 0) {
let type = 'sword';
if (c.spears >= n) type = 'spear'; else if (c.horses >= n) type = 'cav'; else if (c.pikes >= n) type = 'pike'; else if (c.bows >= n) type = 'bow';
else if ((c.catapults ?? 0) > 0) type = 'catapult'; else if ((c.rams ?? 0) > 0) type = 'ram'; else if ((c.beasts ?? 0) > 0) type = 'beast'; else if ((c.towers ?? 0) > 0) type = 'tower';
const u = game.dispatch(c.id, pick, n, type);
if (u) game.orderUnit(u.id, best.id);
}
}
}
}
for (const u of game.units) {
if (u.force !== fid || u.targetCity != null) continue;
const foes = game.cities.filter(c => c.force !== fid && (c.force == null || (game.forces[c.force]?.alive && !game.isAllied(fid, c.force))));
let best = null, bd = 1e9;
for (const e of foes) { const d = Math.hypot(e.lon - u.x, e.lat - u.z); if (d < bd) { bd = d; best = e; } }
const homes = cities.slice().sort((a,b) => Math.hypot(a.lon-u.x,a.lat-u.z) - Math.hypot(b.lon-u.x,b.lat-u.z));
if (best && bd < 10 && u.troops > Math.max(best.troops * 1.2, 4000)) game.orderUnit(u.id, best.id);
else if (homes.length) game.orderUnit(u.id, homes[0].id);
}
}

const $ = id => document.getElementById(id);
let DATA = null, game = null, map = null, selectedUnit = null, autoTimer = null;
async function loadData() {
const [officers, skills, portraits, s184, s190, s251] = await Promise.all(
['data/officers670.json','data/skills.json','data/portraits.json','data/scenario-184.json','data/scenario-190.json','data/scenario-251.json']
.map(u => fetch(u).then(r => r.json())));
const byIdx = {};
for (const o of officers) byIdx[o.idx] = o;
DATA = { officers: byIdx, skills, portraits, scenarios: { '184': s184, '190': s190, '251': s251 } };
}
function portraitCss(idx) {
const m = DATA.portraits.map[String(idx)];
  if (!m) return `background-image:url('portraits/placeholder.svg');background-size:cover;`;
const [sh, c, r] = m, n = DATA.portraits.cols - 1;
  return `background-image:url('portraits-atlas/sheet-${sh}.jpg');background-size:${DATA.portraits.cols*100}% ${DATA.portraits.cols*100}%;background-position:${c/n*100}% ${r/n*100}%;`;
}
function skillKo(k) { return k || '없음'; }
function show(id) {
for (const s of ['screen-title','screen-scenario','screen-ruler','screen-game']) $(s).classList.add('hidden');
$(id).classList.remove('hidden');
}
function buildScenarioScreen() {
const el = $('scenario-list'); el.innerHTML = '';
const meta = {
'184': ['황건의 난', '184년 — 태평도의 봉기, 한실의 몰락이 시작된다'],
'190': ['반동탁연합', '190년 — 동탁의 폭정에 맞서 제후들이 연합하다'],
'251': ['영웅집결', '251년 — 시대의 영웅들이 한자리에 모인 가상 시나리오'],
};
for (const [id, [name, desc]] of Object.entries(meta)) {
const s = DATA.scenarios[id];
const card = document.createElement('div'); card.className = 'card';
    card.innerHTML = `<h3>${name}</h3><p>${desc}</p><p class="stat">세력 ${s.forces.length} · 등장 무장 ${s.officers.filter(o=>['ruler','taesu','serving'].includes(o.status)).length} · 재야 ${s.officers.filter(o=>o.status==='free').length}</p>`;
card.onclick = () => { buildRulerScreen(id); show('screen-ruler'); };
el.appendChild(card);
}
}
function buildRulerScreen(scenId) {
const s = DATA.scenarios[scenId];
  $('ruler-title').textContent = `군주 선택 — ${scenId}년`;
const el = $('ruler-list'); el.innerHTML = '';
const sorted = [...s.forces].sort((a,b) => b.cities.length - a.cities.length || b.officers.length - a.officers.length);
for (const f of sorted) {
const r = DATA.officers[f.ruler];
const card = document.createElement('div'); card.className = 'card';
const cities = f.cities.map(c => s.cities[c].name_ko).join('·');
    card.innerHTML = `<h3>${r.name_ko}</h3><p>통솔${r.ldr} 무력${r.war} 지력${r.int} 정치${r.pol} 매력${r.chr} · 특기 ${skillKo(r.skill)}</p><p class="stat">도시 ${f.cities.length} (${cities}) · 무장 ${f.officers.length}명</p>`;
card.onclick = () => startGame(scenId, f.id);
el.appendChild(card);
}
}
function startGame(scenId, fid) {
game = new Game(DATA.scenarios[scenId], DATA.officers, DATA.skills, fid);
window.__game = game;
enterGame();
  game.log(`${DATA.officers[game.forces[fid].ruler].name_ko}(으)로 ${scenId}년 시나리오를 시작합니다.`, true);
const cap = game.forceCities(fid)[0];
if (cap) map.focusCity(cap);
refreshAll();
}
function enterGame() {
show('screen-game');
if (!map) {
map = new Map3D($('map-canvas'));
window.__map = map;
map.onPick = onPick;
(function loop() { map.render(); requestAnimationFrame(loop); })();
}
map.syncScenario(game.cities);
map.cityGroup.clear(); map.cityMeshes = {};
map.unitGroup.clear(); map.unitMeshes = {};
for (const c of game.cities) map.addCity(c, c.force != null ? forceColor(c.force) : '#777777');
}
function refreshAll() {
for (const c of game.cities) map.setCityColor(c.id, c.force != null ? forceColor(c.force) : '#777777');
for (const u of game.units) {
if (!map.unitMeshes[u.id]) map.addUnit(worldUnit(u), forceColor(u.force));
else map.updateUnit(worldUnit(u), forceColor(u.force));
}
for (const id of Object.keys(map.unitMeshes)) if (!game.units.find(u => u.id == id)) map.removeUnit(id);
refreshHud(); refreshLog();
}
function worldUnit(u) { const [x, z] = toWorld(u.x, u.z); return { id: u.id, x, z, label: u.label }; }
function refreshHud() {
const f = game.forces[game.playerForce];
  $('hud-date').textContent = `${game.year}년 ${game.month}월 ${['상','중','하'][game.dan-1]}순 (${game.turn}턴)`;
const rank = game.playerForce != null && f?.alive ? game.forceRank(game.playerForce) : null;
  $('hud-force').textContent = game.playerForce != null && f?.alive ? `【${game.forceName(game.playerForce)}】${rank ? ' ' + rank : ''}${game.delegated ? ' (위임 중)' : ''}` : '관전 중';
  $('hud-ap').textContent = f?.alive ? `행동력 ${f.ap} · 기교P ${f.techP ?? 0}` : '';
  $('hud-gold').textContent = f?.alive ? `금 ${game.totalGold(game.playerForce)}` : '';
  $('hud-food').textContent = f?.alive ? `병량 ${game.totalFood(game.playerForce)}` : '';
$('btn-endturn').disabled = game.delegated || game.over;
$('btn-delegate').textContent = game.delegated ? '직접 지휘' : '위임';
$('hud-speed').classList.toggle('hidden', !game.delegated);
}
function refreshLog() {
const el = $('logbox');
  el.innerHTML = game.logs.slice(-30).map(l => `<div class="${l.mine?'me':''}">[${l.t}] ${l.msg}</div>`).join('');
el.scrollTop = el.scrollHeight;
}
function doTurn() {
if (!game || game.over) return;
game.endTurn(aiThink);
refreshAll();
checkGameOver();
}
function setAuto(on) {
if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
if (on) {
const speed = Number($('sel-speed').value);
autoTimer = setInterval(() => {
if (!game.delegated || game.over) { setAuto(false); return; }
doTurn();
if (game.delegated && game.pendingStop) { game.pendingStop = false; game.delegated = false; setAuto(false); refreshHud(); }
}, Math.max(120, 1400 / speed));
}
}
function checkGameOver() {
if (game.over) return;
const f = game.forces[game.playerForce];
if (f && !f.alive && !game.deadAck) {
const others = game.aliveForces();
if (others.length === 0) { endModal('천하가 정리되었습니다.'); return; }
    modal(`【${game.forceName(f.id)}】이(가) 멸망했습니다.`, [
['다른 세력으로 계속', () => { game.deadAck = true; game.delegated = true; refreshHud(); setAuto(true); }],
['관전만 계속', () => { game.deadAck = true; game.delegated = true; refreshHud(); setAuto(true); }],
['게임 종료', () => endModal('게임을 종료했습니다. 타이틀로 돌아갑니다.')],
]);
}
const alive = game.aliveForces();
if (alive.length === 1) {
const w = alive[0];
    endModal(`【${game.forceName(w.id)}】이(가) 천하를 통일했습니다! (${game.year}년 ${game.month}월)`);
}
}
function endModal(text) {
game.over = true; setAuto(false);
modal(text, [['타이틀로', () => { localStorage.removeItem(SAVE_KEY); location.reload(); }]]);
}
function modal(text, buttons) {
const m = $('modal'); m.classList.remove('hidden');
  m.innerHTML = `<div class="box"><p>${text}</p>${buttons.map((b,i) => `<button data-i="${i}">${b[0]}</button>`).join('')}</div>`;
m.querySelectorAll('button').forEach(btn => btn.onclick = () => { m.classList.add('hidden'); buttons[Number(btn.dataset.i)][1](); });
}
function onPick(nx, ny) {
if (!game || game.over) return;
const hit = map.pick(nx, ny);
if (!hit) { $('panel').classList.add('hidden'); selectedUnit = null; return; }
if (hit.type === 'unit') { selectedUnit = hit.id; showUnitPanel(hit.id); return; }
const c = game.cityById[hit.id];
if (selectedUnit != null && game.units.find(u => u.id === selectedUnit && u.force === game.playerForce) && !game.delegated) {
game.orderUnit(selectedUnit, hit.id);
    game.log(`${game.units.find(u=>u.id===selectedUnit).label} → ${c.name_ko}(으)로 이동 명령`, true);
selectedUnit = null; $('panel').classList.add('hidden'); refreshLog();
return;
}
selectedUnit = null;
showCityPanel(c);
}
function showAdvisor(c) {
const p = $('panel');
const f = game.forces[c.force];
const serving = Object.values(DATA.officers).filter(o => o.state?.force === c.force).sort((a, b) => b.int - a.int);
  let html = `<h3>${game.forceName(c.force)} 군사</h3>`;
  html += f.advisor != null ? `<p>현재 군사: <b>${DATA.officers[f.advisor].name_ko}</b> (지력 ${DATA.officers[f.advisor].int})</p>` : '<p>현재 군사: 없음</p>';
html += '<p style="font-size:12px;color:#998">군사는 지력 70 이상만 임명 가능. 적국의 군주·군사 지력이 높을수록 아군 계략 성공률이 낮아집니다.</p>';
for (const o of serving) {
const ok = o.int >= 70;
    html += `<div class="officer"><div><div class="nm">${o.name_ko} <span class="st">지력 ${o.int}${f.advisor === o.idx ? ' · 현 군사' : ''}</span></div></div>${ok && f.advisor !== o.idx ? `<button class="cmd cmd-adv" data-i="${o.idx}">임명</button>` : ''}</div>`;
}
  html += `<button class="cmd" id="adv-back">← 도시 패널로</button>`;
p.innerHTML = html;
p.querySelectorAll('.cmd-adv').forEach(b => b.onclick = () => { game.appointAdvisor(Number(b.dataset.i)); refreshAll(); showAdvisor(c); });
$('adv-back').onclick = () => showCityPanel(c);
}
function showLegions(c) {
const p = $('panel');
const f = game.forces[c.force];
const own = game.forceCities(c.force);
const serving = Object.values(DATA.officers).filter(o => o.state?.force === c.force);
const free = own.filter(x => !game.cityLegion(x.id));
const render = () => {
    let html = `<h3>${game.forceName(c.force)} 군단</h3><p style="font-size:12px;color:#998">제1군단(군주 직할)은 항상 직접 조작. 제2군단부터 도독에게 위임 — 소속 도시는 수동 명령이 불가합니다.</p>`;
for (const l of f.legions ?? []) {
      html += `<div class="officer"><div><div class="nm">${l.name} <span class="st">도독 ${DATA.officers[l.governor]?.name_ko ?? '-'} · 방침 ${{ delegate: '위임', attack_city: '도시공략', attack_force: '세력공략' }[l.policy]}${l.target != null ? ' → ' + (l.policy === 'attack_city' ? game.cityById[l.target]?.name_ko : game.forceName(l.target)) : ''}</span></div><div class="st">${l.cities.map(id => game.cityById[id]?.name_ko).join('·')}</div></div><button class="cmd cmd-disband" data-i="${l.id}">해산</button></div>`;
}
if (free.length && serving.length) {
      html += `<h3 style="margin-top:10px">새 군단 편성</h3>
        <p>도독: <select id="leg-gov">${serving.map(o => `<option value="${o.idx}">${o.name_ko} (통${o.ldr}/지${o.int})</option>`).join('')}</select></p>
        <p>도시: ${free.map(x => `<label><input type="checkbox" class="leg-city" value="${x.id}"> ${x.name_ko}</label> `).join('')}</p>
        <p>방침: <select id="leg-pol"><option value="delegate">위임 (전권)</option><option value="attack_city">도시공략</option><option value="attack_force">세력공략</option></select>
        목표: <select id="leg-target"></select></p>
        <p><button class="cmd" id="leg-create">편성</button></p>`;
}
    html += `<button class="cmd" id="leg-back">← 도시 패널로</button>`;
p.innerHTML = html;
const fillTargets = () => {
const pol = $('leg-pol')?.value;
const t = $('leg-target');
if (!t) return;
      if (pol === 'attack_city') t.innerHTML = game.cities.filter(x => x.force !== c.force).map(x => `<option value="${x.id}">${x.name_ko} (${x.force != null ? game.forceName(x.force) : '공백'})</option>`).join('');
      else if (pol === 'attack_force') t.innerHTML = Object.values(game.forces).filter(x => x.alive && x.id !== c.force).map(x => `<option value="${x.id}">${game.forceName(x.id)}</option>`).join('');
else t.innerHTML = '<option value="">-</option>';
};
$('leg-pol') && ($('leg-pol').onchange = fillTargets) && fillTargets();
$('leg-create') && ($('leg-create').onclick = () => {
const cities = [...p.querySelectorAll('.leg-city:checked')].map(x => Number(x.value));
const t = $('leg-target').value;
if (game.createLegion(Number($('leg-gov').value), cities, $('leg-pol').value, t === '' ? null : Number(t))) { refreshAll(); render(); }
});
p.querySelectorAll('.cmd-disband').forEach(b => b.onclick = () => { game.disbandLegion(c.force, Number(b.dataset.i)); refreshAll(); render(); });
$('leg-back').onclick = () => showCityPanel(c);
};
render();
}
function showTrade(c) {
const p = $('panel');
const rate = game.tradeRate();
const myF = game.forces[c.force];
const render = () => {
    p.innerHTML = `<h3>${c.name_ko} 상인</h3>
      <p>이번 달 환율: 금 1000 ↔ 병량 ${rate.toLocaleString()} (매월 변동)</p>
      <p>보유: 금 ${c.gold.toLocaleString()} · 병량 ${c.food.toLocaleString()} · 행동력 ${myF.ap}</p>
      <p>거래량 (롯트): <select id="trd-lots">${[1,2,3,4,5].map(n => `<option value="${n}">${n}</option>`).join('')}</select></p>
      <p><button class="cmd" id="trd-buy" ${myF.ap < 10 || c.gold < 1000 ? 'disabled' : ''}>병량 매입 (금→병량)</button>
      <button class="cmd" id="trd-sell" ${myF.ap < 10 || c.food < rate ? 'disabled' : ''}>병량 매각 (병량→금)</button>
      <button class="cmd" id="trd-back">← 도시 패널로</button></p>`;
$('trd-buy').onclick = () => { game.trade(c.id, 'buy', Number($('trd-lots').value)); refreshAll(); render(); };
$('trd-sell').onclick = () => { game.trade(c.id, 'sell', Number($('trd-lots').value)); refreshAll(); render(); };
$('trd-back').onclick = () => showCityPanel(c);
};
render();
}
function showDiplomacy(c) {
const p = $('panel'); p.classList.remove('hidden');
const myF = game.forces[c.force];
const others = Object.values(game.forces).filter(f => f.alive && f.id !== c.force);
  let html = `<h3>${c.name_ko} 외교 <small>(사절: 이 도시에서 파견)</small></h3>`;
if (!others.length) html += '<p>다른 생존 세력이 없습니다.</p>';
for (const t of others) {
const v = game.relation(c.force, t.id);
const stage = game.relStage(v);
const allied = game.isAllied(c.force, t.id);
const truce = game.isTruce(c.force, t.id);
const d = game.diploOf(c.force, t.id);
const tCities = game.cities.filter(x => x.force === t.id).length;
const aidCool = game.turn - (d.aidTurn ?? -99);
    html += `<div class="officer"><div><div class="nm">${game.forceName(t.id)} <span class="st">${v} ${stage}${allied ? ` · 동맹(${d.allianceUntil - game.turn}턴 남음)` : ''}${truce ? ` · 정전(${d.truceUntil - game.turn}턴)` : ''}</span></div>`;
    html += `<div class="st">`;
    html += `<button class="cmd dip-act" data-a="envoy" data-t="${t.id}" ${myF.ap < 20 || c.gold < 500 ? 'disabled' : ''}>친선사절(금500)</button> `;
    if (!allied && v >= 60) html += `<button class="cmd dip-act" data-a="ally" data-t="${t.id}" ${myF.ap < 30 || c.gold < 1000 ? 'disabled' : ''}>동맹 제의(금1000)</button> `;
    if (v <= 39) html += `<button class="cmd dip-act" data-a="truce" data-t="${t.id}" ${myF.ap < 30 || c.gold < 2000 ? 'disabled' : ''}>정전 요청(금2000)</button> `;
    if (tCities <= 2) html += `<button class="cmd dip-act" data-a="surrender" data-t="${t.id}" ${myF.ap < 30 || c.gold < 1000 ? 'disabled' : ''}>항복 권고(금1000)</button> `;
if (allied) {
      html += `<button class="cmd dip-act" data-a="aid" data-t="${t.id}" ${aidCool < 18 ? 'disabled' : ''}>원군 요청${aidCool < 18 ? `(${18 - aidCool}턴)` : ''}</button> `;
      html += `<button class="cmd dip-act" data-a="break" data-t="${t.id}">동맹 파기</button> `;
}
    html += `</div></div></div>`;
}
  html += `<p class="st">관계: 80+ 친밀 · 60+ 호의 · 40+ 중립 · 20+ 불화 · 미만 험악 — 매달 중립으로 서서히 회귀. 동맹국은 서로 공격하지 않습니다. 설전(협상 연출)은 R11에서 구현되며 지금은 특기 논객이 성공률을 보정합니다.</p>`;
  html += `<button class="cmd" id="cmd-diplo-back">← 도시 패널로</button>`;
p.innerHTML = html;
p.querySelectorAll('.dip-act').forEach(btn => btn.onclick = () => {
const tid = Number(btn.dataset.t);
const act = { envoy: 'envoy', ally: 'proposeAlliance', truce: 'requestTruce', surrender: 'demandSurrender', aid: 'requestAid', break: 'breakAlliance' }[btn.dataset.a];
const r = act === 'breakAlliance' ? game.breakAlliance(c.force, tid) : game[act](c.force, tid, c.id);
refreshAll(); showDiplomacy(c);
});
$('cmd-diplo-back').onclick = () => showCityPanel(c);
}
function showFacilities(c) {
const p = $('panel'); p.classList.remove('hidden');
c.facilities = c.facilities ?? [];
const slots = game.facSlots(c);
  let html = `<h3>${c.name_ko} 시설 <small>(개발지 ${c.facilities.length}/${slots})</small></h3>`;
if (c.facilities.length) {
html += c.facilities.map((f, i) => {
const spec = FACILITIES[f.type];
const body = f.done
        ? `${f.type} — ${spec.desc}`
        : `${f.type} 공사 중 ${f.progress}/${spec.turns} (담당 ${f.builders.map(b => DATA.officers[b]?.name_ko).join('·') || '없음'})`;
      return `<div class="officer"><div><div class="st">${body}</div></div><button class="cmd cmd-demol" data-i="${i}">철거</button></div>`;
}).join('');
} else html += '<p>건설된 시설이 없습니다.</p>';
html += '<h3 style="margin-top:10px">건설</h3>';
const polTop = [...new Set(c.officers)].sort((a, b) => (DATA.officers[b]?.pol ?? 0) - (DATA.officers[a]?.pol ?? 0)).slice(0, 3);
for (const [t, spec] of Object.entries(FACILITIES)) {
    html += `<div class="officer"><div><div class="nm">${t} <span class="st">금${spec.cost} · 공기 ${spec.turns}턴</span></div><div class="st">${spec.desc}</div></div><button class="cmd cmd-build" data-t="${t}">건설</button></div>`;
}
  html += `<p class="st">담당 무장 자동 배정 (정치 상위 3명: ${polTop.map(i => DATA.officers[i]?.name_ko).join('·') || '없음'}) · 정치 합산 250 이상이면 공기 2배</p>`;
  html += `<button class="cmd" id="cmd-fac-back">← 도시 패널로</button>`;
p.innerHTML = html;
p.querySelectorAll('.cmd-build').forEach(btn => btn.onclick = () => {
if (game.buildFacility(c.id, btn.dataset.t, polTop)) { refreshAll(); showFacilities(c); }
});
p.querySelectorAll('.cmd-demol').forEach(btn => btn.onclick = () => {
if (game.demolishFacility(c.id, Number(btn.dataset.i))) { refreshAll(); showFacilities(c); }
});
$('cmd-fac-back').onclick = () => showCityPanel(c);
}
function showTech() {
const f = game.forces[game.playerForce];
const p = $('panel'); p.classList.remove('hidden');
  let html = `<h3>기교 연구 <small>(기교P ${f?.techP ?? 0})</small></h3>`;
for (const b of TECH_BRANCHES) {
const lv = game.techLv(game.playerForce, b);
const done = lv >= 4;
    html += `<div class="officer"><div><div class="nm">${b} ${'●'.repeat(lv)}${'○'.repeat(4 - lv)}</div><div class="st">${TECH_DESC[b]}</div></div>${done ? '<span class="st">최고 단계</span>' : `<button class="cmd cmd-techr" data-b="${b}">연구 (P${TECH_P[lv]}·금${TECH_GOLD[lv]})</button>`}</div>`;
}
  html += `<button class="cmd" id="cmd-tech-back">← 도시 패널로</button>`;
p.innerHTML = html;
p.querySelectorAll('.cmd-techr').forEach(btn => btn.onclick = () => {
game.researchTech(game.playerForce, btn.dataset.b);
refreshAll(); showTech();
});
$('cmd-tech-back').onclick = () => { const c = lastCityId != null && game.cityById[lastCityId]; if (c) showCityPanel(c); else p.classList.add('hidden'); };
}
function officerRow(idx) {
const o = DATA.officers[idx];
  return `<div class="officer"><span class="pimg" style="${portraitCss(idx)}"></span><div><div class="nm">${o.name_ko} <span class="st">${o.name_zh}</span></div><div class="st">통${o.ldr} 무${o.war} 지${o.int} 정${o.pol} 매${o.chr} · ${o.skill ? o.skill + ' — ' + (DATA.skills[o.skill] || '') : '특기 없음'} · 충성 ${o.state?.loyal ?? '-'} · 공적 ${o.state?.merit ?? 0}${(o.state?.items ?? []).length ? ' · 명품: ' + o.state.items.map(id => ITEMS.find(i => i.id === id)?.name ?? id).join('·') : ''}</div></div></div>`;
}
let lastCityId = null;
function showCityPanel(c) {
lastCityId = c.id;
const p = $('panel'); p.classList.remove('hidden');
const legion = game.cityLegion(c.id);
const mine = c.force === game.playerForce && !game.delegated && !legion;
const owner = c.force != null && game.forces[c.force]?.alive ? game.forceName(c.force) : '공백지';
  const legionTag = legion ? ` · <span style="color:#7cf">${legion.name} 소속 (도독 ${DATA.officers[legion.governor]?.name_ko ?? '-'} · 방침 ${{ delegate: '위임', attack_city: '도시공략', attack_force: '세력공략' }[legion.policy]})</span>` : '';
  let html = `<h3>${c.name_ko} <small>(${c.name_zh})</small></h3>
    <p>소속: ${owner}${legionTag} · 태수: ${c.taesu != null ? DATA.officers[c.taesu].name_ko : '-'}<br>
    병사 ${c.troops.toLocaleString()} · 내구 ${c.hp}/${c.maxhp}<br>
    금 ${c.gold.toLocaleString()} · 병량 ${c.food.toLocaleString()}<br>
    상업 ${c.commerce} · 농업 ${c.farm}${c.metropolis ? ' · 대도시' : ''}${c.specialty.length ? ' · 특색: '+c.specialty.join(',') : ''} · 치안 ${c.security ?? 80}${c.disaster ? ` <span style="color:#f66">재해: ${c.disaster.type}</span>` : ''}<br>
    병장: 창${c.spears} 극${c.pikes} 노${c.bows} 군마${c.horses} · 병기: 충거${c.rams ?? 0} 정란${c.towers ?? 0} 목수${c.beasts ?? 0} 투석${c.catapults ?? 0} · 선박: 주가${c.junks ?? 0} 누선${c.lous ?? 0} 투함${c.dous ?? 0}</p>`;
if (mine) {
if (game.cityFac(c, '공방').length) {
      html += `<p style="font-size:12px">병기 생산 (공방): ` + Object.entries(SIEGE_BUILD).map(([k, s]) => {
const cost = Math.round(s.gold * ((c.specialty ?? []).includes('병기') ? 0.75 : 1));
        return `<button class="cmd cmd-siege" data-k="${k}">${s.name} (금${cost})</button>`;
}).join(' ') + '</p>';
}
if (game.cityFac(c, '조선소').length) {
      html += `<p style="font-size:12px">선박 건조 (조선소): ` + Object.entries(SHIP_BUILD).map(([k, s]) => {
const cost = Math.round(s.gold * ((c.specialty ?? []).includes('선박') ? 0.75 : 1));
        return `<button class="cmd cmd-ship" data-k="${k}">${s.name} (금${cost})</button>`;
}).join(' ') + '</p>';
}
}
if (game.delegated && c.force != null && c.force !== game.playerForce && game.forces[c.force]?.alive) {
    html += `<button class="cmd" id="cmd-join">이 세력으로 참가 (${game.forceName(c.force)})</button>`;
}
if (mine) {
    html += `<div>
      <button class="cmd" id="cmd-dev-c">상업 개발 (금300)</button>
      <button class="cmd" id="cmd-dev-f">농업 개발 (금300)</button>
      <button class="cmd" id="cmd-recruit">징병 (금200·병량1000)</button>
      <button class="cmd" id="cmd-dispatch">출진</button>
      <button class="cmd" id="cmd-move">무장 이동</button>
      <button class="cmd" id="cmd-tech">기교 연구</button>
      <button class="cmd" id="cmd-fac">시설 건설</button>
      <button class="cmd" id="cmd-search">수색 (금100)</button>
      <button class="cmd" id="cmd-patrol">치안 순찰 (금100·AP20)</button>
      <button class="cmd" id="cmd-trade">상인</button>
      <button class="cmd" id="cmd-diplo">외교</button>
      <button class="cmd" id="cmd-advisor">군사</button>
      <button class="cmd" id="cmd-legion">군단</button>
    </div>`;
}
  html += `<h3 style="margin-top:10px">주둔 무장 (${c.officers.length})</h3>`;
html += c.officers.map(officerRow).join('') || '<p>무장 없음</p>';
const free = Object.values(DATA.officers).filter(o => o.state?.status === 'free' && o.state.city === c.id && o.state.found !== false);
const hiddenFree = Object.values(DATA.officers).some(o => o.state?.status === 'free' && o.state.city === c.id && o.state.found === false);
  if (mine && hiddenFree) html += `<p style="font-size:12px;color:#aa6">이 도시에 미발견 재야 무장이 있는 것 같습니다 — 수색으로 찾아보세요.</p>`;
if (free.length) {
    html += `<h3 style="margin-top:10px">재야 무장 (${free.length})</h3>`;
for (const o of free) {
html += officerRow(o.idx);
      if (mine && game.recruitChance(c.id, o.idx) > 0) html += `<button class="cmd cmd-rec" data-i="${o.idx}">등용 (금100·성공률 ${Math.round(game.recruitChance(c.id, o.idx)*100)}%)</button>`;
}
}
p.innerHTML = html;
p.scrollTop = 0;
if (mine) {
$('cmd-dev-c').onclick = () => { game.develop(c.id, 'commerce'); refreshAll(); showCityPanel(c); };
$('cmd-dev-f').onclick = () => { game.develop(c.id, 'farm'); refreshAll(); showCityPanel(c); };
$('cmd-recruit').onclick = () => { game.recruit(c.id); refreshAll(); showCityPanel(c); };
$('cmd-patrol').onclick = () => { game.patrol(c.id); refreshAll(); showCityPanel(c); };
p.querySelectorAll('.cmd-siege').forEach(b => b.onclick = () => { game.produceSiege(c.id, b.dataset.k); refreshAll(); showCityPanel(c); });
p.querySelectorAll('.cmd-ship').forEach(b => b.onclick = () => { game.produceShip(c.id, b.dataset.k); refreshAll(); showCityPanel(c); });
$('cmd-dispatch').onclick = () => showDispatch(c);
$('cmd-move').onclick = () => showMove(c);
$('cmd-tech').onclick = () => showTech();
$('cmd-fac').onclick = () => showFacilities(c);
$('cmd-diplo').onclick = () => showDiplomacy(c);
$('cmd-search').onclick = () => { game.searchCity(c.id); refreshAll(); showCityPanel(c); };
$('cmd-trade').onclick = () => showTrade(c);
$('cmd-advisor').onclick = () => showAdvisor(c);
$('cmd-legion').onclick = () => showLegions(c);
p.querySelectorAll('.cmd-rec').forEach(b => b.onclick = () => { game.recruitOfficer(c.id, Number(b.dataset.i)); refreshAll(); showCityPanel(c); });
}
const join = $('cmd-join');
if (join) join.onclick = () => {
game.pendingJoin = c.force;
    game.log(`${game.forceName(c.force)}에 참가 요청 — 이번 턴이 끝나면 인계됩니다.`, true);
$('panel').classList.add('hidden'); refreshLog();
};
}
function showDispatch(c) {
const p = $('panel');
const cap = Math.min(c.troops, 20000);
  p.innerHTML = `<h3>${c.name_ko} 출진 편성</h3>
    <p>병사: <input id="dsp-troops" type="number" value="${Math.min(5000, cap)}" min="500" max="${cap}" step="500" style="width:90px"></p>
    <p>병종: <select id="dsp-type">${Object.entries(UNIT_TYPES).map(([k,v]) => {
      const need = Object.entries(v.cost)[0];
      const have = need ? (c[need[0]] ?? 0) : 1;
      const stock = need ? ` (보유 ${have})` : '';
      return `<option value="${k}" ${have < 1 ? 'disabled' : ''}>${v.name}${stock}</option>`;
    }).join('')}</select></p>
    <p>부장 (최대 3):</p>
    ${c.officers.map(i => `<label style="display:block"><input type="checkbox" class="dsp-off" value="${i}"> ${DATA.officers[i].name_ko} (무${DATA.officers[i].war}/통${DATA.officers[i].ldr})</label>`).join('')}
    <p><button class="cmd" id="dsp-go">출진</button> <button class="cmd" id="dsp-back">취소</button></p>
    <p style="font-size:12px;color:#998">출진 후 부대를 선택하고 목표 도시를 클릭하면 이동합니다.</p>`;
$('dsp-back').onclick = () => showCityPanel(c);
$('dsp-go').onclick = () => {
const troops = Math.min(cap, Number($('dsp-troops').value));
const type = $('dsp-type').value;
const offs = [...document.querySelectorAll('.dsp-off:checked')].map(x => Number(x.value)).slice(0,3);
if (!offs.length) { alert('부장을 선택하세요.'); return; }
const u = game.dispatch(c.id, offs, troops, type);
if (!u) { alert('출진할 수 없습니다 (행동력·병장·병력 부족).'); return; }
map.addUnit(worldUnit(u), forceColor(u.force));
refreshHud(); refreshLog(); showCityPanel(c);
};
}
function showMove(c) {
const p = $('panel');
const mine = game.forceCities(game.playerForce).filter(x => x.id !== c.id);
  p.innerHTML = `<h3>${c.name_ko} → 무장 이동</h3>
    ${c.officers.map(i => `<label style="display:block"><input type="checkbox" class="mv-off" value="${i}"> ${DATA.officers[i].name_ko}</label>`).join('')}
    <p>목적지: <select id="mv-to">${mine.map(x => `<option value="${x.id}">${x.name_ko}</option>`).join('')}</select></p>
    <p><button class="cmd" id="mv-go">이동</button> <button class="cmd" id="mv-back">취소</button></p>`;
$('mv-back').onclick = () => showCityPanel(c);
$('mv-go').onclick = () => {
const offs = [...document.querySelectorAll('.mv-off:checked')].map(x => Number(x.value));
const to = Number($('mv-to').value);
if (!offs.length || !to) return;
game.moveOfficers(c.id, to, offs);
refreshHud(); refreshLog(); showCityPanel(c);
};
}
function showUnitPanel(uid) {
const u = game.units.find(x => x.id === uid); if (!u) return;
const p = $('panel'); p.classList.remove('hidden');
const mine = u.force === game.playerForce && !game.delegated;
  p.innerHTML = `<h3>${u.label} (${UNIT_TYPES[u.type].name})</h3>
    <p>소속: ${game.forceName(u.force)} · 병력 ${u.troops.toLocaleString()}<br>
    부장: ${u.officers.map(i => DATA.officers[i].name_ko).join(', ')}<br>기력 ${u.qi ?? 100} / 100${(u.conf ?? 0) > 0 ? ` · <span style='color:#e66'>혼란 ${u.conf}턴</span>` : ''}</p>
    ${mine ? '<p style="color:#ffd700">목표 도시를 클릭하면 이동 명령을 내립니다.</p>' : ''}
    <p><button class="cmd" id="up-close">닫기</button></p>`;
$('up-close').onclick = () => { $('panel').classList.add('hidden'); selectedUnit = null; };
}
async function boot() {
await loadData();
$('btn-new').onclick = () => { buildScenarioScreen(); show('screen-scenario'); };
document.querySelectorAll('.back').forEach(b => b.onclick = () => show('screen-title'));
if (localStorage.getItem(SAVE_KEY)) {
$('btn-continue').disabled = false;
$('btn-continue').onclick = () => {
const d = JSON.parse(localStorage.getItem(SAVE_KEY));
const g = new Game(DATA.scenarios[d.scenId], DATA.officers, DATA.skills, d.playerForce);
window.__game = g;
Object.assign(g, { year: d.year, month: d.month, dan: d.dan, turn: d.turn, cities: d.cities, forces: d.forces, units: d.units, nextUnitId: d.nextUnitId, playerForce: d.playerForce, delegated: d.delegated, logs: d.logs, deadAck: d.deadAck });
g.cityById = {}; g.cities.forEach(c => g.cityById[c.id] = c);
for (const c of g.cities) c.officers = [...new Set(c.officers ?? [])];
g.diplo = d.diplo ?? {};
g.itemPool = d.itemPool ?? Object.values(ITEMS).map(i => i.id).filter(id => !Object.values(g.officers).some(o => (o.state.items ?? []).includes(id)));
for (const o of Object.values(g.officers)) { o.state.items = o.state.items ?? []; if (o.state.status === 'free' && o.state.found === undefined) o.state.found = true; }
for (const f of Object.values(g.forces)) { f.advisor = f.advisor ?? null; f.legions = f.legions ?? []; }
for (const [i, st] of Object.entries(d.officerStates)) if (DATA.officers[i]) DATA.officers[i].state = st;
game = g; enterGame(); refreshAll();
if (game.delegated) setAuto(true);
};
}
$('btn-endturn').onclick = () => { if (!game.delegated) doTurn(); };
$('btn-delegate').onclick = () => {
game.delegated = !game.delegated;
game.log(game.delegated ? '세력 운영을 AI에 위임합니다. 언제든 직접 지휘로 돌아오거나 다른 세력에 참가할 수 있습니다.' : '직접 지휘로 복귀합니다.', true);
refreshHud(); refreshLog();
setAuto(game.delegated);
};
$('btn-stop-auto').onclick = () => { game.delegated = false; setAuto(false); refreshHud(); refreshLog(); };
$('sel-speed').onchange = () => { if (game?.delegated) setAuto(true); };
$('btn-rot-l').onclick = () => map && map.rotate90(1);
$('btn-rot-r').onclick = () => map && map.rotate90(-1);
$('btn-menu').onclick = () => modal('메뉴', [
['저장하고 타이틀로', () => { game?.autosave(); location.reload(); }],
['타이틀로 (저장은 자동)', () => location.reload()],
['계속', () => {}],
]);
}
boot();
