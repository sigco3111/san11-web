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
    u.qi = Math.min(100, (u.qi ?? 100) + 10); // 기력 회복
    if ((u.conf ?? 0) > 0) { // 혼란: 행동 불가
      u.conf--;
      this.log(`${u.label}이(가) 혼란에 빠져 공격하지 못합니다`, u.force === this.playerForce);
      return;
    }
    let dmg = Math.round(u.troops * 0.12 * ut.atk * (0.7 + lead.war/150));
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
    if (caster && caster.int >= STRATS.fire.minInt && u.qi >= STRATS.fire.qi && Math.random() < Math.min(0.5, 0.1 + caster.int/300)) {
      u.qi -= STRATS.fire.qi;
      const burn = Math.round(c.troops * 0.08);
      c.troops = Math.max(0, c.troops - burn);
      c.hp = Math.max(0, c.hp - Math.round(burn * 0.5));
      this.log(`【계략】${caster.name_ko}의 화계! ${c.name_ko} 수비병 -${burn}`, u.force === this.playerForce);
    }
    // 계략(수비측): 혼란 — 수비 도시 최고 지력 무장, 쿨다운 적용
    if (c.officers.length && (c.lastStrat ?? 0) + STRATS.confuse.cooldown <= this.turn) {
      const def = c.officers.map(i => this.officers[i]).sort((a, b) => b.int - a.int)[0];
      const p = Math.max(0.05, Math.min(0.45, 0.15 + (def.int - lead.int)/250));
      if (def.int >= STRATS.confuse.minInt && Math.random() < p) {
        c.lastStrat = this.turn; u.conf = STRATS.confuse.turns;
        this.log(`【계략】${def.name_ko}의 혼란! ${u.label}이(가) ${STRATS.confuse.turns}턴간 움직이지 못합니다`, c.force === this.playerForce);
      }
    }
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
export function josa(name, pair) { // [을,를] 형태
  const code = name.charCodeAt(name.length-1);
  const jong = (code >= 0xAC00 && code <= 0xD7A3) ? (code-0xAC00)%28 : 0;
  return name + (jong ? pair[0] : pair[1]);
}
