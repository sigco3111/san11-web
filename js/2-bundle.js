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
this.baseColors = Float32Array.from(colors);
}
setSeason(month) {
if (!this.terrainMesh || !this.baseColors || this.season === month) return;
this.season = month;
const tint = month >= 3 && month <= 5 ? [1.0, 1.03, 0.95] : month >= 6 && month <= 8 ? [0.9, 1.06, 0.88] : month >= 9 && month <= 11 ? [1.1, 0.97, 0.8] : [1.15, 1.15, 1.2];
const winter = tint[0] > 1.1;
const col = new THREE.Color(), snow = new THREE.Color(0.93, 0.95, 1.0);
for (let i = 0; i < this.baseColors.length / 3; i++) {
col.setRGB(Math.min(1, this.baseColors[i*3] * tint[0]), Math.min(1, this.baseColors[i*3+1] * tint[1]), Math.min(1, this.baseColors[i*3+2] * tint[2]));
if (winter) col.lerp(snow, 0.28);
this.terrainMesh.setColorAt(i, col);
}
this.terrainMesh.instanceColor.needsUpdate = true;
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
unitBody(type) {
const g = new THREE.Group();
const mat = c => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
const add = (geo, color, x=0, y=0, z=0, rx=0, ry=0, rz=0) => { const m = new THREE.Mesh(geo, mat(color)); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; g.add(m); return m; };
const soldier = (kind) => {
add(new THREE.BoxGeometry(0.3, 0.42, 0.2), 0x3e3226, 0, 0.21, 0);
add(new THREE.BoxGeometry(0.44, 0.55, 0.26), 0x5a4a3a, 0, 0.7, 0);
add(new THREE.BoxGeometry(0.5, 0.12, 0.3), 0x6a5a48, 0, 0.98, 0);
add(new THREE.SphereGeometry(0.16, 6, 5), 0xd8b896, 0, 1.16, 0);
add(new THREE.ConeGeometry(0.19, 0.26, 6), 0x707078, 0, 1.34, 0);
if (kind === 'sword') {
add(new THREE.BoxGeometry(0.08, 0.72, 0.5), 0x8a4a3a, -0.34, 0.75, 0);
add(new THREE.BoxGeometry(0.06, 0.8, 0.05), 0xd8d8e0, 0.36, 1.05, 0, 0, 0, 0.35);
} else if (kind === 'spear') {
add(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 5), 0x9a7a4a, 0.34, 1.35, 0);
add(new THREE.ConeGeometry(0.12, 0.42, 4), 0xd8d8e0, 0.34, 2.65, 0);
} else if (kind === 'pike') {
add(new THREE.CylinderGeometry(0.06, 0.06, 1.9, 5), 0x9a7a4a, 0.34, 1.2, 0);
add(new THREE.BoxGeometry(0.58, 0.18, 0.08), 0xd8d8e0, 0.34, 2.15, 0);
} else if (kind === 'bow') {
add(new THREE.TorusGeometry(0.55, 0.06, 5, 12, Math.PI), 0xc09a5a, 0.44, 1.0, 0, 0, 0, Math.PI/2);
add(new THREE.CylinderGeometry(0.02, 0.02, 1.08, 3), 0xe8e0d0, 0.44, 1.0, 0);
}
};
const hull = (len, wid, sailH, tower = false, masts = 1) => {
add(new THREE.BoxGeometry(wid, 0.3, len), 0x6a4a2a, 0, 0.3, 0);
add(new THREE.BoxGeometry(wid*0.7, 0.25, len*0.7), 0x7a5a3a, 0, 0.5, 0);
for (let mi = 0; mi < masts; mi++) {
const mz = masts === 1 ? 0 : (mi === 0 ? -len*0.25 : len*0.25);
add(new THREE.CylinderGeometry(0.04, 0.04, sailH, 4), 0x4a3a2a, 0, 0.5 + sailH/2, mz);
add(new THREE.BoxGeometry(0.05, sailH*0.55, sailH*0.45), 0xd8cfc0, 0, 0.6 + sailH*0.6, mz);
}
if (tower) add(new THREE.BoxGeometry(0.4, 0.5, 0.4), 0x5a4a3a, 0, 0.85, -len*0.15);
};
switch (type) {
case 'sword': soldier('sword'); break;
case 'spear': soldier('spear'); break;
case 'pike': soldier('pike'); break;
case 'bow': soldier('bow'); break;
case 'cav':
add(new THREE.BoxGeometry(0.5, 0.45, 1.0), 0x6a4a30, 0, 0.55, 0);
add(new THREE.BoxGeometry(0.2, 0.3, 0.35), 0x6a4a30, 0, 0.75, 0.55);
add(new THREE.ConeGeometry(0.3, 0.8, 5), 0x5a4a3a, 0, 1.25, 0); break;
case 'ram':
add(new THREE.BoxGeometry(0.9, 0.6, 1.1), 0x5a4a3a, 0, 0.6, 0);
add(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 6), 0x7a6a4a, 0, 0.5, 0.2, Math.PI/2, 0, 0); break;
case 'tower':
add(new THREE.BoxGeometry(0.8, 1.8, 0.8), 0x6a5a45, 0, 0.9, 0);
add(new THREE.BoxGeometry(0.95, 0.25, 0.95), 0x5a4a3a, 0, 1.85, 0); break;
case 'beast':
add(new THREE.BoxGeometry(0.6, 0.5, 1.0), 0x7a5a3a, 0, 0.6, 0);
add(new THREE.BoxGeometry(0.35, 0.35, 0.4), 0x7a5a3a, 0, 0.75, 0.6);
for (const [lx, lz] of [[-0.2, 0.3], [0.2, 0.3], [-0.2, -0.3], [0.2, -0.3]]) add(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 4), 0x5a4a30, lx, 0.25, lz);
add(new THREE.BoxGeometry(0.5, 0.3, 0.6), 0x8a6a4a, 0, 0.95, -0.1); break;
case 'catapult':
add(new THREE.BoxGeometry(0.7, 0.3, 0.7), 0x5a4a3a, 0, 0.35, 0);
add(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 4), 0x7a6a4a, 0, 0.8, 0, 0.6, 0, 0);
add(new THREE.BoxGeometry(0.25, 0.2, 0.25), 0x4a3a2a, 0, 1.25, -0.45); break;
case 'junk': hull(1.3, 0.55, 1.0); break;
case 'lou': hull(1.6, 0.65, 1.2, true); break;
case 'dou': hull(1.9, 0.75, 1.4, true, 2); break;
default: soldier();
}
return g;
}
addUnit(unit, colorHex) {
const g = new THREE.Group();
const body = this.unitBody(unit.type ?? 'sword');
g.add(body);
const banner = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.05),
new THREE.MeshBasicMaterial({ color: new THREE.Color(colorHex) }));
banner.position.set(0.35, 1.45, 0); g.add(banner);
const label = this.makeLabel(unit.label, 0.6); label.position.y = 2.1; g.add(label);
const y = this.levelAtWorld(unit.x, unit.z) * STEP;
g.position.set(unit.x, Math.max(y, WATER_Y + 0.2), unit.z);
g.userData.unitId = unit.id;
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
const AB_BRANCHES = { '공격': 'war', '방어': 'ldr', '계략': 'int', '내정': 'pol' };
const AB_P = [500, 1500, 3000];
const AB_SKILL = { '공격': '맹돌', '방어': '강직', '계략': '논객', '내정': '치안' };
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
'부절대': { cost: 400, turns: 3, desc: '턴 시작 행동력 회복 +10 (합산 최대 +30)' },
'군사부': { cost: 400, turns: 3, desc: '이 도시의 군사 커맨드(출진·징병·생산) 행동력 25% 절감' },
'인재부': { cost: 400, turns: 3, desc: '이 도시의 인사 커맨드(수색·등용·이동) 행동력 25% 절감' },
'외교부': { cost: 400, turns: 3, desc: '이 도시의 외교 커맨드 행동력 25% 절감' },
'회계청': { cost: 400, turns: 3, desc: '이 도시 금 수입 +10%' },
'곡물창고': { cost: 400, turns: 3, desc: '이 도시 병량 수입 +10%' },
'훈련장': { cost: 400, turns: 3, desc: '이 도시에 주둔한 부대 기력 회복 +5' },
'의관':   { cost: 400, turns: 3, desc: '이 도시 부상 무장 회복 2배' },
'감찰소': { cost: 400, turns: 3, desc: '이 도시 치안 매월 +2' },
'서재':   { cost: 400, turns: 3, desc: '세력 기교P 매월 +10 (합산 최대 +30)' },
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
const RANKS = [[2,'주자사'],[4,'주목'],[6,'우림중랑장'],[8,'오관중랑장'],[12,'대장군'],[14,'대사마'],[18,'공'],[20,'왕'],[24,'황제']];
const MERIT = { develop: 30, recruit: 80, facility: 100, tactic: 40, stratagem: 30, capture: 150 };
const DEBATE_CARDS = {
질타: { dmg: 12 }, 강변: { dmg: 24, cd: 2, int: 80 }, 반박: { counter: 8 }, 경청: { heal: 12, cd: 2 }, 도발: { seal: true, cd: 3, int: 85 },
};
const SWORN_GROUPS = [['유비', '관우', '장비'], ['손책', '주유']];
const SPOUSE_PAIRS = [['손책', '대교'], ['주유', '소교'], ['유비', '손상향'], ['조조', '변씨'], ['여포', '초선']];
const DEAR_PAIRS = [['조조', '순욱'], ['조조', '곽가'], ['조조', '하후돈'], ['조조', '하후연'], ['유비', '조운'], ['유비', '제갈량'], ['손권', '주유'], ['손권', '여몽'], ['동탁', '여포']];
const HATE_PAIRS = [['마초', '조조'], ['손책', '황조'], ['장비', '여포'], ['관우', '여포']];
class Game {
constructor(scen, officers, skills, playerForceId) {
this.officers = officers;
this.skills = skills;
this.scenId = scen.id;
this.year = scen.year; this.month = scen.month; this.dan = 1;
this.turn = 1;
this.pendingDuel = null;
this.pendingDebate = null;
this.cities = scen.cities.map(c => ({ ...c, commerce: Math.round(c.revenue/10), farm: Math.round(c.harvest/100), hp: c.maxhp, officers: [], troops: c.troops, facilities: [] }));
this.cityById = {}; this.cities.forEach(c => this.cityById[c.id] = c);
this.forces = {};
for (const f of scen.forces) this.forces[f.id] = { id: f.id, ruler: f.ruler, alive: true, ap: 60, techP: 0, techs: Object.fromEntries(TECH_BRANCHES.map(b => [b, 0])), advisor: null, legions: [], ab: { '공격': 0, '방어': 0, '계략': 0, '내정': 0 } };
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
this.unified = false;
this.chronicle = [];
}
log(msg, mine=false) {
    this.logs.push({ t: `${this.year}년 ${this.month}월`, msg, mine }); if (this.logs.length > 200) this.logs.shift();
if (msg.includes('【')) { this.chronicle = this.chronicle ?? []; this.chronicle.push({ y: this.year, m: this.month, msg }); if (this.chronicle.length > 300) this.chronicle.shift(); }
}
forceName(fid) { const f = this.forces[fid]; return f ? this.officers[f.ruler].name_ko + '군' : '적병'; }
forceCities(fid) { return this.cities.filter(c => c.force === fid); }
inVision(x, z) {
if (this.delegated || this.playerForce == null || !this.forces[this.playerForce]?.alive) return true;
const R2 = 25;
for (const c of this.cities) if (c.force === this.playerForce && (c.lon - x) ** 2 + (c.lat - z) ** 2 <= R2) return true;
for (const u of this.units) if (u.force === this.playerForce && (u.x - x) ** 2 + (u.z - z) ** 2 <= R2) return true;
return false;
}
cityVisible(c) { return c.force === this.playerForce || this.inVision(c.lon, c.lat); }
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
const apc = Math.ceil(20 * this.apMult(c, 'personnel'));
if (!c || c.force == null || !f?.alive || f.ap < apc || c.gold < 100 || !c.officers.length) return false;
c.gold -= 100; f.ap -= apc;
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
const apc = Math.ceil(20 * this.apMult(c, 'diplo'));
if (!c || c.force !== fid || !f?.alive || !t?.alive || f.ap < apc || c.gold < 500) return false;
c.gold -= 500; f.ap -= apc;
const pol = Math.max(50, ...c.officers.map(i => this.officers[i].pol));
const negotiator = c.officers.some(i => this.officers[i].skill === '논객');
const gain = Math.round((8 + pol / 10) * (negotiator ? 1.5 : 1));
const v = this.changeRelation(fid, tid, gain);
    this.log(`【외교】${this.forceName(fid)} → ${this.forceName(tid)} 친선 사절 (관계 +${gain} → ${v} ${this.relStage(v)}${negotiator ? ', 논객' : ''})`, fid === this.playerForce || tid === this.playerForce);
return true;
}
proposeAlliance(fid, tid, cityId) {
const c = this.cityById[cityId], f = this.forces[c?.force], t = this.forces[tid];
if (!c || c.force !== fid || !f?.alive || !t?.alive || f.ap < 23 || c.gold < 1000) return false;
const d = this.diploOf(fid, tid);
if (d.v < 60 || this.isAllied(fid, tid)) return false;
const apc = Math.ceil(30 * this.apMult(c, 'diplo'));
if (f.ap < apc) return false;
c.gold -= 1000; f.ap -= apc;
const pol = Math.max(50, ...c.officers.map(i => this.officers[i].pol));
const p = Math.min(0.9, 0.4 + (d.v - 50) / 100 + pol / 300);
if (Math.random() < p) {
d.allianceUntil = this.turn + 24;
      this.log(`【외교】${this.forceName(fid)}과(와) ${this.forceName(tid)}이(가) 24턴 동맹을 맺었습니다!`, true);
return true;
}
    this.log(`【외교】${this.forceName(tid)}이(가) ${this.forceName(fid)}의 동맹 제의를 거절했습니다`, fid === this.playerForce || tid === this.playerForce);
this.tryDebate({ kind: 'alliance', fid, tid, cityId });
return false;
}
requestTruce(fid, tid, cityId) {
const c = this.cityById[cityId], f = this.forces[c?.force], t = this.forces[tid];
if (!c || c.force !== fid || !f?.alive || !t?.alive || f.ap < 23 || c.gold < 2000) return false;
const d = this.diploOf(fid, tid);
if (d.v > 39) return false;
const apc = Math.ceil(30 * this.apMult(c, 'diplo'));
if (f.ap < apc) return false;
c.gold -= 2000; f.ap -= apc;
const pol = Math.max(50, ...c.officers.map(i => this.officers[i].pol));
if (Math.random() < Math.min(0.8, 0.3 + pol / 300 + d.v / 200)) {
d.truceUntil = this.turn + 12;
const v = this.changeRelation(fid, tid, 30);
      this.log(`【외교】${this.forceName(fid)}과(와) ${this.forceName(tid)}이(가) 정전했습니다 (12턴간 공격 금지, 관계 → ${v} ${this.relStage(v)})`, true);
return true;
}
    this.log(`【외교】${this.forceName(tid)}이(가) 정전 요청을 거절했습니다`, fid === this.playerForce || tid === this.playerForce);
this.tryDebate({ kind: 'truce', fid, tid, cityId });
return false;
}
demandSurrender(fid, tid, cityId) {
const c = this.cityById[cityId], f = this.forces[c?.force], t = this.forces[tid];
if (!c || c.force !== fid || !f?.alive || !t?.alive || f.ap < 23 || c.gold < 1000) return false;
const tCities = this.cities.filter(x => x.force === tid);
if (tCities.length > 2) return false;
const apc = Math.ceil(30 * this.apMult(c, 'diplo'));
if (f.ap < apc) return false;
c.gold -= 1000; f.ap -= apc;
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
const emp = r === '황제' && f.rank !== '황제';
f.rank = r;
for (const o of Object.values(this.officers)) if (o.state?.force === f.id) o.state.loyal = Math.min(100, (o.state.loyal ?? 70) + (emp ? 10 : 5));
        this.log(emp ? `【황제】${this.forceName(f.id)}이(가) 황제에 올랐습니다! 소속 무장 충성 대폭 상승, 기교P 매월 +20` : `【관작】${this.forceName(f.id)}이(가) ${r}(으)로 승진했습니다! 소속 무장 충성 상승`, true);
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
const apc = Math.ceil(30 * this.apMult(c, 'military'));
if (c.gold < 200 || c.food < 1000 || f.ap < apc) return false;
const best = Math.max(50, ...c.officers.map(i => this.officers[i].chr));
const n = Math.round((1500 + best*30) * (this.cityHasSkill(c, '명성') ? 1.3 : 1) * (1 + 0.3 * this.cityFacLv(c, '병영')));
c.gold -= 200; c.food -= 1000; f.ap -= apc;
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
const rel = this.relOf(officerIdx);
let mod = 0;
if (rel.dear.some(i => this.officers[i]?.state?.force === c.force)) mod += 0.1;
const rf = this.forces[c.force];
if (rf && rel.hate.includes(rf.ruler)) mod -= 0.15;
if (rel.sworn.some(i => { const f2 = this.officers[i]?.state?.force; return f2 != null && f2 !== c.force; }) || (rel.spouse != null && (this.officers[rel.spouse]?.state?.force != null) && this.officers[rel.spouse].state.force !== c.force)) mod -= 0.2;
return Math.max(0.1, Math.min(0.9, 0.45 + (envoy - t.chr)/200 + (ruler - 50)/500 - loyal/400 + (this.cityHasSkill(c, '등용') ? 0.1 : 0) + mod));
}
recruitOfficer(cityId, officerIdx) {
const c = this.cityById[cityId], f = this.forces[c.force];
if (this._blocked(c)) return false;
const apc = Math.ceil(20 * this.apMult(c, 'personnel'));
if (c.gold < 100 || f.ap < apc) return false;
const p = this.recruitChance(cityId, officerIdx);
if (p <= 0) return false;
const t = this.officers[officerIdx];
const envoy = Math.max(...c.officers.map(i => this.officers[i].chr));
c.gold -= 100; f.ap -= apc;
if (Math.random() < p) {
const envoyIdx = c.officers.length ? [...c.officers].sort((a, b) => this.officers[b].chr - this.officers[a].chr)[0] : null;
if (envoyIdx != null) this.gainMerit(envoyIdx, MERIT.recruit);
t.state.status = 'serving'; t.state.force = c.force;
if (!c.officers.includes(officerIdx)) c.officers.push(officerIdx);
      this.log(`【등용】${t.name_ko}이(가) 【${this.forceName(c.force)}】에 등용되었습니다 (${c.name_ko}, 사자 매력 ${envoy})`, true);
return true;
}
    this.log(`${c.name_ko}의 ${t.name_ko} 등용에 실패했습니다`, c.force === this.playerForce);
this.tryDebate({ kind: 'recruit', fid: c.force, tid: c.force, cityId, officerIdx });
return false;
}
moveOfficers(fromCity, toCity, idxs) {
const a = this.cityById[fromCity], b = this.cityById[toCity], f = this.forces[a.force];
const apc = Math.ceil(20 * this.apMult(a, 'personnel'));
if (f.ap < apc || this._blocked(a)) return false;
f.ap -= apc;
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
const apc = Math.ceil(10 * this.apMult(c, 'military'));
if (f.ap < apc || c.gold < cost) return false;
c.gold -= cost; f.ap -= apc;
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
const apc = Math.ceil(10 * this.apMult(c, 'military'));
if (f.ap < apc || c.gold < cost) return false;
c.gold -= cost; f.ap -= apc;
c[spec.store] = (c[spec.store] ?? 0) + 1;
    this.log(`${c.name_ko}에서 ${spec.name} 건조 (금 ${cost})`, c.force === this.playerForce);
return true;
}
dispatch(cityId, officerIdxs, troops, type) {
officerIdxs = [...new Set(officerIdxs)];
const c = this.cityById[cityId], f = this.forces[c.force];
if (this._blocked(c)) return false;
const apc = Math.ceil(40 * this.apMult(c, 'military'));
if (f.ap < apc || c.troops < troops || officerIdxs.length === 0) return false;
if (officerIdxs.some(i => (this.officers[i]?.state?.injuredUntil ?? 0) > this.turn)) return false;
const ut = UNIT_TYPES[type];
for (const [k, per] of Object.entries(ut.cost)) {
const need = ut.perUnit ? per : per * troops;
if ((c[k] ?? 0) < need) return false;
}
for (const [k, per] of Object.entries(ut.cost)) c[k] -= ut.perUnit ? per : per * troops;
c.troops -= troops; f.ap -= apc;
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
if (this.over) return;
if (this.pendingDuel || this.pendingDebate) return;
for (const u of this.units) {
const home = this.cities.find(c => c.force != null && c.force === u.force && c.lon === u.x && c.lat === u.z);
u.qi = Math.min(100, (u.qi ?? 100) + 10 + (home && this.cityFac(home, '훈련장').length ? 5 : 0));
}
for (const u of [...this.units]) { if (u.force === -1) this.banditAct(u); else this.stepUnit(u); }
this.resolveFieldBattles();
if (this.dan === 3) {
for (const c of this.cities) {
if (c.force == null || !this.forces[c.force]?.alive) continue;
const mk = this.cityFacLv(c, '시장') * (this.cityFac(c, '조폐').length ? 1.5 : 1);
const fm = this.cityFacLv(c, '농장') * (this.cityFac(c, '곡창').length ? 1.5 : 1);
c.gold += Math.round((50 + c.commerce * 8 * (c.metropolis ? 1.5 : 1)) * (this.cityHasSkill(c, '통상') ? 1.3 : 1) * (1 + 0.25 * mk) * (this.cityFac(c, '회계청').length ? 1.1 : 1));
c.food += Math.round((300 + c.farm * 80) * (this.cityHasSkill(c, '부농') ? 1.3 : 1) * (1 + 0.25 * fm) * (this.cityFac(c, '곡물창고').length ? 1.1 : 1));
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
c.security = Math.max(0, Math.min(100, (c.security ?? 80) + (this.cityHasSkill(c, '치안') ? 0 : -1) + (this.cityFac(c, '감찰소').length ? 2 : 0)));
if (this.cityFac(c, '의관').length) for (const i of c.officers) { const st = this.officers[i]?.state; if (st && (st.injuredUntil ?? 0) > this.turn) st.injuredUntil -= 1; }
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
for (const f of Object.values(this.forces)) {
if (!f.alive) continue;
const ra = this.affOf(f.ruler);
for (const o of Object.values(this.officers)) {
const st = o.state;
if (!st || st.force !== f.id || (st.status !== 'serving' && st.status !== 'taesu')) continue;
const diff = Math.abs(this.affOf(o.idx) - ra);
if (diff >= 100) st.loyal = Math.max(0, (st.loyal ?? 70) - 1);
else if (diff <= 25) st.loyal = Math.min(100, (st.loyal ?? 70) + 1);
}
}
for (const f of Object.values(this.forces)) {
if (!f.alive || (f.techP ?? 0) < 800) continue;
for (const c of this.forceCities(f.id)) {
const cand = c.officers.filter(i => (this.officers[i]?.state?.merit ?? 0) >= 500 && this.relOf(i).sworn.length === 0);
if (cand.length >= 2) { this.swearBrotherhood(c.id, cand.slice(0, 3)); break; }
}
}
for (const f of Object.values(this.forces)) {
if (!f.alive) continue;
const sj = Math.min(3, this.forceFacLv(f.id, '서재'));
if (sj) this.gainTechP(f.id, sj * 10);
if (f.rank === '황제') this.gainTechP(f.id, 20);
f.ab = f.ab ?? { '공격': 0, '방어': 0, '계략': 0, '내정': 0 };
const abTodo = Object.keys(AB_BRANCHES).filter(b => (f.ab[b] ?? 0) < 3 && (f.techP ?? 0) >= AB_P[f.ab[b] ?? 0] + 300).sort((a, b) => AB_P[f.ab[a] ?? 0] - AB_P[f.ab[b] ?? 0]);
if (abTodo.length && f.id !== this.playerForce) this.researchAbility(f.id, abTodo[0]);
if (f.id === this.playerForce) continue;
for (const c of this.forceCities(f.id)) {
if (c.gold < 400) continue;
const byType = {};
(c.facilities ?? []).forEach((x, i) => { if (x.done && (x.level ?? 1) < 3) (byType[x.type] = byType[x.type] ?? []).push(i); });
const pair = Object.values(byType).find(v => v.length >= 2);
if (pair) { this.absorbFacility(c.id, pair[0], pair[1]); break; }
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
f.ap = Math.min(255, f.ap + 30 + Math.min(3, this.forceFacLv(f.id, '부절대')) * 10);
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
if (!this.over && !this.unified) {
const owners = new Set(this.cities.map(c => c.force).filter(x => x != null));
if (owners.size === 1) {
const w = [...owners][0];
this.over = true;
this.unified = true;
        this.log(`【통일】${this.forceName(w)}이(가) 모든 도시를 제압해 천하를 통일했습니다! (${this.year}년 ${this.month}월, ${this.turn}턴)`, true);
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
        if (!u._landWarn) { u._landWarn = true; this.log(`${josa(u.label, ['이','가'])} 수로를 벗어나 더 이상 나아갈 수 없습니다`, u.force === this.playerForce); }
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
let dmg = Math.round(u.troops * 0.12 * ut.atk * (0.7 + lead.war/150) * this.aptMult(u) * this.unitDmgMult(u, true) * this.unitItemAtk(u) * this.unitTechAtk(u) * this.unitRelMult(u) * (1 + 0.1 * this.techLv(u.force, '발명')));
let loss = Math.round(c.troops * 0.06 / ut.def + 150);
const tac = TACTICS[u.type];
const aptLv = u.type === 'sword' ? 1 : APT_LV(lead.apt?.[APT_IDX[u.type]]);
if ((u._tacTurn ?? -1) !== this.turn && aptLv >= (tac.minApt ?? 1) && u.qi >= tac.qi && Math.random() < Math.min(0.55, 0.15 + lead.war/250)) {
u.qi -= tac.qi;
this.gainMerit(u.officers[0], MERIT.tactic);
dmg = Math.round(dmg * tac.mult);
if (tac.guard) loss = Math.round(loss * tac.guard);
      this.log(`【전법】${lead.name_ko}의 ${tac.name}! ${c.name_ko}에 큰 피해`, u.force === this.playerForce);
}
const caster = u.officers.map(i => this.officers[i]).sort((a, b) => b.int - a.int)[0];
if (caster && (u._stratTurn ?? -1) !== this.turn && caster.int >= STRATS.fire.minInt && u.qi >= STRATS.fire.qi && Math.random() < Math.min(0.5, 0.1 + caster.int/300 + (this.unitHasSkill(u, '풍계') ? 0.15 : 0)) * (1 - this.mindDefense(c.force))) {
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
        this.log(`【계략】${def.name_ko}의 혼란! ${josa(u.label, ['이','가'])} ${STRATS.confuse.turns}턴간 움직이지 못합니다`, c.force === this.playerForce);
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
    this.log(`${josa(u.label, ['이','가'])} ${josa(c.name_ko, ['을','를'])} 공격 (적병 -${dmg}, 아군 -${loss})`, u.force === this.playerForce);
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
let dmg = Math.round(att.troops * 0.05 * utA.atk * (0.7 + lead.war/150) / utD.def * this.aptMult(att) * this.unitDmgMult(att) * this.unitItemAtk(att) * this.unitDefMult(def) * this.unitTechAtk(att) * this.unitRelMult(att) / this.unitRelMult(def) * (1 - 0.03 * this.techLv(def.force, '연병')));
if (isWaterAt(att.x, att.z)) { dmg = Math.round(dmg * (utA.ship ? 1.3 : 0.7) * (this.unitHasSkill(att, '수완') ? 1.15 : 1)); }
const tac = TACTICS[att.type];
const aptLv = att.type === 'sword' ? 1 : APT_LV(lead.apt?.[APT_IDX[att.type]]);
if ((att._tacTurn ?? -1) !== this.turn && aptLv >= (tac.minApt ?? 1) && (att.qi ?? 100) >= tac.qi && Math.random() < Math.min(0.55, 0.15 + lead.war/250)) {
att.qi -= tac.qi; dmg = Math.round(dmg * tac.mult);
if (tac.guard) att._guard = true;
if (att.type === 'cav') att._cavTactic = true;
        this.log(`【전법】${lead.name_ko}의 ${tac.name}! 야전에서 ${def.label}에 큰 피해`, att.force === this.playerForce);
}
const caster = att.officers.map(i => this.officers[i]).sort((x, y) => y.int - x.int)[0];
if (caster && (att._stratTurn ?? -1) !== this.turn && caster.int >= STRATS.confuse.minInt && !this.unitHasSkill(def, '위장') && (att.qi ?? 100) >= 25 && Math.random() < Math.min(0.35, 0.08 + caster.int/400) * (1 - this.mindDefense(def.force))) {
att.qi -= 25; def.conf = Math.max(def.conf ?? 0, STRATS.confuse.turns);
        this.log(`【계략】${caster.name_ko}의 혼란! ${josa(def.label, ['이','가'])} ${STRATS.confuse.turns}턴간 움직이지 못합니다`, att.force === this.playerForce);
}
if (caster && (att._stratTurn ?? -1) !== this.turn && caster.int >= STRATS.fire.minInt && !this.unitHasSkill(def, '위장') && (att.qi ?? 100) >= STRATS.fire.qi && Math.random() < Math.min(0.5, 0.1 + caster.int/300 + (this.unitHasSkill(att, '풍계') ? 0.15 : 0)) * (1 - this.mindDefense(def.force))) {
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
if (!this.pendingDuel && a.troops > 0 && b.troops > 0 && a.officers.length && b.officers.length && a.force !== -1 && b.force !== -1) {
const cavTac = a._cavTactic || b._cavTactic;
a._cavTactic = false; b._cavTactic = false;
if (Math.random() < (cavTac ? 0.15 : 0.08)) {
const d = this.startDuel(a, b);
        this.log(`【일기토】${this.officers[d.a.offs[0]].name_ko} vs ${this.officers[d.b.offs[0]].name_ko} — 일기토 시작!`, true);
if ((a.force !== this.playerForce && b.force !== this.playerForce) || this.delegated) this.duelAuto(d);
}
}
for (const u of [a, b]) {
if (u.troops <= 0) {
this.units = this.units.filter(x => x !== u);
        this.log(`${u.label} 부대가 전멸했습니다`, false);
} else if (u.troops < (this.unitHasSkill(u, '완강') ? 600 : 1200)) {
const home = this.forceCities(u.force).sort((pp, qq) => Math.hypot(pp.lon-u.x, pp.lat-u.z) - Math.hypot(qq.lon-u.x, qq.lat-u.z))[0];
if (home) {
u.targetCity = home.id; u.tx = home.lon; u.tz = home.lat;
          this.log(`${josa(u.label, ['이','가'])} ${josa(home.name_ko, ['으로','로'])} 퇴각합니다`, u.force === this.playerForce);
}
}
}
}
tacticInfo(u) {
const tac = u ? TACTICS[u.type] : null;
if (!u || !tac || (u.conf ?? 0) > 0 || (u._tacTurn ?? -1) === this.turn) return null;
const lead = this.officers[u.officers[0]] ?? { war: 60, int: 30, apt: null, name_ko: '적병 두목', idx: -1 };
const aptLv = u.type === 'sword' ? 1 : APT_LV(lead.apt?.[APT_IDX[u.type]]);
if (aptLv < (tac.minApt ?? 1) || (u.qi ?? 100) < tac.qi) return null;
return { tac, lead };
}
fireTactic(uid, target) {
const u = this.units.find(x => x.id === uid);
const info = this.tacticInfo(u);
if (!info) return false;
const { tac, lead } = info;
const inRange = (x, z) => Math.hypot(x - u.x, z - u.z) < 2.2;
if (target.type === 'unit') {
const d = this.units.find(x => x.id === target.id);
if (!d || d.force === u.force || this.isPeace(u.force, d.force) || !inRange(d.x, d.z)) return false;
const utA = UNIT_TYPES[u.type], utD = UNIT_TYPES[d.type];
let dmg = Math.round(u.troops * 0.05 * utA.atk * (0.7 + lead.war/150) / utD.def * this.aptMult(u) * this.unitDmgMult(u) * this.unitItemAtk(u) * this.unitDefMult(d) * this.unitTechAtk(u) * this.unitRelMult(u) / this.unitRelMult(d) * (1 - 0.03 * this.techLv(d.force, '연병')));
if (isWaterAt(u.x, u.z)) dmg = Math.round(dmg * (utA.ship ? 1.3 : 0.7) * (this.unitHasSkill(u, '수완') ? 1.15 : 1));
dmg = Math.round(dmg * tac.mult);
u.qi -= tac.qi; u._tacTurn = this.turn;
this.gainMerit(u.officers[0], MERIT.tactic);
d.troops = Math.max(0, d.troops - dmg);
this.gainTechP(u.force, Math.min(40, Math.floor(dmg / 100)));
      this.log(`【전법】${lead.name_ko}의 ${tac.name}! 야전에서 ${d.label}에 큰 피해 (-${dmg})`, u.force === this.playerForce);
      if (d.troops <= 0) { this.units = this.units.filter(x => x !== d); this.log(`${d.label} 부대가 전멸했습니다`, false); }
this.autosave();
return true;
}
if (target.type === 'city') {
const c = this.cityById[target.id];
if (!c || c.force === u.force || (c.force != null && this.isPeace(u.force, c.force)) || !inRange(c.lon, c.lat)) return false;
const ut = UNIT_TYPES[u.type];
let dmg = Math.round(u.troops * 0.12 * ut.atk * (0.7 + lead.war/150) * this.aptMult(u) * this.unitDmgMult(u, true) * this.unitItemAtk(u) * this.unitTechAtk(u) * this.unitRelMult(u) * (1 + 0.1 * this.techLv(u.force, '발명')));
dmg = Math.round(dmg * tac.mult);
if (ut.siege) dmg = Math.round(dmg * ut.siege);
if (ut.burn) { const ex = Math.round(c.troops * 0.03); c.troops = Math.max(0, c.troops - ex); c.hp = Math.max(0, c.hp - Math.round(ex * 0.5)); }
if (this.cityHasSkill(c, '수성')) dmg = Math.round(dmg * 0.85);
if (c.force != null) dmg = Math.round(dmg * (1 - 0.05 * this.techLv(c.force, '방위')));
u.qi -= tac.qi; u._tacTurn = this.turn;
this.gainMerit(u.officers[0], MERIT.tactic);
c.troops = Math.max(0, c.troops - dmg);
c.hp = Math.max(0, c.hp - Math.round(dmg * 0.5));
this.gainTechP(u.force, Math.min(50, Math.floor(dmg / 100)));
      this.log(`【전법】${lead.name_ko}의 ${tac.name}! ${c.name_ko}에 큰 피해 (-${dmg})`, u.force === this.playerForce);
if (c.troops <= 0 || c.hp <= 0) {
c.force = u.force; c.district = null;
c.hp = Math.round(c.maxhp * 0.4);
this.gainTechP(u.force, 200);
for (const i of u.officers) this.gainMerit(i, MERIT.capture);
u.tx = null; u.targetCity = null;
        this.log(`【${c.name_ko}】함락! → ${this.forceName(u.force)}`, true);
}
this.autosave();
return true;
}
return false;
}
fireStrat(uid, kind, target) {
const u = this.units.find(x => x.id === uid);
if (!u || (u.conf ?? 0) > 0 || (u._stratTurn ?? -1) === this.turn) return false;
const caster = u.officers.map(i => this.officers[i]).sort((a, b) => b.int - a.int)[0];
if (!caster) return false;
const inRange = (x, z) => Math.hypot(x - u.x, z - u.z) < 2.2;
const enemyUnit = () => { const d = this.units.find(x => x.id === target.id); return (d && d.force !== u.force && !this.isPeace(u.force, d.force) && !this.unitHasSkill(d, '위장') && inRange(d.x, d.z)) ? d : null; };
if (kind === 'fire') {
if (caster.int < STRATS.fire.minInt || (u.qi ?? 100) < STRATS.fire.qi) return false;
const p = Math.min(0.5, 0.1 + caster.int/300 + (this.unitHasSkill(u, '풍계') ? 0.15 : 0));
if (target.type === 'unit') {
const d = enemyUnit();
if (!d) return false;
u._stratTurn = this.turn;
        if (Math.random() >= p * (1 - this.mindDefense(d.force))) { this.log(`【계략】${caster.name_ko}의 화계가 ${d.label}에 실패했습니다`, u.force === this.playerForce); this.autosave(); return true; }
u.qi -= STRATS.fire.qi;
this.gainMerit(caster.idx, MERIT.stratagem);
const burn = Math.round(d.troops * 0.06 * (1 + 0.15 * this.techLv(u.force, '화공')));
d.troops = Math.max(0, d.troops - burn);
        this.log(`【계략】${caster.name_ko}의 화계! ${d.label} 병력 -${burn}`, u.force === this.playerForce);
        if (d.troops <= 0) { this.units = this.units.filter(x => x !== d); this.log(`${d.label} 부대가 전멸했습니다`, false); }
this.autosave();
return true;
}
if (target.type === 'city') {
const c = this.cityById[target.id];
if (!c || c.force == null || c.force === u.force || this.isPeace(u.force, c.force) || !inRange(c.lon, c.lat)) return false;
u._stratTurn = this.turn;
        if (Math.random() >= p * (1 - this.mindDefense(c.force))) { this.log(`【계략】${caster.name_ko}의 화계가 ${c.name_ko}에 실패했습니다`, u.force === this.playerForce); this.autosave(); return true; }
u.qi -= STRATS.fire.qi;
this.gainMerit(caster.idx, MERIT.stratagem);
const burn = Math.round(c.troops * 0.08 * (1 + 0.15 * this.techLv(u.force, '화공')));
c.troops = Math.max(0, c.troops - burn);
c.hp = Math.max(0, c.hp - Math.round(burn * 0.5));
        this.log(`【계략】${caster.name_ko}의 화계! ${c.name_ko} 수비병 -${burn}`, u.force === this.playerForce);
this.autosave();
return true;
}
return false;
}
if (kind === 'confuse') {
if (caster.int < STRATS.confuse.minInt || (u.qi ?? 100) < 25 || target.type !== 'unit') return false;
const d = enemyUnit();
if (!d) return false;
u._stratTurn = this.turn;
      if (Math.random() >= Math.min(0.35, 0.08 + caster.int/400) * (1 - this.mindDefense(d.force))) { this.log(`【계략】${caster.name_ko}의 혼란이 ${d.label}에 실패했습니다`, u.force === this.playerForce); this.autosave(); return true; }
u.qi -= 25;
this.gainMerit(caster.idx, MERIT.stratagem);
d.conf = Math.max(d.conf ?? 0, STRATS.confuse.turns);
      this.log(`【계략】${caster.name_ko}의 혼란! ${josa(d.label, ['이','가'])} ${STRATS.confuse.turns}턴간 움직이지 못합니다`, u.force === this.playerForce);
this.autosave();
return true;
}
return false;
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
effWar(o) { return Math.max(1, (o?.war ?? 50) - ((o?.state?.injuredUntil ?? 0) > this.turn ? 20 : 0)); }
buildRelations() {
const byName = {};
for (const o of Object.values(this.officers)) (byName[o.name_ko] ??= []).push(o.idx);
const rels = {};
const ensure = i => rels[i] ??= { sworn: [], spouse: null, dear: [], hate: [] };
for (const g of SWORN_GROUPS) { const ids = g.flatMap(n => byName[n] ?? []); for (const a of ids) for (const b of ids) if (a !== b) ensure(a).sworn.push(b); }
const pair = (list, fn) => { for (const [x, y] of list) for (const xi of byName[x] ?? []) for (const yi of byName[y] ?? []) if (xi !== yi) fn(xi, yi); };
pair(SPOUSE_PAIRS, (a, b) => { ensure(a).spouse = b; ensure(b).spouse = a; });
pair(DEAR_PAIRS, (a, b) => { ensure(a).dear.push(b); ensure(b).dear.push(a); });
pair(HATE_PAIRS, (a, b) => { ensure(a).hate.push(b); ensure(b).hate.push(a); });
return rels;
}
relOf(idx) {
this._rels ??= this.buildRelations();
const base = this._rels[idx] ?? { sworn: [], spouse: null, dear: [], hate: [] };
const dyn = this.officers[idx]?.state?.sworn ?? [];
return { ...base, sworn: [...new Set([...base.sworn, ...dyn])] };
}
isBonded(a, b) { const r = this.relOf(a); return r.sworn.includes(b) || r.spouse === b; }
affOf(idx) { let s = 0; for (const ch of (this.officers[idx]?.name_ko ?? '')) s += ch.charCodeAt(0); return s % 150; }
unitRelMult(u) {
const os = u.officers;
for (let i = 0; i < os.length; i++) for (let j = i + 1; j < os.length; j++) if (this.isBonded(os[i], os[j])) return 1.1;
return 1;
}
cityFacLv(c, t) { return this.cityFac(c, t).reduce((s, x) => s + (x.level ?? 1), 0); }
forceFacLv(fid, t) { return this.cities.filter(c => c.force === fid).reduce((s, c) => s + this.cityFacLv(c, t), 0); }
apMult(c, cat) {
const fac = { military: '군사부', personnel: '인재부', diplo: '외교부' }[cat];
return fac && this.cityFac(c, fac).length ? 0.75 : 1;
}
absorbFacility(cityId, fi1, fi2) {
const c = this.cityById[cityId], f = this.forces[c?.force];
if (!c || this._blocked(c) || c.gold < 200 || f.ap < 10) return false;
const a = c.facilities?.[fi1], b = c.facilities?.[fi2];
if (!a || !b || fi1 === fi2 || a.type !== b.type || !a.done || !b.done) return false;
if ((a.level ?? 1) >= 3) return false;
a.level = (a.level ?? 1) + 1;
c.facilities.splice(fi2, 1);
c.gold -= 200; f.ap -= 10;
    this.log(`【합병】${c.name_ko}의 ${a.type}을(를) 흡수합병해 Lv${a.level}(으)로 강화했습니다 (금 200·AP 10, 개발지 1개 회수)`, c.force === this.playerForce);
this.autosave();
return true;
}
researchAbility(fid, branch) {
const f = this.forces[fid]; if (!f?.alive) return false;
f.ab = f.ab ?? { '공격': 0, '방어': 0, '계략': 0, '내정': 0 };
const stat = AB_BRANCHES[branch], lv = f.ab[branch] ?? 0;
if (!stat || lv >= 3 || (f.techP ?? 0) < AB_P[lv]) return false;
f.techP -= AB_P[lv]; f.ab[branch] = lv + 1;
const statNm = { war: '무력', ldr: '통솔', int: '지력', pol: '정치' }[stat];
for (const o of this.forceOfficers(fid)) {
o[stat] = Math.min(100, (o[stat] ?? 50) + 2);
if (o.state) { o.state.bonus = o.state.bonus ?? {}; o.state.bonus[stat] = (o.state.bonus[stat] ?? 0) + 2; }
}
    this.log(`【연구】${this.forceName(fid)} 능력연구 「${branch}」 ${lv + 1}단계 완료 (기교P ${AB_P[lv]} 소비, 소속 무장 전원 ${statNm} +2)`, fid === this.playerForce);
if (lv + 1 === 3) {
const sk = AB_SKILL[branch];
const cand = this.forceOfficers(fid).filter(o => o && !o.skill && !o.state?.grantSkill).sort((a, b) => (b.state?.merit ?? 0) - (a.state?.merit ?? 0))[0];
if (cand) {
cand.skill = sk; if (cand.state) cand.state.grantSkill = sk;
        this.log(`【연구】${cand.name_ko}이(가) 연구 성과로 특기 「${sk}」을(를) 습득했습니다!`, fid === this.playerForce);
}
}
this.autosave();
return true;
}
swearBrotherhood(cityId, idxs) {
idxs = [...new Set(idxs)];
const c = this.cityById[cityId], f = this.forces[c?.force];
if (!c || !f?.alive || this._blocked(c)) return false;
if (idxs.length < 2 || idxs.length > 3 || idxs.some(i => !c.officers.includes(i))) return false;
if (idxs.some(i => (this.officers[i]?.state?.merit ?? 0) < 500)) return false;
if ((f.techP ?? 0) < 500) return false;
f.techP -= 500;
for (const i of idxs) {
const st = this.officers[i].state ??= {};
st.sworn = [...new Set([...(st.sworn ?? []), ...idxs.filter(x => x !== i)])];
st.loyal = Math.min(100, (st.loyal ?? 70) + 10);
}
    this.log(`【결연】${idxs.map(i => this.officers[i].name_ko).join('·')}이(가) ${c.name_ko}에서 의형제를 맺었습니다! (기교P -500, 충성 +10)`, c.force === this.playerForce);
this.autosave();
return true;
}
unitHasItemKind(u, kind) {
for (const i of u.officers) for (const id of (this.officers[i]?.state?.items ?? [])) if (ITEMS.find(x => x.id === id)?.kind === kind) return true;
return false;
}
startDuel(a, b) {
const mk = (u) => ({ u, offs: [...u.officers], cur: 0, hp: 100, hpMap: {}, spirit: 0, stance: 'attack', streak: 0, lastStance: null });
this.pendingDuel = { a: mk(a), b: mk(b), bout: 0, log: [], done: false };
return this.pendingDuel;
}
duelOfficer(d, k) { const s = d[k]; return this.officers[s.offs[s.cur]]; }
duelPolicy(d, k) {
const s = d[k], ok = k === 'a' ? 'b' : 'a', opp = d[ok];
const myWar = this.effWar(this.duelOfficer(d, k)), opWar = this.effWar(this.duelOfficer(d, ok));
if (s.spirit >= 300) return { stance: s.stance, cmd: '무쌍' };
if (s.spirit >= 200 && opp.hp < 45) return { stance: s.stance, cmd: '급소' };
if (s.spirit >= 100 && opp.hp < 60) return { stance: s.stance, cmd: '필살기' };
if (s.hp <= 25 && myWar < opWar - 10 && Math.random() < 0.4) return { stance: 'defense', cmd: this.unitHasItemKind(s.u, 'bow') ? '위퇴각' : '퇴각' };
return { stance: s.spirit < 100 ? 'spirit' : (myWar >= opWar ? 'attack' : 'defense'), cmd: null };
}
duelTick(d, selA, selB) {
if (!d || d.done) return d;
d.bout++;
for (const k of ['a', 'b']) {
const s = d[k];
if (s.hp <= 30 && s.cur < s.offs.length - 1) {
const cur = this.officers[s.offs[s.cur]], nxt = this.officers[s.offs[s.cur + 1]];
const assistP = this.isBonded(s.offs[s.cur], s.offs[s.cur + 1]) ? 0.75 : 0.5;
if (this.effWar(nxt) > this.effWar(cur) + 5 && Math.random() < assistP) {
s.hpMap[s.offs[s.cur]] = s.hp; s.cur++;
s.hp = s.hpMap[s.offs[s.cur]] ?? 100; s.spirit = Math.round(s.spirit / 2);
          d.log.push(`${nxt.name_ko}이(가) 교체 출전!`);
}
}
}
for (const [k, sel, ok] of [['a', selA, 'b'], ['b', selB, 'a']]) {
if (sel.cmd !== '퇴각' && sel.cmd !== '위퇴각') continue;
const s = d[k], opp = d[ok];
if (sel.cmd === '위퇴각' && !this.unitHasItemKind(s.u, 'bow')) continue;
let chance = 0.7 + (this.unitHasItemKind(s.u, 'horse') ? 0.2 : 0) - (this.unitHasItemKind(opp.u, 'horse') ? 0.2 : 0);
if (sel.cmd === '위퇴각') chance = 1;
if (Math.random() < chance) {
if (sel.cmd === '위퇴각') {
const cnt = Math.round(8 + this.effWar(this.duelOfficer(d, k)) / 10);
          opp.hp -= cnt; d.log.push(`${this.duelOfficer(d, k).name_ko}의 위퇴각! 돌아서며 ${cnt} 대미지`);
}
d.fled = k; return this.finishDuel(d, 'flee');
}
      s.spirit = Math.max(0, s.spirit - 30); d.log.push(`${this.duelOfficer(d, k).name_ko}의 도주 실패!`);
}
const side = (k, sel, ok) => {
const s = d[k], opp = d[ok];
const o = this.duelOfficer(d, k), oo = this.duelOfficer(d, ok);
s.streak = s.lastStance === sel.stance ? s.streak + 1 : 1; s.lastStance = sel.stance; s.stance = sel.stance;
const swordMul = this.unitHasItemKind(s.u, 'sword') ? 1.25 : 1;
s.spirit = Math.min(300, s.spirit + Math.round((sel.stance === 'spirit' ? 14 : 8) * swordMul));
let mult = 1, note = null, vital = false;
if (sel.cmd === '필살기' && s.spirit >= 100) { s.spirit -= 100; mult = 2.5; note = '필살기'; }
else if (sel.cmd === '급소' && s.spirit >= 200) { s.spirit -= 200; mult = 3; note = '급소'; vital = true; }
else if (sel.cmd === '무쌍' && s.spirit >= 300) { s.spirit = 0; mult = 4.5; note = '무쌍'; opp.spirit = 0; }
else if (sel.cmd === '암기' && !s._hiddenUsed && this.unitHasItemKind(s.u, 'weapon')) { s._hiddenUsed = true; mult = 1.5; note = '암기'; opp.spirit = Math.max(0, opp.spirit - 50); }
let dmg = Math.max(2, Math.round(4 + (this.effWar(o) - this.effWar(oo)) / 8));
if (sel.stance === 'attack') dmg = Math.round(dmg * 1.3);
else if (sel.stance === 'defense') dmg = Math.round(dmg * 0.65);
else if (sel.stance === 'burst') {
dmg = Math.round(dmg * 0.55);
if (Math.random() < 0.15 + s.streak * 0.03) { dmg *= 3; note = note ? note + '·크리티컬' : '크리티컬'; }
} else if (s.streak >= 3 && Math.random() < 0.1) { dmg *= 2; note = note ? note + '·크리티컬' : '크리티컬'; }
dmg = Math.round(dmg * mult);
if (opp.stance === 'defense') dmg = Math.round(dmg * 0.6);
return { dmg, note, vital, name: o.name_ko };
};
const rA = side('a', selA, 'b'), rB = side('b', selB, 'a');
d.b.hp -= rA.dmg; d.a.hp -= rB.dmg;
if (rB.dmg > 0) d.a.spirit = Math.min(300, d.a.spirit + 6);
if (rA.dmg > 0) d.b.spirit = Math.min(300, d.b.spirit + 6);
    if (rA.vital && d.b.hp > 0) { const vo = this.duelOfficer(d, 'b'); vo.state.injuredUntil = this.turn + 6; d.log.push(`${vo.name_ko}이(가) 급소를 맞아 부상! (6턴간 무력 -20·출진 불가)`); }
    if (rB.vital && d.a.hp > 0) { const vo = this.duelOfficer(d, 'a'); vo.state.injuredUntil = this.turn + 6; d.log.push(`${vo.name_ko}이(가) 급소를 맞아 부상! (6턴간 무력 -20·출진 불가)`); }
    if (rA.note) d.log.push(`${rA.name}의 ${rA.note}! ${rA.dmg} 대미지`);
    if (rB.note) d.log.push(`${rB.name}의 ${rB.note}! ${rB.dmg} 대미지`);
    if (!rA.note && !rB.note) d.log.push(`${d.bout}합: 공방 ${rA.dmg} / ${rB.dmg}`);
if (d.a.hp <= 0 && d.b.hp <= 0) return this.finishDuel(d, 'draw');
if (d.b.hp <= 0) return this.finishDuel(d, 'a');
if (d.a.hp <= 0) return this.finishDuel(d, 'b');
if (d.bout >= 50) return this.finishDuel(d, 'draw');
return d;
}
finishDuel(d, result) {
d.done = true;
if (result === 'a' || result === 'b') {
const w = d[result], l = d[result === 'a' ? 'b' : 'a'];
l.u.troops = Math.round(l.u.troops * 0.7);
this.gainMerit(w.offs[w.cur], 40); this.gainTechP(w.u.force, 30);
      this.log(`【일기토】${this.officers[w.offs[w.cur]].name_ko}이(가) ${this.officers[l.offs[l.cur]].name_ko}를 격파! ${l.u.label} 병력 -30%`, true);
} else if (result === 'flee') {
const f = d[d.fled];
const home = this.forceCities(f.u.force).sort((p, q) => Math.hypot(p.lon - f.u.x, p.lat - f.u.z) - Math.hypot(q.lon - f.u.x, q.lat - f.u.z))[0];
if (home) { f.u.targetCity = home.id; f.u.tx = home.lon; f.u.tz = home.lat; }
      this.log(`【일기토】${this.officers[f.offs[f.cur]].name_ko}이(가) 물러났습니다`, f.u.force === this.playerForce);
} else {
      this.log(`【일기토】${d.bout}합 무승부로 끝났습니다`, true);
}
this.pendingDuel = null;
return d;
}
duelAuto(d) { let guard = 0; while (d && !d.done && guard++ < 200) this.duelTick(d, this.duelPolicy(d, 'a'), this.duelPolicy(d, 'b')); }
hasItemKindOff(idx, kind) { return (this.officers[idx]?.state?.items ?? []).some(id => ITEMS.find(x => x.id === id)?.kind === kind); }
debateCards(idx) {
const o = this.officers[idx], book = this.hasItemKindOff(idx, 'book');
const out = {};
for (const [k, v] of Object.entries(DEBATE_CARDS)) if (book || (v.int ?? 0) <= (o?.int ?? 0)) out[k] = v;
return out;
}
debateCardList() { return DEBATE_CARDS; }
debateCardUsable(d, k, card) { const s = d[k]; return !!card && !s.seal && !!this.debateCards(s.o)[card] && (s.cds[card] ?? 0) <= 0; }
startDebate(aIdx, bIdx, ctx) { return { a: { o: aIdx, hp: 100, cds: {}, seal: false }, b: { o: bIdx, hp: 100, cds: {}, seal: false }, bout: 0, log: [], done: false, winner: null, ctx }; }
debatePolicy(d, k) {
const s = d[k], o = d[k === 'a' ? 'b' : 'a'];
const usable = c => this.debateCardUsable(d, k, c);
if (s.hp <= 25 && usable('경청')) return '경청';
if (usable('도발') && Math.random() < 0.3) return '도발';
if (o.hp >= 40 && usable('반박') && Math.random() < 0.35) return '반박';
if (usable('강변')) return '강변';
return '질타';
}
debateTick(d, cardA, cardB) {
if (d.done) return d;
d.bout++;
const name = s => this.officers[s.o].name_ko;
const mult = s => (0.8 + (this.officers[s.o]?.int ?? 50) / 200) * (this.officers[s.o]?.skill === '논객' ? 1.25 : 1);
const okCard = (k, c) => { const s = d[k]; return c && this.debateCards(s.o)[c] && (s.cds[c] ?? 0) <= 0; };
if (!okCard('a', cardA)) cardA = null;
if (!okCard('b', cardB)) cardB = null;
    if (d.a.seal) { if (cardA) d.log.push(`${name(d.a)}은(는) 도발에 말려 화술을 쓰지 못했습니다`); cardA = null; d.a.seal = false; }
    if (d.b.seal) { if (cardB) d.log.push(`${name(d.b)}은(는) 도발에 말려 화술을 쓰지 못했습니다`); cardB = null; d.b.seal = false; }
const defA = cardA ? DEBATE_CARDS[cardA] : null, defB = cardB ? DEBATE_CARDS[cardB] : null;
let dmgA = 0, dmgB = 0;
    if (defA?.dmg) { if (cardB === '반박') { dmgB += Math.round(DEBATE_CARDS.반박.counter * mult(d.b)); d.log.push(`${name(d.b)}의 반박! ${name(d.a)}의 ${cardA}을(를) 되돌림`); } else dmgA += Math.round(defA.dmg * mult(d.a)); }
    if (defB?.dmg) { if (cardA === '반박') { dmgA += Math.round(DEBATE_CARDS.반박.counter * mult(d.a)); d.log.push(`${name(d.a)}의 반박! ${name(d.b)}의 ${cardB}을(를) 되돌림`); } else dmgB += Math.round(defB.dmg * mult(d.b)); }
    if (defA?.heal) { d.a.hp = Math.min(100, d.a.hp + defA.heal); d.log.push(`${name(d.a)}의 경청 (논리 +${defA.heal})`); }
    if (defB?.heal) { d.b.hp = Math.min(100, d.b.hp + defB.heal); d.log.push(`${name(d.b)}의 경청 (논리 +${defB.heal})`); }
    if (defA?.seal) { d.b.seal = true; d.log.push(`${name(d.a)}의 도발! ${name(d.b)}의 다음 화술 봉인`); }
    if (defB?.seal) { d.a.seal = true; d.log.push(`${name(d.b)}의 도발! ${name(d.a)}의 다음 화술 봉인`); }
d.b.hp -= dmgA; d.a.hp -= dmgB;
    if (dmgA) d.log.push(`${name(d.a)}의 ${cardA} → ${dmgA} 피해`);
    if (dmgB) d.log.push(`${name(d.b)}의 ${cardB} → ${dmgB} 피해`);
for (const [s, c] of [[d.a, cardA], [d.b, cardB]]) { for (const k of Object.keys(s.cds)) s.cds[k]--; if (c && DEBATE_CARDS[c]?.cd) s.cds[c] = DEBATE_CARDS[c].cd; }
    d.log.push(`${d.bout}합: ${name(d.a)} ${Math.max(0, d.a.hp)} / ${name(d.b)} ${Math.max(0, d.b.hp)}`);
if (d.a.hp <= 0 || d.b.hp <= 0 || d.bout >= 15) this.finishDebate(d);
return d;
}
finishDebate(d) {
d.done = true;
const an = this.officers[d.a.o].name_ko, bn = this.officers[d.b.o].name_ko;
let w = null;
if (d.a.hp > 0 && d.b.hp <= 0) w = 'a';
else if (d.b.hp > 0 && d.a.hp <= 0) w = 'b';
else if (d.a.hp > 0 && d.b.hp > 0 && d.a.hp !== d.b.hp) w = d.a.hp > d.b.hp ? 'a' : 'b';
d.winner = w;
const ctx = d.ctx ?? {};
if (w === 'a') {
      if (ctx.kind === 'alliance') { const dd = this.diploOf(ctx.fid, ctx.tid); dd.allianceUntil = this.turn + 24; this.log(`【설전】${an}이(가) ${bn}을(를) 논파! ${this.forceName(ctx.fid)}과(와) ${this.forceName(ctx.tid)}이(가) 24턴 동맹을 맺었습니다!`, true); }
      else if (ctx.kind === 'truce') { const dd = this.diploOf(ctx.fid, ctx.tid); dd.truceUntil = this.turn + 12; const v = this.changeRelation(ctx.fid, ctx.tid, 30); this.log(`【설전】${an}이(가) ${bn}을(를) 논파! 정전 성립 (12턴간 공격 금지, 관계 → ${v})`, true); }
      else if (ctx.kind === 'recruit') { const c = this.cityById[ctx.cityId], t = this.officers[ctx.officerIdx]; if (c && t?.state && t.state.force == null) { t.state.status = 'serving'; t.state.force = c.force; if (!c.officers.includes(t.idx)) c.officers.push(t.idx); this.gainMerit(d.a.o, MERIT.recruit); this.log(`【설전】${an}의 설파 끝에 ${t.name_ko}이(가) 【${this.forceName(c.force)}】에 등용되었습니다! (${c.name_ko})`, true); } }
} else if (w === 'b') {
      if (ctx.kind === 'alliance' || ctx.kind === 'truce') { const v = this.changeRelation(ctx.fid, ctx.tid, -5); this.log(`【설전】${bn}이(가) ${an}을(를) 논파 — 협상 결렬 (관계 → ${v} ${this.relStage(v)})`, ctx.fid === this.playerForce || ctx.tid === this.playerForce); }
      else this.log(`【설전】${bn}이(가) ${an}을(를) 논파 — 등용 결렬`, ctx.fid === this.playerForce);
    } else this.log(`【설전】${an} vs ${bn} — ${d.bout}합 무승부`, ctx.fid === this.playerForce || ctx.tid === this.playerForce);
this.pendingDebate = null;
return d;
}
debateAuto(d) { let guard = 0; while (d && !d.done && guard++ < 100) this.debateTick(d, this.debatePolicy(d, 'a'), this.debatePolicy(d, 'b')); }
tryDebate(ctx) {
const c = this.cityById[ctx.cityId];
let aIdx = null, bIdx = null;
if (ctx.kind === 'recruit') {
aIdx = (c?.officers ?? []).slice().sort((x, y) => (this.officers[y]?.int ?? 0) - (this.officers[x]?.int ?? 0))[0] ?? null;
bIdx = ctx.officerIdx;
} else {
aIdx = (c?.officers ?? []).slice().sort((x, y) => (this.officers[y]?.int ?? 0) - (this.officers[x]?.int ?? 0))[0] ?? null;
bIdx = Object.values(this.officers).filter(o => o.state?.force === ctx.tid).sort((x, y) => y.int - x.int)[0]?.idx ?? null;
}
if (aIdx == null || bIdx == null) return false;
if (Math.random() >= 0.3) return false;
const d = this.startDebate(aIdx, bIdx, ctx);
    this.log(`【설전】${this.officers[aIdx].name_ko} vs ${this.officers[bIdx].name_ko} — 설전 시작!`, ctx.fid === this.playerForce || ctx.tid === this.playerForce);
if ((ctx.fid !== this.playerForce && ctx.tid !== this.playerForce) || this.delegated) this.debateAuto(d);
else this.pendingDebate = d;
return true;
}
autosave() {
try {
const data = {
scenId: this.scenId, year: this.year, month: this.month, dan: this.dan, turn: this.turn,
cities: this.cities, forces: this.forces, units: this.units, nextUnitId: this.nextUnitId,
playerForce: this.playerForce, delegated: this.delegated, deadAck: this.deadAck, logs: this.logs.slice(-60), diplo: this.diplo, itemPool: this.itemPool, chronicle: this.chronicle, over: this.over, unified: this.unified,
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
for (const u of [...game.units]) {
if (u.force !== fid || !game.units.includes(u)) continue;
const inR = (x, z) => Math.hypot(x - u.x, z - u.z) < 2.2;
const eu = game.units.find(x => x.force !== u.force && !game.isPeace(u.force, x.force) && inR(x.x, x.z));
const ec = game.cities.find(c => c.force != null && c.force !== u.force && !game.isPeace(u.force, c.force) && inR(c.lon, c.lat));
if (game.tacticInfo(u)) {
if (eu) { game.fireTactic(u.id, { type: 'unit', id: eu.id }); }
else if (ec) { game.fireTactic(u.id, { type: 'city', id: ec.id }); }
}
if (!game.units.includes(u) || (u._stratTurn ?? -1) === game.turn) continue;
const caster = u.officers.map(i => game.officers[i]).sort((a, b) => b.int - a.int)[0];
if (!caster) continue;
const tgt = game.units.find(x => x.force !== u.force && !game.isPeace(u.force, x.force) && !game.unitHasSkill(x, '위장') && inR(x.x, x.z));
if (tgt && caster.int >= 80 && (u.qi ?? 100) >= 25 && (tgt.conf ?? 0) <= 0) game.fireStrat(u.id, 'confuse', { type: 'unit', id: tgt.id });
else if (tgt && caster.int >= 75 && (u.qi ?? 100) >= 30) game.fireStrat(u.id, 'fire', { type: 'unit', id: tgt.id });
else if (!tgt && ec && caster.int >= 75 && (u.qi ?? 100) >= 30) game.fireStrat(u.id, 'fire', { type: 'city', id: ec.id });
}
}

const $ = id => document.getElementById(id);
let DATA = null, game = null, map = null, selectedUnit = null, autoTimer = null, pendingFire = null;
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
if (!(game.delegated || u.force === game.playerForce || game.inVision(u.x, u.z))) {
if (map.unitMeshes[u.id]) map.removeUnit(u.id);
continue;
}
if (!map.unitMeshes[u.id]) map.addUnit(worldUnit(u), forceColor(u.force));
else map.updateUnit(worldUnit(u), forceColor(u.force));
}
for (const id of Object.keys(map.unitMeshes)) if (!game.units.find(u => u.id == id)) map.removeUnit(id);
map.setSeason?.(game.month);
refreshHud(); refreshLog();
game.autosave();
}
function worldUnit(u) { const [x, z] = toWorld(u.x, u.z); return { id: u.id, x, z, label: u.label, type: u.type }; }
function refreshHud() {
document.documentElement.style.setProperty('--hud-h', ($('hud-top').offsetHeight + 6) + 'px');
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
if (game.pendingDuel) showDuel();
if (game.pendingDebate) showDebate();
}
function showDuel() {
const d = game.pendingDuel; if (!d) return;
const m = $('modal'); m.classList.remove('hidden');
const pk = d.a.u.force === game.playerForce ? 'a' : 'b', ek = pk === 'a' ? 'b' : 'a';
const STANCES = [['attack', '공격 중시'], ['defense', '방어 중시'], ['spirit', '투지 중시'], ['burst', '일발 중시']];
const CMDS = [['필살기', 100], ['급소', 200], ['무쌍', 300], ['암기', 0], ['퇴각', 0], ['위퇴각', 0]];
const render = () => {
const P = d[pk], E = d[ek];
const po = game.duelOfficer(d, pk), eo = game.duelOfficer(d, ek);
    const bar = (v, max, color) => `<span style="display:inline-block;width:120px;height:10px;background:#333;vertical-align:middle"><span style="display:block;width:${Math.max(0, Math.min(100, v / max * 100))}%;height:100%;background:${color}"></span></span>`;
const cmdBtn = ([name, need]) => {
let ok = P.spirit >= need;
if (name === '암기') ok = ok && !P._hiddenUsed && game.unitHasItemKind(P.u, 'weapon');
if (name === '위퇴각') ok = ok && game.unitHasItemKind(P.u, 'bow');
      return `<button class="cmd duel-cmd" data-c="${name}" ${ok ? '' : 'disabled'}>${name}${need ? ` (투지${need})` : ''}</button>`;
};
    m.innerHTML = `<div class="box" style="min-width:420px">
      <h3 style="color:#f66;text-align:center">일기토 (${d.bout}합)</h3>
      <p style="text-align:center;margin:4px 0"><span class="pimg" style="${portraitCss(po.idx)};display:inline-block;width:64px;height:64px;border:2px solid #d44;border-radius:4px;vertical-align:middle"></span> <b style="font-size:20px;color:#f66;vertical-align:middle"> VS </b> <span class="pimg" style="${portraitCss(eo.idx)};display:inline-block;width:64px;height:64px;border:2px solid #47d;border-radius:4px;vertical-align:middle"></span><br><b>${po.name_ko}</b> vs <b>${eo.name_ko}</b></p>
      <p>${po.name_ko} 체력 ${bar(P.hp, 100, '#d44')} ${Math.max(0, P.hp)} · 투지 ${bar(P.spirit, 300, '#4a7fd4')} ${P.spirit}<br>
      ${eo.name_ko} 체력 ${bar(E.hp, 100, '#d44')} ${Math.max(0, E.hp)} · 투지 ${bar(E.spirit, 300, '#4a7fd4')} ${E.spirit}</p>
      <p style="font-size:12px;color:#cbB;min-height:54px">${d.log.slice(-3).join('<br>')}</p>
      <p>방침: ${STANCES.map(([s, n]) => `<button class="cmd duel-stance" data-s="${s}" ${P.stance === s ? 'style="border-color:#ffd700"' : ''}>${n}</button>`).join(' ')}</p>
      <p>필살: ${CMDS.map(cmdBtn).join(' ')}</p>
      <p><button class="cmd" id="duel-go">합 진행</button> <button class="cmd" id="duel-auto">위임 (자동)</button></p></div>`;
let selStance = P.stance, selCmd = null;
m.querySelectorAll('.duel-stance').forEach(b => b.onclick = () => { selStance = b.dataset.s; m.querySelectorAll('.duel-stance').forEach(x => x.style.borderColor = ''); b.style.borderColor = '#ffd700'; });
const playerTick = sel => game.duelTick(d, pk === 'a' ? sel : game.duelPolicy(d, 'a'), pk === 'a' ? game.duelPolicy(d, 'b') : sel);
m.querySelectorAll('.duel-cmd').forEach(b => b.onclick = () => { selCmd = b.dataset.c; playerTick({ stance: selStance, cmd: selCmd }); after(); });
$('duel-go').onclick = () => { playerTick({ stance: selStance, cmd: null }); after(); };
$('duel-auto').onclick = () => { game.duelAuto(d); after(); };
};
const after = () => {
if (game.pendingDuel) render();
else { m.classList.add('hidden'); refreshAll(); checkGameOver(); }
};
render();
}
function showSwear(c) {
const m = $('modal'); m.classList.remove('hidden');
const eligible = c.officers.filter(i => (DATA.officers[i]?.state?.merit ?? 0) >= 500);
const techP = game.forces[c.force]?.techP ?? 0;
const render = sel => {
    m.innerHTML = `<div class="box" style="min-width:380px">
      <h3 style="color:#fd7">의형제 결연 — ${c.name_ko}</h3>
      <p style="font-size:12px">공적 500 이상 무장 2~3명 선택 · 세력 기교P 500 소비 (보유 ${techP}) · 결연 무장 충성 +10 · 같은 부대 공·방 +10%, 일기토 교체 지원 상승</p>
      ${eligible.length ? eligible.map(i => { const o = DATA.officers[i]; return `<p><label><input type="checkbox" class="swear-pick" data-i="${i}" ${sel.has(i) ? 'checked' : ''}> ${o.name_ko} (공적 ${o.state?.merit ?? 0}${game.relOf(i).sworn.length ? ' · 이미 결연: ' + game.relOf(i).sworn.map(x => DATA.officers[x]?.name_ko).join('·') : ''})</label></p>`; }).join('') : '<p>조건을 갖춘 무장이 없습니다 (공적 500 필요)</p>'}
      <p><button class="cmd" id="swear-ok" ${sel.size >= 2 && sel.size <= 3 && techP >= 500 ? '' : 'disabled'}>결연 맺기</button> <button class="cmd" id="swear-cancel">취소</button></p></div>`;
m.querySelectorAll('.swear-pick').forEach(cb => cb.onchange = () => { const i = Number(cb.dataset.i); cb.checked ? sel.add(i) : sel.delete(i); render(sel); });
$('swear-ok').onclick = () => { if (game.swearBrotherhood(c.id, [...sel])) { m.classList.add('hidden'); refreshAll(); showCityPanel(c); } };
$('swear-cancel').onclick = () => { m.classList.add('hidden'); };
};
render(new Set());
}
function showDebate() {
const d = game.pendingDebate; if (!d) return;
const m = $('modal'); m.classList.remove('hidden');
const pk = d.ctx?.fid === game.playerForce ? 'a' : (d.ctx?.tid === game.playerForce ? 'b' : 'a'), ek = pk === 'a' ? 'b' : 'a';
const render = () => {
const P = d[pk], E = d[ek];
const po = game.officers[P.o], eo = game.officers[E.o];
    const bar = (v, max, color) => `<span style="display:inline-block;width:120px;height:10px;background:#333;vertical-align:middle"><span style="display:block;width:${Math.max(0, Math.min(100, v / max * 100))}%;height:100%;background:${color}"></span></span>`;
const ctxName = { alliance: '동맹 제의', truce: '정전 요청', recruit: '등용' }[d.ctx?.kind] ?? '협상';
const cardBtn = c => {
const owned = !!game.debateCards(P.o)[c];
const ok = game.debateCardUsable(d, pk, c);
      const cd = (P.cds[c] ?? 0) > 0 ? ` (쿨 ${P.cds[c]})` : '';
      return `<button class="cmd debate-card" data-c="${c}" ${ok ? '' : 'disabled'}>${c}${cd}${owned ? '' : ' 🔒'}</button>`;
};
    m.innerHTML = `<div class="box" style="min-width:420px">
      <h3 style="color:#6cf;text-align:center">설전 (${d.bout}합) <span style="font-size:12px;color:#aaa">${ctxName}</span></h3>
      <p style="text-align:center;margin:4px 0"><span class="pimg" style="${portraitCss(P.o)};display:inline-block;width:64px;height:64px;border:2px solid #47d;border-radius:4px;vertical-align:middle"></span> <b style="font-size:20px;color:#6cf;vertical-align:middle"> VS </b> <span class="pimg" style="${portraitCss(E.o)};display:inline-block;width:64px;height:64px;border:2px solid #d44;border-radius:4px;vertical-align:middle"></span><br><b>${po.name_ko}</b> vs <b>${eo.name_ko}</b></p>
      <p>${po.name_ko} 논리 ${bar(P.hp, 100, '#d44')} ${Math.max(0, P.hp)}${P.seal ? ' · 봉인' : ''}<br>
      ${eo.name_ko} 논리 ${bar(E.hp, 100, '#d44')} ${Math.max(0, E.hp)}${E.seal ? ' · 봉인' : ''}</p>
      <p style="font-size:12px;color:#cbb;min-height:54px">${d.log.slice(-3).join('<br>')}</p>
      <p>화술: ${Object.keys(game.debateCardList()).map(cardBtn).join(' ')}</p>
      <p style="font-size:11px;color:#999">반박=상대 공격 무효+반격 · 경청=논리 회복 · 도발=다음 화술 봉인 · 🔒는 지력 부족(서적 보유 시 해금)</p>
      <p><button class="cmd" id="debate-auto">위임 (자동)</button></p></div>`;
m.querySelectorAll('.debate-card').forEach(b => b.onclick = () => { const sel = b.dataset.c; game.debateTick(d, pk === 'a' ? sel : game.debatePolicy(d, 'a'), pk === 'a' ? game.debatePolicy(d, 'b') : sel); after(); });
$('debate-auto').onclick = () => { game.debateAuto(d); after(); };
};
const after = () => {
if (game.pendingDebate) render();
else { m.classList.add('hidden'); refreshAll(); checkGameOver(); }
};
render();
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
function showChronicle() {
const m = $('modal'); m.classList.remove('hidden');
const ch = (game.chronicle ?? []).slice().reverse();
  const body = ch.length ? ch.map(e => `<p class="st">[${e.y}년 ${e.m}월] ${e.msg}</p>`).join('') : '<p>기록된 사건이 없습니다.</p>';
  m.innerHTML = `<div class="box" style="max-height:72vh;max-width:560px;display:flex;flex-direction:column"><h3>연감</h3><div style="overflow:auto;flex:1;min-height:0">${body}</div><button id="chr-close" style="flex:none;margin-top:8px">닫기</button></div>`; // R14: 기록이 길어도 닫기 버튼 고정 노출
m.querySelector('#chr-close').onclick = () => m.classList.add('hidden');
}
function checkGameOver() {
const owners = new Set(game.cities.map(c => c.force).filter(x => x != null));
if (owners.size === 1) {
if (!game._endShown) {
game._endShown = true;
      endModal(`【${game.forceName([...owners][0])}】이(가) 모든 도시를 제압해 천하를 통일했습니다! (${game.year}년 ${game.month}월, ${game.turn}턴)`, true);
}
return;
}
if (game.over) return;
const f = game.forces[game.playerForce];
if (f && !f.alive && !game.deadAck) {
const others = game.aliveForces();
if (others.length === 0) { endModal('천하가 정리되었습니다.'); return; }
    modal(`【${game.forceName(f.id)}】이(가) 멸망했습니다.`, [
['다른 세력으로 계속', () => {
modal('계속할 세력 선택', game.aliveForces().map(of => [game.forceName(of.id), () => { game.playerForce = of.id; game.deadAck = true; game.delegated = false; setAuto(false); refreshAll(); }]).concat([['취소', () => checkGameOver()]]));
}],
['관전만 계속', () => { game.deadAck = true; game.delegated = true; refreshHud(); setAuto(true); }],
['게임 종료', () => endModal('게임을 종료했습니다. 타이틀로 돌아갑니다.')],
]);
}
}
function endModal(text, spectator=false) {
game.over = true; setAuto(false);
const btns = spectator ? [['관전 계속', () => { game.over = false; game.delegated = true; refreshAll(); setAuto(true); }]] : [];
btns.push(['타이틀로', () => { localStorage.removeItem(SAVE_KEY); location.reload(); }]);
modal(text, btns);
}
function modal(text, buttons) {
const m = $('modal'); m.classList.remove('hidden');
  m.innerHTML = `<div class="box"><p>${text}</p>${buttons.map((b,i) => `<button data-i="${i}">${b[0]}</button>`).join('')}</div>`;
m.querySelectorAll('button').forEach(btn => btn.onclick = () => { m.classList.add('hidden'); buttons[Number(btn.dataset.i)][1](); });
}
function onPick(nx, ny) {
if (!game || game.over) return;
const hit = map.pick(nx, ny);
if (pendingFire) {
const pf = pendingFire; pendingFire = null;
let ok = false;
if (hit && hit.type === 'unit') ok = pf.kind === 'tactic' ? game.fireTactic(pf.uid, { type: 'unit', id: hit.id }) : game.fireStrat(pf.uid, pf.kind, { type: 'unit', id: hit.id });
else if (hit && hit.type === 'city') ok = pf.kind === 'tactic' ? game.fireTactic(pf.uid, { type: 'city', id: hit.id }) : game.fireStrat(pf.uid, pf.kind, { type: 'city', id: hit.id });
selectedUnit = null;
if (ok) { refreshAll(); if (game.units.find(x => x.id === pf.uid)) { selectedUnit = pf.uid; showUnitPanel(pf.uid); } else $('panel').classList.add('hidden'); }
else { game.log('대상이 유효하지 않습니다 (인접한 적 부대·도시만 가능)', true); refreshLog(); showUnitPanel(pf.uid); }
return;
}
if (!hit) { $('panel').classList.add('hidden'); selectedUnit = null; return; }
if (hit.type === 'unit') {
const u = game.units.find(x => x.id === hit.id);
if (u && !game.delegated && u.force !== game.playerForce && !game.inVision(u.x, u.z)) return;
selectedUnit = hit.id; showUnitPanel(hit.id); return;
}
const c = game.cityById[hit.id];
if (selectedUnit != null && game.units.find(u => u.id === selectedUnit && u.force === game.playerForce) && !game.delegated) {
game.orderUnit(selectedUnit, hit.id);
    game.log(`${game.units.find(u=>u.id===selectedUnit).label} → ${josa(c.name_ko, ['으로','로'])} 이동 명령`, true);
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
  html += `<p class="st">관계: 80+ 친밀 · 60+ 호의 · 40+ 중립 · 20+ 불화 · 미만 험악 — 매달 중립으로 서서히 회귀. 동맹국은 서로 공격하지 않습니다. 협상 결렬·등용 실패 시 30% 확률로 설전이 벌어지며, 승리하면 협상이 재심됩니다. 논객 특기는 성공률과 설전 공격력(+25%)을 보정합니다.</p>`;
  html += `<button class="cmd" id="cmd-diplo-back">← 도시 패널로</button>`;
p.innerHTML = html;
p.querySelectorAll('.dip-act').forEach(btn => btn.onclick = () => {
const tid = Number(btn.dataset.t);
const act = { envoy: 'envoy', ally: 'proposeAlliance', truce: 'requestTruce', surrender: 'demandSurrender', aid: 'requestAid', break: 'breakAlliance' }[btn.dataset.a];
const r = act === 'breakAlliance' ? game.breakAlliance(c.force, tid) : game[act](c.force, tid, c.id);
refreshAll(); showDiplomacy(c);
if (game.pendingDebate) showDebate();
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
        ? `${f.type}${(f.level ?? 1) > 1 ? ' Lv' + f.level : ''} — ${spec.desc}`
        : `${f.type} 공사 중 ${f.progress}/${spec.turns} (담당 ${f.builders.map(b => DATA.officers[b]?.name_ko).join('·') || '없음'})`;
      return `<div class="officer"><div><div class="st">${body}</div></div><button class="cmd cmd-demol" data-i="${i}">철거</button></div>`;
}).join('');
} else html += '<p>건설된 시설이 없습니다.</p>';
const mergeable = {};
c.facilities.forEach((f, i) => { if (f.done && (f.level ?? 1) < 3) (mergeable[f.type] = mergeable[f.type] ?? []).push(i); });
const mergePairs = Object.entries(mergeable).filter(([, v]) => v.length >= 2);
if (mergePairs.length) {
html += '<h3 style="margin-top:10px">흡수합병 <small>(같은 시설 2개 → Lv+1 · 금 200·AP 10 · 개발지 1개 회수, 최대 Lv3)</small></h3>';
    for (const [t, v] of mergePairs) html += `<div class="officer"><div><div class="nm">${t} × ${v.length}</div><div class="st">${FACILITIES[t].desc}</div></div><button class="cmd cmd-merge" data-t="${t}">합병</button></div>`;
}
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
p.querySelectorAll('.cmd-merge').forEach(btn => btn.onclick = () => {
const idxs = []; c.facilities.forEach((f, i) => { if (f.done && f.type === btn.dataset.t && (f.level ?? 1) < 3) idxs.push(i); });
idxs.sort((a, b) => (c.facilities[a].level ?? 1) - (c.facilities[b].level ?? 1));
if (idxs.length >= 2 && game.absorbFacility(c.id, idxs[0], idxs[1])) { refreshAll(); showFacilities(c); }
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
  html += `<h3 style="margin-top:10px">능력연구 <small>(PK — 소속 무장 전원 능력 +2/단계, 3단계 완료 시 특기 습득)</small></h3>`; // R13
const AB_NM = { '공격': '무력', '방어': '통솔', '계략': '지력', '내정': '정치' };
for (const b of Object.keys(AB_BRANCHES)) {
const lv = f?.ab?.[b] ?? 0; const maxed = lv >= 3;
    html += `<div class="officer"><div><div class="nm">${b}(${AB_NM[b]}) ${'●'.repeat(lv)}${'○'.repeat(3 - lv)}</div><div class="st">${maxed ? '최고 단계' : `기교P ${AB_P[lv]} · 전원 ${AB_NM[b]} +2${lv === 2 ? ' · 완료 시 특기 「' + AB_SKILL[b] + '」' : ''}`}</div></div>${maxed ? '<span class="st">최고 단계</span>' : `<button class="cmd cmd-abr" data-b="${b}">연구</button>`}</div>`;
}
  html += `<button class="cmd" id="cmd-tech-back">← 도시 패널로</button>`;
p.innerHTML = html;
p.querySelectorAll('.cmd-abr').forEach(btn => btn.onclick = () => {
if (game.researchAbility(game.playerForce, btn.dataset.b)) { refreshAll(); showTech(); }
});
p.querySelectorAll('.cmd-techr').forEach(btn => btn.onclick = () => {
game.researchTech(game.playerForce, btn.dataset.b);
refreshAll(); showTech();
});
$('cmd-tech-back').onclick = () => { const c = lastCityId != null && game.cityById[lastCityId]; if (c) showCityPanel(c); else p.classList.add('hidden'); };
}
function relLine(idx) {
const r = game.relOf(idx);
const nm = i => DATA.officers[i]?.name_ko ?? '?';
const parts = [];
if (r.sworn.length) parts.push('의형제: ' + r.sworn.map(nm).join('·'));
if (r.spouse != null) parts.push('배우자: ' + nm(r.spouse));
if (r.dear.length) parts.push('친애: ' + r.dear.map(nm).join('·'));
if (r.hate.length) parts.push('혐오: ' + r.hate.map(nm).join('·'));
parts.push('상성 ' + game.affOf(idx));
return ' · ' + parts.join(' · ');
}
function officerRow(idx) {
const o = DATA.officers[idx];
  return `<div class="officer"><span class="pimg" style="${portraitCss(idx)}"></span><div><div class="nm">${o.name_ko} <span class="st">${o.name_zh}</span></div><div class="st">통${o.ldr} 무${o.war} 지${o.int} 정${o.pol} 매${o.chr} · ${o.skill ? o.skill + ' — ' + (DATA.skills[o.skill] || '') : '특기 없음'} · 충성 ${o.state?.loyal ?? '-'} · 공적 ${o.state?.merit ?? 0}${(o.state?.injuredUntil ?? 0) > game.turn ? ' · <span style="color:#f66">부상</span>' : ''}${(o.state?.items ?? []).length ? ' · 명품: ' + o.state.items.map(id => ITEMS.find(i => i.id === id)?.name ?? id).join('·') : ''}</div><div class="st" style="color:#b9a">${relLine(idx)}</div></div></div>`;
}
let lastCityId = null;
function showCityPanel(c) {
lastCityId = c.id;
if (c.force !== game.playerForce && !game.delegated && !game.inVision(c.lon, c.lat)) {
const p = $('panel'); p.classList.remove('hidden');
const owner = c.force != null && game.forces[c.force]?.alive ? game.forceName(c.force) : '공백지';
    p.innerHTML = `<h3>${c.name_ko} (${c.name_zh ?? ''})</h3>
      <p class="st">소속: ${owner}</p>
      <p class="st">시야 밖입니다 — 내 도시·부대가 접근해야 상세 정보를 확인할 수 있습니다.</p>`;
return;
}
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
  if (mine) html += `<p style="margin-top:8px"><button class="cmd" id="cmd-swear">의형제 결연 (공적 500+ 무장 2~3명 · 기교P 500)</button></p>`;
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
const sw = $('cmd-swear');
if (sw) sw.onclick = () => showSwear(c);
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
p.querySelectorAll('.cmd-rec').forEach(b => b.onclick = () => { game.recruitOfficer(c.id, Number(b.dataset.i)); refreshAll(); showCityPanel(c); if (game.pendingDebate) showDebate(); });
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
    ${mine && game.tacticInfo?.(u) ? `<p><button class="cmd" id="up-tac">전법 ${game.tacticInfo(u).tac.name} (기력 ${game.tacticInfo(u).tac.qi})</button></p>` : ''}
    ${mine && (u.conf ?? 0) <= 0 && (u._stratTurn ?? -1) !== game.turn && u.officers.some(i => (DATA.officers[i]?.int ?? 0) >= 75) && (u.qi ?? 100) >= 30 ? '<p><button class="cmd" id="up-fire">계략 화계 (기력 30)</button></p>' : ''}
    ${mine && (u.conf ?? 0) <= 0 && (u._stratTurn ?? -1) !== game.turn && u.officers.some(i => (DATA.officers[i]?.int ?? 0) >= 80) && (u.qi ?? 100) >= 25 ? '<p><button class="cmd" id="up-conf">계략 혼란 (기력 25)</button></p>' : ''}
    <p><button class="cmd" id="up-close">닫기</button></p>`;
$('up-close').onclick = () => { $('panel').classList.add('hidden'); selectedUnit = null; pendingFire = null; };
const armFire = (kind, label) => {
pendingFire = { uid: u.id, kind };
    p.innerHTML = `<h3>${u.label} — ${label}</h3><p style="color:#ffd700">인접한 적 부대나 도시를 클릭하면 발동합니다.</p><p><button class="cmd" id="up-cancel">취소</button></p>`;
$('up-cancel').onclick = () => { pendingFire = null; showUnitPanel(u.id); };
};
  if ($('up-tac')) $('up-tac').onclick = () => armFire('tactic', `전법 ${game.tacticInfo(u).tac.name}`);
if ($('up-fire')) $('up-fire').onclick = () => armFire('fire', '계략 화계');
if ($('up-conf')) $('up-conf').onclick = () => armFire('confuse', '계략 혼란');
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
Object.assign(g, { year: d.year, month: d.month, dan: d.dan, turn: d.turn, cities: d.cities, forces: d.forces, units: d.units, nextUnitId: d.nextUnitId, playerForce: d.playerForce, delegated: d.delegated, logs: d.logs, deadAck: d.deadAck, chronicle: d.chronicle ?? [], over: d.over ?? false, unified: d.unified ?? d.over ?? false });
g.cityById = {}; g.cities.forEach(c => g.cityById[c.id] = c);
for (const c of g.cities) c.officers = [...new Set(c.officers ?? [])];
g.diplo = d.diplo ?? {};
g.itemPool = d.itemPool ?? Object.values(ITEMS).map(i => i.id).filter(id => !Object.values(g.officers).some(o => (o.state.items ?? []).includes(id)));
for (const o of Object.values(g.officers)) { o.state.items = o.state.items ?? []; if (o.state.status === 'free' && o.state.found === undefined) o.state.found = true; }
for (const f of Object.values(g.forces)) { f.advisor = f.advisor ?? null; f.legions = f.legions ?? []; }
for (const [i, st] of Object.entries(d.officerStates)) if (DATA.officers[i]) {
DATA.officers[i].state = st;
if (st.bonus) for (const [k, v] of Object.entries(st.bonus)) DATA.officers[i][k] = Math.min(100, (DATA.officers[i][k] ?? 50) + v);
if (st.grantSkill) DATA.officers[i].skill = st.grantSkill;
}
game = g; enterGame(); refreshAll(); checkGameOver();
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
['연감', () => showChronicle()],
['저장하고 타이틀로', () => { game?.autosave(); location.reload(); }],
['타이틀로 (저장은 자동)', () => location.reload()],
['계속', () => {}],
]);
}
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => document.documentElement.style.setProperty('--hud-h', ($('hud-top').offsetHeight + 6) + 'px')).observe($('hud-top'));
boot();
