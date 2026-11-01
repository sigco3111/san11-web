// 3D 저폴리 지도 엔진 (Three.js) - 고정 등각 아이소메트릭 + 계단식 지형 + 성곽/숲
import * as THREE from 'three';
import { loadGLBAssets, applyEnvironment } from './assets-3d.js?v=r160';

// R139: 결정적 전역 시설 배치. 지형·성곽·야전 시설·기배치 시설은 비용이 아닌 제외 조건.
// 자리가 없으면 도시 상단 요약 표식으로 표현하며 수상에 육상 건물을 강제 배치하지 않는다.
export function layoutCityFacilities(list, centers, fields, levelAt) {
  const placed = [], out = [];
  for (const cf of [...list].sort((a, b) => a.cityId - b.cityId)) {
    const facs = [...cf.facs].sort((a, b) => a.type.localeCompare(b.type, 'ko'));
    facs.forEach((f, i) => {
      const dock = f.type === '조선소', ideal = -Math.PI / 2 + i * 2 * Math.PI / facs.length;
      let best = null, bestScore = Infinity;
      for (const scale of [1, 0.8, 0.65]) {
        const half = 0.7 * scale, rad = 0.9 * scale;
        for (let ri = 0; ri <= 12; ri++) {
          const r = 2.4 + ri * 0.3;
          for (let k = 0; k < 72; k++) {
            const a = ideal + k * Math.PI / 36, x = cf.x + Math.cos(a) * r, z = cf.z + Math.sin(a) * r;
            const lv = levelAt(x, z);
            if (dock ? lv > 1 : lv !== 1) continue;
            if (!dock && [-half, 0, half].some(dx => [-half, 0, half].some(dz => levelAt(x + dx, z + dz) !== 1))) continue;
            if (centers.some(c => Math.hypot(x - c.x, z - c.z) < 2.2 + rad)) continue;
            if (fields.some(c => Math.hypot(x - c.x, z - c.z) < c.fr + rad + 0.15)) continue;
            if (placed.some(c => Math.hypot(x - c.x, z - c.z) < c.rad + rad + 0.12)) continue;
            const score = ri * 0.2 + Math.min(k, 72 - k) * 0.025 + (dock && lv !== 0 ? 4 : 0);
            if (score < bestScore) { bestScore = score; best = { cityId: cf.cityId, ...f, x, z, scale, rad, summary: false }; }
          }
        }
        if (best) break;
      }
      if (best) placed.push(best);
      else best = { cityId: cf.cityId, ...f, x: cf.x, z: cf.z, scale: 0.3, summary: true, slot: i };
      out.push(best);
    });
  }
  return out;
}

const LON0 = 100, LON1 = 126.5, LAT0 = 21.5, LAT1 = 43;
export function toWorld(lon, lat) {
  const x = (lon - (LON0+LON1)/2) * 3.1;
  const z = -((lat - (LAT0+LAT1)/2)) * 3.7;
  return [x, z];
}
function toLonLat(x, z) {
  return [x/3.1 + (LON0+LON1)/2, -z/3.7 + (LAT0+LAT1)/2];
}

// 대략적인 중국 윤곽 (lon,lat)
const OUTLINE = [
[101,28],[101.5,31],[103,33.5],[104,36],[105.5,37.5],[107,39],[109,40.2],[111,40.8],[114,41.2],[117,41.2],[120,41.8],[123,42.3],[125.5,41.5],[125,40.3],[124,39.7],[122.5,38.7],[121.5,38.8],[119,38.3],[117.8,38.5],[117.5,37.7],[118.5,37.3],[119.5,36.8],[120.8,36.5],[121,35.3],[120.2,34.4],[120.3,33],[120.8,31.8],[121.6,31.1],[121.6,29.8],[120.8,28.3],[119.8,27],[118.7,25.8],[117.5,24.6],[115.8,23.3],[113.8,22.6],[111.5,21.9],[109.8,21.8],[108.2,22.3],[106.5,23.2],[104.5,23.8],[102.5,24.8],[101.2,26.2]];
const RIVERS = [
  // 황하
  [[102.5,36.5],[105,36.8],[106.5,38.5],[108.5,40.1],[110.5,40.1],[111.8,39.2],[112.15,37.5],[111.3,36],[110.6,34.7],[111.8,34.6],[113.5,34.9],[115,35.4],[116.5,36.6],[118,37.4],[118.9,37.7]],
  // 장강
  [[104.1,28.8],[105.5,29.2],[106.65,29.0],[107.8,30.3],[109.35,30.45],[110.5,30.8],[111.5,30.2],[112.6,29.9],[114.35,30.0],[115.85,29.15],[117,30.6],[118.2,31.4],[118.3,32.7],[118.95,32.85],[119.3,32.1],[120.6,32.1],[121.4,31.5]],
  // 남쪽 강 (湘江 — R90: 동정호 수로로 장강까지 연장, 합류점 (113.55,30.24)는 장강 세그먼트 위)
  [[110.5,26],[111.7,25.7],[112.4,26.9],[112.5,28.3],[112.9,29.3],[113.1,29.6],[113.55,30.24]],
  // R90: 지류 확장 — 실제 하천 경로 근거(통관 110.2E 34.5N, 요하삼각주 40.87N 121.58E, 영정하 유역 112~117.75E 등 웹 출처 확인). 합류점은 기존 강 세그먼트 위, 하구는 게임 해역 인접으로 배치
  [[104.6,34.8],[105.55,34.05],[106.7,34.4],[107.5,34.3],[108.9,33.72],[109.7,34.4],[110.5,34.62]], // 위수: 천수-장안-통관(황하)
  [[106.75,33.1],[108.3,32.9],[109.3,32.7],[110.8,32.65],[111.5,32.4],[112.05,31.45],[112.9,31.7],[113.8,31.0],[114.3,30.55]], // 한수: 한중-양양-무한(장강)
  [[104.5,30.3],[104.0,30.0],[103.8,29.55],[104.3,29.0],[104.6,28.94]], // 민강: 성도-이빈(장강)
  [[104.8,31.4],[105.5,31.15],[106.1,30.5],[106.3,30.0],[106.65,29.0]], // 부강: 재동-중경(장강)
  [[112.3,40.1],[113.5,40.1],[114.8,40.0],[116.0,39.85],[116.4,39.25],[117.0,39.3],[117.3,39.2],[117.8,38.5]], // 영정하: 계-톈진(보하이)
  [[118.3,41.3],[118.65,40.6],[119.0,40.35],[119.1,39.3],[119.5,38.55]], // 난하: 북평-보하이
  [[113.6,32.45],[114.5,32.5],[115.8,32.62],[117.0,32.68],[117.4,32.95],[118.5,33.3],[119.2,33.45],[120.0,33.55]], // 회수: 여남-홍택호-황해
  [[117.0,35.5],[117.0,34.9],[117.2,34.3],[118.35,34.0],[118.15,33.2]], // 사수: 하비-회수
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
// 해안 체인: 동해안(12..37), 남해안(37..42) — 폴리곤 바깥의 바다 판정용
const EAST_COAST = OUTLINE.slice(12, 38);  // [125.5,41.5] -> [109.8,21.8]
const SOUTH_COAST = OUTLINE.slice(37, 43); // [109.8,21.8] -> [101.2,26.2]
function _chainLonAtLat(chain, lat) { // 감소 순서 체인에서 lat의 경계 lon
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
// 윤곽 밖 셀의 바다 여부: 동해안 동쪽, 남해안 남쪽만 바다. 서/북은 대륙이 이어짐.
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

// ---- 격자 지형 상수 ----
const CELL = 1.8, STEP = 0.85, WATER_Y = 0.45;
const GX0 = -41.4, GZ0 = -41.4, GN = 47;
const MGN = 8, GN2 = GN + 2*MGN; // 대륙 확장 링(섬처럼 보이는 문제 개선)
const GX2 = GX0 - MGN*CELL, GZ2 = GZ0 - MGN*CELL;
const CASTLE_SCALE = 0.075, CASTLE_CELL = 10 * CASTLE_SCALE; // Kenney 부품(10 유닛) -> 1.5 월드 유닛
const CITY_FLAT_R = 2.3, CITY_RIVER_R = 1.2, RIVER_R = 1.5; // R94: 강 폭 1.8→1.5·보호반경 1.0→1.2 — 도시 주변 수면 과다(도시가 섬처럼 보이는 퇴행) 개선. 레플리카 8연결 검증: 연결 37완전+2부분 유지, 도시 8world 내 수면 장안 35→28·낙양 25→19·시상 20→15셀. 성곽 반폭 0.75 < 1.2로 성곽은 육지 유지

// 강 폴리라인을 월드 좌표 점열로 전개
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

// GLB 씬을 Box3 기준으로 바닥 중앙 정렬한 래퍼
function centered(node) {
  const box = new THREE.Box3().setFromObject(node);
  const c = box.getCenter(new THREE.Vector3());
  node.position.set(-c.x, -box.min.y, -c.z);
  const g = new THREE.Group(); g.add(node); return g;
}
// GLB 씬 + 변환 배열 -> 메시 종류별 InstancedMesh 묶음
function instancedFromScene(srcScene, placements, clothColorHex = null) {
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
    let useMat = m.material;
    if (clothColorHex && m.name === 'roof') { useMat = m.material.clone(); useMat.color.set(clothColorHex); } // R116: 기치 천 세력색 (GLB cloth가 'roof' 명칭)
    const im = new THREE.InstancedMesh(m.geometry, useMat, placements.length);
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

export class Map3D {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x16374d);
    // 고정 등각 직교 카메라
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

  // ---- 시나리오 동기화: 도시 목록이 바뀔 때만 지형/성곽/숲 재구축 ----
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
    // 1패스: 레벨 산정
    for (let iz = 0; iz < GN2; iz++) for (let ix = 0; ix < GN2; ix++) {
      const x = GX2 + (ix+0.5)*CELL, z = GZ2 + (iz+0.5)*CELL;
      const [lon, lat] = toLonLat(x, z);
      let lv = 0;
      // R90: 강 파내기는 윤곽 안팎 공통 — 윤곽 밖 대륙 링을 지나는 상류(황하·장강 상류)와 신규 지류가 실제 수로가 되도록 (도시 보호 반경 제외는 동일)
      let dR = 1e9;
      for (const [rx, rz] of RIVER_PTS) { const d = Math.hypot(x-rx, z-rz); if (d < dR) dR = d; }
      const carve = dR < RIVER_R && !this.nearCity(x, z, CITY_RIVER_R);
      if (inOutline(lon, lat)) {
        lv = Math.min(3, Math.max(1, 1 + Math.floor((rawHeight(lon,lat)-0.25)/0.6)));
        // 강 파내기 (도시 보호 반경 제외)
        if (carve) lv = 0;
        // 도시 주변 평탄화
        if (lv > 1 && this.nearCity(x, z, CITY_FLAT_R)) lv = 1;
      } else if (!isSea(lon, lat)) {
        // 윤곽 밖 내륙(서/북/남서): 대륙이 맵 밖까지 물리적으로 이어짐
        lv = noise(lon*0.4+9, lat*0.4+2) > 0.8 ? 2 : 1;
        if (carve) lv = 0;
      }
      levels[iz*GN2+ix] = lv;
    }
    this.levels = levels;
    // 2패스: 인스턴스 + 색상 (해안 모래)
    const geo = new THREE.BoxGeometry(CELL*0.98, 1, CELL*0.98);
    const mat = new THREE.MeshLambertMaterial({ flatShading: true });
    const im = new THREE.InstancedMesh(geo, mat, GN2*GN2);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    const nearSea = (ix, iz) => {
      for (const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const jx = ix+dx, jz = iz+dz;
        if (jx<0||jz<0||jx>=GN2||jz>=GN2) continue; // 링 바깥은 대륙 연장으로 간주
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
    this.baseColors = Float32Array.from(colors); // R16: 사계절 재채색용 기본 색
  }
  setSeason(month) { // R16: 사계절 표현 (설계안 지도) — 월에 따라 지형 색조 변경
    if (!this.terrainMesh || !this.baseColors || this.season === month) return;
    this.season = month;
    const tint = month >= 3 && month <= 5 ? [1.0, 1.03, 0.95] : month >= 6 && month <= 8 ? [0.9, 1.06, 0.88] : month >= 9 && month <= 11 ? [1.25, 1.0, 0.62] : [1.38, 1.4, 1.55]; // 봄·여름·가을·겨울 — R131c: 가을·겨울 틴트 강화 (구값은 월 전환 시 식별 어려움, 11/1 실측 ΔRGB 평균 15~25)
    const winter = month >= 12 || month <= 2; // R131d: 틴트 값이 아닌 월로 겨울 판정 (R131c에서 가을 tint[0]=1.25가 >1.1 조건을 오발동시켜 가을도 설원이 되는 결함 — 라이브 10월 캡처가 겨울색으로 관측됨)
    const col = new THREE.Color(), snow = new THREE.Color(0.93, 0.95, 1.0);
    for (let i = 0; i < this.baseColors.length / 3; i++) {
      col.setRGB(Math.min(1, this.baseColors[i*3] * tint[0]), Math.min(1, this.baseColors[i*3+1] * tint[1]), Math.min(1, this.baseColors[i*3+2] * tint[2]));
      if (winter) col.lerp(snow, 0.45); // R131c: 설원 식별성 강화 (구 0.28은 '약간 밝음' 수준)
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
    const walls = [], towers = [], keeps = [], flags = {}, roofs = [], eaves = [], gates = [], tips = [];
    const sc = (x, y, z, sx, sy, sz, ry) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), ry), new THREE.Vector3(sx, sy, sz));
    // R115: 처마 반전(위로 치켜올린 모서리) — sc에 Y회전만 있어 팔자 회전은 오일러 조합 별도 도우미 (자체 수치)
    const tip = (x, y, z, dx, dz) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(dz*0.38, dx !== 0 ? Math.PI/4 : -Math.PI/4, -dx*0.38)), new THREE.Vector3(1, 1, 1)); // R119: 2단 판재는 공중 분리 인상이라 r116/117 단일 접합판으로 복귀(부모 실화면 지적)
    const pushEave = (x, y, z, s, sy) => { eaves.push(sc(x, y, z, s, sy, s, Math.PI/4)); const r = s*0.74, ty = y + 0.03*s; tips.push(tip(x+r, ty, z, 1, 0), tip(x-r, ty, z, -1, 0), tip(x, ty, z+r, 0, 1), tip(x, ty, z-r, 0, -1)); };
    for (const c of this.cityList) {
      const [x, z] = toWorld(c.lon, c.lat);
      const y = STEP; // 도시 평탄화 레벨 1
      const rot = 0;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== 1) continue;
        if (dz === 1 && dx === 0) continue; // 남쪽 정문 개구부
        const p = placement(x + dx*C, y, z + dz*C, S, rot);
        if (Math.abs(dx) === 1 && Math.abs(dz) === 1) towers.push(p); else walls.push(p);
      }
      keeps.push(placement(x, y, z, S*1.3, Math.PI/4));
      // 동양풍 지붕·문루 (자체 제작 저폴리: 4각 추형, 기와색) — 본성 2층 지붕, 모서리 망루 지붕, 남문 문루
      const ky = y + 10.2 * S;
      pushEave(x, ky, z, 1.3, 0.14); roofs.push(sc(x, ky + 0.03, z, 0.92, 0.7, 0.92, Math.PI/4));
      pushEave(x, ky + 0.5, z, 0.7, 0.12); roofs.push(sc(x, ky + 0.53, z, 0.5, 0.62, 0.5, Math.PI/4));
      gates.push(sc(x, ky + 1.1, z, 0.05, 0.22, 0.05, 0)); // 용마루 끝 장식(붉은 첨탑)
      for (const [tx, tz] of [[-1,-1],[1,-1],[-1,1],[1,1]]) { pushEave(x + tx*C, y + 12.2*S, z + tz*C, 0.42, 0.07); roofs.push(sc(x + tx*C, y + 12.25*S, z + tz*C, 0.27, 0.4, 0.27, Math.PI/4)); }
      gates.push(sc(x - 0.2, y, z + C, 0.07, 0.62, 0.07, 0), sc(x + 0.2, y, z + C, 0.07, 0.62, 0.07, 0), sc(x, y + 0.6, z + C, 0.52, 0.07, 0.12, 0), sc(x, y + 0.68, z + C, 0.62, 0.05, 0.18, 0)); // R117: 문루 보 돌출 비례 축소
      const fy = y + 13.1 * S;
      const fcol = (this.cityColorOf && c.force != null) ? this.cityColorOf(c.force) : null; // R116: 세력색 기치
      (flags[fcol ?? 'asset'] ??= []).push(placement(x, y + 10.7*S, z, S*1.5, 0), placement(x - C, fy, z + C, S*1.1, 0), placement(x + C, fy, z + C, S*1.1, 0));
    }
    if (walls.length) this.castleGroup.add(instancedFromScene(A.wall, walls));
    if (towers.length) this.castleGroup.add(instancedFromScene(A.towerSquareBaseColor, towers));
    if (keeps.length) this.castleGroup.add(instancedFromScene(A.towerSquareBaseColor, keeps));
    for (const [col, list] of Object.entries(flags)) this.castleGroup.add(instancedFromScene(A.flagBlueWide, list, col === 'asset' ? null : col)); // R116
    const addInst = (geo, mat, list) => { if (!list.length) return; const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = true; im.receiveShadow = true; this.castleGroup.add(im); };
    const pyr = new THREE.ConeGeometry(1, 1, 4, 1); pyr.translate(0, 0.5, 0); // 밑면 y=0, 4각 추
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    addInst(pyr, new THREE.MeshLambertMaterial({ color: 0x2f4f55 }), roofs);   // 청회색 기와
    addInst(pyr, new THREE.MeshLambertMaterial({ color: 0x8a2b24 }), eaves);   // 붉은 처마
    addInst(box, new THREE.MeshLambertMaterial({ color: 0xa5342a }), gates);   // 붉은 문루 기둥·보
    const tipGeo = new THREE.BoxGeometry(0.2, 0.045, 0.13); tipGeo.translate(0, 0.02, 0); // R116: 가시형 첨체 대신 납작한 추노 마감(완만한 상승 곡선 인상)
    addInst(tipGeo, new THREE.MeshLambertMaterial({ color: 0x8a2b24 }), tips); // R115: 처마 반전 팁
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
    // 1) 클러스터 시드: 넓은 스케일 노이즈가 높은 셀
    for (let iz = MGN+1; iz < MGN+GN-1; iz++) for (let ix = MGN+1; ix < MGN+GN-1; ix++) {
      if (!eligible(ix, iz)) continue;
      const x = GX2 + (ix+0.5)*CELL, z = GZ2 + (iz+0.5)*CELL;
      const [lon, lat] = toLonLat(x, z);
      const cf = 0.65*noise(lon*0.2+31, lat*0.2+17) + 0.35*noise(lon*0.45+3, lat*0.45+5);
      if (cf > 0.60) isForest[iz*GN2+ix] = 1;
    }
    // 2) 시드 주변 블롭 확장 (한 번의 성장 패스)
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
    // 3) 배치: 숲 셀당 2~4그루 + 군집 밖 드문 고목/관목
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
    this.forestGrid = grown;
  }
  mountainAtLL(lon, lat) { // 간도: 렌더 지형 높이 2 이상(구릉·산) 육지 셀 (엔진 규칙용)
    if (!this.levels) return false; const [x, z] = toWorld(lon, lat); return this.levelAtWorld(x, z) >= 2;
  }
  forestAtLL(lon, lat) { // 엔진 규칙용 숲 판정 (렌더 숲 셀과 동일)
    if (!this.forestGrid) return false;
    const [x, z] = toWorld(lon, lat); const ix = Math.floor((x - GX2) / CELL), iz = Math.floor((z - GZ2) / CELL);
    return ix >= 0 && iz >= 0 && ix < GN2 && iz < GN2 && this.forestGrid[iz * GN2 + ix] === 1;
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
    // 세력 깃발 (주탑 위)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8),
      new THREE.MeshBasicMaterial({ color: 0xdddddd }));
    pole.position.set(0, y + 1.7, 0); g.add(pole);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.5, 0.05),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(colorHex) }));
    flag.position.set(0.45, y + 2.3, 0); g.add(flag);
    const label = this.makeLabel(city.name_ko, 0.75); label.position.set(0, y + 3.1, 0); g.add(label);
    // 클릭용 보이지 않는 기둥
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

  unitBody(type) { // R16: 병종별 저폴리 모델 (임시 단일 원뿔 대체, 자체 제작 primitives)
    const g = new THREE.Group();
    const mat = c => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    const add = (geo, color, x=0, y=0, z=0, rx=0, ry=0, rz=0) => { const m = new THREE.Mesh(geo, mat(color)); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; g.add(m); return m; };
    const soldier = (kind) => { // 보병: 사람형 실루엣(다리·몸통·머리·투구) + 병종별 무기로 줌 아웃에서도 구분
      add(new THREE.BoxGeometry(0.3, 0.42, 0.2), 0x3e3226, 0, 0.21, 0);            // 다리
      add(new THREE.BoxGeometry(0.44, 0.55, 0.26), 0x5a4a3a, 0, 0.7, 0);           // 몸통(갑옷)
      add(new THREE.BoxGeometry(0.5, 0.12, 0.3), 0x6a5a48, 0, 0.98, 0);            // 어깨
      add(new THREE.SphereGeometry(0.16, 6, 5), 0xd8b896, 0, 1.16, 0);             // 머리
      add(new THREE.ConeGeometry(0.19, 0.26, 6), 0x707078, 0, 1.34, 0);            // 투구
      if (kind === 'sword') { // 대형 방패 + 직검
        add(new THREE.BoxGeometry(0.08, 0.72, 0.5), 0x8a4a3a, -0.34, 0.75, 0);
        add(new THREE.BoxGeometry(0.06, 0.8, 0.05), 0xd8d8e0, 0.36, 1.05, 0, 0, 0, 0.35);
      } else if (kind === 'spear') { // 머리 위로 솟은 굵은 장창 + 금속 촉
        add(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 5), 0x9a7a4a, 0.34, 1.35, 0);
        add(new THREE.ConeGeometry(0.12, 0.42, 4), 0xd8d8e0, 0.34, 2.65, 0);
      } else if (kind === 'pike') { // 장극 + 대형 월아 날
        add(new THREE.CylinderGeometry(0.06, 0.06, 1.9, 5), 0x9a7a4a, 0.34, 1.2, 0);
        add(new THREE.BoxGeometry(0.58, 0.18, 0.08), 0xd8d8e0, 0.34, 2.15, 0);
      } else if (kind === 'bow') { // 몸통만한 대형 활 아크 + 시위
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
      case 'cav': // 말 + 기수 (R118: 기수를 몸통+머리+투구로 세분, 말/기수 색 분리)
        add(new THREE.BoxGeometry(0.5, 0.45, 1.0), 0x6a4a30, 0, 0.62, 0);
        for (const [lx, lz] of [[-0.16, 0.32], [0.16, 0.32], [-0.16, -0.32], [0.16, -0.32]]) add(new THREE.CylinderGeometry(0.06, 0.06, 0.45, 4), 0x54381f, lx, 0.22, lz);
        add(new THREE.BoxGeometry(0.2, 0.3, 0.35), 0x6a4a30, 0, 0.82, 0.55);      // 말 머리
        add(new THREE.BoxGeometry(0.1, 0.22, 0.16), 0x54381f, 0, 0.72, 0.62);    // 말 귀·얼굴 앞면
        add(new THREE.BoxGeometry(0.34, 0.4, 0.24), 0x5a4a3a, 0, 1.06, -0.05);   // 기수 몸통(갑옷)
        add(new THREE.SphereGeometry(0.13, 6, 5), 0xd8b896, 0, 1.36, -0.05);     // 기수 머리
        add(new THREE.ConeGeometry(0.16, 0.22, 6), 0x707078, 0, 1.5, -0.05);     // 기수 투구
        add(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 4), 0x9a7a4a, 0.26, 1.1, -0.05); break; // 기수 장창
      case 'ram': // 충거: 수레 + 충각 (R117: 바퀴 추가)
        add(new THREE.BoxGeometry(0.9, 0.6, 1.1), 0x5a4a3a, 0, 0.68, 0);
        for (const [wx, wz] of [[-0.48, 0.35], [0.48, 0.35], [-0.48, -0.35], [0.48, -0.35]]) add(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 8), 0x3e2f1e, wx, 0.16, wz, 0, 0, Math.PI/2);
        add(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 6), 0x7a6a4a, 0, 0.58, 0.2, Math.PI/2, 0, 0); break;
      case 'tower': // 정란: 높은 탑
        add(new THREE.BoxGeometry(0.8, 1.8, 0.8), 0x6a5a45, 0, 0.9, 0);
        add(new THREE.BoxGeometry(0.95, 0.25, 0.95), 0x5a4a3a, 0, 1.85, 0); break;
      case 'beast': // 목수: 짐승 + 등 위 구조물
        add(new THREE.BoxGeometry(0.6, 0.5, 1.0), 0x7a5a3a, 0, 0.6, 0);
        add(new THREE.BoxGeometry(0.35, 0.35, 0.4), 0x7a5a3a, 0, 0.75, 0.6);
        for (const [lx, lz] of [[-0.2, 0.3], [0.2, 0.3], [-0.2, -0.3], [0.2, -0.3]]) add(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 4), 0x5a4a30, lx, 0.25, lz);
        add(new THREE.BoxGeometry(0.5, 0.3, 0.6), 0x8a6a4a, 0, 0.95, -0.1); break;
      case 'catapult': // 투석기: 대좌 + 발사대 + 투석통
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
    const body = this.unitBody(unit.type ?? 'sword'); // R16: 병종별 모델
    g.add(body);
    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.34, 0.05),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(colorHex) }));
    banner.position.set(0.3, 1.52, -0.3); g.add(banner); // R117: 병사 실루엣을 가리지 않도록 등 뒤로 축소·후방 이동
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
  syncFieldFacs(list) { // R26: 야전 시설 표시 (list: {id,type,x,z,color,done}) - 낮은 폴리 자체 모델
    this.fieldMeshes = this.fieldMeshes ?? {};
    const keep = new Set(list.map(f => f.id));
    for (const id of Object.keys(this.fieldMeshes)) if (!keep.has(Number(id))) { this.unitGroup.remove(this.fieldMeshes[id].g); delete this.fieldMeshes[id]; }
    for (const f of list) {
      let m = this.fieldMeshes[f.id];
      if (m && m.type === f.type && m.done === f.done) { m.g.position.set(f.x, Math.max(this.levelAtWorld(f.x, f.z) * STEP, WATER_Y + 0.2), f.z); continue; }
      if (m) this.unitGroup.remove(m.g);
      const g = new THREE.Group(); const col = new THREE.Color(f.color);
      const mat = new THREE.MeshLambertMaterial({ color: f.done ? 0x8a6a45 : 0xb9a47e, transparent: !f.done, opacity: f.done ? 1 : 0.55 });
      const flag = new THREE.MeshBasicMaterial({ color: col });
      const box = (w, h, d, x, y, z, mt = mat) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mt); b.position.set(x, y, z); g.add(b); return b; };
      if (f.type === '토루') { box(1.6, 0.35, 0.6, 0, 0.18, 0); box(0.6, 0.35, 1.6, 0, 0.18, 0); }
      else if (f.type === '진') { box(1.4, 0.18, 1.4, 0, 0.09, 0); box(0.08, 1.3, 0.08, 0, 0.8, 0); box(0.6, 0.35, 0.04, 0.34, 1.2, 0, flag); }
      else if (f.type === '채') { for (const [x, z] of [[-.8, -.8], [.8, -.8], [-.8, .8], [.8, .8]]) box(0.18, 0.8, 0.18, x, 0.4, z); box(1.8, 0.3, 0.12, 0, 0.55, -.8); box(1.8, 0.3, 0.12, 0, 0.55, .8); box(0.12, 0.3, 1.8, -.8, 0.55, 0); box(0.12, 0.3, 1.8, .8, 0.55, 0); box(0.08, 1.6, 0.08, 0, 0.9, 0); box(0.6, 0.35, 0.04, 0.34, 1.5, 0, flag); }
      else if (f.type === '성채') { box(2.0, 0.5, 2.0, 0, 0.25, 0); box(0.5, 1.2, 0.5, -0.8, 0.8, -0.8); box(0.5, 1.2, 0.5, 0.8, 0.8, -0.8); box(0.5, 1.2, 0.5, -0.8, 0.8, 0.8); box(0.5, 1.2, 0.5, 0.8, 0.8, 0.8); box(0.08, 1.8, 0.08, 0, 1.4, 0); box(0.6, 0.4, 0.04, 0.34, 2.1, 0, flag); }
      else if (f.type === '태고대') { box(1.1, 0.5, 1.1, 0, 0.25, 0); const dr = box(0.7, 0.5, 0.7, 0, 0.8, 0, flag); dr.rotation.z = Math.PI / 2; box(0.08, 0.6, 0.08, 0.5, 0.9, 0); }
      else if (f.type === '군악대') { box(1.1, 0.4, 1.1, 0, 0.2, 0); box(0.08, 1.2, 0.08, -0.3, 0.9, 0); box(0.08, 1.2, 0.08, 0.3, 0.9, 0); box(0.7, 0.3, 0.04, 0, 1.4, 0, flag); }
      else if (f.type === '석병팔진') { const st = new THREE.MeshLambertMaterial({ color: f.done ? 0x8d8d92 : 0xb5b5b8, transparent: !f.done, opacity: f.done ? 1 : 0.55 }); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; box(0.3, 0.8, 0.3, Math.cos(a) * 0.9, 0.4, Math.sin(a) * 0.9, st); } box(0.08, 1.3, 0.08, 0, 0.65, 0); box(0.5, 0.3, 0.04, 0.28, 1.2, 0, flag); }
      else if (f.type === '석벽') { const st = new THREE.MeshLambertMaterial({ color: f.done ? 0x8d8d92 : 0xb5b5b8, transparent: !f.done, opacity: f.done ? 1 : 0.55 }); box(2.0, 0.9, 0.35, 0, 0.45, 0, st); box(0.35, 0.9, 1.4, 0.85, 0.45, 0.6, st); box(0.08, 1.4, 0.08, -0.8, 1.1, 0); box(0.5, 0.3, 0.04, -0.55, 1.4, 0, flag); }
      else if (f.type === '불화살함정') { box(0.9, 0.08, 0.9, 0, 0.05, 0); box(0.08, 0.5, 0.08, 0.2, 0.3, 0, flag).rotation.z = 0.5; box(0.08, 0.5, 0.08, -0.2, 0.3, 0, flag).rotation.z = -0.5; }
      else if (f.type === '낙석') { box(0.5, 0.4, 0.5, 0, 0.2, 0); box(0.35, 0.3, 0.35, 0.4, 0.15, 0.2); box(0.3, 0.25, 0.3, -0.35, 0.12, -0.2); }
      else { box(1.0, 0.5, 1.0, 0, 0.25, 0); box(0.9, 0.12, 0.2, 0, 0.7, 0).rotation.z = 0.5; box(0.35, 0.35, 0.35, 0.3, 0.95, 0, flag); }
      g.position.set(f.x, Math.max(this.levelAtWorld(f.x, f.z) * STEP, WATER_Y + 0.2), f.z);
      this.unitGroup.add(g);
      // R89: 시각 크기 비례 피킹을 위한 유형별 풋프린트 반경(월드 단위) — 기존 고정 0.06 NDC는 시각 모델(폭 ~0.027)보다 2~4배 넓어 빈 공간 오선택 유발
      const FAC_R = { '토루': 0.9, '진': 0.8, '채': 1.0, '성채': 1.2, '태고대': 0.7, '군악대': 0.7, '석병팔진': 1.0, '석벽': 1.1, '불화살함정': 0.6, '낙석': 0.5 };
      this.fieldMeshes[f.id] = { g, type: f.type, done: f.done, fr: FAC_R[f.type] ?? 0.7 };
    }
  }
  // R135: 도시 내정 시설 지도 표시 — 종류별 낮은 폴리 자체 모델 (시각 체험 개선 전용, 규칙 변경 없음). 시야 밖 적 도시는 main이 목록에서 제외 (R14 cityVisible과 동일 기준)
  static CITY_FAC_STYLE = { // geo: 형태 분류 8종, col: 종류별 액센트 색
    '시장': { geo: 'market', col: 0xd4a017 }, '회계청': { geo: 'market', col: 0xe0c060 },
    '농장': { geo: 'farm', col: 0x3f7a2a }, '곡물창고': { geo: 'barn', col: 0x7a9a3a }, '곡창': { geo: 'barn', col: 0xb08a3a },
    '조폐': { geo: 'smith', col: 0xc9a86a }, '대장간': { geo: 'smith', col: 0x705040 }, '공방': { geo: 'smith', col: 0x606070 },
    '병영': { geo: 'barracks', col: 0xa03030 }, '훈련장': { geo: 'barracks', col: 0xc05030 },
    '마구간': { geo: 'stable', col: 0x8a5a2a }, '조선소': { geo: 'dock', col: 0x3a6a9a },
    '부절대': { geo: 'gov', col: 0x8a2a8a }, '군사부': { geo: 'gov', col: 0x2a5a8a }, '인재부': { geo: 'gov', col: 0x2a8a5a },
    '외교부': { geo: 'gov', col: 0xb0a030 }, '감찰소': { geo: 'gov', col: 0x5a5a5a }, '서재': { geo: 'gov', col: 0x7a6ab0 }, '의관': { geo: 'gov', col: 0x4a9a8a },
  };
  _cityFacModel(type, done, level = 1) { // 시설 1개 모델 — 8종 형태 × 종류색 액센트, 공사 중(done=false)은 반투명 (야전 시설 R26과 같은 표기)
    const st = Map3D.CITY_FAC_STYLE[type] ?? { geo: 'barn', col: 0x9a9a9a };
    const g = new THREE.Group();
    const op = { transparent: !done, opacity: done ? 1 : 0.55 };
    const wood = new THREE.MeshLambertMaterial({ color: 0xb9a47e, ...op });
    const stone = new THREE.MeshLambertMaterial({ color: 0x8d8d92, ...op });
    const accent = new THREE.MeshLambertMaterial({ color: st.col, ...op });
    const box = (w, h, d, x, y, z, mt = wood) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mt); b.position.set(x, y, z); g.add(b); return b; };
    if (st.geo === 'market') { box(0.7, 0.3, 0.7, 0, 0.15, 0); box(0.85, 0.08, 0.85, 0, 0.42, 0, accent); box(0.08, 0.2, 0.08, -0.3, 0.3, -0.3); box(0.08, 0.2, 0.08, 0.3, 0.3, 0.3); }
    else if (st.geo === 'farm') { box(0.95, 0.07, 0.95, 0, 0.035, 0, new THREE.MeshLambertMaterial({ color: 0x5a8a3a, ...op })); box(0.9, 0.06, 0.12, 0, 0.1, -0.3, accent); box(0.9, 0.06, 0.12, 0, 0.1, 0, accent); box(0.9, 0.06, 0.12, 0, 0.1, 0.3, accent); }
    else if (st.geo === 'barn') { box(0.6, 0.45, 0.6, 0, 0.22, 0); box(0.78, 0.22, 0.78, 0, 0.56, 0, accent); }
    else if (st.geo === 'barracks') { box(0.8, 0.3, 0.5, 0, 0.15, 0); box(0.06, 0.8, 0.06, 0.3, 0.4, 0.18); box(0.35, 0.2, 0.04, 0.5, 0.7, 0.18, accent); }
    else if (st.geo === 'smith') { box(0.55, 0.4, 0.55, 0, 0.2, 0); const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.55, 6), accent); ch.position.set(0.18, 0.55, -0.18); g.add(ch); box(0.3, 0.12, 0.2, -0.25, 0.46, 0.15, stone); }
    else if (st.geo === 'stable') { box(0.9, 0.18, 0.06, 0, 0.09, -0.45); box(0.9, 0.18, 0.06, 0, 0.09, 0.45); box(0.06, 0.18, 0.9, -0.45, 0.09, 0); box(0.06, 0.18, 0.9, 0.45, 0.09, 0); box(0.5, 0.16, 0.4, 0, 0.3, 0, accent); }
    else if (st.geo === 'dock') { box(1.1, 0.12, 0.5, 0, 0.06, 0); box(0.6, 0.18, 0.26, 0, 0.2, 0, accent); box(0.06, 0.4, 0.06, 0.2, 0.3, 0); }
    else { const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.8, 8), stone); tw.position.y = 0.4; g.add(tw); box(0.4, 0.25, 0.04, 0.2, 0.85, 0, accent); box(0.05, 0.3, 0.05, 0, 0.95, 0); }
    // R141: 합병 레벨을 모델 위 금색 표식 2/3개로 구분(기본 Lv1은 추가 표식 없음).
    if (level > 1) for (let i = 0; i < Math.min(3, level); i++) box(0.12, 0.12, 0.12, (i - (level - 1) / 2) * 0.19, 1.25, 0, new THREE.MeshLambertMaterial({ color: 0xe3bd58, ...op }));
    g.userData.facilityLevel = level;
    return g;
  }
  syncCityFacs(list) { // R139: 모든 도시/야전 시설의 배치 의존성을 함께 무효화
    this.cityFacMeshes = this.cityFacMeshes ?? {};
    const centers = this.cityList.map(c => { const [x, z] = toWorld(c.lon, c.lat); return { x, z }; });
    const fields = Object.values(this.fieldMeshes ?? {}).map(f => ({ x: f.g.position.x, z: f.g.position.z, fr: f.fr }));
    const sig = JSON.stringify([list, centers, fields]);
    if (this._cityFacLayoutSig === sig) return;
    this._cityFacLayoutSig = sig;
    for (const e of Object.values(this.cityFacMeshes)) for (const m of e.meshes) this.unitGroup.remove(m);
    this.cityFacMeshes = {};
    const layout = layoutCityFacilities(list, centers, fields, (x, z) => this.levelAtWorld(x, z));
    for (const f of layout) {
      let m;
      if (f.summary) {
        // 좁은 지형에서는 건물이 아닌 도시 상단 색 표식. 종류/공사 상태는 도시 상세에 보존.
        m = new THREE.Group();
        const count = layout.filter(x => x.cityId === f.cityId && x.summary).indexOf(f);
        const badge = this.makeLabel('성내: ' + f.type + ((f.level ?? 1) > 1 ? ' Lv' + f.level : '') + (f.done ? '' : ' 공사'), 0.4);
        badge.position.set(0, 5 + count * 0.75, 0); badge.userData.summaryDetail = true; m.add(badge);
        if (count === 0) {
          const total = layout.filter(x => x.cityId === f.cityId && x.summary).length;
          const compact = this.makeLabel('성내 ' + total, 0.32); compact.position.y = 5;
          compact.userData.summaryCompact = true; m.add(compact);
        }
        m.position.set(f.x, 0, f.z);
      } else {
        m = this._cityFacModel(f.type, f.done, f.level ?? 1); m.scale.setScalar(f.scale);
        m.position.set(f.x, Math.max(this.levelAtWorld(f.x, f.z) * STEP, WATER_Y + 0.2), f.z);
      }
      m.userData.cityFacility = { ...f };
      this.unitGroup.add(m);
      (this.cityFacMeshes[f.cityId] ??= { meshes: [], sig }).meshes.push(m);
    }
  }
  removeUnit(id) { const m = this.unitMeshes[id]; if (m) { this.unitGroup.remove(m.group); delete this.unitMeshes[id]; } }

  pick(nx, ny, preferTarget = false) {
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    // 부대 우선: 광선이 부대 중심(몸통/기치 높이) 1.3 유닛 이내를 지나면 도시보다 부대를 선택
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
    if (!preferTarget && bestU != null) return { type: 'unit', id: bestU };
    // 도시: 광선-메쉬 교차 대신 화면공간 근접 — 성채 메쉬가 겹치는 각도에서 앞 도시가 뒤 도시를 가리는 오선택 방지 (자체 수치)
    let bestC = null, bestCd = 0.06; // NDC 거리 임계 (~40px)
    const pv = new THREE.Vector3();
    for (const id of Object.keys(this.cityMeshes)) {
      const g = this.cityMeshes[id].group;
      pv.set(g.position.x, g.position.y + 1.2, g.position.z).project(this.camera);
      if (pv.z > 1) continue;
      const d = Math.hypot(pv.x - nx, pv.y - ny);
      if (d < bestCd) { bestCd = d; bestC = Number(id); }
    }
    let bestF = null, bestFd = Infinity; // R71: 야전 시설도 화면공간 근접 피킹
    const pv2 = new THREE.Vector3();
    for (const id of Object.keys(this.fieldMeshes ?? {})) {
      const g2 = this.fieldMeshes[id].g;
      pv.set(g2.position.x, g2.position.y + 0.8, g2.position.z).project(this.camera);
      if (pv.z > 1) continue;
      // R89: 풋프린트 반경을 투영해 픽 영역을 시각 크기에 비례시킴 (최소 0.022·최대 0.05 NDC) — 기존 고정 0.06은 빈 공간 오선택 유발
      pv2.set(g2.position.x + (this.fieldMeshes[id].fr ?? 0.7), g2.position.y + 0.8, g2.position.z).project(this.camera);
      const frad = Math.max(0.022, Math.min(0.05, Math.abs(pv2.x - pv.x)));
      const d = Math.hypot(pv.x - nx, pv.y - ny);
      if (d < frad && d < bestFd) { bestFd = d; bestF = Number(id); }
    }
    const tgt = bestF != null && (bestC == null || bestFd <= bestCd) ? { type: 'fac', id: bestF } : bestC != null ? { type: 'city', id: bestC } : null;
    if (tgt) return tgt;
    return bestU != null ? { type: 'unit', id: bestU } : null; // preferTarget(R72b): 명령 모드에서 목표 우선 — 시설 위 수비 부대에 가려 명령 불가하던 문제
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
    // R140: 원거리에서 시설명 묶음이 도시/부대 라벨을 가리지 않게 줌별 요약.
    for (const e of Object.values(this.cityFacMeshes ?? {})) for (const m of e.meshes) {
      if (!m.userData.cityFacility?.summary) continue;
      for (const ch of m.children) {
        if (ch.userData.summaryDetail) ch.visible = this.view <= 32;
        if (ch.userData.summaryCompact) ch.visible = this.view > 32 && this.view <= 55;
      }
    }
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
// end of map3d
