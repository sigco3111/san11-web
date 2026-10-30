// ==== map3d.js ====
// 3D 저폴리 지도 엔진 (Three.js)
import * as THREE from 'three';

const LON0 = 100, LON1 = 126.5, LAT0 = 21.5, LAT1 = 43;
function toWorld(lon, lat) {
  const x = (lon - (LON0+LON1)/2) * 2.4;
  const z = -((lat - (LAT0+LAT1)/2)) * 2.9;
  return [x, z];
}

// 대략적인 중국 윤곽 (lon,lat)
const OUTLINE = [
[101,28],[101.5,31],[103,33.5],[104,36],[105.5,37.5],[107,39],[109,40.2],[111,40.8],[114,41.2],[117,41.2],[120,41.8],[123,42.3],[125.5,41.5],[125,40.3],[124,39.7],[122.5,38.7],[121.5,38.8],[119,38.3],[117.8,38.5],[117.5,37.7],[118.5,37.3],[119.5,36.8],[120.8,36.5],[121,35.3],[120.2,34.4],[120.3,33],[120.8,31.8],[121.6,31.1],[121.6,29.8],[120.8,28.3],[119.8,27],[118.7,25.8],[117.5,24.6],[115.8,23.3],[113.8,22.6],[111.5,21.9],[109.8,21.8],[108.2,22.3],[106.5,23.2],[104.5,23.8],[102.5,24.8],[101.2,26.2]];
const RIVERS = [
  // 황하
  [[102.5,36.5],[105,36.8],[106.5,38.5],[108.5,40.1],[110.5,40.1],[111.8,39.2],[112.3,37.8],[111.3,36],[110.6,34.7],[111.8,34.6],[113.5,34.9],[115,35.4],[116.5,36.6],[118,37.4],[118.9,37.7]],
  // 장강
  [[104.1,28.8],[105.5,29.2],[106.6,29.6],[107.8,30.3],[109.3,31],[110.5,30.8],[111.5,30.2],[112.6,29.9],[114.3,30.5],[115.8,29.7],[117,30.6],[118.2,31.4],[119.3,32.1],[120.6,32.1],[121.4,31.5]],
  // 남쪽 강 (시xiang)
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
function hash(x, z) { const s = Math.sin(x*127.1+z*311.7)*43758.5453; return s - Math.floor(s); }
function noise(x, z) { return hash(Math.floor(x*3.1), Math.floor(z*3.1))*0.6 + hash(Math.floor(x*7.7), Math.floor(z*7.7))*0.4; }

class Map3D {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1a26);
    this.scene.fog = new THREE.Fog(0x0d1a26, 90, 220);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    this.camTarget = new THREE.Vector3(8, 0, 2);
    this.camAngle = 0.5; this.camDist = 55; this.camTilt = 0.86;
    this.scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x3a2f1a, 0.9));
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.4); sun.position.set(40, 60, 20); this.scene.add(sun);
    this.cityGroup = new THREE.Group(); this.unitGroup = new THREE.Group();
    this.scene.add(this.cityGroup, this.unitGroup);
    this.raycaster = new THREE.Raycaster();
    this.buildTerrain(); this.buildRivers();
    this.bindInput(canvas);
    this.resize(); addEventListener('resize', () => this.resize());
    this.cityMeshes = {}; this.unitMeshes = {};
  }
  buildTerrain() {
    const W = 132, H = 108;
    const geo = new THREE.PlaneGeometry((LON1-LON0)*2.4, (LAT1-LAT0)*2.9, W, H);
    geo.rotateX(-Math.PI/2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count*3);
    const cPlain = new THREE.Color(0x6d8f4e), cLush = new THREE.Color(0x4d7a41), cDry = new THREE.Color(0x9a8f5a),
          cMtn = new THREE.Color(0x7a6a55), cSnow = new THREE.Color(0x8a8070), cSea = new THREE.Color(0x14405e);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const lon = x/2.4 + (LON0+LON1)/2, lat = -z/2.9 + (LAT0+LAT1)/2;
      let h = 0; const c = new THREE.Color();
      if (!inOutline(lon, lat)) { h = -1.2; c.copy(cSea); }
      else {
        h = 0.25;
        for (const [mlon,mlat,r,mh] of MOUNTAINS) {
          const d = Math.hypot(lon-mlon, lat-mlat);
          if (d < r) h += mh * (1 - d/r) * (0.7 + noise(lon,lat)*0.6);
        }
        h += noise(lon*0.7, lat*0.7) * 0.35;
        if (h > 1.6) c.copy(cSnow); else if (h > 0.8) c.copy(cMtn);
        else if (lat > 34.5) c.copy(cDry).lerp(cPlain, noise(lon,lat)); else c.copy(cLush).lerp(cPlain, noise(lon,lat)*0.7);
      }
      pos.setY(i, h);
      colors[i*3] = c.r; colors[i*3+1] = c.g; colors[i*3+2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.terrain = new THREE.Mesh(geo, mat);
    this.scene.add(this.terrain);
  }
  buildRivers() {
    const mat = new THREE.MeshBasicMaterial({ color: 0x3a7ca8 });
    for (const line of RIVERS) {
      const pts = line.map(([lon,lat]) => { const [x,z] = toWorld(lon,lat); return new THREE.Vector3(x, 0.35, z); });
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, 40, 0.22, 5, false);
      this.scene.add(new THREE.Mesh(geo, mat));
    }
  }
  makeLabel(text, scale=1) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    const ctx = cv.getContext('2d');
    ctx.font = 'bold 40px "Noto Serif KR", serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.lineWidth = 7; ctx.strokeText(text, 128, 32);
    ctx.fillStyle = '#fff'; ctx.fillText(text, 128, 32);
    const tex = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sp.scale.set(6*scale, 1.5*scale, 1);
    return sp;
  }
  addCity(city, colorHex) {
    const [x, z] = toWorld(city.lon, city.lat);
    const g = new THREE.Group();
    const color = new THREE.Color(colorHex);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 0.5, 6), new THREE.MeshLambertMaterial({ color: 0x9a8a70, flatShading: true }));
    base.position.y = 0.45; g.add(base);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 2.4), new THREE.MeshLambertMaterial({ color: 0xb0a080, flatShading: true }));
    wall.position.y = 1.1; g.add(wall);
    const keep = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.6, 4), new THREE.MeshLambertMaterial({ color: 0x8a5a3a, flatShading: true }));
    keep.position.y = 2.2; keep.rotation.y = Math.PI/4; g.add(keep);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.05), new THREE.MeshBasicMaterial({ color }));
    flag.position.set(0.7, 3.1, 0); g.add(flag);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2), new THREE.MeshBasicMaterial({ color: 0xdddddd }));
    pole.position.set(0.2, 2.6, 0); g.add(pole);
    const label = this.makeLabel(city.name_ko); label.position.y = 4.4; g.add(label);
    g.position.set(x, 0.2, z);
    g.userData.cityId = city.id;
    base.userData.cityId = city.id; wall.userData.cityId = city.id; keep.userData.cityId = city.id;
    this.cityGroup.add(g);
    this.cityMeshes[city.id] = { group: g, flag, base, wall, keep };
  }
  setCityColor(cityId, colorHex) {
    const m = this.cityMeshes[cityId]; if (m) m.flag.material.color.set(colorHex);
  }
  addUnit(unit, colorHex) {
    const g = new THREE.Group();
    const color = new THREE.Color(colorHex);
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.2, 5), new THREE.MeshLambertMaterial({ color: 0x5a4a3a, flatShading: true }));
    body.position.y = 0.8; g.add(body);
    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.05), new THREE.MeshBasicMaterial({ color }));
    banner.position.set(0.45, 1.7, 0); g.add(banner);
    const label = this.makeLabel(unit.label, 0.7); label.position.y = 2.6; g.add(label);
    g.position.set(unit.x, 0.3, unit.z);
    g.userData.unitId = unit.id; body.userData.unitId = unit.id;
    this.unitGroup.add(g);
    this.unitMeshes[unit.id] = { group: g, banner };
  }
  updateUnit(unit, colorHex) {
    const m = this.unitMeshes[unit.id]; if (!m) return;
    m.group.position.set(unit.x, 0.3, unit.z);
    if (colorHex) m.banner.material.color.set(colorHex);
  }
  removeUnit(id) { const m = this.unitMeshes[id]; if (m) { this.unitGroup.remove(m.group); delete this.unitMeshes[id]; } }
  pick(nx, ny) {
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const hits = this.raycaster.intersectObjects([this.cityGroup, this.unitGroup], true);
    for (const h of hits) {
      let o = h.object;
      if (o.userData.cityId !== undefined) return { type: 'city', id: o.userData.cityId };
      if (o.userData.unitId !== undefined) return { type: 'unit', id: o.userData.unitId };
    }
    return null;
  }
  bindInput(el) {
    let dragging = false, px = 0, py = 0, moved = 0; let pinch = 0;
    el.addEventListener('pointerdown', e => { dragging = true; px = e.clientX; py = e.clientY; moved = 0; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - px, dy = e.clientY - py; moved += Math.abs(dx)+Math.abs(dy);
      if (e.shiftKey || e.buttons === 2) { // pan
        const s = this.camDist/600;
        const fwd = new THREE.Vector3(); this.camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
        const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0,1,0));
        this.camTarget.addScaledVector(right, -dx*s).addScaledVector(fwd, dy*s);
      } else { this.camAngle -= dx*0.005; this.camTilt = Math.min(1.45, Math.max(0.35, this.camTilt + dy*0.004)); }
      px = e.clientX; py = e.clientY;
    });
    el.addEventListener('pointerup', e => {
      dragging = false;
      if (moved < 6 && this.onPick) {
        const r = el.getBoundingClientRect();
        this.onPick(((e.clientX-r.left)/r.width)*2-1, -(((e.clientY-r.top)/r.height)*2-1));
      }
    });
    el.addEventListener('wheel', e => { e.preventDefault(); this.camDist = Math.min(130, Math.max(12, this.camDist * (1 + e.deltaY*0.001))); }, { passive: false });
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('touchstart', e => { if (e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY); }, { passive: true });
    el.addEventListener('touchmove', e => {
      if (e.touches.length === 2 && pinch > 0) {
        const d = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
        this.camDist = Math.min(130, Math.max(12, this.camDist * pinch / d)); pinch = d;
      }
    }, { passive: true });
  }
  focusCity(city) { const [x,z] = toWorld(city.lon, city.lat); this.camTarget.set(x, 0, z); this.camDist = 30; }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w/h; this.camera.updateProjectionMatrix();
  }
  render() {
    const { camAngle, camTilt, camDist } = this;
    this.camera.position.set(
      this.camTarget.x + Math.sin(camAngle)*Math.cos(camTilt)*camDist,
      this.camTarget.y + Math.sin(camTilt)*camDist,
      this.camTarget.z + Math.cos(camAngle)*Math.cos(camTilt)*camDist);
    this.camera.lookAt(this.camTarget);
    this.renderer.render(this.scene, this.camera);
  }
}

;
// ==== game.js ====
// 게임 상태·턴 엔진 (삼국지11 기본 구조의 단순화 1차 구현)
const SAVE_KEY = 'cheonha-xi-web.save.v1';
const FORCE_COLORS = ['#4a7fd4','#d44a4a','#4ad47f','#d4a44a','#9a4ad4','#4ad4d4','#d44a8f','#8fd44a','#d47f4a','#6a6ad4','#d4d44a','#4a9a6a','#c46a4a','#7a4a2a','#2a7a8a','#8a2a4a','#5a8a2a','#aa6aaa','#4a5a9a','#9a8a3a','#3a7a4a','#b45a7a','#6aaac4','#c48a3a','#7a3a9a','#3a9a8a','#aa4a3a','#5a7a2a','#8a6aaa','#4a8aaa','#ca7a5a','#3a6a3a','#9a4a6a','#6a8a4a','#4a4aaa','#aa9a3a','#3a8a6a','#b46a8a','#5a9aca'];
function forceColor(fid) { return FORCE_COLORS[fid % FORCE_COLORS.length]; }

const UNIT_TYPES = {
  sword: { name: '검병', atk: 0.7, def: 0.8, move: 1.0, cost: {} },
  spear: { name: '창병', atk: 1.0, def: 1.0, move: 1.0, cost: { spears: 1 } },
  pike:  { name: '극병', atk: 0.9, def: 1.2, move: 1.0, cost: { pikes: 1 } },
  bow:   { name: '노병', atk: 0.8, def: 0.7, move: 1.0, cost: { bows: 1 } },
  cav:   { name: '기병', atk: 1.2, def: 0.9, move: 1.6, cost: { horses: 1 } },
};

class Game {
  constructor(scen, officers, skills, playerForceId) {
    this.officers = officers; // by idx
    this.skills = skills;
    this.scenId = scen.id;
    this.year = scen.year; this.month = scen.month; this.dan = 1; // 1~3 (旬)
    this.turn = 1;
    this.cities = scen.cities.map(c => ({ ...c, commerce: Math.round(c.revenue/10), farm: Math.round(c.harvest/100), hp: c.maxhp, officers: [], troops: c.troops }));
    this.cityById = {}; this.cities.forEach(c => this.cityById[c.id] = c);
    this.forces = {};
    for (const f of scen.forces) this.forces[f.id] = { id: f.id, ruler: f.ruler, alive: true, ap: 60 };
    for (const o of scen.officers) {
      const rec = { idx: o.idx, status: o.status, force: o.force ?? null, city: o.city ?? null, loyal: o.loyal };
      this.officers[o.idx].state = rec;
      if ((o.status === 'ruler' || o.status === 'taesu' || o.status === 'serving') && o.city != null && this.cityById[o.city]) this.cityById[o.city].officers.push(o.idx);
    }
    this.units = []; this.nextUnitId = 1;
    this.playerForce = playerForceId;
    this.delegated = false;   // 플레이어 세력 위임 여부
    this.pendingJoin = null;  // 턴 경계에서 인계할 세력
    this.logs = [];
    this.over = false;
  }
  log(msg, mine=false) { this.logs.push({ t: `${this.year}년 ${this.month}월`, msg, mine }); if (this.logs.length > 200) this.logs.shift(); }
  forceName(fid) { return this.officers[this.forces[fid].ruler].name_ko + '군'; }
  forceCities(fid) { return this.cities.filter(c => c.force === fid); }
  forceOfficers(fid) { return Object.values(this.officers).filter(o => o.state && o.state.force === fid); }
  aliveForces() { return Object.values(this.forces).filter(f => f.alive); }
  totalGold(fid) { return this.forceCities(fid).reduce((s,c) => s + c.gold, 0); }
  totalFood(fid) { return this.forceCities(fid).reduce((s,c) => s + c.food, 0); }

  // === 명령 (행동력 소비) ===
  canUse(fid, ap) { return this.forces[fid].ap >= ap; }
  develop(cityId, kind) { // kind: 'commerce' | 'farm', 비용 금 300, AP 30
    const c = this.cityById[cityId], f = this.forces[c.force];
    if (c.gold < 300 || f.ap < 30 || c[kind] >= 100) return false;
    const best = Math.max(50, ...c.officers.map(i => this.officers[i].pol));
    c.gold -= 300; f.ap -= 30;
    const gain = Math.round(4 + best/20);
    c[kind] = Math.min(100, c[kind] + gain);
    this.log(`${c.name_ko} ${kind==='commerce'?'상업':'농업'} 개발 +${gain} (담당 정치 ${best})`, c.force === this.playerForce);
    return true;
  }
  recruit(cityId) { // 금 200 + 병량 1000 → 병사, AP 30
    const c = this.cityById[cityId], f = this.forces[c.force];
    if (c.gold < 200 || c.food < 1000 || f.ap < 30) return false;
    const best = Math.max(50, ...c.officers.map(i => this.officers[i].chr));
    const n = Math.round(1500 + best*30);
    c.gold -= 200; c.food -= 1000; f.ap -= 30;
    const cap = c.metropolis ? 150000 : 100000;
    c.troops = Math.min(cap, c.troops + n);
    this.log(`${c.name_ko} 징병 +${n} (담당 매력 ${best})`, c.force === this.playerForce);
    return true;
  }
  moveOfficers(fromCity, toCity, idxs) {
    const a = this.cityById[fromCity], b = this.cityById[toCity], f = this.forces[a.force];
    if (f.ap < 20) return false;
    f.ap -= 20;
    a.officers = a.officers.filter(i => !idxs.includes(i));
    for (const i of idxs) { b.officers.push(i); this.officers[i].state.city = toCity; }
    this.log(`${a.name_ko} → ${b.name_ko} 무장 ${idxs.length}명 이동`, a.force === this.playerForce);
    return true;
  }
  dispatch(cityId, officerIdxs, troops, type) { // 부대 출진, AP 40
    const c = this.cityById[cityId], f = this.forces[c.force];
    if (f.ap < 40 || c.troops < troops || officerIdxs.length === 0) return false;
    const ut = UNIT_TYPES[type];
    for (const [k, per] of Object.entries(ut.cost)) {
      const need = per * troops;
      if ((c[k] ?? 0) < need) return false;
    }
    for (const [k, per] of Object.entries(ut.cost)) c[k] -= per * troops;
    c.troops -= troops; f.ap -= 40;
    c.officers = c.officers.filter(i => !officerIdxs.includes(i));
    for (const i of officerIdxs) this.officers[i].state.city = null;
    const unit = { id: this.nextUnitId++, force: c.force, officers: officerIdxs, troops, type,
      x: c.lon, z: c.lat, path: [], tx: null, tz: null, targetCity: null, label: '' };
    unit.label = `${this.officers[officerIdxs[0]].name_ko} ${Math.round(troops/1000)}k`;
    this.units.push(unit);
    this.log(`${c.name_ko}에서 ${this.officers[officerIdxs[0]].name_ko}의 ${ut.name} ${troops} 출진`, c.force === this.playerForce);
    return unit;
  }
  orderUnit(unitId, targetCityId) {
    const u = this.units.find(u => u.id === unitId);
    const c = this.cityById[targetCityId];
    if (!u || !c) return;
    u.targetCity = targetCityId; u.tx = c.lon; u.tz = c.lat;
  }

  // === 턴 진행 ===
  endTurn(aiThink) {
    // 부대 이동·전투
    for (const u of [...this.units]) this.stepUnit(u);
    // 도시 공성 처리는 stepUnit 내부
    // 수입: 매 3순(한 달)
    if (this.dan === 3) {
      for (const c of this.cities) {
        if (c.force == null || !this.forces[c.force]?.alive) continue;
        c.gold += Math.round(50 + c.commerce * 8 * (c.metropolis ? 1.5 : 1));
        c.food += Math.round(300 + c.farm * 80);
        c.hp = Math.min(c.maxhp, c.hp + 200);
      }
    }
    // 신규 등장 무장
    for (const o of Object.values(this.officers)) {
      if (o.state && o.state.status === 'not_yet' && this.year >= o.avail) {
        o.state.status = 'free';
        if (o.state.city != null && this.cityById[o.state.city]) this.log(`${o.name_ko}이(가) ${this.cityById[o.state.city].name_ko}에 등장했습니다 (재야)`);
      }
    }
    // 세력 AP 회복·AI
    for (const f of Object.values(this.forces)) {
      if (!f.alive) continue;
      f.ap = Math.min(255, f.ap + 30);
      if (f.id !== this.playerForce || this.delegated) aiThink(this, f.id);
    }
    // 멸망 판정
    for (const f of Object.values(this.forces)) {
      if (!f.alive) continue;
      const hasCity = this.cities.some(c => c.force === f.id);
      const hasUnit = this.units.some(u => u.force === f.id);
      if (!hasCity && !hasUnit) {
        f.alive = false;
        this.log(`【${this.forceName(f.id)}】이(가) 멸망했습니다!`, true);
        for (const o of this.forceOfficers(f.id)) { o.state.force = null; o.state.status = 'free'; }
      }
    }
    // 시계
    this.dan++;
    if (this.dan > 3) { this.dan = 1; this.month++; if (this.month > 12) { this.month = 1; this.year++; } }
    this.turn++;
    // 세력 전환 인계 (턴 경계)
    if (this.pendingJoin != null && this.forces[this.pendingJoin]?.alive) {
      this.playerForce = this.pendingJoin; this.delegated = false; this.pendingJoin = null;
      this.log(`【${this.forceName(this.playerForce)}】에 참가하여 지휘를 시작합니다.`, true);
    }
    this.autosave();
  }
  stepUnit(u) {
    if (u.tx == null) return;
    const ut = UNIT_TYPES[u.type];
    const speed = 0.55 * ut.move;
    const dx = u.tx - u.x, dz = u.tz - u.z;
    const d = Math.hypot(dx, dz);
    if (d > 1.2) { u.x += dx/d*speed; u.z += dz/d*speed; return; }
    // 도착: 도시 처리
    const c = this.cityById[u.targetCity];
    if (!c) { u.tx = null; return; }
    if (c.force === u.force) { // 아군 도시 합류
      const cap = c.metropolis ? 150000 : 100000;
      c.troops = Math.min(cap, c.troops + u.troops);
      for (const i of u.officers) { c.officers.push(i); this.officers[i].state.city = c.id; }
      this.units = this.units.filter(x => x !== u);
      return;
    }
    // 공성: 도시 내구/병사 공격
    const lead = this.officers[u.officers[0]];
    const dmg = Math.round(u.troops * 0.12 * ut.atk * (0.7 + lead.war/150));
    const loss = Math.round(c.troops * 0.06 / ut.def + 150);
    c.troops = Math.max(0, c.troops - dmg);
    c.hp = Math.max(0, c.hp - Math.round(dmg*0.5));
    u.troops = Math.max(0, u.troops - loss);
    this.log(`${u.label}이(가) ${c.name_ko}을(를) 공격 (적병 -${dmg}, 아군 -${loss})`, u.force === this.playerForce);
    if (u.troops <= 0) { this.units = this.units.filter(x => x !== u); this.log(`${u.label} 부대가 전멸했습니다`, false); return; }
    if (c.troops <= 0 || c.hp <= 0) {
      const old = c.force;
      c.force = u.force; c.district = null;
      c.hp = Math.round(c.maxhp * 0.4);
      this.log(`【${c.name_ko}】함락! ${old != null ? this.forceName(old) : '공백지'} → ${this.forceName(u.force)}`, true);
      // 수비 무장 일부 포로/퇴각은 후속 구현 — 일단 공격측 도시에 그대로 둠
      u.tx = null; u.targetCity = null;
    }
  }
  autosave() {
    try {
      const data = {
        scenId: this.scenId, year: this.year, month: this.month, dan: this.dan, turn: this.turn,
        cities: this.cities, forces: this.forces, units: this.units, nextUnitId: this.nextUnitId,
        playerForce: this.playerForce, delegated: this.delegated, logs: this.logs.slice(-60),
        officerStates: Object.fromEntries(Object.entries(this.officers).filter(([,o]) => o.state).map(([i,o]) => [i, o.state])),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) { /* 용량 초과 등 무시 */ }
  }
}
function josa(name, pair) { // [을,를] 형태
  const code = name.charCodeAt(name.length-1);
  const jong = (code >= 0xAC00 && code <= 0xD7A3) ? (code-0xAC00)%28 : 0;
  return name + (jong ? pair[0] : pair[1]);
}

;
// ==== ai.js ====
// 세력 AI — 위임 시 플레이어 세력도 이 AI가 운영 (위임·샌드박스의 실질 주체)
function aiThink(game, fid) {
  const f = game.forces[fid];
  if (!f || !f.alive) return;
  const cities = game.forceCities(fid);
  if (cities.length === 0) return;
  // 1) 내정: 여유 금이 있으면 개발
  for (const c of cities) {
    if (f.ap < 30) break;
    if (c.gold > 1200) {
      game.develop(c.id, c.commerce <= c.farm ? 'commerce' : 'farm');
    }
  }
  // 2) 징병: 병력이 적은 도시
  for (const c of cities) {
    if (f.ap < 30) break;
    const avgNbr = cities.reduce((s,x) => s + x.troops, 0) / cities.length;
    if (c.troops < Math.min(avgNbr, 12000) && c.gold > 500 && c.food > 3000) game.recruit(c.id);
  }
  // 3) 군사: 전방 도시(적과 인접) 병력이 충분하면 공격, 아니면 집결
  const enemyCities = game.cities.filter(c => c.force !== fid);
  for (const c of cities) {
    if (f.ap < 40) break;
    if (c.officers.length === 0) continue;
    // 가장 가까운 적 도시
    let best = null, bd = 1e9;
    for (const e of enemyCities) {
      const d = Math.hypot(e.lon - c.lon, e.lat - c.lat);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) continue;
    const threatened = game.units.some(u => u.force !== fid && u.targetCity === c.id);
    const threshold = Math.max(best.troops * 1.5, 6000);
    if ((c.troops > threshold && bd < 12) || (threatened && c.troops > 4000)) {
      // 출진
      const n = Math.min(c.troops - 3000, Math.round(best.troops * 1.6) + 3000);
      if (n >= 3000) {
        const offs = [...c.officers].sort((a,b) => game.officers[b].war - game.officers[a].war);
        const pick = offs.slice(0, Math.min(2, offs.length - 1 || 1));
        if (pick.length > 0) {
          let type = 'sword';
          if (c.spears >= n) type = 'spear'; else if (c.horses >= n) type = 'cav'; else if (c.pikes >= n) type = 'pike'; else if (c.bows >= n) type = 'bow';
          const u = game.dispatch(c.id, pick, n, type);
          if (u) game.orderUnit(u.id, best.id);
        }
      }
    }
  }
  // 4) 목표 없는 야전 부대 재지정: 인접 적 도시가 약하면 공격, 아니면 귀환
  for (const u of game.units) {
    if (u.force !== fid || u.targetCity != null) continue;
    const foes = game.cities.filter(c => c.force !== fid && (c.force == null || game.forces[c.force]?.alive));
    let best = null, bd = 1e9;
    for (const e of foes) { const d = Math.hypot(e.lon - u.x, e.lat - u.z); if (d < bd) { bd = d; best = e; } }
    const homes = cities.slice().sort((a,b) => Math.hypot(a.lon-u.x,a.lat-u.z) - Math.hypot(b.lon-u.x,b.lat-u.z));
    if (best && bd < 10 && u.troops > Math.max(best.troops * 1.2, 4000)) game.orderUnit(u.id, best.id);
    else if (homes.length) game.orderUnit(u.id, homes[0].id);  // 귀환·합류
  }
}

;
// ==== main.js ====
// 진입점: 화면 전환·UI·지도 연결

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
function portraitCss(idx) {  // 아틀라스 배경 스타일 (sheet 8x8 타일)
  const m = DATA.portraits.map[String(idx)];
  if (!m) return `background-image:url('portraits/placeholder.svg');background-size:cover;`;
  const [sh, c, r] = m, n = DATA.portraits.cols - 1;
  return `background-image:url('portraits-atlas/sheet-${sh}.jpg');background-size:${DATA.portraits.cols*100}% ${DATA.portraits.cols*100}%;background-position:${c/n*100}% ${r/n*100}%;`;
}
function skillKo(k) { return k || '없음'; }  // 특기는 자체 한글 명칭, 설명은 data/skills.json

// === 화면 전환 ===
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

// === 게임 시작 ===
function startGame(scenId, fid) {
  game = new Game(DATA.scenarios[scenId], DATA.officers, DATA.skills, fid);
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
    map.onPick = onPick;
    (function loop() { map.render(); requestAnimationFrame(loop); })();
  }
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
  $('hud-force').textContent = game.playerForce != null && f?.alive ? `【${game.forceName(game.playerForce)}】${game.delegated ? ' (위임 중)' : ''}` : '관전 중';
  $('hud-ap').textContent = f?.alive ? `행동력 ${f.ap}` : '';
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

// === 턴·자동 진행 ===
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
  if (f && !f.alive) {
    const others = game.aliveForces();
    if (others.length === 0) { endModal('천하가 정리되었습니다.'); return; }
    modal(`【${game.forceName(f.id)}】이(가) 멸망했습니다.`, [
      ['다른 세력으로 계속', () => { game.delegated = true; refreshHud(); setAuto(true); }],
      ['관전만 계속', () => { game.delegated = true; refreshHud(); setAuto(true); }],
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

// === 선택·패널 ===
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
function officerRow(idx) {
  const o = DATA.officers[idx];
  return `<div class="officer"><span class="pimg" style="${portraitCss(idx)}"></span><div><div class="nm">${o.name_ko} <span class="st">${o.name_zh}</span></div><div class="st">통${o.ldr} 무${o.war} 지${o.int} 정${o.pol} 매${o.chr} · ${skillKo(o.skill)} · 충성 ${o.state?.loyal ?? '-'}</div></div></div>`;
}
function showCityPanel(c) {
  const p = $('panel'); p.classList.remove('hidden');
  const mine = c.force === game.playerForce && !game.delegated;
  const owner = c.force != null && game.forces[c.force]?.alive ? game.forceName(c.force) : '공백지';
  let html = `<h3>${c.name_ko} <small>(${c.name_zh})</small></h3>
    <p>소속: ${owner} · 태수: ${c.taesu != null ? DATA.officers[c.taesu].name_ko : '-'}<br>
    병사 ${c.troops.toLocaleString()} · 내구 ${c.hp}/${c.maxhp}<br>
    금 ${c.gold.toLocaleString()} · 병량 ${c.food.toLocaleString()}<br>
    상업 ${c.commerce} · 농업 ${c.farm}${c.metropolis ? ' · 대도시' : ''}${c.specialty.length ? ' · 특색: '+c.specialty.join(',') : ''}<br>
    병장: 창${c.spears} 극${c.pikes} 노${c.bows} 군마${c.horses}</p>`;
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
    </div>`;
  }
  html += `<h3 style="margin-top:10px">주둔 무장 (${c.officers.length})</h3>`;
  html += c.officers.map(officerRow).join('') || '<p>무장 없음</p>';
  const free = Object.values(DATA.officers).filter(o => o.state?.status === 'free' && o.state.city === c.id);
  if (free.length) html += `<h3 style="margin-top:10px">재야 무장 (${free.length})</h3>` + free.map(o => officerRow(o.idx)).join('');
  p.innerHTML = html;
  if (mine) {
    $('cmd-dev-c').onclick = () => { game.develop(c.id, 'commerce'); refreshAll(); showCityPanel(c); };
    $('cmd-dev-f').onclick = () => { game.develop(c.id, 'farm'); refreshAll(); showCityPanel(c); };
    $('cmd-recruit').onclick = () => { game.recruit(c.id); refreshAll(); showCityPanel(c); };
    $('cmd-dispatch').onclick = () => showDispatch(c);
    $('cmd-move').onclick = () => showMove(c);
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
    <p>병종: <select id="dsp-type">${Object.entries(UNIT_TYPES).map(([k,v]) => `<option value="${k}">${v.name}</option>`).join('')}</select></p>
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
    부장: ${u.officers.map(i => DATA.officers[i].name_ko).join(', ')}</p>
    ${mine ? '<p style="color:#ffd700">목표 도시를 클릭하면 이동 명령을 내립니다.</p>' : ''}
    <p><button class="cmd" id="up-close">닫기</button></p>`;
  $('up-close').onclick = () => { $('panel').classList.add('hidden'); selectedUnit = null; };
}

// === 부트 ===
async function boot() {
  await loadData();
  $('btn-new').onclick = () => { buildScenarioScreen(); show('screen-scenario'); };
  document.querySelectorAll('.back').forEach(b => b.onclick = () => show('screen-title'));
  if (localStorage.getItem(SAVE_KEY)) {
    $('btn-continue').disabled = false;
    $('btn-continue').onclick = () => {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY));
      const g = new Game(DATA.scenarios[d.scenId], DATA.officers, DATA.skills, d.playerForce);
      Object.assign(g, { year: d.year, month: d.month, dan: d.dan, turn: d.turn, cities: d.cities, forces: d.forces, units: d.units, nextUnitId: d.nextUnitId, playerForce: d.playerForce, delegated: d.delegated, logs: d.logs });
      g.cityById = {}; g.cities.forEach(c => g.cityById[c.id] = c);
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
  $('btn-menu').onclick = () => modal('메뉴', [
    ['저장하고 타이틀로', () => { game?.autosave(); location.reload(); }],
    ['타이틀로 (저장은 자동)', () => location.reload()],
    ['계속', () => {}],
  ]);
}
boot();
