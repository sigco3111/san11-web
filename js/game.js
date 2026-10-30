// 게임 상태·턴 엔진 (삼국지11 기본 구조의 단순화 1차 구현)
export const SAVE_KEY = 'cheonha-xi-web.save.v1';
export const FORCE_COLORS = ['#4a7fd4','#d44a4a','#4ad47f','#d4a44a','#9a4ad4','#4ad4d4','#d44a8f','#8fd44a','#d47f4a','#6a6ad4','#d4d44a','#4a9a6a','#c46a4a','#7a4a2a','#2a7a8a','#8a2a4a','#5a8a2a','#aa6aaa','#4a5a9a','#9a8a3a','#3a7a4a','#b45a7a','#6aaac4','#c48a3a','#7a3a9a','#3a9a8a','#aa4a3a','#5a7a2a','#8a6aaa','#4a8aaa','#ca7a5a','#3a6a3a','#9a4a6a','#6a8a4a','#4a4aaa','#aa9a3a','#3a8a6a','#b46a8a','#5a9aca'];
export function forceColor(fid) { return FORCE_COLORS[fid % FORCE_COLORS.length]; }

export const UNIT_TYPES = {
  sword: { name: '검병', atk: 0.7, def: 0.8, move: 1.0, cost: {} },
  spear: { name: '창병', atk: 1.0, def: 1.0, move: 1.0, cost: { spears: 1 } },
  pike:  { name: '극병', atk: 0.9, def: 1.2, move: 1.0, cost: { pikes: 1 } },
  bow:   { name: '노병', atk: 0.8, def: 0.7, move: 1.0, cost: { bows: 1 } },
  cav:   { name: '기병', atk: 1.2, def: 0.9, move: 1.6, cost: { horses: 1 } },
};

// === 전법·계략·기력 (자체 명명·자체 수치 — 원작 수치 미참조) ===
const APT_IDX = { spear: 0, pike: 1, bow: 2, cav: 3 }; // data apt 순서: 창 극 노 기 병기 수군 (검병은 적성 없음)
const APT_LV = g => ({ S: 3, A: 2, B: 1 })[g] ?? 0;
export const TACTICS = {
  sword: { name: '분전', qi: 20, mult: 1.5 },
  spear: { name: '창격', qi: 20, mult: 1.8 },
  pike:  { name: '철벽', qi: 20, mult: 1.3, guard: 0.5 },
  bow:   { name: '연사', qi: 20, mult: 1.6 },
  cav:   { name: '돌격', qi: 25, mult: 2.0 },
};
export const STRATS = {
  fire:    { name: '화계', qi: 30, minInt: 75 },            // 공격측: 수비 병력 추가 소각
  confuse: { name: '혼란', cooldown: 3, minInt: 80, turns: 2 }, // 수비측: 공격 부대 행동 정지
};

// === 기교 연구 (자체 수치) ===
export const TECH_BRANCHES = ['창병','극병','노병','기병','연병','발명','방위','화공'];
export const TECH_P = [1000, 2000, 3000, 5000];      // 단계별 필요 기교P
export const TECH_GOLD = [1000, 2000, 5000, 10000];  // 단계별 연구 비용 (금)
export const TECH_DESC = {
  '창병': '창병 부대 공격력 단계당 +5%', '극병': '극병 부대 공격력 단계당 +5%',
  '노병': '노병 부대 공격력 단계당 +5%', '기병': '기병 부대 공격력 단계당 +5%',
  '연병': '부대가 받는 피해 단계당 -3%', '발명': '공성(성 공격) 피해 단계당 +10%',
  '방위': '도시가 받는 피해 단계당 -5%', '화공': '화계 피해 단계당 +15%',
};
const TYPE2TECH = { spear: '창병', pike: '극병', bow: '노병', cav: '기병' };

export class Game {
  constructor(scen, officers, skills, playerForceId) {
    this.officers = officers; // by idx
    this.skills = skills;
    this.scenId = scen.id;
    this.year = scen.year; this.month = scen.month; this.dan = 1; // 1~3 (旬)
    this.turn = 1;
    this.cities = scen.cities.map(c => ({ ...c, commerce: Math.round(c.revenue/10), farm: Math.round(c.harvest/100), hp: c.maxhp, officers: [], troops: c.troops }));
    this.cityById = {}; this.cities.forEach(c => this.cityById[c.id] = c);
    this.forces = {};
    for (const f of scen.forces) this.forces[f.id] = { id: f.id, ruler: f.ruler, alive: true, ap: 60, techP: 0, techs: Object.fromEntries(TECH_BRANCHES.map(b => [b, 0])) };
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
  // === 특기·적성 보정 (자체 수치) ===
  unitHasSkill(u, sk) { return u.officers.some(i => this.officers[i]?.skill === sk); }
  cityHasSkill(c, sk) { return c.officers.some(i => this.officers[i]?.skill === sk); }
  aptMult(u) { // 병종 적성 공격 보정: C 0.9 / B 1.0 / A 1.1 / S 1.2
    if (u.type === 'sword') return 1;
    const lead = this.officers[u.officers[0]];
    return 0.9 + APT_LV(lead.apt?.[APT_IDX[u.type]]) * 0.1;
  }
  unitDmgMult(u, siege = false) { // 공격 특기 보정
    let m = 1;
    if (siege) { if (this.unitHasSkill(u, '파성')) m *= 1.2; return m; }
    if ((u.type === 'spear' || u.type === 'pike') && this.unitHasSkill(u, '파진')) m *= 1.15;
    if (u.type === 'bow' && this.unitHasSkill(u, '신궁')) m *= 1.15;
    if (u.type === 'cav' && this.unitHasSkill(u, '맹돌')) m *= 1.2;
    if (u.type !== 'bow' && this.unitHasSkill(u, '격전')) m *= 1.1;
    return m;
  }
  unitDefMult(u) { return this.unitHasSkill(u, '강직') ? 0.85 : 1; }
  // === 기교 (자체 수치) ===
  techLv(fid, b) { return this.forces[fid]?.techs?.[b] ?? 0; }
  unitTechAtk(u) { const b = TYPE2TECH[u.type]; return b ? 1 + 0.05 * this.techLv(u.force, b) : 1; }
  gainTechP(fid, n) { const f = this.forces[fid]; if (f?.alive) f.techP = (f.techP ?? 0) + n; }
  researchTech(fid, b) { // 기교P + 금 소비, 계통당 4단계
    const f = this.forces[fid];
    if (!f?.alive || !TECH_BRANCHES.includes(b)) return false;
    const lv = this.techLv(fid, b); if (lv >= 4) return false;
    const cap = this.forceCities(fid).sort((x, y) => y.gold - x.gold)[0];
    if ((f.techP ?? 0) < TECH_P[lv] || !cap || cap.gold < TECH_GOLD[lv]) return false;
    f.techP -= TECH_P[lv]; cap.gold -= TECH_GOLD[lv]; f.techs[b] = lv + 1;
    this.log(`【기교】${this.forceName(fid)} ${b} ${lv + 1}단계 연구 완료 (기교P ${TECH_P[lv]}·금 ${TECH_GOLD[lv]} 소비)`, fid === this.playerForce);
    return true;
  }
  develop(cityId, kind) { // kind: 'commerce' | 'farm', 비용 금 300, AP 30
    const c = this.cityById[cityId], f = this.forces[c.force];
    if (c.gold < 300 || f.ap < 30 || c[kind] >= 100) return false;
    const best = Math.max(50, ...c.officers.map(i => this.officers[i].pol));
    c.gold -= 300; f.ap -= 30;
    const gain = Math.round(4 + best/20);
    c[kind] = Math.min(100, c[kind] + gain);
    this.gainTechP(c.force, 25); // 커맨드 실행 기교P
    this.log(`${c.name_ko} ${kind==='commerce'?'상업':'농업'} 개발 +${gain} (담당 정치 ${best})`, c.force === this.playerForce);
    return true;
  }
  recruit(cityId) { // 금 200 + 병량 1000 → 병사, AP 30
    const c = this.cityById[cityId], f = this.forces[c.force];
    if (c.gold < 200 || c.food < 1000 || f.ap < 30) return false;
    const best = Math.max(50, ...c.officers.map(i => this.officers[i].chr));
    const n = Math.round((1500 + best*30) * (this.cityHasSkill(c, '명성') ? 1.3 : 1));
    c.gold -= 200; c.food -= 1000; f.ap -= 30;
    const cap = c.metropolis ? 150000 : 100000;
    c.troops = Math.min(cap, c.troops + n);
    this.gainTechP(c.force, 25); // 커맨드 실행 기교P
    this.log(`${c.name_ko} 징병 +${n} (담당 매력 ${best})`, c.force === this.playerForce);
    return true;
  }
  freeOfficers(cityId) { // 그 도시에 머무는 재야 무장
    return Object.values(this.officers).filter(o => o.state?.status === 'free' && o.state.city === cityId);
  }
  recruitChance(cityId, officerIdx) { // 등용 성공률 (자체 수치): 사자 매력·상대 매력·충성·군주 매력 반영
    const c = this.cityById[cityId], t = this.officers[officerIdx];
    if (!c || c.force == null || !this.forces[c.force]?.alive || !c.officers.length) return 0;
    if (!t?.state || t.state.status !== 'free' || t.state.city !== cityId) return 0;
    const envoy = Math.max(...c.officers.map(i => this.officers[i].chr));
    const ruler = this.officers[this.forces[c.force].ruler]?.chr ?? 50;
    const loyal = t.state.loyal ?? 70;
    return Math.max(0.1, Math.min(0.9, 0.45 + (envoy - t.chr)/200 + (ruler - 50)/500 - loyal/400 + (this.cityHasSkill(c, '등용') ? 0.1 : 0)));
  }
  recruitOfficer(cityId, officerIdx) { // 재야 무장 등용: 금 100, AP 20 (자체 규칙)
    const c = this.cityById[cityId], f = this.forces[c.force];
    if (c.gold < 100 || f.ap < 20) return false;
    const p = this.recruitChance(cityId, officerIdx);
    if (p <= 0) return false;
    const t = this.officers[officerIdx];
    const envoy = Math.max(...c.officers.map(i => this.officers[i].chr));
    c.gold -= 100; f.ap -= 20;
    if (Math.random() < p) {
      t.state.status = 'serving'; t.state.force = c.force;
      c.officers.push(officerIdx);
      this.log(`【등용】${t.name_ko}이(가) 【${this.forceName(c.force)}】에 등용되었습니다 (${c.name_ko}, 사자 매력 ${envoy})`, true);
      return true;
    }
    this.log(`${c.name_ko}의 ${t.name_ko} 등용에 실패했습니다`, c.force === this.playerForce);
    return false;
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
    u.targetCity = targetCityId; u.tx = c.lon; u.tz = c.lat;
  }

  // === 턴 진행 ===
  endTurn(aiThink) {
    // 전 부대 기력 회복
    for (const u of this.units) u.qi = Math.min(100, (u.qi ?? 100) + 10);
    // 부대 이동·전투
    for (const u of [...this.units]) this.stepUnit(u);
    // 도시 공성 처리는 stepUnit 내부
    // 야전: 접촉한 적 부대끼리 교전
    this.resolveFieldBattles();
    // 수입: 매 3순(한 달)
    if (this.dan === 3) {
      for (const c of this.cities) {
        if (c.force == null || !this.forces[c.force]?.alive) continue;
        c.gold += Math.round((50 + c.commerce * 8 * (c.metropolis ? 1.5 : 1)) * (this.cityHasSkill(c, '통상') ? 1.3 : 1));
        c.food += Math.round((300 + c.farm * 80) * (this.cityHasSkill(c, '부농') ? 1.3 : 1));
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
    if ((u.conf ?? 0) > 0) { // 혼란: 이동·공격 불가
      u.conf--;
      this.log(`${u.label}이(가) 혼란에 빠져 움직이지 못합니다`, u.force === this.playerForce);
      return;
    }
    if (u.tx == null) return;
    // 요격: 인접한 적 부대가 있으면 진격 정지 (아군 도시로의 퇴각은 허용)
    const engaged = this.units.some(v => v !== u && v.force !== u.force && Math.hypot(v.x-u.x, v.z-u.z) < 2.2);
    if (engaged) {
      const tgt = u.targetCity != null ? this.cityById[u.targetCity] : null;
      if (!tgt || tgt.force !== u.force) return;
    }
    const ut = UNIT_TYPES[u.type];
    const speed = 0.55 * ut.move * (this.unitHasSkill(u, '질풍') ? 1.25 : 1);
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
    let dmg = Math.round(u.troops * 0.12 * ut.atk * (0.7 + lead.war/150) * this.aptMult(u) * this.unitDmgMult(u, true) * this.unitTechAtk(u) * (1 + 0.1 * this.techLv(u.force, '발명')));
    let loss = Math.round(c.troops * 0.06 / ut.def + 150);
    // 전법: 병종 적성 B 이상 + 기력 소모, 무력이 높을수록 발동 잘됨
    const tac = TACTICS[u.type];
    const aptLv = u.type === 'sword' ? 1 : APT_LV(lead.apt?.[APT_IDX[u.type]]);
    if (aptLv >= 1 && u.qi >= tac.qi && Math.random() < Math.min(0.55, 0.15 + lead.war/250)) {
      u.qi -= tac.qi;
      dmg = Math.round(dmg * tac.mult);
      if (tac.guard) loss = Math.round(loss * tac.guard);
      this.log(`【전법】${lead.name_ko}의 ${tac.name}! ${c.name_ko}에 큰 피해`, u.force === this.playerForce);
    }
    // 계략(공격측): 화계 — 부대 내 최고 지력 무장
    const caster = u.officers.map(i => this.officers[i]).sort((a, b) => b.int - a.int)[0];
    if (caster && caster.int >= STRATS.fire.minInt && u.qi >= STRATS.fire.qi && Math.random() < Math.min(0.5, 0.1 + caster.int/300 + (this.unitHasSkill(u, '풍계') ? 0.15 : 0))) {
      u.qi -= STRATS.fire.qi;
      const burn = Math.round(c.troops * 0.08 * (1 + 0.15 * this.techLv(u.force, '화공')));
      c.troops = Math.max(0, c.troops - burn);
      c.hp = Math.max(0, c.hp - Math.round(burn * 0.5));
      this.log(`【계략】${caster.name_ko}의 화계! ${c.name_ko} 수비병 -${burn}`, u.force === this.playerForce);
    }
    // 계략(수비측): 혼란 — 수비 도시 최고 지력 무장, 쿨다운 적용
    if (c.officers.length && (c.lastStrat ?? 0) + STRATS.confuse.cooldown <= this.turn) {
      const def = c.officers.map(i => this.officers[i]).sort((a, b) => b.int - a.int)[0];
      const p = Math.max(0.05, Math.min(0.45, 0.15 + (def.int - lead.int)/250));
      if (def.int >= STRATS.confuse.minInt && !this.unitHasSkill(u, '위장') && Math.random() < p) {
        c.lastStrat = this.turn; u.conf = STRATS.confuse.turns;
        this.log(`【계략】${def.name_ko}의 혼란! ${u.label}이(가) ${STRATS.confuse.turns}턴간 움직이지 못합니다`, c.force === this.playerForce);
      }
    }
    if (this.cityHasSkill(c, '수성')) dmg = Math.round(dmg * 0.85); // 수성: 주둔 도시 방어 보정
    if (c.force != null) dmg = Math.round(dmg * (1 - 0.05 * this.techLv(c.force, '방위'))); // 방위 기교: 도시 방어
    c.troops = Math.max(0, c.troops - dmg);
    c.hp = Math.max(0, c.hp - Math.round(dmg*0.5));
    u.troops = Math.max(0, u.troops - loss);
    this.gainTechP(u.force, Math.min(50, Math.floor(dmg / 100))); // 전투 기교P
    this.log(`${u.label}이(가) ${c.name_ko}을(를) 공격 (적병 -${dmg}, 아군 -${loss})`, u.force === this.playerForce);
    if (u.troops <= 0) { this.units = this.units.filter(x => x !== u); this.log(`${u.label} 부대가 전멸했습니다`, false); return; }
    if (c.troops <= 0 || c.hp <= 0) {
      const old = c.force;
      c.force = u.force; c.district = null;
      c.hp = Math.round(c.maxhp * 0.4);
      this.gainTechP(u.force, 200); // 도시 함락 기교P
      this.log(`【${c.name_ko}】함락! ${old != null ? this.forceName(old) : '공백지'} → ${this.forceName(u.force)}`, true);
      // 수비 무장 일부 포로/퇴각은 후속 구현 — 일단 공격측 도시에 그대로 둠
      u.tx = null; u.targetCity = null;
    }
  }
  // === 야전: 접촉한 적 부대 쌍 교전 ===
  resolveFieldBattles() {
    const us = [...this.units];
    for (let i = 0; i < us.length; i++) for (let j = i+1; j < us.length; j++) {
      const a = us[i], b = us[j];
      if (!this.units.includes(a) || !this.units.includes(b)) continue;
      if (a.force === b.force) continue;
      if (Math.hypot(a.x-b.x, a.z-b.z) >= 2.2) continue;
      this.fieldBattle(a, b);
    }
  }
  fieldBattle(a, b) {
    const strike = (att, def) => { // 공격측 1회 타격분 산출 (전법·계략 포함), 피해는 나중에 동시 적용
      if ((att.conf ?? 0) > 0) return 0; // 혼란은 stepUnit에서 감소 처리됨
      const utA = UNIT_TYPES[att.type], utD = UNIT_TYPES[def.type];
      const lead = this.officers[att.officers[0]];
      let dmg = Math.round(att.troops * 0.05 * utA.atk * (0.7 + lead.war/150) / utD.def * this.aptMult(att) * this.unitDmgMult(att) * this.unitDefMult(def) * this.unitTechAtk(att) * (1 - 0.03 * this.techLv(def.force, '연병')));
      // 전법 (공성과 같은 규칙)
      const tac = TACTICS[att.type];
      const aptLv = att.type === 'sword' ? 1 : APT_LV(lead.apt?.[APT_IDX[att.type]]);
      if (aptLv >= 1 && (att.qi ?? 100) >= tac.qi && Math.random() < Math.min(0.55, 0.15 + lead.war/250)) {
        att.qi -= tac.qi; dmg = Math.round(dmg * tac.mult);
        if (tac.guard) att._guard = true;
        this.log(`【전법】${lead.name_ko}의 ${tac.name}! 야전에서 ${def.label}에 큰 피해`, att.force === this.playerForce);
      }
      // 계략: 혼란
      const caster = att.officers.map(i => this.officers[i]).sort((x, y) => y.int - x.int)[0];
      if (caster && caster.int >= STRATS.confuse.minInt && !this.unitHasSkill(def, '위장') && (att.qi ?? 100) >= 25 && Math.random() < Math.min(0.35, 0.08 + caster.int/400)) {
        att.qi -= 25; def.conf = Math.max(def.conf ?? 0, STRATS.confuse.turns);
        this.log(`【계략】${caster.name_ko}의 혼란! ${def.label}이(가) ${STRATS.confuse.turns}턴간 움직이지 못합니다`, att.force === this.playerForce);
      }
      // 계략: 화계
      if (caster && caster.int >= STRATS.fire.minInt && !this.unitHasSkill(def, '위장') && (att.qi ?? 100) >= STRATS.fire.qi && Math.random() < Math.min(0.5, 0.1 + caster.int/300 + (this.unitHasSkill(att, '풍계') ? 0.15 : 0))) {
        att.qi -= STRATS.fire.qi;
        const burn = Math.round(def.troops * 0.06 * (1 + 0.15 * this.techLv(att.force, '화공')));
        def.troops = Math.max(0, def.troops - burn);
        this.log(`【계략】${caster.name_ko}의 화계! ${def.label} 병력 -${burn}`, att.force === this.playerForce);
      }
      return dmg;
    };
    a._guard = false; b._guard = false;
    let da = strike(a, b), db = strike(b, a);
    if (a._guard) db = Math.round(db * TACTICS[a.type].guard); // 철벽: 받는 피해 감소
    if (b._guard) da = Math.round(da * TACTICS[b.type].guard);
    a.troops = Math.max(0, a.troops - db);
    b.troops = Math.max(0, b.troops - da);
    this.gainTechP(a.force, Math.min(40, Math.floor(db / 100))); this.gainTechP(b.force, Math.min(40, Math.floor(da / 100))); // 전투 기교P
    this.log(`【야전】${a.label} ↔ ${b.label} 교전 (${a.label} -${db} / ${b.label} -${da})`, a.force === this.playerForce || b.force === this.playerForce);
    for (const u of [a, b]) {
      if (u.troops <= 0) {
        this.units = this.units.filter(x => x !== u);
        this.log(`${u.label} 부대가 전멸했습니다`, false);
      } else if (u.troops < (this.unitHasSkill(u, '완강') ? 600 : 1200)) { // 퇴각: 가장 가까운 아군 도시로 (완강 특기는 기준 절반)
        const home = this.forceCities(u.force).sort((pp, qq) => Math.hypot(pp.lon-u.x, pp.lat-u.z) - Math.hypot(qq.lon-u.x, qq.lat-u.z))[0];
        if (home) {
          u.targetCity = home.id; u.tx = home.lon; u.tz = home.lat;
          this.log(`${u.label}이(가) ${home.name_ko}(으)로 퇴각합니다`, u.force === this.playerForce);
        }
      }
    }
  }
  autosave() {
    try {
      const data = {
        scenId: this.scenId, year: this.year, month: this.month, dan: this.dan, turn: this.turn,
        cities: this.cities, forces: this.forces, units: this.units, nextUnitId: this.nextUnitId,
        playerForce: this.playerForce, delegated: this.delegated, deadAck: this.deadAck, logs: this.logs.slice(-60),
        officerStates: Object.fromEntries(Object.entries(this.officers).filter(([,o]) => o.state).map(([i,o]) => [i, o.state])),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) { /* 용량 초과 등 무시 */ }
  }
}
export function josa(name, pair) { // [을,를] 형태
  const code = name.charCodeAt(name.length-1);
  const jong = (code >= 0xAC00 && code <= 0xD7A3) ? (code-0xAC00)%28 : 0;
  return name + (jong ? pair[0] : pair[1]);
}
