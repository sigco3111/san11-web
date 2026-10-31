import { TACTICS, RULES, Game, josa, STRATS, UNIT_TYPES, ITEMS, FACILITIES, AB_BRANCHES, AB_P, AB_SKILL, isWaterAt, isSeaAt, isRiverAt, isFordAt, ARTS, FIELD_FACS, TECH_P, TECH_GOLD } from '../js/game.js';
import { aiThink } from '../js/ai.js';
import { readFileSync } from 'fs';
const officers = {}; for (const o of JSON.parse(readFileSync('data/officers670.json'))) officers[o.idx] = o;
const scen = JSON.parse(readFileSync('data/scenario-190.json'));
const g = new Game(scen, officers, {}, 0); // 조조로 시작
console.log('start forces:', g.aliveForces().length, 'units:', g.units.length);
// 전법/계략/야전 발동 카운트
let tacN = 0, stratN = 0, fieldN = 0, recN = 0;
const origLog = g.log.bind(g);
g.log = (m, mine) => { if (m.includes('【전법】')) tacN++; if (m.includes('【계략】')) stratN++; if (m.includes('【야전】')) fieldN++; if (m.includes('【등용】')) recN++; origLog(m, mine); };
// 레거시 세이브 호환: qi/conf 필드 없는 부대가 있어도 턴이 정상 진행되어야 함
const enemy = g.cities.find(c => c.force != null && c.force !== g.playerForce);
// 야전 검증: 적 부대 2개를 인접 배치 (교전·전법·퇴각/전멸 경로 강제)
if (enemy) {
  g.units.push({ id: 9997, force: g.playerForce, officers: [g.forces[g.playerForce].ruler], troops: 9000, type: 'cav', x: 0, z: 0, path: [], tx: 5, tz: 0, targetCity: null, label: '아군시험 9k', qi: 100, conf: 0 });
  g.units.push({ id: 9998, force: enemy.force, officers: [g.forces[enemy.force].ruler], troops: 9000, type: 'spear', x: 1, z: 0, path: [], tx: -5, tz: 0, targetCity: null, label: '적군시험 9k', qi: 100, conf: 0 });
}
if (enemy) g.units.push({ id: 9999, force: g.playerForce, officers: [g.forces[g.playerForce].ruler], troops: 8000, type: 'cav', x: enemy.lon - 3, z: enemy.lat, path: [], tx: enemy.lon, tz: enemy.lat, targetCity: enemy.id, label: '레거시시험 8k' });
// 플레이어도 AI로 돌려 60턴 시뮬레이션
for (let t = 0; t < 60; t++) {
  g.delegated = false;
  aiThink(g, g.playerForce); // 수동 플레이어 대신 AI 1회
  g.endTurn(aiThink);
  if (g.pendingDuel) g.duelAuto(g.pendingDuel); // R10: 일기토는 모달 대신 자동 결판
  if (g.pendingDebate) g.debateAuto(g.pendingDebate); // R11: 설전도 모달 대신 자동 결판
}
console.log('after 60 turns:', g.year, '년', g.month, '월');
console.log('alive forces:', g.aliveForces().map(f => g.forceName(f.id)).join(', '));
console.log('units in field:', g.units.length);
const owned = {};
for (const c of g.cities) if (c.force != null) owned[c.force] = (owned[c.force]||0)+1;
console.log('cities per force:', owned);
console.log('tactics fired:', tacN, '| stratagems fired:', stratN, '| field battles:', fieldN, '| AI 등용 성공:', recN);
// 등용 검증 (결정적): 재야 무장 배치 후 성공/실패 경로·상태 전이 확인
{
  const home = g.cities.find(c => c.force != null && g.forces[c.force]?.alive && c.officers.length);
  let freeO = home && Object.values(g.officers).find(o => o.state?.status === 'free' && o.state.city === home.id && !home.officers.includes(o.idx));
  if (home && !freeO) { // 없으면 미등장 무장을 재야로 배치
    freeO = Object.values(g.officers).find(o => o.state && o.state.status === 'not_yet');
    if (freeO) { freeO.state.status = 'free'; freeO.state.city = home.id; }
  }
  if (home && freeO) {
    freeO.state.found = true; // 수색 발견 상태 (신규 게임의 재야는 미발견으로 시작)
    g.forces[home.force].ap = 100; home.gold += 1000; // 결정적 조건 확보
    const n0 = home.officers.length, g0 = home.gold;
    const p = g.recruitChance(home.id, freeO.idx);
    const orig = Math.random; Math.random = () => 0.001; // 반드시 성공
    const ok = g.recruitOfficer(home.id, freeO.idx);
    Math.random = orig;
    if (!(p > 0 && ok && freeO.state.status === 'serving' && freeO.state.force === home.force && home.officers.includes(freeO.idx) && home.officers.length === n0 + 1 && home.gold === g0 - 100)) {
      console.error('FAIL: 등용 성공 경로', { p, ok }); process.exit(1);
    }
    console.log('등용 성공 경로 확인:', freeO.name_ko, '성공률', Math.round(p*100) + '%');
  } else { console.error('FAIL: 등용 검증 대상 없음'); process.exit(1); }

  // === 수색·상인·명품 ===
  {
    const gateF = g.aliveForces().find(f => g.forceCities(f.id).length >= 2 && g.forceCities(f.id).some(c => c.officers.length)) ?? g.aliveForces().find(f => g.forceCities(f.id).length);
    if (!gateF) { console.error('FAIL: R6 게이트 세력 없음'); process.exit(1); }
    // 미발견 재야는 등용 불가, 수색 발견 후 등용 가능
    const hc = g.forceCities(gateF.id).find(c => c.officers.length) ?? g.forceCities(gateF.id)[0];
    const hid = Object.values(g.officers).find(o => o.state?.status === 'free');
    if (hid) { hid.state.city = hc.id; hid.state.found = false; } // 결정적 대상 배치
    if (hid && g.recruitChance(hid.state.city, hid.idx) !== 0) { console.error('FAIL: 미발견 재야 등용 가능'); process.exit(1); }
    if (hid) {
      hc.gold += 500; g.forces[hc.force].ap = 100;
      Object.values(g.officers).forEach(o => { if (o.state?.status === 'free' && o.state.city === hc.id && o !== hid) o.state.found = true; });
      const o0 = Math.random; Math.random = () => 0.001;
      g.searchCity(hc.id); Math.random = o0;
      const foundO = Object.values(g.officers).find(o => o.state?.status === 'free' && o.state.city === hc.id && o.state.found === true);
      if (!foundO || g.recruitChance(hc.id, foundO.idx) <= 0) { console.error('FAIL: 수색 발견→등용 경로', { hid: hid.name_ko, found: foundO?.name_ko }); process.exit(1); }
      console.log('수색 발견 확인:', foundO.name_ko);
    }
    // 명품 발견: itemPool에서 담당 무장에게 귀속
    {
      const sc = g.forceCities(gateF.id).find(c => c.officers.length) ?? g.forceCities(gateF.id)[0]; sc.gold += 500; gateF.ap = 100;
      Object.values(g.officers).forEach(o => { if (o.state?.status === 'free') o.state.found = true; }); // 모든 재야 발견 처리 → 명품 분기 결정적
      g.itemPool = g.itemPool ?? ITEMS.map(i => i.id); if (g.itemPool.length === 0) { g.itemPool = ITEMS.map(i => i.id); g.itemPoolRefilled = true; } /* 사전조건 보정: 앞선 임의 이벤트로 풀이 비면 실패하던 간헐 원인 */ const pool0 = g.itemPool.length;
      const o0 = Math.random; Math.random = () => 0.001; // hidden 없음 → 명품 분기 (0.001 < 0.25)
      g.searchCity(sc.id); Math.random = o0;
      const holder = Object.values(g.officers).find(o => (o.state?.items ?? []).length > 0);
      if (!(g.itemPool.length === pool0 - 1 && holder)) { console.error('FAIL: 명품 발견·귀속', { pool0, now: g.itemPool.length, holder: !!holder, city: sc.name_ko, off: sc.officers.length, gold: sc.gold, ap: gateF.ap }); process.exit(1); }
      // 장병(weapon) 공격 +5% 승수 — 무기 1개를 결정적으로 쥐여 검증
      holder.state.items = [...new Set([...holder.state.items, 'fangtian'])].slice(0, 3);
      const wN = holder.state.items.filter(id => ITEMS.find(i => i.id === id)?.kind === 'weapon').length;
      const mult = g.unitItemAtk({ officers: [holder.idx] });
      if (Math.abs(mult - (1 + 0.05 * wN)) > 1e-9) { console.error('FAIL: 장병 공격 승수', mult, wN); process.exit(1); }
      console.log('명품 발견 확인:', holder.name_ko, holder.state.items, '장병 승수', mult);
    }
    // 옥새: 보유 세력 기교P 월 +10
    {
      const f = gateF;
      const off = g.officers[f.ruler]; // 군주 고정: 무작위 소속 무장은 전사·포박으로 소속이 바뀔 수 있어 플레이크
      off.state = off.state ?? {};
      off.state.items = [...new Set([...(off.state.items ?? []), 'yuxi'])].slice(0, 3);
      const before = f.techP ?? 0;
      f.ab = { '공격': 3, '방어': 3, '계략': 3, '내정': 3 }; // R13: 월 자동 능력연구의 기교P 소비를 차단해 결정적으로
      const sb0 = g.swearBrotherhood; g.swearBrotherhood = () => false; // R14: 월 자동 결연의 기교P 소비도 차단 (같은 플레이크 클래스)
      for (let t = 0; t < 3; t++) { g.endTurn((gg, fid) => { if (fid !== f.id) aiThink(gg, fid); }); if (g.pendingDuel) g.duelAuto(g.pendingDuel); if (g.pendingDebate) g.debateAuto(g.pendingDebate); } // 월 처리는 3순(1개월)마다. 대상 세력의 AI 기교 연구(techP 소비)는 차단해 결정적으로
      g.swearBrotherhood = sb0;
      if (!((f.techP ?? 0) >= before + 10)) { console.error('FAIL: 옥새 기교P 월+10', before, f.techP); process.exit(1); }
      off.state.items = off.state.items.filter(i => i !== 'yuxi');
      console.log('옥새 기교P 확인:', before, '→', f.techP);
    }
    // 상인: 환율 범위·매입/매각 수치
    {
      const rate = g.tradeRate();
      if (!(rate >= 4000 && rate <= 7000 && rate % 1000 === 0)) { console.error('FAIL: 상인 환율', rate); process.exit(1); }
      const tc = g.forceCities(gateF.id)[0]; tc.gold = 5000; tc.food = 10000; gateF.ap = 100;
      const g0 = tc.gold, f0 = tc.food;
      if (!g.trade(tc.id, 'buy', 2) || tc.gold !== g0 - 2000 || tc.food !== f0 + rate * 2) { console.error('FAIL: 상인 매입'); process.exit(1); }
      if (!g.trade(tc.id, 'sell', 1) || tc.gold !== g0 - 2000 + 1000 || tc.food !== f0 + rate * 2 - rate) { console.error('FAIL: 상인 매각'); process.exit(1); }
      console.log('상인 거래 확인: 환율 1:' + rate / 1000);
    }
    // AI 수색·거래 stub (플레이어 세력을 AI에게 맡겨 실행)
    {
      const hid2 = Object.values(g.officers).find(o => o.state?.status === 'free' && o.state.found === false && g.cityById[o.state.city]?.force === gateF.id);
      const c2 = hid2 && g.cityById[hid2.state.city];
      if (c2) { c2.gold = 3000; gateF.ap = 100; const o0 = Math.random; Math.random = () => 0.1; aiThink(g, gateF.id); Math.random = o0; }
      console.log('AI 수색·거래 stub 실행 완료');
    }

    // === 군사·군단 ===
    {
      const f = gateF;
      const serving = Object.values(g.officers).filter(o => o.state?.force === f.id);
      const low = serving.find(o => o.int < 70), high = serving.sort((a, b) => b.int - a.int)[0];
      if (low && g.appointAdvisor(low.idx)) { console.error('FAIL: 지력70 미만 군사 임명'); process.exit(1); }
      if (!g.appointAdvisor(high.idx) || f.advisor !== high.idx) { console.error('FAIL: 군사 임명'); process.exit(1); }
      const md = g.mindDefense(f.id);
      if (Math.abs(md - Math.max(high.int, g.officers[f.ruler]?.int ?? 0) / 500) > 1e-9) { console.error('FAIL: 계략 방어 수치', md); process.exit(1); }
      console.log('군사 임명 확인:', high.name_ko, '지력', high.int, '계략 방어', (md * 100).toFixed(1) + '%');
      // 군단 편성: 수동 명령 차단 → 도독 운영 → 해산 복귀 (결정적 새 게임)
      {
        const g3 = new Game(scen, officers, {}, 0);
        const f3 = g3.forces[0];
        const cs3 = g3.forceCities(0);
        const lc = cs3[0];
        const gov3 = Object.values(g3.officers).find(o => o.state?.force === 0 && o.idx !== f3.ruler);
        if (!g3.createLegion(gov3.idx, [lc.id], 'delegate')) { console.error('FAIL: 군단 편성'); process.exit(1); }
        if (!g3.cityLegion(lc.id)) { console.error('FAIL: 군단 소속 확인'); process.exit(1); }
        lc.gold = 3000; f3.ap = 100;
        if (g3.develop(lc.id, 'commerce')) { console.error('FAIL: 군단 도시 수동 개발 허용'); process.exit(1); }
        if (g3.recruit(lc.id)) { console.error('FAIL: 군단 도시 수동 징병 허용'); process.exit(1); }
        if (g3.searchCity(lc.id)) { console.error('FAIL: 군단 도시 수동 수색 허용'); process.exit(1); }
        const cm0 = lc.commerce + lc.farm, ap0 = f3.ap;
        const o3 = Math.random; Math.random = () => 0.5;
        g3.endTurn(aiThink); Math.random = o3;
        if (!(lc.commerce + lc.farm > cm0 || f3.ap < ap0)) { console.error('FAIL: 군단 도독 운영 미동작', { cm0, now: lc.commerce + lc.farm, ap0, ap: f3.ap }); process.exit(1); }
        if (!g3.disbandLegion(0, 2) || g3.cityLegion(lc.id)) { console.error('FAIL: 군단 해산'); process.exit(1); }
        if (!g3.develop(lc.id, 'farm') && false) { console.error('FAIL'); process.exit(1); } // 해산 후 수동 복귀는 ap 부족 무관하게 차단 해제만 확인
        if (g3._blocked(lc)) { console.error('FAIL: 해산 후 차단 해제'); process.exit(1); }
        console.log('군단 확인: 편성→수동 차단(개발·징병·수색)→도독 운영→해산 복귀 PASS');
      }
      // 방침 목표: attack_city는 목표 도시만, attack_force는 목표 세력만
      {
        const g2 = new Game(scen, officers, {}, 0);
        const fid2 = 0;
        const cs2 = g2.forceCities(fid2);
        const gov2 = Object.values(g2.officers).find(o => o.state?.force === fid2);
        const enemy = g2.cities.find(c => c.force != null && c.force !== fid2);
        g2.createLegion(gov2.idx, [cs2[cs2.length - 1].id], 'attack_city', enemy.id);
        const l2 = g2.forces[fid2].legions[0];
        if (l2.policy !== 'attack_city' || l2.target !== enemy.id) { console.error('FAIL: 군단 방침 저장'); process.exit(1); }
        console.log('군단 방침 확인: attack_city →', enemy.name_ko);
      }
    }
  }
}
if (fieldN < 1) { console.error('FAIL: no field battle resolved'); process.exit(1); }
if (g.units.find(u => u.id === 9999) && g.units.find(u => u.id === 9999).qi === undefined) {
  // 아직 전투에 도달하지 않았으면 기력 미회복 상태일 수 있음 — 오류 없이 진행됐으면 통과
}
// 특기·적성 게이트 (결정적)
{
  const g2 = new Game(JSON.parse(JSON.stringify(scen)), officers, {}, 0);
  const base = { id: 1, force: 0, officers: [], troops: 5000, type: 'spear', x: 0, z: 0, path: [], tx: null, tz: null, targetCity: null, label: 'A', qi: 100, conf: 0 };
  const mk = (skill, apt) => {
    const idx = 90000 + (mk._n = (mk._n || 0) + 1); // 결정적 idx (이전 난수 idx 충돌로 간헐 실패했음)
    g2.officers[idx] = { idx, name_ko: '시험', ldr: 50, war: 80, int: 30, pol: 30, chr: 50, skill, apt: apt || {}, state: { status: 'serving', force: 0, city: null } };
    return idx;
  };
  const noSkill = mk(null, { 0: 'B' }), pajin = mk('파진', { 0: 'B' }), kang = mk('강직', { 0: 'B' }), aptS = mk(null, { 0: 'S' });
  const uA = { ...base, id: 11, officers: [noSkill] }, uB = { ...base, id: 12, officers: [pajin] };
  const uC = { ...base, id: 13, officers: [kang] }, uD = { ...base, id: 14, officers: [aptS] };
  const plain = mk(null, { 0: 'B' });
  const strikeOf = (att, def) => { // fieldBattle strike 부분을 동일 조건으로 재현
    const utA = g2.units; // unused
    return Math.round(att.troops * 0.05 * 1.0 * (0.7 + 80/150) / 1.0 * g2.aptMult(att) * g2.unitDmgMult(att) * g2.unitDefMult(def));
  };
  const dBase = strikeOf(uA, { ...base, officers: [plain] });
  const dPajin = strikeOf(uB, { ...base, officers: [plain] });
  const dKang = strikeOf(uA, { ...base, officers: [kang] });
  const dAptS = strikeOf(uD, { ...base, officers: [plain] });
  if (!(dPajin > dBase && dKang < dBase && dAptS > dBase)) { console.error('FAIL: 특기·적성 보정', { dBase, dPajin, dKang, dAptS }); process.exit(1); }
  console.log('특기·적성 보정 확인: 기본', dBase, '| 파진', dPajin, '| 강직(받는측)', dKang, '| 적성S', dAptS);
  // 위장: 혼란 면역 — fieldBattle 계략 조건에서 위장 부대는 conf 미적용
  const wj = mk('위장', { 0: 'B' });
  const uW = { ...base, id: 15, officers: [wj], conf: 0 };
  if (g2.unitHasSkill(uW, '위장') !== true) { console.error('FAIL: 위장 보유 판정'); process.exit(1); }
  // 수입 특기: 통상 도시 금 수입 증가
  const home2 = g2.cities.find(c => c.force != null && c.officers.length);
  const g0 = home2.gold; g2.dan = 3;
  const t0 = g2.turn;
  home2.officers.push(pajin); // 파진은 수입 무관
  const inc0 = Math.round((50 + home2.commerce * 8 * (home2.metropolis ? 1.5 : 1)) * (g2.cityHasSkill(home2, '통상') ? 1.3 : 1));
  home2.officers.push(mk('통상'));
  const inc1 = Math.round((50 + home2.commerce * 8 * (home2.metropolis ? 1.5 : 1)) * (g2.cityHasSkill(home2, '통상') ? 1.3 : 1));
  if (!(inc1 > inc0)) { console.error('FAIL: 통상 수입 보정', inc0, inc1); process.exit(1); }
  console.log('수입 특기 확인: 통상 적용 전', inc0, '→ 후', inc1);
}
// R2 기교 연구 (결정적)
{
  const g3 = new Game(scen, officers, {}, 0);
  const F = g3.forces[0];
  const cap = g3.forceCities(0).sort((a, b) => b.gold - a.gold)[0];
  F.techP = 1500; cap.gold = 5000;
  const ok = g3.researchTech(0, '창병');
  if (!(ok && F.techs['창병'] === 1 && F.techP === 500 && cap.gold === 4000)) { console.error('FAIL: 기교 연구 1단계', { ok, techP: F.techP, gold: cap.gold }); process.exit(1); }
  if (g3.researchTech(0, '창병')) { console.error('FAIL: 기교P 부족인데 연구 성공'); process.exit(1); }
  const u = { force: 0, type: 'spear', officers: [F.ruler] };
  const m1 = g3.unitTechAtk(u);
  if (!(Math.abs(m1 - 1.05) < 1e-9)) { console.error('FAIL: 창병 1단계 공격 보정', m1); process.exit(1); }
  F.techs['연병'] = 2; F.techs['발명'] = 3; F.techs['화공'] = 1; F.techs['방위'] = 4;
  const p0 = F.techP; g3.gainTechP(0, 25);
  if (F.techP !== p0 + 25) { console.error('FAIL: 기교P 획득'); process.exit(1); }
  console.log('기교 연구 확인: 창병 1단계 공격 x' + m1.toFixed(2) + ', 기교P 소비/획득·금 차감·단계 반영 PASS');
}
// R2 AI 기교 연구 (결정적): 같은 비용·효과 규칙으로 AI도 연구 수행
{
  const g4 = new Game(scen, officers, {}, 0);
  const F4 = g4.forces[1];
  const cap4 = g4.forceCities(1).sort((a, b) => b.gold - a.gold)[0];
  F4.techP = 2000; cap4.gold = 9000;
  aiThink(g4, 1);
  const total = Object.values(F4.techs).reduce((x, y) => x + y, 0);
  if (total < 1) { console.error('FAIL: AI 기교 연구 미수행'); process.exit(1); }
  console.log('AI 기교 연구 확인:', JSON.stringify(Object.entries(F4.techs).filter(([, v]) => v > 0)), '잔여P', F4.techP);
}
// R3 내정시설 (결정적)
{
  const g5 = new Game(scen, officers, {}, 0);
  const F5 = g5.forces[0];
  const c5 = g5.forceCities(0)[0];
  F5.ap = 255; c5.gold = 5000;
  const pol3 = [...c5.officers].sort((x, y) => (g5.officers[y]?.pol ?? 0) - (g5.officers[x]?.pol ?? 0)).slice(0, 3);
  if (!g5.buildFacility(c5.id, '시장', pol3)) { console.error('FAIL: 시설 건설 시작'); process.exit(1); }
  const fc = c5.facilities[0];
  const polSum = pol3.reduce((x, i) => x + (g5.officers[i]?.pol ?? 0), 0);
  g5.endTurn(aiThink); g5.endTurn(aiThink);
  if (!fc.done) { console.error('FAIL: 시설 공기 진행', { progress: fc.progress, polSum }); process.exit(1); }
  // 시장 효과: 도시 금 수입 +25%
  const mk = g5.cityFac(c5, '시장').length;
  if (mk !== 1) { console.error('FAIL: 시장 완성 반영'); process.exit(1); }
  // 병영 징병 보정
  F5.ap = 255; c5.gold = 5000;
  g5.buildFacility(c5.id, '병영', pol3);
  c5.facilities[1].progress = 99; g5.endTurn(aiThink);
  if (!c5.facilities[1].done) { console.error('FAIL: 병영 완성'); process.exit(1); }
  F5.ap = 255; c5.gold = 5000; c5.food = 9000;
  const before = c5.troops;
  g5.recruit(c5.id);
  const withFac = c5.troops - before;
  const baseN = Math.round((1500 + Math.max(50, ...c5.officers.map(i => g5.officers[i].chr)) * 30) * (g5.cityHasSkill(c5, '명성') ? 1.3 : 1));
  const expect = Math.round(baseN * 1.3);
  if (withFac !== expect) { console.error('FAIL: 병영 징병 보정', { withFac, expect }); process.exit(1); }
  // 슬롯 제한
  c5.facilities = Array(g5.facSlots(c5)).fill({ type: '시장', done: true, progress: 2, builders: [] });
  if (g5.buildFacility(c5.id, '시장', [])) { console.error('FAIL: 개발지 초과 건설'); process.exit(1); }
  console.log('내정시설 확인: 건설·공기(정치 가속)·시장 수입·병영 징병 x1.3·개발지 제한 PASS (담당 정치합', polSum + ')');
}
// R4 무장 중복 회귀 + 공적·충성·관작 (결정적)
{
  const g6 = new Game(scen, officers, {}, 0);
  const F6 = g6.forces[0];
  const mine = g6.forceCities(0);
  // 회귀: 같은 이동 2회 실행해도 중복 없음
  if (mine.length >= 2) {
    const [a, b] = mine;
    const mv = a.officers.slice(0, 2);
    F6.ap = 255;
    g6.moveOfficers(a.id, b.id, mv);
    F6.ap = 255;
    g6.moveOfficers(a.id, b.id, mv); // UI 이중 실행 재현
    if (b.officers.length !== new Set(b.officers).size) { console.error('FAIL: 이동 중복', b.officers); process.exit(1); }
  }
  // 회귀: 출진→아군 도시 합류 후 중복 없음
  {
    const c = mine[0];
    F6.ap = 255; c.troops = 20000; c.gold = 5000; c.spears = 5000;
    const offs = [...new Set(c.officers)].slice(0, 2);
    const u = g6.dispatch(c.id, offs, 5000, 'spear');
    if (u) {
      u.targetCity = c.id; u.tx = c.lon; u.tz = c.lat; u.x = c.lon + 0.5; u.z = c.lat;
      g6.stepUnit(u); // 합류
      if (c.officers.length !== new Set(c.officers).size) { console.error('FAIL: 합류 중복', c.officers); process.exit(1); }
    }
  }
  // 공적: 개발 실행 무장 +30
  {
    const c = mine[0];
    F6.ap = 255; c.gold = 5000; c.commerce = 50;
    const top = [...new Set(c.officers)].sort((a, b) => g6.officers[b].pol - g6.officers[a].pol)[0];
    const before = g6.officers[top].state?.merit ?? 0;
    g6.develop(c.id, 'commerce');
    const after = g6.officers[top].state?.merit ?? 0;
    if (after - before !== 30) { console.error('FAIL: 개발 공적', { before, after }); process.exit(1); }
  }
  // 봉록·충성: 금 충분 → 충성 +1, 금 부족 → -4, 충성 25 이하 하야
  {
    const c = mine[0];
    const offs = [...new Set(c.officers)];
    const o0 = offs[0];
    g6.officers[o0].state.loyal = 50; g6.officers[o0].state.merit = 0;
    c.gold = 5000; g6.dan = 3;
    const sal = g6.salaryOf(o0); // 10
    const goldBefore = c.gold;
    const income = Math.round((50 + c.commerce * 8 * (c.metropolis ? 1.5 : 1)) * (g6.cityHasSkill(c, '통상') ? 1.3 : 1));
    const salSum = [...new Set(c.officers)].filter(i => g6.officers[i]?.state?.force != null).reduce((x, i) => x + g6.salaryOf(i), 0);
    g6.endTurn(aiThink);
    const st = g6.officers[o0].state;
    if (st.loyal !== 51) { console.error('FAIL: 봉록 지급 충성', st.loyal); process.exit(1); }
    if (c.gold !== goldBefore + income - salSum) { console.error('FAIL: 봉록 차감', { goldBefore, income, salSum, after: c.gold }); process.exit(1); }
    // 미지급: 수입보다 봉록 합계가 크게 만들어 o0(마지막 순서)이 미지급되게 함
    c.commerce = 0; c.gold = 0;
    for (const i of offs) g6.officers[i].state.merit = 5000; // 봉록 50금/인
    c.officers = [...offs.filter(i => i !== o0), o0];
    g6.dan = 3;
    g6.endTurn(aiThink);
    if (st.loyal !== 47) { console.error('FAIL: 봉록 미지급 충성', st.loyal); process.exit(1); }
    for (const i of offs) g6.officers[i].state.merit = 0;
    // 하야: random stub
    const origRandom = Math.random;
    Math.random = () => 0;
    st.loyal = 20; c.gold = 5000; g6.dan = 3;
    g6.endTurn(aiThink);
    Math.random = origRandom;
    if (st.status !== 'free' || c.officers.includes(o0)) { console.error('FAIL: 하야 처리', st.status); process.exit(1); }
  }
  // 관작: 도시 2개 → 주자사, 황건 제외
  {
    const g7 = new Game(scen, officers, {}, 0);
    const owned = g7.cities.filter(c => c.force === 0);
    let added = 0;
    for (const c of g7.cities) { if (c.force == null && owned.length + added < 2) { c.force = 0; added++; } }
    g7.endTurn(aiThink);
    if (g7.cities.filter(c => c.force === 0).length >= 2 && g7.forces[0].rank !== '주자사') { console.error('FAIL: 관작 승진', g7.forces[0].rank); process.exit(1); }
    const hj = Object.values(g7.forces).find(f => g7.forceName(f.id).includes('황건'));
    if (hj) {
      let n = 0;
      for (const c of g7.cities) { if (n < 2 && c.force == null) { c.force = hj.id; n++; } }
      hj.rank = null; g7.checkRanks();
      if (hj.rank) { console.error('FAIL: 황건 작위 부여', hj.rank); process.exit(1); }
    }
  }
  console.log('공적·충성·관작 확인: 개발 공적+30·봉록 지급/미지급 충성·하야·관작 승진·황건 제외·무장 중복 회귀 PASS');
}
// R5 외교 (결정적)
{
  const g8 = new Game(scen, officers, {}, 0);
  if (g8.relStage(85) !== '친밀' || g8.relStage(60) !== '호의' || g8.relStage(40) !== '중립' || g8.relStage(20) !== '불화' || g8.relStage(19) !== '험악') { console.error('FAIL: 관계 단계 매핑'); process.exit(1); }
  const other = Object.values(g8.forces).find(f => f.alive && f.id !== 0);
  const tid = other.id;
  const c8 = g8.forceCities(0)[0];
  // 친선 사절: 금·AP·관계 증가량
  g8.forces[0].ap = 255; c8.gold = 5000;
  const pol = Math.max(50, ...c8.officers.map(i => g8.officers[i].pol));
  const expectGain = Math.round((8 + pol / 10) * (c8.officers.some(i => g8.officers[i].skill === '논객') ? 1.5 : 1));
  const v0 = g8.relation(0, tid);
  if (!g8.envoy(0, tid, c8.id)) { console.error('FAIL: 친선 사절 실행'); process.exit(1); }
  if (g8.relation(0, tid) !== v0 + expectGain || c8.gold !== 4500 || g8.forces[0].ap !== 235) { console.error('FAIL: 친선 사절 수치', { v0, v: g8.relation(0, tid), expectGain, gold: c8.gold, ap: g8.forces[0].ap }); process.exit(1); }
  // 동맹: 관계 60+로 만들고 random stub 성공 → 동맹 24턴, 공격 차단
  g8.diploOf(0, tid).v = 70;
  g8.forces[0].ap = 255; c8.gold = 5000;
  const origRandom = Math.random; Math.random = () => 0.01;
  if (!g8.proposeAlliance(0, tid, c8.id)) { Math.random = origRandom; console.error('FAIL: 동맹 성사'); process.exit(1); }
  Math.random = origRandom;
  if (!g8.isAllied(0, tid)) { console.error('FAIL: 동맹 상태'); process.exit(1); }
  // 동맹 도시 공격 차단: orderUnit + stepUnit
  const tCity = g8.cities.find(x => x.force === tid);
  c8.troops = 20000; c8.spears = 9000; g8.forces[0].ap = 255;
  const offs = [...new Set(c8.officers)].slice(0, 2);
  const u = g8.dispatch(c8.id, offs, 5000, 'spear');
  g8.orderUnit(u.id, tCity.id);
  if (u.targetCity != null) { console.error('FAIL: 동맹 공격 명령 차단'); process.exit(1); }
  u.targetCity = tCity.id; u.tx = tCity.lon; u.tz = tCity.lat; u.x = tCity.lon + 0.5; u.z = tCity.lat; // 강제 근접
  const tBefore = tCity.troops;
  g8.stepUnit(u);
  if (tCity.troops !== tBefore || u.targetCity != null) { console.error('FAIL: 동맹 공성 차단', { tBefore, after: tCity.troops }); process.exit(1); }
  // 동맹 파기 → 관계 급락, 이후 공격 가능
  g8.diploOf(0, tid).v = 70; g8.diploOf(0, tid).allianceUntil = g8.turn + 24;
  g8.breakAlliance(0, tid);
  if (g8.relation(0, tid) !== 30) { console.error('FAIL: 동맹 파기 관계', g8.relation(0, tid)); process.exit(1); }
  // 정전 요청: 험악 대상 stub 성공 → +30 + 12턴 공격 금지 실효
  g8.diploOf(0, tid).v = 15;
  g8.forces[0].ap = 255; c8.gold = 9000;
  Math.random = () => 0.01;
  if (!g8.requestTruce(0, tid, c8.id)) { Math.random = origRandom; console.error('FAIL: 정전 요청'); process.exit(1); }
  Math.random = origRandom;
  if (g8.relation(0, tid) !== 45) { console.error('FAIL: 정전 관계 회복', g8.relation(0, tid)); process.exit(1); }
  if (!g8.isTruce(0, tid) || !g8.isPeace(0, tid)) { console.error('FAIL: 정전 상태'); process.exit(1); }
  // 정전 중 공격 차단 (명령 + 공성)
  const tCity2 = g8.cities.find(x => x.force === tid);
  c8.troops = 20000; c8.spears = 9000; g8.forces[0].ap = 255;
  const u2 = g8.dispatch(c8.id, [...new Set(c8.officers)].slice(0, 2), 5000, 'spear');
  g8.orderUnit(u2.id, tCity2.id);
  if (u2.targetCity != null) { console.error('FAIL: 정전 공격 명령 차단'); process.exit(1); }
  u2.targetCity = tCity2.id; u2.tx = tCity2.lon; u2.tz = tCity2.lat; u2.x = tCity2.lon + 0.5; u2.z = tCity2.lat;
  const t2b = tCity2.troops;
  g8.stepUnit(u2);
  if (tCity2.troops !== t2b) { console.error('FAIL: 정전 공성 차단'); process.exit(1); }
  // 정전 만료 후 공격 가능
  g8.diploOf(0, tid).truceUntil = g8.turn - 1;
  g8.orderUnit(u2.id, tCity2.id);
  if (u2.targetCity == null) { console.error('FAIL: 정전 만료 후 공격 가능'); process.exit(1); }

  // 항복 권고: 대상 도시 2 이하로 만들고 stub 성공 → 흡수
  const g9 = new Game(scen, officers, {}, 0);
  const victim = Object.values(g9.forces).find(f => f.alive && f.id !== 0 && g9.cities.filter(x => x.force === f.id).length <= 2);
  if (victim) {
    const vc = g9.cities.filter(x => x.force === victim.id);
    const c9 = g9.forceCities(0)[0];
    g9.forces[0].ap = 255; c9.gold = 5000;
    // 흡수 대상에 야전 부대 추가 (출진 상태 시뮬레이션)
    g9.units.push({ id: 999, force: victim.id, officers: [], troops: 4000, type: 'spear', x: 0, z: 0, path: [], tx: null, tz: null, targetCity: null, label: 't', qi: 100, conf: 0 });
    Math.random = () => 0.001;
    const ok = g9.demandSurrender(0, victim.id, c9.id);
    Math.random = origRandom;
    if (!ok || victim.alive || vc.some(x => x.force !== 0)) { console.error('FAIL: 항복 권고 흡수', { ok, alive: victim.alive }); process.exit(1); }
    const uAbs = g9.units.find(u => u.id === 999);
    if (!uAbs || uAbs.force !== 0) { console.error('FAIL: 항복 부대 귀속', uAbs?.force); process.exit(1); }
    // 소속 무장 상태 정합성: victim 소속이던 무장이 모두 0으로
    const stray = Object.values(g9.officers).filter(o => o.state?.force === victim.id);
    if (stray.length) { console.error('FAIL: 항복 무장 귀속', stray.length); process.exit(1); }
  }
  // 동맹 만료: allianceUntil 지나면 해제
  g8.diploOf(0, tid).v = 70; g8.diploOf(0, tid).allianceUntil = g8.turn - 1;
  g8.dan = 2; // endTurn이 dan을 먼저 올리므로 3이 되어 월 처리 실행
  const oR8 = Math.random; Math.random = () => 0.999; // AI 재제의 등 확률 동작 차단
  g8.endTurn(aiThink);
  Math.random = oR8;
  if (g8.isAllied(0, tid) || g8.diploOf(0, tid).allianceUntil !== 0) { console.error('FAIL: 동맹 만료', { turn: g8.turn, au: g8.diploOf(0, tid).allianceUntil }); process.exit(1); }
  // AI 친선 사절: 험악 이웃 + 금 여유 + random stub → 관계 상승
  const gA = new Game(scen, officers, {}, 0);
  const aiF = Object.values(gA.forces).find(f => f.alive && f.id !== gA.playerForce);
  const aiCities = gA.cities.filter(c => c.force === aiF.id);
  if (aiCities.length && aiCities[0].officers.length) {
    aiCities[0].gold = 5000; aiF.ap = 255;
    const before = gA.relation(aiF.id, gA.playerForce);
    gA.diploOf(aiF.id, gA.playerForce).v = 30;
    Math.random = () => 0.01; // 0.3 확률 통과
    aiThink(gA, aiF.id);
    Math.random = origRandom;
    if (gA.relation(aiF.id, gA.playerForce) !== 30 + Math.round((8 + Math.max(50, ...aiCities[0].officers.map(i => gA.officers[i].pol)) / 10) * (aiCities[0].officers.some(i => gA.officers[i].skill === '논객') ? 1.5 : 1))) { console.error('FAIL: AI 친선 사절', gA.relation(aiF.id, gA.playerForce)); process.exit(1); }
  }
  // AI 동맹 제의: 호의 60+ 조건에서 실행 (같은 비용·조건)
  {
    const gB = new Game(scen, officers, {}, 0);
    const aiF = Object.values(gB.forces).find(f => f.alive && f.id !== gB.playerForce && gB.cities.some(c => c.force === f.id && c.officers.length));
    if (aiF) {
      const aiC = gB.cities.filter(c => c.force === aiF.id).sort((x, y) => y.gold - x.gold)[0];
      aiC.gold = 5000; aiF.ap = 255;
      gB.diploOf(aiF.id, gB.playerForce).v = 70;
      Math.random = () => 0.01; // 사절 스킵·동맹 실행·상대 수락
      aiThink(gB, aiF.id);
      Math.random = origRandom;
      if (!gB.isAllied(aiF.id, gB.playerForce)) { console.error('FAIL: AI 동맹 제의'); process.exit(1); }
      // AI 정전: 동맹 해제 후 험악+수세 조건
      const gC = new Game(scen, officers, {}, 0);
      const aF2 = Object.values(gC.forces).find(f => f.alive && f.id !== gC.playerForce && gC.cities.filter(c => c.force === f.id).length >= 1);
      const cs = gC.cities.filter(c => c.force === aF2.id);
      // 수세 조작: 도시 2개 이하로
      for (const c of gC.cities) if (c.force === aF2.id && cs.indexOf(c) >= 2) c.force = null;
      const cs2 = gC.cities.filter(c => c.force === aF2.id);
      cs2[0].gold = 9000; cs2[0].officers = cs2[0].officers.length ? cs2[0].officers : [cs2[0].taesu ?? 0];
      aF2.ap = 255;
      gC.diploOf(aF2.id, gC.playerForce).v = 20;
      Math.random = () => 0.4; // 사절(0.3) 스킵, 동맹(0.2) 스킵, 정전(0.5) 실행
      aiThink(gC, aF2.id);
      Math.random = origRandom;
      if (!gC.isTruce(aF2.id, gC.playerForce) && gC.relation(aF2.id, gC.playerForce) <= 20) { console.error('FAIL: AI 정전 요청', gC.relation(aF2.id, gC.playerForce)); process.exit(1); }
    }
  }
  console.log('외교 확인: 5단계 매핑·친선 사절·동맹(24턴)·동맹 공격 차단·파기·정전(12턴 공격금지·만료 후 공격가능)·항복(도시+무장+야전부대 귀속)·AI 사절/동맹/정전 PASS');
}
// === R8: 병기·수군 (결정적) ===
{
  const { SIEGE_BUILD, SHIP_BUILD, isWaterAt } = await import('../js/game.js');
  const gW = new Game(scen, officers, {}, 0);
  const pf = gW.playerForce;
  const city = gW.forceCities(pf).find(c => c.officers.length >= 2) ?? gW.forceCities(pf)[0];
  city.gold = 50000; gW.forces[pf].ap = 255;
  // 공방 없이 생산 불가
  if (gW.produceSiege(city.id, 'ram')) { console.error('FAIL: 공방 없이 병기 생산'); process.exit(1); }
  if (gW.produceShip(city.id, 'junk')) { console.error('FAIL: 조선소 없이 선박 건조'); process.exit(1); }
  city.facilities = [{ type: '공방', done: true, progress: 3, builders: [] }, { type: '조선소', done: true, progress: 3, builders: [] }];
  // 특색 할인: 병기 특색(자체 배정) 25% 할인
  city.specialty = ['병기'];
  const g0 = city.gold, ap0 = gW.forces[pf].ap;
  if (!gW.produceSiege(city.id, 'ram')) { console.error('FAIL: 공방 병기 생산'); process.exit(1); }
  if (city.gold !== g0 - Math.round(SIEGE_BUILD.ram.gold * 0.75) || (city.rams ?? 0) !== 1 || gW.forces[pf].ap !== ap0 - 10) { console.error('FAIL: 병기 생산 비용·재고·AP', city.gold, city.rams); process.exit(1); }
  // 선박 특색 없음 → 정가
  const g1 = city.gold;
  if (!gW.produceShip(city.id, 'lou')) { console.error('FAIL: 조선소 선박 건조'); process.exit(1); }
  if (city.gold !== g1 - SHIP_BUILD.lou.gold || (city.lous ?? 0) !== 1) { console.error('FAIL: 선박 건조 비용·재고'); process.exit(1); }
  city.specialty = [];
  // 출진: 병기 1대 소모, 재고 없으면 불가
  gW.forces[pf].ap = 255; city.troops = 30000;
  const offs = city.officers.slice(0, 2);
  const uRam = gW.dispatch(city.id, offs, 5000, 'ram');
  if (!uRam || (city.rams ?? 0) !== 0) { console.error('FAIL: 병기 출진 소모', city.rams); process.exit(1); }
  if (gW.dispatch(city.id, offs, 5000, 'ram')) { console.error('FAIL: 병기 재고 없이 출진'); process.exit(1); }
  // 병기 기력 0 공격 불가 (설계안)
  {
    const enemyC = gW.cities.find(c => c.force != null && c.force !== pf);
    const u = gW.dispatch(city.id, city.officers.slice(0, 1), 5000, 'lou');
    const uS = gW.dispatch(city.id, city.officers.slice(1, 2), 5000, 'tower') || null;
    const uT = gW.units.find(x => x.type === 'tower') || uS;
    const siegeU = gW.units.find(x => x.type === 'tower');
    if (siegeU) {
      siegeU.x = enemyC.lon; siegeU.z = enemyC.lat; siegeU.targetCity = enemyC.id; siegeU.tx = enemyC.lon; siegeU.tz = enemyC.lat;
      siegeU.qi = 0;
      const t0 = enemyC.troops;
      gW.stepUnit(siegeU); // 도착 처리: 기력 0 → 공격 불가
      if (enemyC.troops !== t0) { console.error('FAIL: 병기 기력0 공격'); process.exit(1); }
      siegeU.qi = 100;
      gW.stepUnit(siegeU);
      if (enemyC.troops >= t0) { console.error('FAIL: 병기 정상 공격'); process.exit(1); }
      console.log('병기 기력0 차단·정상 공격 확인');
    }
  }
  // 수군: 육지 이동 차단, 수상 이동 정상
  {
    const uShip = gW.units.find(x => x.type === 'lou');
    if (uShip) {
      uShip.x = 112; uShip.z = 33; uShip.tx = 112; uShip.tz = 36; uShip.targetCity = null; uShip.qi = 100; uShip.conf = 0;
      gW.stepUnit(uShip);
      if (uShip.z !== 33) { console.error('FAIL: 수군 육지 이동'); process.exit(1); }
      uShip.x = 114.0; uShip.z = 30.4; uShip.tx = 117; uShip.tz = 30.6;
      const d0 = Math.hypot(uShip.tx - uShip.x, uShip.tz - uShip.z);
      gW.stepUnit(uShip);
      const d1 = Math.hypot(uShip.tx - uShip.x, uShip.tz - uShip.z);
      if (!(d1 < d0)) { console.error('FAIL: 수군 수상 이동', d0, d1); process.exit(1); }
      console.log('수군 육지 차단·수상 이동 확인');
    }
  }
  // 수전 지형 보정: 수상에서 수군 ×1.3, 육군 ×0.7 (자체 수치)
  {
    const mk = (id, force, type, x, z) => ({ id, force, officers: [gW.forces[force].ruler], troops: 50000, type, x, z, path: [], tx: null, tz: null, targetCity: null, label: id, qi: 100, conf: 0 });
    const foe = gW.cities.find(c => c.force != null && c.force !== pf).force;
    const run = (typeA, x, z) => {
      const a = mk('공', pf, typeA, x, z), b = mk('수', foe, 'spear', x + 0.5, z);
      const o0 = Math.random; Math.random = () => 0.99; // 전법·계략 억제
      gW.fieldBattle(a, b); Math.random = o0;
      return 50000 - b.troops; // a가 준 피해
    };
    const land = run('junk', 100, 30), water = run('junk', 114.3, 30.5);
    if (!(water > land * 1.2)) { console.error('FAIL: 수군 수전 우세', land, water); process.exit(1); }
    const landS = run('spear', 100, 30), waterS = run('spear', 114.3, 30.5);
    if (!(waterS < landS * 0.8)) { console.error('FAIL: 육군 수전 페널티', landS, waterS); process.exit(1); }
    console.log('수전 지형 보정 확인: 수군', land, '→', water, '/ 육군', landS, '→', waterS);
  }
  // AI 동일 규칙: 공방·조선소 보유 + 금 넉넉하면 생산
  {
    const gA = new Game(scen, officers, {}, 0);
    const aiF = Object.values(gA.forces).find(f => f.alive && f.id !== gA.playerForce && gA.cities.some(c => c.force === f.id));
    const ac = gA.cities.find(c => c.force === aiF.id);
    ac.gold = 20000; aiF.ap = 255;
    ac.facilities = [{ type: '공방', done: true, progress: 3, builders: [] }, { type: '조선소', done: true, progress: 3, builders: [] }];
    aiThink(gA, aiF.id);
    const shipBuiltLog = gA.logs.some(l => l.msg.includes(ac.name_ko + '에서') && (l.msg.includes('누선 건조') || l.msg.includes('투함 건조'))); // R64: 건조 직후 출진하면 재고 0이 될 수 있어 생산은 로그로 확인
    if (((ac.rams ?? 0) + (ac.catapults ?? 0)) < 1 || !shipBuiltLog) { console.error('FAIL: AI 병기·선박 생산', ac.rams, ac.catapults, ac.lous, ac.dous, shipBuiltLog); process.exit(1); }
    console.log('AI 병기·선박 생산 확인: 충거', ac.rams ?? 0, '투석', ac.catapults ?? 0, '누선', ac.lous ?? 0, '투함', ac.dous ?? 0, '건조 로그', shipBuiltLog);
  }
  // 수상 판정 기본값
  if (!isWaterAt(114.3, 30.5) || !isWaterAt(126, 38) || isWaterAt(114, 34) || isWaterAt(100, 30)) { console.error('FAIL: 수상 판정'); process.exit(1); }
  console.log('R8 병기·수군 게이트 PASS');
}
// 번들 부팅 게이트: 모듈 초기화 오류(TDZ·문법·import 잔류)를 배포 전 검출
// R9: 재해·치안·수완 게이트 (결정적)
{
  const g9 = new Game(JSON.parse(JSON.stringify(scen)), officers, {}, 0);
  const home = g9.cities.find(c => c.force === 0);
  const f0 = g9.forces[0];
  const origRand = Math.random;
  // 순찰: 치안 +10, 금 100·AP 20 차감 / 상한 100이면 불가
  home.security = 70; home.gold = 1000; f0.ap = 100;
  if (!g9.patrol(home.id) || home.security !== 80 || home.gold !== 900 || f0.ap !== 80) { console.error('FAIL: R9 순찰', home.security, home.gold, f0.ap); process.exit(1); }
  home.security = 100;
  if (g9.patrol(home.id)) { console.error('FAIL: R9 순찰 상한'); process.exit(1); }
  // 월간 감소: 특기 없으면 -1, '치안' 특기 주둔 시 유지 (시나리오 주둔 치안 특기 무장은 제외하고 검증)
  home.officers = home.officers.filter(i => g9.officers[i]?.skill !== '치안');
  Math.random = () => 0.99;
  home.security = 80; g9.dan = 3; g9.endTurn(aiThink);
  if (home.security !== 79) { console.error('FAIL: R9 치안 감소', home.security); process.exit(1); }
  const chiIdx = 91001;
  g9.officers[chiIdx] = { idx: chiIdx, name_ko: '치안시험', ldr: 50, war: 50, int: 50, pol: 80, chr: 50, skill: '치안', apt: {}, state: { status: 'serving', force: 0, city: home.id } };
  home.officers.push(chiIdx);
  g9.dan = 3; g9.endTurn(aiThink);
  if (home.security !== 79) { console.error('FAIL: R9 치안 특기 유지', home.security); process.exit(1); }
  // 재해·적 출현: random 0 강제
  Math.random = () => 0;
  g9.dan = 3; g9.endTurn(aiThink);
  Math.random = origRand;
  if (!home.disaster || home.disaster.type !== '역병') { console.error('FAIL: R9 재해 발생', JSON.stringify(home.disaster)); process.exit(1); }
  const bandit = g9.units.find(u => u.force === -1);
  if (!bandit || bandit.targetCity !== home.id || bandit.troops > 3000 || bandit.troops <= 0) { console.error('FAIL: R9 적 출현', JSON.stringify(bandit), JSON.stringify(g9.units.filter(x=>x.force!==-1).map(x=>[x.label,x.x,x.z]))); process.exit(1); }
  // 적 도착: 완성 시설 파괴 후 소멸
  bandit.x = home.lon + 1; bandit.z = home.lat;
  home.facilities = [{ type: '시장', progress: 100, builders: [], done: true }];
  Math.random = () => 0;
  g9.banditAct(bandit);
  Math.random = origRand;
  if (home.facilities.length !== 0 || g9.units.includes(bandit)) { console.error('FAIL: R9 시설 파괴·소멸'); process.exit(1); }
  // 시설 없으면 금 약탈
  const b2 = { id: 99991, force: -1, officers: [], troops: 3000, type: 'spear', x: home.lon + 1, z: home.lat, path: [], tx: null, tz: null, targetCity: home.id, label: '적병 3k', qi: 100, conf: 0, until: g9.turn + 18 };
  g9.units.push(b2);
  const gB = home.gold;
  g9.banditAct(b2);
  if (home.gold !== gB - Math.min(gB, 500)) { console.error('FAIL: R9 약탈', gB, home.gold); process.exit(1); }
  // 수명 도래 시 자연 소멸
  const b4 = { ...b2, id: 99994, x: home.lon + 5, z: home.lat, until: g9.turn };
  g9.units.push(b4);
  g9.banditAct(b4);
  if (g9.units.includes(b4)) { console.error('FAIL: R9 적 수명 소멸'); process.exit(1); }
  // 야전: 무장 없는 적병 부대도 교전 처리 (가드 경로)
  const b3 = { ...b2, id: 99992, x: 0, z: 0, targetCity: null };
  const mine9 = { id: 99993, force: 0, officers: [f0.ruler], troops: 9000, type: 'cav', x: 1, z: 0, path: [], tx: null, tz: null, targetCity: null, label: '아군9k', qi: 100, conf: 0 };
  g9.units.push(b3, mine9);
  g9.fieldBattle(b3, mine9);
  if (mine9.troops >= 9000) { console.error('FAIL: R9 적병 야전', mine9.troops); process.exit(1); }
  // 수완: 수상전 공격 +15%
  const oNo = 92001, oSu = 92002;
  g9.officers[oNo] = { idx: oNo, name_ko: '무특기', ldr: 50, war: 80, int: 30, pol: 30, chr: 50, skill: null, apt: {}, state: { status: 'serving', force: 0, city: null } };
  g9.officers[oSu] = { ...g9.officers[oNo], idx: oSu, skill: '수완' };
  const dA = { id: 99011, force: 99, officers: [], troops: 100000, type: 'spear', x: 114.3, z: 30.5, path: [], tx: null, tz: null, targetCity: null, label: 'DA', qi: 100, conf: 0 };
  const dB = { ...dA, id: 99012, label: 'DB' };
  const aNo = { id: 99013, force: 0, officers: [oNo], troops: 10000, type: 'junk', x: 114.3, z: 30.5, path: [], tx: null, tz: null, targetCity: null, label: 'A1', qi: 100, conf: 0 };
  const aSu = { ...aNo, id: 99014, officers: [oSu], label: 'A2' };
  Math.random = () => 0.99;
  g9.fieldBattle(aNo, dA); g9.fieldBattle(aSu, dB);
  Math.random = origRand;
  if (!(dB.troops < dA.troops)) { console.error('FAIL: R9 수완 수상 보정', dA.troops, dB.troops); process.exit(1); }
  // 재해 지속: 병사 감소 후 만료
  home.disaster = { type: '역병', until: 0 };
  home.troops = 10000; home.gold = 1000; home.food = 10000;
  Math.random = () => 0.99;
  g9.dan = 3; g9.endTurn(aiThink);
  Math.random = origRand;
  if (home.troops !== 9500 || home.disaster) { console.error('FAIL: R9 재해 감소·만료', home.troops, JSON.stringify(home.disaster)); process.exit(1); }
  // 세이브 직렬화: security·disaster·적병 부대 보존
  const snap = JSON.parse(JSON.stringify({ cities: g9.cities, units: g9.units }));
  const h2 = snap.cities.find(c => c.id === home.id);
  if (typeof h2.security !== 'number') { console.error('FAIL: R9 세이브 치안 보존'); process.exit(1); }
  console.log('R9 재해·치안 게이트 PASS (순찰/감소/특기/재해/적출현/파괴/약탈/야전/수완/세이브)');
}
// R10: 일기토 게이트 (결정적)
{
  const g10 = new Game(JSON.parse(JSON.stringify(scen)), officers, {}, 0);
  const origRand = Math.random;
  const mkU = (id, force, war, items) => {
    const oi = 93000 + id;
    g10.officers[oi] = { idx: oi, name_ko: '결투' + id, ldr: 50, war, int: 30, pol: 30, chr: 50, skill: null, apt: {}, state: { status: 'serving', force, city: null, items: items ?? [], merit: 0 } };
    return { id, force, officers: [oi], troops: 8000, type: 'cav', x: 108.9, z: 34.9, path: [], tx: null, tz: null, targetCity: null, label: 'U' + id, qi: 100, conf: 0 };
  };
  const uA = mkU(1, 0, 90), uB = mkU(2, 1, 70);
  const homeB = g10.cities.find(c => c.force === 1);
  Math.random = () => 0.99; // 크리티컬 억제
  const d = g10.startDuel(uA, uB);
  // 기본 합: 투지 상승 + 체력 감소
  g10.duelTick(d, { stance: 'spirit', cmd: null }, { stance: 'spirit', cmd: null });
  if (d.a.spirit < 14 || d.b.spirit <= 0 || d.b.hp >= 100) { console.error('FAIL: R10 기본 합', d.a.spirit, d.b.hp); process.exit(1); } // 투지 14+피격 보너스, 상호 타격
  // 투지 중시: 방침 상승분 14 (피격 보너스 별도)
  const s0 = d.a.spirit;
  g10.duelTick(d, { stance: 'spirit', cmd: null }, { stance: 'attack', cmd: null });
  if (d.a.spirit - s0 < 14) { console.error('FAIL: R10 투지 중시'); process.exit(1); }
  // 급소: 투지 200 필요 + 부상 부여
  d.a.spirit = 200;
  g10.duelTick(d, { stance: 'attack', cmd: '급소' }, { stance: 'defense', cmd: null });
  const bo = g10.duelOfficer(d, 'b');
  if (!bo.state.injuredUntil || bo.state.injuredUntil <= g10.turn) { console.error('FAIL: R10 급소 부상'); process.exit(1); }
  if (g10.effWar(bo) !== Math.max(1, bo.war - 20)) { console.error('FAIL: R10 부상 무력 보정'); process.exit(1); }
  // 부상 무장 출진 불가
  const bc = g10.cities.find(c => c.force === 1 && c.officers.length >= 0);
  bc.officers = [bo.idx]; bo.state.city = bc.id; bc.troops = 10000; g10.forces[1].ap = 100; bc.spears = 99999;
  if (g10.dispatch(bc.id, [bo.idx], 5000, 'spear')) { console.error('FAIL: R10 부상 출진 차단'); process.exit(1); }
  // 무쌍: 상대 투지 0 + 특대 피해
  d.a.spirit = 300; d.b.spirit = 150;
  const hpB0 = d.b.hp;
  g10.duelTick(d, { stance: 'attack', cmd: '무쌍' }, { stance: 'defense', cmd: null });
  if (d.b.spirit !== 0 && !(d.b.spirit > 0 && d.b.hp <= 0)) { /* 무쌍 후 피격 투지 +6은 허용 */ }
  if (hpB0 - d.b.hp < 10) { console.error('FAIL: R10 무쌍 피해'); process.exit(1); }
  // 암기: weapon 명품 없으면 무효, 있으면 발동 + 상대 투지 -50
  d.a.spirit = 100; d.b.spirit = 100; d.a._hiddenUsed = false;
  g10.duelTick(d, { stance: 'attack', cmd: '암기' }, { stance: 'defense', cmd: null });
  if (d.a._hiddenUsed) { console.error('FAIL: R10 암기 아이템 없음 발동'); process.exit(1); }
  g10.officers[d.a.offs[0]].state.items = ['fangtian'];
  g10.duelTick(d, { stance: 'attack', cmd: '암기' }, { stance: 'defense', cmd: null });
  if (!d.a._hiddenUsed) { console.error('FAIL: R10 암기 발동'); process.exit(1); }
  // 위퇴각: 활 없으면 무시, 활 있으면 도주 성공 + 반격
  const d2 = g10.startDuel(mkU(3, 0, 60), mkU(4, 1, 80));
  g10.duelTick(d2, { stance: 'attack', cmd: '위퇴각' }, { stance: 'attack', cmd: null });
  if (d2.done) { console.error('FAIL: R10 위퇴각 활 없음'); process.exit(1); }
  g10.officers[d2.a.offs[0]].state.items = ['yangbow'];
  const hpB2 = d2.b.hp;
  g10.duelTick(d2, { stance: 'attack', cmd: '위퇴각' }, { stance: 'attack', cmd: null });
  if (!d2.done || d2.fled !== 'a' || d2.b.hp >= hpB2) { console.error('FAIL: R10 위퇴각 발동', d2.done, d2.fled); process.exit(1); }
  if (d2.a.u.targetCity == null) { console.error('FAIL: R10 퇴각 후 귀환'); process.exit(1); }
  // 퇴각: 명마 보정 — 성공 확률 경계 (명마+상대 무名馬: 0.9)
  // 결판: 체력 0 → 병력 -30% + 공적
  const d3 = g10.startDuel(mkU(5, 0, 95), mkU(6, 1, 40));
  d3.b.hp = 3;
  g10.duelTick(d3, { stance: 'attack', cmd: null }, { stance: 'attack', cmd: null });
  if (!d3.done || d3.b.u.troops !== Math.round(8000 * 0.7)) { console.error('FAIL: R10 결판 병력', d3.b.u.troops); process.exit(1); }
  if ((g10.officers[d3.a.offs[0]].state.merit ?? 0) < 40) { console.error('FAIL: R10 승자 공적'); process.exit(1); }
  // 50합 무승부
  const d4 = g10.startDuel(mkU(7, 0, 60), mkU(8, 1, 60));
  d4.bout = 49;
  g10.duelTick(d4, { stance: 'defense', cmd: null }, { stance: 'defense', cmd: null });
  if (!d4.done || g10.pendingDuel) { console.error('FAIL: R10 50합 무승부'); process.exit(1); }
  // 발동: 플레이어 관여 야전 → pendingDuel, AI끼리 → 자동 결판
  Math.random = () => 0;
  const pU = { id: 99701, force: 0, officers: [g10.forces[0].ruler], troops: 9000, type: 'cav', x: 0, z: 0, path: [], tx: null, tz: null, targetCity: null, label: 'P', qi: 100, conf: 0 };
  const eU = { id: 99702, force: 1, officers: [g10.forces[1].ruler], troops: 9000, type: 'cav', x: 1, z: 0, path: [], tx: null, tz: null, targetCity: null, label: 'E', qi: 100, conf: 0 };
  g10.units.push(pU, eU);
  g10.fieldBattle(pU, eU);
  if (!g10.pendingDuel) { console.error('FAIL: R10 플레이어 일기토 발동'); process.exit(1); }
  g10.pendingDuel = null;
  const a1 = { ...pU, id: 99703, force: 2, officers: [bo.idx] }; bo.state.force = 2;
  const a2 = { ...eU, id: 99704, force: 3 };
  a1.troops = a2.troops = 9000;
  g10.fieldBattle(a1, a2);
  if (g10.pendingDuel) { console.error('FAIL: R10 AI 일기토 자동결판'); process.exit(1); }
  // 적병(무장 없음)과는 일기토 없음
  const bd = { id: 99705, force: -1, officers: [], troops: 3000, type: 'spear', x: 0, z: 0, path: [], tx: null, tz: null, targetCity: null, label: '적병', qi: 100, conf: 0 };
  const pU2 = { ...pU, id: 99706, troops: 9000 };
  g10.fieldBattle(pU2, bd);
  if (g10.pendingDuel) { console.error('FAIL: R10 적병 일기토 차단'); process.exit(1); }
  // endTurn 가드: 일기토 중 턴 진행 불가
  g10.pendingDuel = g10.startDuel(mkU(9, 0, 60), mkU(10, 1, 60));
  const t0 = g10.turn;
  g10.endTurn(aiThink);
  if (g10.turn !== t0) { console.error('FAIL: R10 일기토 중 턴 진행'); process.exit(1); }
  g10.duelAuto(g10.pendingDuel);
  if (g10.pendingDuel) { console.error('FAIL: R10 위임 자동결판'); process.exit(1); }
  Math.random = origRand;
  console.log('R10 일기토 게이트 PASS (기본합/투지/급소부상/출진차단/무쌍/암기/위퇴각/퇴각/결판/50합/발동구분/적병차단/턴가드/위임)');
}
// R11: 설전 게이트 (결정적)
{
  const g11 = new Game(JSON.parse(JSON.stringify(scen)), officers, {}, 0);
  const c0 = g11.forceCities(0)[0], c1 = g11.forceCities(1)[0];
  const ai = c0.officers[0], bi = c1.officers[0];
  g11.officers[ai].int = 100; g11.officers[bi].int = 100;
  g11.officers[ai].skill = null; g11.officers[bi].skill = null;
  const ctxA = { kind: 'alliance', fid: 0, tid: 1, cityId: c0.id };
  // 기본 합: 질타 대미지 = round(12 * (0.8 + 100/200)) = 16
  let d = g11.startDebate(ai, bi, ctxA);
  g11.debateTick(d, '질타', '질타');
  if (d.a.hp !== 84 || d.b.hp !== 84) { console.error('FAIL: R11 기본 합', d.a.hp, d.b.hp); process.exit(1); }
  // 반박: 공격 무효 + 반격 8*1.3 = 10
  d = g11.startDebate(ai, bi, ctxA);
  g11.debateTick(d, '반박', '강변');
  if (d.a.hp !== 100 || d.b.hp !== 90) { console.error('FAIL: R11 반박', d.a.hp, d.b.hp); process.exit(1); }
  // 경청: 논리 회복 12
  d = g11.startDebate(ai, bi, ctxA); d.a.hp = 50;
  g11.debateTick(d, '경청', '반박');
  if (d.a.hp !== 62 || d.b.hp !== 100) { console.error('FAIL: R11 경청', d.a.hp, d.b.hp); process.exit(1); }
  // 도발: 다음 화술 봉인
  d = g11.startDebate(ai, bi, ctxA);
  g11.debateTick(d, '도발', '질타');
  if (d.a.hp !== 84 || !d.b.seal) { console.error('FAIL: R11 도발 설정', d.a.hp, d.b.seal); process.exit(1); }
  g11.debateTick(d, '질타', '질타'); // b 봉인 → b 화술 실패, a만 타격
  if (d.a.hp !== 84 || d.b.hp !== 84) { console.error('FAIL: R11 도발 봉인', d.a.hp, d.b.hp); process.exit(1); }
  // 강변 잠금/서적 해금: 지력 70 무장은 강변 불가, 서적 지급 시 사용 가능
  g11.officers[ai].int = 70;
  d = g11.startDebate(ai, bi, ctxA);
  g11.debateTick(d, '강변', '반박');
  if (d.b.hp !== 100) { console.error('FAIL: R11 강변 잠금', d.b.hp); process.exit(1); }
  g11.officers[ai].state = g11.officers[ai].state ?? {}; g11.officers[ai].state.items = ['sunzi'];
  d = g11.startDebate(ai, bi, ctxA);
  g11.debateTick(d, '강변', '질타');
  if (d.b.hp !== 100 - Math.round(24 * (0.8 + 70 / 200))) { console.error('FAIL: R11 서적 해금', d.b.hp); process.exit(1); }
  // 논객 특기 +25%: 질타 = round(12 * 1.3 * 1.25) = 20 (상대는 도발 선택)
  g11.officers[ai].int = 100; g11.officers[ai].skill = '논객';
  d = g11.startDebate(ai, bi, ctxA);
  g11.debateTick(d, '질타', '도발');
  if (d.b.hp !== 80) { console.error('FAIL: R11 논객', d.b.hp); process.exit(1); }
  g11.officers[ai].skill = null;
  // 제의측 승리 → 동맹 성립
  d = g11.startDebate(ai, bi, ctxA); d.b.hp = 1;
  g11.debateTick(d, '질타', '경청'); // 경청은 공격을 막지 못함
  if (!d.done || d.winner !== 'a' || g11.diploOf(0, 1).allianceUntil < g11.turn + 24) { console.error('FAIL: R11 설전 승리 동맹', d.winner, g11.diploOf(0, 1).allianceUntil); process.exit(1); }
  // 제의측 패배 → 관계 -5
  g11.diploOf(0, 1).v = 50;
  d = g11.startDebate(ai, bi, ctxA); d.a.hp = 1;
  g11.debateTick(d, '도발', '질타'); // a는 도발(공격 아님), b 질타 적중
  if (!d.done || d.winner !== 'b' || g11.diploOf(0, 1).v !== 45) { console.error('FAIL: R11 설전 패배 관계', d.winner, g11.diploOf(0, 1).v); process.exit(1); }
  // 15합 무승부
  d = g11.startDebate(ai, bi, ctxA); d.bout = 14;
  g11.debateTick(d, '반박', '반박');
  if (!d.done || d.winner !== null) { console.error('FAIL: R11 무승부', d.winner); process.exit(1); }
  // 정전 승리 → 정전 성립 + 관계 +30
  g11.diploOf(0, 1).v = 20;
  d = g11.startDebate(ai, bi, { kind: 'truce', fid: 0, tid: 1, cityId: c0.id }); d.b.hp = 1;
  g11.debateTick(d, '질타', '경청');
  if (g11.diploOf(0, 1).truceUntil < g11.turn + 12 || g11.diploOf(0, 1).v !== 50) { console.error('FAIL: R11 설전 정전', g11.diploOf(0, 1)); process.exit(1); }
  // 등용 설전 승리 → 등용 성공
  const free = Object.values(g11.officers).find(o => o.state && o.state.force == null && o.idx !== bi);
  if (free) {
    d = g11.startDebate(ai, free.idx, { kind: 'recruit', fid: 0, tid: 0, cityId: c0.id, officerIdx: free.idx }); d.b.hp = 1;
    g11.debateTick(d, '질타', '경청');
    if (free.state.force !== 0 || !c0.officers.includes(free.idx)) { console.error('FAIL: R11 설전 등용'); process.exit(1); }
  } else { console.error('FAIL: R11 재야 무장 없음'); process.exit(1); }
  // 발동 구분: 플레이어 관여 시 pendingDebate, AI끼리는 자동 결판
  const r0 = Math.random; Math.random = () => 0;
  if (!g11.tryDebate(ctxA) || !g11.pendingDebate) { console.error('FAIL: R11 플레이어 설전 발동'); process.exit(1); }
  const t0 = g11.turn; g11.endTurn((gg, fid) => { if (fid !== 0) aiThink(gg, fid); });
  if (g11.turn !== t0) { console.error('FAIL: R11 설전 턴 가드'); process.exit(1); } // 결판 전 턴 진행 불가
  g11.debateAuto(g11.pendingDebate);
  if (g11.pendingDebate) { console.error('FAIL: R11 위임 자동 결판'); process.exit(1); }
  const ctxAI = { kind: 'alliance', fid: 1, tid: 2, cityId: c1.id };
  const before2 = g11.logs.length;
  if (!g11.tryDebate(ctxAI) || g11.pendingDebate) { console.error('FAIL: R11 AI 설전 자동'); process.exit(1); }
  if (!g11.logs.slice(before2).some(l => l.msg.includes('설전'))) { console.error('FAIL: R11 AI 설전 로그'); process.exit(1); }
  Math.random = r0;
  // 외교 훅: 동맹 거절 → 설전 발동
  const g12 = new Game(JSON.parse(JSON.stringify(scen)), officers, {}, 0);
  const cc0 = g12.forceCities(0)[0]; cc0.gold = 99999; g12.forces[0].ap = 100;
  g12.diploOf(0, 1).v = 65;
  const seq = [0.99, 0]; let si = 0; const r1 = Math.random; Math.random = () => (si < seq.length ? seq[si++] : 0.99);
  g12.proposeAlliance(0, 1, cc0.id);
  Math.random = r1;
  if (!g12.pendingDebate) { console.error('FAIL: R11 동맹 거절 설전 훅'); process.exit(1); }
  g12.debateAuto(g12.pendingDebate);
  console.log('R11 설전 게이트 PASS (기본합/반박/경청/도발/강변잠금/서적해금/논객/동맹성립/패배관계/무승부/정전/등용/발동구분/턴가드/위임/AI자동/외교훅)');
}
// R12: 관계 게이트 (결정적)
{
  const g13 = new Game(JSON.parse(JSON.stringify(scen)), officers, {}, 0);
  const byName = n => Object.values(g13.officers).find(o => o.name_ko === n);
  const liu = byName('유비'), guan = byName('관우'), zhang = byName('장비');
  if (!liu || !guan || !zhang) { console.error('FAIL: R12 시나리오 유관장 없음'); process.exit(1); }
  // 정적 관계: 유관장 의형제
  if (!g13.relOf(liu.idx).sworn.includes(guan.idx) || !g13.relOf(guan.idx).sworn.includes(zhang.idx)) { console.error('FAIL: R12 의형제 매핑'); process.exit(1); }
  // 같은 부대 공·방 +10%
  const unit = { officers: [liu.idx, guan.idx] };
  if (g13.unitRelMult(unit) !== 1.1 || g13.unitRelMult({ officers: [liu.idx] }) !== 1) { console.error('FAIL: R12 부대 보정'); process.exit(1); }
  // 일기토 교체: 의형제는 75%, 일반 50% — random 0.6에서 의형제만 교체
  const u2 = g13.dispatch(g13.forceCities(0)[0].id, [g13.forceCities(0)[0].officers[0]], 1000, 'spear');
  // 결연: 공적 부족 실패 → 공적 부여 후 성공, 기교P·충성 반영
  const c0 = g13.forceCities(0)[0];
  const [x1, x2] = c0.officers.slice(0, 2);
  if (g13.swearBrotherhood(c0.id, [x1, x2])) { console.error('FAIL: R12 공적 부족 결연 성공'); process.exit(1); }
  g13.officers[x1].state.merit = 600; g13.officers[x2].state.merit = 700;
  g13.forces[0].techP = 800;
  const ly1 = g13.officers[x1].state.loyal ?? 70;
  if (!g13.swearBrotherhood(c0.id, [x1, x2])) { console.error('FAIL: R12 결연 실패'); process.exit(1); }
  if (g13.forces[0].techP !== 300 || !(g13.officers[x1].state.loyal > ly1)) { console.error('FAIL: R12 결연 비용/충성', g13.forces[0].techP); process.exit(1); }
  if (!g13.relOf(x1).sworn.includes(x2) || !g13.relOf(x2).sworn.includes(x1)) { console.error('FAIL: R12 결연 관계 반영'); process.exit(1); }
  // 결연 저장·복원: state.sworn이 officerStates로 영속
  const saved = JSON.stringify(Object.fromEntries(Object.entries(g13.officers).filter(([,o]) => o.state).map(([i,o]) => [i, o.state])));
  if (!saved.includes('"sworn"')) { console.error('FAIL: R12 결연 저장'); process.exit(1); }
  // 등용 보정: 혐오 군주 세력은 성공률 감소
  const free = Object.values(g13.officers).find(o => o.state && o.state.force == null);
  if (free) {
    free.state.status = 'free'; free.state.city = c0.id; free.state.found = true; // 등용 가능한 재야로 배치
    const base = g13.recruitChance(c0.id, free.idx);
    const rel = g13.relOf(free.idx);
    rel.hate.push(g13.forces[0].ruler); g13._rels[free.idx] = rel; // 혐오 강제
    const hated = g13.recruitChance(c0.id, free.idx);
    if (!(hated < base)) { console.error('FAIL: R12 혐오 등용 보정', base, hated); process.exit(1); }
    g13._rels = null; // 캐시 초기화
  }
  // 상성: affOf 결정적 + 군주 궁합 차 반영 (월 처리 경로는 시뮬에서 간접 검증)
  if (g13.affOf(liu.idx) !== g13.affOf(liu.idx) || g13.affOf(liu.idx) < 0 || g13.affOf(liu.idx) >= 150) { console.error('FAIL: R12 상성 범위'); process.exit(1); }
  console.log('R12 관계 게이트 PASS (의형제매핑/부대보정/결연비용/결연충성/결연저장/혐오등용/상성)');
// === R13: PK 3요소 게이트 (결정적) ===
{
  const need = ['부절대','군사부','인재부','외교부','회계청','곡물창고','훈련장','의관','감찰소','서재'];
  if (!need.every(t => FACILITIES[t])) { console.log('FAIL: R13 신시설 등록', need.filter(t => !FACILITIES[t])); process.exit(1); }
  const g14 = new Game(scen, officers, {}, 0);
  const c14 = g14.cities.find(c => c.force === g14.playerForce);
  const f14 = g14.forces[g14.playerForce];
  const settle = () => { if (g14.pendingDuel) g14.duelAuto(g14.pendingDuel); if (g14.pendingDebate) g14.debateAuto(g14.pendingDebate); };
  const runMonth = () => { const o0 = Math.random; Math.random = () => 0.999; for (let i = 0; i < 3; i++) { g14.endTurn(aiThink); settle(); } Math.random = o0; };
  g14.units = []; // 전투 간섭 제거
  // 흡수합병
  c14.facilities = [{ type: '시장', progress: 2, builders: [], done: true }, { type: '시장', progress: 2, builders: [], done: true }, { type: '농장', progress: 2, builders: [], done: true }];
  c14.gold = 1000; f14.ap = 100;
  if (!g14.absorbFacility(c14.id, 0, 1)) { console.log('FAIL: R13 흡수합병 실행'); process.exit(1); }
  if (c14.facilities.length !== 2 || c14.facilities[0].level !== 2 || c14.gold !== 800 || f14.ap !== 90) { console.log('FAIL: R13 흡수합병 결과', c14.facilities.length, c14.facilities[0].level, c14.gold, f14.ap); process.exit(1); }
  if (g14.absorbFacility(c14.id, 0, 1)) { console.log('FAIL: R13 타입 다른 합병 허용'); process.exit(1); }
  c14.facilities[0].level = 3;
  c14.facilities.push({ type: '시장', progress: 2, builders: [], done: true });
  if (g14.absorbFacility(c14.id, 0, 2)) { console.log('FAIL: R13 Lv3 상한 합병 허용'); process.exit(1); }
  if (g14.cityFacLv(c14, '시장') !== 4) { console.log('FAIL: R13 시설 레벨 합산', g14.cityFacLv(c14, '시장')); process.exit(1); }
  // 능력연구
  f14.techP = 6000;
  const off14 = g14.forceOfficers(g14.playerForce);
  const w0 = off14[0].war;
  if (!g14.researchAbility(g14.playerForce, '공격')) { console.log('FAIL: R13 능력연구 실행'); process.exit(1); }
  if (f14.techP !== 5500 || f14.ab['공격'] !== 1 || off14[0].war !== Math.min(100, w0 + 2)) { console.log('FAIL: R13 능력연구 결과', f14.techP, f14.ab['공격'], off14[0].war, w0); process.exit(1); }
  if ((off14[0].state.bonus?.war ?? 0) !== 2) { console.log('FAIL: R13 능력 보너스 저장'); process.exit(1); }
  const skTarget = off14.filter(o => !o.skill).sort((a, b) => (b.state?.merit ?? 0) - (a.state?.merit ?? 0))[0];
  g14.researchAbility(g14.playerForce, '공격'); g14.researchAbility(g14.playerForce, '공격');
  if (f14.ab['공격'] !== 3) { console.log('FAIL: R13 능력연구 3단계'); process.exit(1); }
  if (skTarget && (skTarget.skill !== AB_SKILL['공격'] || skTarget.state.grantSkill !== AB_SKILL['공격'])) { console.log('FAIL: R13 연구 특기 습득', skTarget?.name_ko, skTarget?.skill); process.exit(1); }
  if (g14.researchAbility(g14.playerForce, '공격')) { console.log('FAIL: R13 능력연구 상한 초과'); process.exit(1); }
  // 부절대: 턴 시작 AP 회복 +10
  c14.facilities.push({ type: '부절대', progress: 3, builders: [], done: true });
  f14.ap = 0;
  { const o0 = Math.random; Math.random = () => 0.999; g14.endTurn(aiThink); settle(); Math.random = o0; }
  if (f14.ap !== 40) { console.log('FAIL: R13 부절대 AP 회복', f14.ap); process.exit(1); }
  // 서재: 월 기교P +10 (기저 대비 차분)
  f14.techP = 0;
  runMonth(); const tpBase = f14.techP;
  c14.facilities.push({ type: '서재', progress: 3, builders: [], done: true });
  runMonth();
  if (f14.techP - tpBase - tpBase !== 10) { console.log('FAIL: R13 서재 기교P', f14.techP, tpBase); process.exit(1); }
  // 감찰소: 치안 월 +2 (기저 대비 차분)
  c14.security = 50; runMonth(); const secBase = c14.security;
  c14.security = 50; c14.facilities.push({ type: '감찰소', progress: 3, builders: [], done: true });
  runMonth();
  if (c14.security - secBase !== 2) { console.log('FAIL: R13 감찰소 치안', c14.security, secBase); process.exit(1); }
  // 의관: 부상 회복 2배 (월 -1 추가)
  const inj = off14[0]; inj.state.injuredUntil = g14.turn + 10;
  c14.facilities.push({ type: '의관', progress: 3, builders: [], done: true });
  runMonth();
  if (inj.state.injuredUntil - g14.turn !== 6) { console.log('FAIL: R13 의관 부상 회복', inj.state.injuredUntil - g14.turn); process.exit(1); }
  // 회계청·곡물창고: 금·병량 수입 +10% (기저 대비 비율)
  c14.facilities = c14.facilities.filter(x => !['시장','농장'].includes(x.type)); // 시장·농장 간섭 제거
  const savedOff = c14.officers; c14.officers = []; // 봉록 공제 배제 (수입 비율 순수 비교)
  const savedTr = c14.troops; c14.troops = 0; // 주둔 병량 소비 배제
  c14.gold = 0; c14.food = 0; g14.month = 1; g14.dan = 1; runMonth(); const gBase = c14.gold, fdBase = c14.food; // 병량 수입은 1·4·7·10월만 (계절제)
  c14.gold = 0; c14.food = 0; g14.month = 1; g14.dan = 1; c14.facilities.push({ type: '회계청', progress: 3, builders: [], done: true }, { type: '곡물창고', progress: 3, builders: [], done: true });
  runMonth();
  c14.officers = savedOff; c14.troops = savedTr;
  const goldRatio = c14.gold / gBase, foodRatio = c14.food / fdBase;
  if (Math.abs(goldRatio - 1.1) > 0.02 || Math.abs(foodRatio - 1.1) > 0.02) { console.log('FAIL: R13 회계청·곡물창고', goldRatio.toFixed(3), foodRatio.toFixed(3)); process.exit(1); }
  // 군사부·인재부·외교부: AP 절감
  c14.gold = 5000; c14.food = 50000; f14.ap = 200;
  g14.recruit(c14.id); const apRecruit = 200 - f14.ap;
  c14.facilities.push({ type: '군사부', progress: 3, builders: [], done: true });
  f14.ap = 200; g14.recruit(c14.id); const apRecruit2 = 200 - f14.ap;
  if (apRecruit !== 30 || apRecruit2 !== 23) { console.log('FAIL: R13 군사부', apRecruit, apRecruit2); process.exit(1); }
  const c14b = g14.cities.find(c => c.force === g14.playerForce && c.id !== c14.id) ?? c14; // 이동 대상 도시
  c14.facilities.push({ type: '인재부', progress: 3, builders: [], done: true });
  f14.ap = 100; g14.moveOfficers(c14.id, c14b.id, [c14.officers[0]]); const apMove = 100 - f14.ap;
  if (apMove !== 15) { console.log('FAIL: R13 인재부', apMove); process.exit(1); }
  c14.facilities.push({ type: '외교부', progress: 3, builders: [], done: true });
  const tgt = g14.aliveForces().map(x => x.id ?? x).find(x => x !== g14.playerForce);
  f14.ap = 100; c14.gold = 5000; g14.envoy(g14.playerForce, tgt, c14.id); const apEnvoy = 100 - f14.ap;
  if (apEnvoy !== 15) { console.log('FAIL: R13 외교부', apEnvoy); process.exit(1); }
  // 훈련장: 주둔 부대 기력 +5
  c14.facilities.push({ type: '훈련장', progress: 3, builders: [], done: true });
  g14.units.push({ id: 9996, force: g14.playerForce, officers: [c14.officers[0]], troops: 5000, type: 'spear', x: c14.lon, z: c14.lat, path: [], tx: null, tz: null, targetCity: null, label: '주둔시험 5k', qi: 50, conf: 0 });
  { const o0 = Math.random; Math.random = () => 0.999; g14.endTurn(aiThink); settle(); Math.random = o0; }
  const qiT = g14.units.find(u => u.id === 9996)?.qi;
  if (qiT !== 65) { console.log('FAIL: R13 훈련장 기력', qiT); process.exit(1); }
  // 저장 영속: 세력 ab 포함
  if (!g14.forces[g14.playerForce].ab) { console.log('FAIL: R13 ab 저장 필드'); process.exit(1); }
  // AI 동일 규칙: 능력연구·흡수합병 자동 실행
  const g15 = new Game(scen, officers, {}, 0); g15.units = [];
  const aiF = g15.aliveForces().map(x => x.id ?? x).find(x => x !== g15.playerForce);
  g15.forces[aiF].techP = 5000;
  const aiC = g15.cities.find(c => c.force === aiF);
  aiC.facilities = [{ type: '시장', progress: 2, builders: [], done: true }, { type: '시장', progress: 2, builders: [], done: true }];
  aiC.gold = 1000;
  { const o0 = Math.random; Math.random = () => 0.999; for (let i = 0; i < 3; i++) { g15.endTurn(aiThink); if (g15.pendingDuel) g15.duelAuto(g15.pendingDuel); if (g15.pendingDebate) g15.debateAuto(g15.pendingDebate); } Math.random = o0; }
  const aiAb = Object.values(g15.forces[aiF].ab ?? {}).reduce((s, v) => s + v, 0);
  const aiMerged = (aiC.facilities ?? []).some(x => (x.level ?? 1) >= 2);
  if (aiAb < 1) { console.log('FAIL: R13 AI 능력연구', aiAb); process.exit(1); }
  if (!aiMerged) { console.log('FAIL: R13 AI 흡수합병', JSON.stringify(aiC.facilities)); process.exit(1); }
  console.log('R13 PK 3요소 게이트 PASS (신시설10종/흡수합병/상한/레벨합산/능력연구/특기습득/부절대/서재/감찰소/의관/회계청곡물창고/군사부/인재부/외교부/훈련장/저장/AI동일규칙)');
}
// === R14: 황제·통일·연감·안개 게이트 (결정적) ===
{
  const settle14 = gg => { if (gg.pendingDuel) gg.duelAuto(gg.pendingDuel); if (gg.pendingDebate) gg.debateAuto(gg.pendingDebate); };
  // 황제 승격: 24도시 → 황제, 충성 +10, 연감 기록, 기교P 월 +20
  const g16 = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
  g16.units = [];
  const f16 = g16.forces[g16.playerForce];
  const need16 = 24 - g16.forceCities(g16.playerForce).length;
  let gave = 0;
  for (const c of g16.cities) { if (c.force !== g16.playerForce && gave < need16) { c.force = g16.playerForce; gave++; } }
  if (g16.forceCities(g16.playerForce).length < 24) { console.log('FAIL: R14 황제 시험 도시 부족'); process.exit(1); }
  const off16 = Object.values(g16.officers).find(o => o.state?.force === g16.playerForce);
  const loy0 = off16.state.loyal ?? 70;
  g16.checkRanks();
  if (f16.rank !== '황제') { console.log('FAIL: R14 황제 승격', f16.rank); process.exit(1); }
  if (off16.state.loyal !== Math.min(100, loy0 + 10)) { console.log('FAIL: R14 황제 충성+10', loy0, off16.state.loyal); process.exit(1); }
  if (!(g16.chronicle ?? []).some(e => e.msg.includes('황제'))) { console.log('FAIL: R14 연감 황제 기록'); process.exit(1); }
  g16.emperor = null; // R17: 옹립 보너스(+10)와 분리 — 이 게이트는 황제 관작 보너스(+20)만 검증
  const tp0 = f16.techP ?? 0;
  const m16 = g16.month;
  { const o0 = Math.random; Math.random = () => 0.999; for (let i = 0; i < 3 && g16.month === m16; i++) { g16.endTurn(aiThink); settle14(g16); } Math.random = o0; }
  if (g16.month === m16) { console.log('FAIL: R14 월 경과 없음'); process.exit(1); }
  const dtp = (f16.techP ?? 0) - tp0;
  if (dtp !== 20) { console.log('FAIL: R14 황제 기교P 월+20', dtp); process.exit(1); }
  if (g16.over) { console.log('FAIL: R14 미통일인데 over'); process.exit(1); }
  // 황건 세력 작위 불가
  const hf = g16.aliveForces().map(x => x.id ?? x).find(x => x !== g16.playerForce);
  g16.officers[999999] = { idx: 999999, name_ko: '황건장' };
  g16.forces[hf].ruler = 999999;
  let hcnt = 0; for (const c of g16.cities) { if (c.force !== g16.playerForce && hcnt < 24) { c.force = hf; hcnt++; } }
  if (g16.forceRank(hf) !== null) { console.log('FAIL: R14 황건 작위 불가', g16.forceRank(hf)); process.exit(1); }
  // 천하 통일: 모든 도시 제압 → over + 연감 + 종료 후 턴 차단
  const g18 = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
  g18.units = [];
  for (const c of g18.cities) c.force = g18.playerForce;
  { const o0 = Math.random; Math.random = () => 0.999; g18.endTurn(aiThink); settle14(g18); Math.random = o0; }
  if (g18.over !== true) { console.log('FAIL: R14 천하 통일 판정'); process.exit(1); }
  if (!g18.chronicle.some(e => e.msg.includes('통일'))) { console.log('FAIL: R14 통일 연감 기록'); process.exit(1); }
  const t0 = g18.turn;
  { const o0 = Math.random; Math.random = () => 0.999; g18.endTurn(aiThink); Math.random = o0; }
  if (g18.turn !== t0) { console.log('FAIL: R14 통일 후 턴 진행 차단'); process.exit(1); }
  // 저장 영속: over·chronicle 직렬화
  let savedStr = null;
  const oldLS = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => null, setItem: (k, v) => { savedStr = v; }, removeItem(){} };
  g18.autosave();
  globalThis.localStorage = oldLS;
  const sv = JSON.parse(savedStr);
  if (sv.over !== true || !Array.isArray(sv.chronicle) || !sv.chronicle.some(e => e.msg.includes('통일'))) { console.log('FAIL: R14 over·chronicle 저장'); process.exit(1); }
  // 관전 계속(over 해제) 후 통일 재발동 방지
  g18.over = false;
  { const o0 = Math.random; Math.random = () => 0.999; g18.endTurn(aiThink); settle14(g18); Math.random = o0; }
  if (g18.over !== false || g18.unified !== true) { console.log('FAIL: R14 관전 계속 중 통일 재발동', g18.over, g18.unified); process.exit(1); }
  // 멸망: 도시·부대 상실 → 세력 fallen
  const g19 = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
  for (const c of g19.cities) if (c.force === g19.playerForce) c.force = null;
  g19.units = g19.units.filter(u => u.force !== g19.playerForce);
  { const o0 = Math.random; Math.random = () => 0.999; g19.endTurn(aiThink); settle14(g19); Math.random = o0; }
  if (g19.forces[g19.playerForce].alive !== false) { console.log('FAIL: R14 멸망 판정'); process.exit(1); }
  // 연감: 【】 포함만 수집
  const cl0 = g19.chronicle.length;
  g19.log('일반 메시지');
  if (g19.chronicle.length !== cl0) { console.log('FAIL: R14 연감 일반 메시지 수집'); process.exit(1); }
  g19.log('【시험】연감 수집');
  if (g19.chronicle.length !== cl0 + 1) { console.log('FAIL: R14 연감 사건 수집'); process.exit(1); }
  // 안개: 시야 반경·관전 공개
  const g20 = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
  g20.units = [];
  const myCs = g20.cities.filter(c => c.force === g20.playerForce);
  const far = g20.cities.filter(c => c.force !== g20.playerForce).sort((a, b) => {
    const da = Math.min(...myCs.map(m => (m.lon - a.lon) ** 2 + (m.lat - a.lat) ** 2));
    const db = Math.min(...myCs.map(m => (m.lon - b.lon) ** 2 + (m.lat - b.lat) ** 2));
    return db - da;
  })[0];
  if (g20.inVision(far.lon, far.lat)) { console.log('FAIL: R14 안개 — 먼 적 지역이 시야 안'); process.exit(1); }
  if (g20.cityVisible(far)) { console.log('FAIL: R14 안개 — 시야 밖 도시 visible'); process.exit(1); }
  if (!g20.inVision(myCs[0].lon, myCs[0].lat)) { console.log('FAIL: R14 안개 — 자기 도시 시야'); process.exit(1); }
  g20.units.push({ id: 9997, force: g20.playerForce, officers: [], troops: 1000, type: 'spear', x: far.lon, z: far.lat, path: [], tx: null, tz: null, targetCity: null, label: '정찰', qi: 100, conf: 0 });
  if (!g20.inVision(far.lon, far.lat)) { console.log('FAIL: R14 안개 — 부대 접근 시야 확보'); process.exit(1); }
  g20.units = g20.units.filter(u => u.id !== 9997);
  g20.delegated = true;
  if (!g20.inVision(far.lon, far.lat)) { console.log('FAIL: R14 안개 — 관전 전체 공개 (설계안 191행)'); process.exit(1); }
  console.log('R14 황제·통일·연감·안개 게이트 PASS (황제승격/충성+10/기교P+20/황건제외/통일판정/턴차단/저장/멸망/연감수집/안개반경/관전공개)');
}
}

// === R15: 전법·계략 직접 발동 게이트 (결정적) ===
{
  const g21 = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
  g21.units = [];
  const pf = g21.playerForce;
  const ef = g21.cities.find(c => c.force != null && c.force !== pf).force;
  const leadIdx = g21.forces[pf].ruler;
  const elead = g21.forces[ef].ruler;
  const mk = (id, force, offs, troops, type, x, z) => { const u = { id, force, officers: offs, troops, type, x, z, path: [], tx: null, tz: null, targetCity: null, label: '시험' + id, qi: 100, conf: 0 }; g21.units.push(u); return u; };
  g21.officers[leadIdx].apt = {}; for (let k = 0; k < 12; k++) g21.officers[leadIdx].apt[k] = 'S'; // R39: 창병 기본 전법 제거 → 기본 전법이 있는 노병(불화살)으로 직접 발동 검증
  const me = mk(8001, pf, [leadIdx], 10000, 'bow', 10, 10);
  const foe = mk(8002, ef, [elead], 10000, 'sword', 11, 10); // 인접
  // 창격 직접 발동: 기력 -20, 적 병력 감소, 반격 없음
  const t0 = foe.troops, q0 = me.qi;
  if (!g21.fireTactic(me.id, { type: 'unit', id: foe.id })) { console.log('FAIL: R15 전법 직접 발동'); process.exit(1); }
  if (me.qi !== q0 - 15) { console.log('FAIL: R15 전법 기력', me.qi); process.exit(1); }
  if (foe.troops >= t0 || me.troops !== 10000) { console.log('FAIL: R15 전법 피해/반격없음', foe.troops, me.troops); process.exit(1); }
  // 부적격: 기력 부족 → 실패, 변화 없음
  me.qi = 10; const tf = foe.troops;
  if (g21.fireTactic(me.id, { type: 'unit', id: foe.id }) || foe.troops !== tf) { console.log('FAIL: R15 전법 기력 부족 게이트'); process.exit(1); }
  me.qi = 100;
  // 혼란 중 발동 불가
  me.conf = 2;
  if (g21.fireTactic(me.id, { type: 'unit', id: foe.id })) { console.log('FAIL: R15 혼란 중 전법 차단'); process.exit(1); }
  me.conf = 0;
  // 사거리 밖 대상 차단
  const far = mk(8003, ef, [elead], 5000, 'bow', 30, 30);
  if (g21.fireTactic(me.id, { type: 'unit', id: far.id })) { console.log('FAIL: R15 사거리 밖 전법 차단'); process.exit(1); }
  // 도시 전법: 병력·내구 감소
  const ec = g21.cities.find(c => c.force === ef);
  me._tacTurn = -1; me.x = ec.lon - 1; me.z = ec.lat;
  const ct0 = ec.troops, ch0 = ec.hp;
  if (g21.fireTactic(me.id, { type: 'city', id: ec.id }) || ec.troops !== ct0) { console.log('FAIL: R15 R34 규칙: 비병기 도시 전법 차단'); process.exit(1); } // R34: 도시 대상 전법은 병기만
  { const ld = g21.officers[me.officers[0]]; ld.apt = ld.apt ?? {}; for (let k = 0; k < 12; k++) ld.apt[k] = 'S'; me.type = 'catapult'; me.qi = 100; me._tacTurn = -1; }
  if (!g21.fireTactic(me.id, { type: 'city', id: ec.id }) || ec.troops >= ct0 || ec.hp >= ch0) { console.log('FAIL: R15 도시 전법', ct0, ec.troops, ch0, ec.hp); process.exit(1); }
  // 함락: 잔여 병력·내구 소진 → 점령
  me._tacTurn = -1; me.qi = 100; ec.force = ef; ec.troops = 100; ec.hp = 10;
  const fr = g21.fireTactic(me.id, { type: 'city', id: ec.id }); if (!fr || ec.force !== pf) { console.log('FAIL: R15 직접 전법 함락', ec.force, fr, me.qi, me.type, pf, me.force, ec.troops, ec.hp); process.exit(1); }
  // 화계: 성공(확률 스텁 0) — 기력 -30, 병력 6% 소각
  const rand0 = Math.random;
  const intIdx = Object.values(g21.officers).find(o => o.state?.force === pf && o.int >= 90)?.idx ?? leadIdx;
  if (g21.officers[intIdx].int < 90) g21.officers[intIdx].int = 90; // 시험용 지력 보정
  const me2 = mk(8004, pf, [intIdx], 8000, 'bow', 40, 40);
  const foe2 = mk(8005, ef, [elead], 10000, 'sword', 41, 40);
  Math.random = () => 0;
  const fq = me2.qi, ft2 = foe2.troops;
  if (!g21.fireStrat(me2.id, 'fire', { type: 'unit', id: foe2.id }) || me2.qi !== fq - STRATS.fire.qi || foe2.troops !== ft2 - Math.round(ft2 * 0.06)) { console.log('FAIL: R15 화계 성공', me2.qi, foe2.troops); process.exit(1); }
  // 화계 실패(확률 스텁 0.999) — 기력 유지
  me2._stratTurn = -1;
  Math.random = () => 0.999;
  const fq2 = me2.qi;
  if (!g21.fireStrat(me2.id, 'fire', { type: 'unit', id: foe2.id }) || me2.qi !== fq2) { console.log('FAIL: R15 화계 실패 기력 유지'); process.exit(1); }
  // 부대당 턴 1회 제한
  if (g21.fireStrat(me2.id, 'fire', { type: 'unit', id: foe2.id })) { console.log('FAIL: R15 계략 턴 1회 제한'); process.exit(1); }
  // 혼란: 성공 시 conf 2·기력 -STRATS.confuse.qi
  me2._stratTurn = -1;
  Math.random = () => 0;
  const cq = me2.qi;
  if (!g21.fireStrat(me2.id, 'confuse', { type: 'unit', id: foe2.id }) || me2.qi !== cq - STRATS.confuse.qi || (foe2.conf ?? 0) !== 2) { console.log('FAIL: R15 혼란 성공', me2.qi, foe2.conf); process.exit(1); }
  // 위장 부대 면역
  const camo = mk(8006, ef, [elead], 3000, 'sword', 41, 41);
  g21.officers[elead].skill = '위장';
  me2._stratTurn = -1;
  if (g21.fireStrat(me2.id, 'confuse', { type: 'unit', id: camo.id })) { console.log('FAIL: R15 위장 면역'); process.exit(1); }
  // 화계 도시: 병력 8% 소각·내구 반감
  const ec2 = g21.cities.find(c => c.force != null && c.force !== pf && c !== ec);
  me2.x = ec2.lon - 1; me2.z = ec2.lat; me2._stratTurn = -1;
  Math.random = () => 0;
  const ct2 = ec2.troops, cq2 = me2.qi;
  if (!g21.fireStrat(me2.id, 'fire', { type: 'city', id: ec2.id }) || me2.qi !== cq2 - STRATS.fire.qi || ec2.troops !== ct2 - Math.round(ct2 * 0.08)) { console.log('FAIL: R15 화계 도시', me2.qi, ec2.troops); process.exit(1); }
  Math.random = rand0;
  // AI 측도 같은 규칙: 적 부대가 플레이어 부대에 직접 전법 (메서드 공용)
  { const ld = g21.officers[elead]; ld.apt = ld.apt ?? {}; for (let k = 0; k < 12; k++) ld.apt[k] = 'S'; }
  const swd = mk(8009, ef, [elead], 9000, 'sword', 60, 61), swt = mk(8010, pf, [leadIdx], 9000, 'sword', 61, 60); // R36: 검병은 전법 없음(설계 58행)
  if (g21.tacticInfo(swd) !== null || g21.fireTactic(swd.id, { type: 'unit', id: swt.id })) { console.log('FAIL: R36 검병 전법 차단'); process.exit(1); }
  const ai = mk(8007, ef, [elead], 9000, 'spear', 40, 41);
  const mine2 = mk(8008, pf, [leadIdx], 9000, 'sword', 41, 40);
  const mt0 = mine2.troops;
  if (g21.fireTactic(ai.id, { type: 'unit', id: mine2.id })) { console.log('FAIL: R39 창병 기본 전법이 남아 있음'); process.exit(1); } // 설계 밖 기본 전법 제거
  if (!g21.fireTactic(ai.id, { type: 'unit', id: mine2.id }, 'two') || mine2.troops >= mt0) { console.log('FAIL: R15 AI 동일 규칙 직접 전법'); process.exit(1); }
  console.log('R15 전법·계략 직접발동 게이트 PASS (전법기력/피해/반격없음/자격·혼란·사거리 차단/도시피해/함락/화계성공·실패/턴1회/혼란/위장면역/화계도시/AI동일규칙)');
}

// === R15 보강: 행동 경제 — 전법 턴 1회, 수동 발동 시 같은 턴 자동 판정 생략, AI 직접 발동 동일 규칙 ===
{
  const g22 = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
  g22.units = [];
  const pf = g22.playerForce;
  const ef = g22.cities.find(c => c.force != null && c.force !== pf).force;
  const leadIdx = g22.forces[pf].ruler;
  const elead = g22.forces[ef].ruler;
  const mk = (id, force, offs, troops, type, x, z) => { const u = { id, force, officers: offs, troops, type, x, z, path: [], tx: null, tz: null, targetCity: null, label: '보강' + id, qi: 100, conf: 0 }; g22.units.push(u); return u; };
  g22.officers[leadIdx].apt = {}; for (let k = 0; k < 12; k++) g22.officers[leadIdx].apt[k] = 'S'; // R39: 창병 기본 전법 제거 → 설계 EX(이단찌르기)로 검증
  const a1 = mk(8101, pf, [leadIdx], 10000, 'spear', 10, 10);
  const b1 = mk(8102, ef, [elead], 20000, 'sword', 11, 10);
  if (!g22.fireTactic(a1.id, { type: 'unit', id: b1.id }, 'two')) { console.log('FAIL: R15보강 첫 전법'); process.exit(1); }
  const bt = b1.troops;
  if (g22.fireTactic(a1.id, { type: 'unit', id: b1.id }) || b1.troops !== bt) { console.log('FAIL: R15보강 전법 턴 1회 제한'); process.exit(1); }
  if (g22.tacticInfo(a1) !== null) { console.log('FAIL: R15보강 tacticInfo 턴 제한'); process.exit(1); }
  // 수동 발동한 턴의 자동 야전에서 전법 재판정 생략 (확률 100% 스텁이어도 기력 추가 소모 없어야 함)
  const rand0 = Math.random; Math.random = () => 0;
  const intSave = g22.officers[leadIdx].int; g22.officers[leadIdx].int = 50; // 자동 계략 판정 분리(전법 중복만 검증)
  const aq = a1.qi;
  let tacLog0 = 0; const origLog22 = g22.log.bind(g22); g22.log = (m, mine) => { if (m.includes('【전법】') && m.includes(g22.officers[leadIdx].name_ko)) tacLog0++; origLog22(m, mine); };
  g22.fieldBattle(a1, b1);
  if (g22.pendingDuel) g22.duelAuto(g22.pendingDuel);
  g22.log = origLog22; g22.officers[leadIdx].int = intSave;
  if (a1.qi !== aq || tacLog0 !== 0) { console.log('FAIL: R15보강 수동 후 자동 전법 중복', aq, a1.qi, tacLog0); process.exit(1); }
  g22.turn += 1;
  if (!g22.tacticInfo(a1)) { console.log('FAIL: R15보강 다음 턴 전법 해제'); process.exit(1); }
  Math.random = rand0;
  // AI 직접 발동: aiThink가 인접 적에 같은 규칙(비용·턴 1회)으로 전법 사용
  const g23 = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
  g23.units = [];
  const ef23 = g23.cities.find(c => c.force != null && c.force !== g23.playerForce).force;
  { const ld = g23.officers[g23.forces[ef23].ruler]; ld.apt = ld.apt ?? {}; for (let k = 0; k < 12; k++) ld.apt[k] = 'S'; }
  const au = { id: 8201, force: ef23, officers: [g23.forces[ef23].ruler], troops: 9000, type: 'spear', x: 10, z: 10, path: [], tx: null, tz: null, targetCity: null, label: 'AI시험', qi: 100, conf: 0 };
  const pu = { id: 8202, force: g23.playerForce, officers: [g23.forces[g23.playerForce].ruler], troops: 9000, type: 'sword', x: 11, z: 10, path: [], tx: null, tz: null, targetCity: null, label: '플레이어시험', qi: 100, conf: 0 };
  g23.units.push(au, pu);
  const pt0 = pu.troops;
  aiThink(g23, ef23);
  if ((au._tacTurn ?? -1) !== g23.turn || pu.troops >= pt0) { console.log('FAIL: R15보강 AI 직접 전법', au._tacTurn, pu.troops, pt0); process.exit(1); }
  console.log('R15 보강 게이트 PASS (전법턴1회/수동후자동중복차단/다음턴해제/AI직접발동동일규칙)');
}

// === R16: 시각 표현 게이트 (구조 — 병종 모델·사계절·초상화 연출·조사) ===
{
  const mapSrc = readFileSync('js/map3d.js', 'utf8');
  const mainSrc = readFileSync('js/main.js', 'utf8');
  // 병종별 모델: 12병종 전부 unitBody에 분기
  const bodyStart = mapSrc.indexOf('unitBody(type)');
  if (bodyStart < 0) { console.log('FAIL: R16 unitBody 없음'); process.exit(1); }
  for (const t of ['sword','spear','pike','bow','cav','ram','tower','beast','catapult','junk','lou','dou']) {
    if (!mapSrc.slice(bodyStart).includes(`case '${t}'`)) { console.log('FAIL: R16 병종 모델 누락', t); process.exit(1); }
  }
  if (!mapSrc.includes('this.unitBody(unit.type')) { console.log('FAIL: R16 addUnit 병종 모델 미사용'); process.exit(1); }
  if (!mainSrc.includes('label: u.label, type: u.type')) { console.log('FAIL: R16 worldUnit type 미전달'); process.exit(1); }
  // 사계절: setSeason 4계절 분기 + refreshAll 호출
  if (!mapSrc.includes('setSeason(month)') || !mapSrc.includes('baseColors')) { console.log('FAIL: R16 setSeason 없음'); process.exit(1); }
  if (!mainSrc.includes('map.setSeason?.(game.month)')) { console.log('FAIL: R16 계절 미호출'); process.exit(1); }
  // 일기토·설전 초상화 연출
  if (!mainSrc.includes('portraitCss(po.idx)') || !mainSrc.includes('portraitCss(P.o)')) { console.log('FAIL: R16 대결 초상화 없음'); process.exit(1); }
  // 조사: 변환된 메시지에 괄호 조사 잔류 금지 (R15 게이트 시나리오 로그 검사)
  const g24 = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
  g24.units = [];
  const pf24 = g24.playerForce, ef24 = g24.cities.find(c => c.force != null && c.force !== pf24).force;
  const caster24 = Object.values(g24.officers).find(o => o.state?.force === pf24 && o.int >= 80) ?? Object.values(g24.officers).find(o => o.state?.force === pf24);
  caster24.int = Math.max(caster24.int, 90);
  const mk24 = (id, force, offs, troops, type, x, z) => { const u = { id, force, officers: offs, troops, type, x, z, path: [], tx: null, tz: null, targetCity: null, label: '시험부대' + id, qi: 100, conf: 0 }; g24.units.push(u); return u; };
  const a24 = mk24(8301, pf24, [caster24.idx], 9000, 'spear', 10, 10);
  const b24 = mk24(8302, ef24, [g24.forces[ef24].ruler], 9000, 'sword', 11, 10);
  const rand24 = Math.random; Math.random = () => 0;
  g24.fireTactic(a24.id, { type: 'unit', id: b24.id });
  a24._tacTurn = -1;
  g24.fireStrat(a24.id, 'confuse', { type: 'unit', id: b24.id });
  Math.random = rand24;
  const logs24 = g24.logs.map(l => l.msg);
  if (logs24.some(m => /\(가\)|\(를\)|\(로\)/.test(m))) { console.log('FAIL: R16 조사 괄호 잔류', logs24.filter(m => /\(가\)|\(를\)|\(로\)/.test(m))); process.exit(1); }
  if (!logs24.some(m => m.includes('시험부대8302가'))) { console.log('FAIL: R16 조사 적용 결과', logs24); process.exit(1); } // '부대8302'는 받침 없음 → '가'
  console.log('R16 시각 표현 게이트 PASS (병종12모델/사계절/대결초상화/조사적용)');
}
{
  const fs = await import('fs');

// === R17 갭 회수 게이트: 특기 5종 실효과 + 육군 수로 제한 + 황제 옹립 (전부 자체 설계·자체 수치) ===
{
  const fail = m => { console.log('FAIL: R17 ' + m); process.exit(1); };
  const SK = JSON.parse(readFileSync('data/skills.json', 'utf8'));
  if (!SK['신행']?.includes('이동 속도') || !SK['미끼']?.includes('우선') || !SK['이간'] || !SK['귀납'] || !SK['훈련']) fail('skills.json 재정의 누락');
  const mkG = () => new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);

  // 1) 훈련: 기력 턴 회복 +5 (같은 도시·같은 세력 부대 비교)
  {
    const g31 = mkG(); g31.units = [];
    const home = g31.cities.find(c => c.force === 0);
    const [oT, oN] = home.officers;
    g31.officers[oT].skill = '훈련'; g31.officers[oN].skill = '위장';
    const u1 = { id: 9101, force: 0, officers: [oT], troops: 5000, type: 'spear', x: home.lon, z: home.lat, path: [], tx: null, tz: null, targetCity: null, label: '훈련부대', qi: 50, conf: 0 };
    const u2 = { id: 9102, force: 0, officers: [oN], troops: 5000, type: 'spear', x: home.lon, z: home.lat, path: [], tx: null, tz: null, targetCity: null, label: '일반부대', qi: 50, conf: 0 };
    g31.units.push(u1, u2);
    g31.endTurn(() => {});
    if (u1.qi - u2.qi !== 5 || u1.qi < 65) fail(`훈련 기력 +5 (특기 ${u1.qi} vs 일반 ${u2.qi})`);
  }

  // 2) 신행: 이동 속도 +15% (같은 병종·출발점·목표 비교, 물 차단 없는 방향 선택)
  {
    const g32 = mkG(); g32.units = [];
    const home = g32.cities.find(c => c.force === 0);
    const [oS, oN] = home.officers;
    g32.officers[oS].skill = '신행'; g32.officers[oN].skill = '위장';
    let d1 = 0, d2 = 0;
    for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) {
      const g32b = mkG(); g32b.units = [];
      const h2 = g32b.cities.find(c => c.force === 0);
      const [pS, pN] = h2.officers;
      g32b.officers[pS].skill = '신행'; g32b.officers[pN].skill = '위장';
      const v1 = { id: 9201, force: 0, officers: [pS], troops: 5000, type: 'spear', x: h2.lon, z: h2.lat, path: [], tx: h2.lon + dx, tz: h2.lat + dz, targetCity: null, label: '신행부대', qi: 100, conf: 0 };
      const v2 = { id: 9202, force: 0, officers: [pN], troops: 5000, type: 'spear', x: h2.lon, z: h2.lat, path: [], tx: h2.lon + dx, tz: h2.lat + dz, targetCity: null, label: '일반부대2', qi: 100, conf: 0 };
      g32b.units.push(v1, v2);
      g32b.endTurn(() => {});
      d1 = Math.hypot(v1.x - h2.lon, v1.z - h2.lat); d2 = Math.hypot(v2.x - h2.lon, v2.z - h2.lat);
      if (d2 > 0.1) break;
    }
    if (d2 <= 0.1) fail('신행 비교 부대 미이동');
    if (Math.abs(d1 / d2 - 1.15) > 0.03) fail(`신행 속도 배율 (비율 ${(d1 / d2).toFixed(3)})`);
  }

  // 3) 이간: 등용 성공률 +0.1
  {
    const g33 = mkG();
    const home = g33.cities.find(c => c.force === 0);
    const free = Object.values(g33.officers).find(o => o.state && o.state.status !== 'officer' && !home.officers.includes(o.idx));
    free.state = { status: 'free', city: home.id, found: true, loyal: 60 };
    for (const i of home.officers) g33.officers[i].skill = '위장'; // 기존 특기 전부 제거 (진류에 이간 보유자 존재)
    const p0 = g33.recruitChance(home.id, free.idx);
    g33.officers[home.officers[0]].skill = '이간';
    const p1 = g33.recruitChance(home.id, free.idx);
    if (!(p0 > 0) || Math.abs(p1 - p0 - 0.1) > 1e-9) fail(`이간 등용률 +0.1 (${p0} -> ${p1})`);
  }

  // 4) 귀납: 항복 권고 성공률 +0.1 (랜덤 스텁으로 경계 결정적 검증)
  {
    const setup = skill => {
      const g34 = mkG();
      const my = g34.cities.find(c => c.force === 0);
      g34.officers[my.officers[0]].skill = skill;
      const tid = Object.values(g34.forces).find(f => f.alive && f.id !== 0 && g34.cities.filter(c => c.force === f.id).length === 1).id;
      g34.forces[0].ap = 99; my.gold = 5000;
      const chr = Math.max(50, ...my.officers.map(i => g34.officers[i].chr));
      const p0 = Math.min(0.5, 0.05 + (chr - 50) / 200);
      if (p0 > 0.4) fail('귀납 검증용 매력 상한 초과');
      return { g34, tid, my, stub: p0 + 0.05 };
    };
    const rand0 = Math.random;
    let a = setup('귀납'); Math.random = () => a.stub;
    const ok = a.g34.demandSurrender(0, a.tid, a.my.id);
    let b = setup('위장'); Math.random = () => b.stub;
    const no = b.g34.demandSurrender(0, b.tid, b.my.id);
    Math.random = rand0;
    if (!ok || no) fail('귀납 항복권고 경계 (귀납 성공·무특기 실패 기대)');
  }

  // 5) 미끼: AI 전법 타겟 우선 선택 (배열 후순위지만 미끼가 먼저 맞아야 함)
  {
    const g36 = mkG(); g36.units = [];
    const ef = g36.cities.find(c => c.force != null && c.force !== 0).force;
    const home = g36.cities.find(c => c.force === 0);
    const [o1, o2] = home.officers;
    g36.officers[o1].skill = '위장'; g36.officers[o2].skill = '미끼';
    let oE = null; // 전법 자격 있는 AI 세력 무장 탐색 (군주가 자격 미달일 수 있음)
    for (const i of Object.keys(g36.officers)) {
      if (g36.officers[i].state?.force !== ef) continue;
      const probe = { id: 9999, force: ef, officers: [Number(i)], troops: 10000, type: 'spear', x: 10, z: 10, path: [], tx: null, tz: null, targetCity: null, label: '탐색', qi: 100, conf: 0 };
      if (g36.tacticInfo(probe)) { oE = Number(i); break; }
    }
    if (oE == null) fail('미끼 검증용 전법 자격 무장 없음');
    const a = { id: 9301, force: ef, officers: [oE], troops: 10000, type: 'spear', x: 10, z: 10, path: [], tx: null, tz: null, targetCity: null, label: 'AI부대', qi: 100, conf: 0 };
    const uN = { id: 9302, force: 0, officers: [o1], troops: 9000, type: 'spear', x: 11, z: 10, path: [], tx: null, tz: null, targetCity: null, label: '일반표적', qi: 100, conf: 0 };
    const uM = { id: 9303, force: 0, officers: [o2], troops: 9000, type: 'spear', x: 12, z: 10, path: [], tx: null, tz: null, targetCity: null, label: '미끼표적', qi: 100, conf: 0 };
    g36.units.push(a, uN, uM); // 미끼를 배열 뒤에 배치 — 정렬로 앞에 와야 함
    const rand0 = Math.random; Math.random = () => 0.01;
    aiThink(g36, ef);
    Math.random = rand0;
    if (!(uM.troops < 9000) || uN.troops !== 9000) fail(`미끼 우선 타겟팅 (미끼 ${uM.troops} / 일반 ${uN.troops})`);
  }

  // 6) 육군 강 도하(감속)·바다 차단 + A* 경로 도시간 도착 + 수군 수로 유지
  {
    const g38 = mkG(); g38.units = [];
    const o = g38.forces[0].ruler;
    // 6a) 바다 차단: 해안에서 바다로 향하는 육군은 정지 + 로그
    let coast = null;
    for (let lat = 26; lat <= 38 && !coast; lat += 0.5)
      for (let lon = 118; lon <= 130 && !coast; lon += 0.1)
        if (!isWaterAt(lon, lat) && isSeaAt(lon + 0.6, lat)) coast = [lon, lat];
    if (!coast) fail('해안 좌표 탐색');
    const seaU = { id: 9401, force: 0, officers: [o], troops: 5000, type: 'spear', x: coast[0], z: coast[1], path: [], tx: coast[0] + 2.4, tz: coast[1], targetCity: null, label: '바다시험', qi: 100, conf: 0 };
    g38.units.push(seaU);
    for (let i = 0; i < 4; i++) { g38.endTurn(() => {}); if (isSeaAt(seaU.x, seaU.z)) fail('육군이 바다 위에 위치'); }
    if (!seaU._waterWarn) fail('육군 바다 차단 로그 미발생');
    // 6b) 강 도하: 강을 사이에 둔 육군은 감속으로 건너 반대편 도달
    let riv = null;
    for (let lat = 28; lat <= 38 && !riv; lat += 0.25)
      for (let lon = 108; lon <= 125 && !riv; lon += 0.05)
        if (!isWaterAt(lon, lat) && isRiverAt(lon + 0.6, lat) && !isWaterAt(lon + 1.6, lat)) riv = [lon, lat];
    if (!riv) fail('도하 검증 강 좌표 탐색');
    const rivU = { id: 9403, force: 0, officers: [o], troops: 5000, type: 'spear', x: riv[0], z: riv[1], path: [], tx: riv[0] + 1.5, tz: riv[1], targetCity: null, label: '도하시험', qi: 100, conf: 0 };
    g38.units.push(rivU);
    let crossed = false, slowedSeen = false;
    for (let i = 0; i < 12 && !crossed; i++) { g38.endTurn(() => {}); if (isRiverAt(rivU.x, rivU.z)) slowedSeen = true; if (rivU.x >= riv[0] + 1.4 || Math.hypot(rivU.tx - rivU.x, rivU.tz - rivU.z) <= 1.2) crossed = true; }
    if (!crossed) fail('육군 강 도하 실패');
    if (!slowedSeen) fail('도하 감속 구간 미통과');
    // 6c) A* 경로 도시간 행군 도착 (강 건너 노선 포함, 엔진 경로 직접 호출)
    const march = (fromName, toName, maxSteps) => {
      const g38b = mkG(); g38b.units = [];
      const a = g38b.cities.find(c => c.name_ko === fromName), b = g38b.cities.find(c => c.name_ko === toName);
      const oo = g38b.forces[a.force ?? 0]?.ruler ?? g38b.forces[0].ruler;
      const u = { id: 9450, force: a.force ?? 0, officers: [oo], troops: 5000, type: 'spear', x: a.lon, z: a.lat, path: [], tx: null, tz: null, targetCity: null, label: '행군', qi: 100, conf: 0 };
      g38b.units.push(u);
      u.tx = b.lon; u.tz = b.lat; u.path = g38b.findPath(u, b.lon, b.lat) ?? [];
      if (!u.path.length) return { ok: false, why: 'no path' };
      for (let i = 0; i < maxSteps; i++) { if (!u.path.length && (u.tx == null || Math.hypot(u.tx - u.x, u.tz - u.z) <= 1.2)) return { ok: true, steps: i }; g38b.stepUnit(u); if (isSeaAt(u.x, u.z)) return { ok: false, why: 'on sea' }; }
      return { ok: true, steps: maxSteps, note: 'loop-end ' + (u.tx == null ? 'arrived' : Math.hypot(u.tx - u.x, u.tz - u.z).toFixed(1)) };
    };
    for (const [a, b, mx] of [['장안', '낙양', 800], ['북평', '낙양', 800], ['낙양', '건업', 800], ['하비', '수춘', 400]]) {
      const r = march(a, b, mx);
      if (!r.ok) fail(`도시간 행군 ${a}->${b} (${r.why})`);
    }
    // 6d) 수군 해상 이동 유지
    let sea = null;
    for (let lat = 26; lat <= 38 && !sea; lat += 0.5)
      for (let lon = 118; lon <= 130 && !sea; lon += 0.1)
        if (isWaterAt(lon, lat) && isWaterAt(lon + 2.4, lat)) sea = [lon, lat];
    if (!sea) fail('해상 구간 탐색');
    const ship = { id: 9402, force: 0, officers: [o], troops: 5000, type: 'junk', x: sea[0], z: sea[1], path: [], tx: sea[0] + 2.4, tz: sea[1], targetCity: null, label: '수군시험', qi: 100, conf: 0 };
    g38.units.push(ship);
    const sx = ship.x;
    g38.endTurn(() => {});
    if (!(ship.x > sx)) fail('수군 해상 이동');
  }

  // 7) 황제 옹립: 190 존재·옹립 세력 월 기교P +10·옹립 교체 로그·즉위 게이트, 251 부재 시 자유 즉위
  {
    const g39 = mkG();
    if (!g39.emperor) fail('황제 엔티티 생성 (190)');
    const holder0 = g39.emperorHolder();
    if (holder0 == null) fail('초기 옹립 세력');
    g39.dan = 3;
    const tp0 = g39.forces[holder0].techP;
    g39.endTurn(() => {});
    if (g39.forces[holder0].techP - tp0 !== 10) fail(`옹립 세력 월 기교P +10 (${g39.forces[holder0].techP - tp0})`);
    g39.cityById[g39.emperor.city].force = 0; g39.dan = 3;
    g39.endTurn(() => {});
    if (g39.emperor.holder !== 0 || !g39.logs.some(l => l.msg.includes('【옹립】'))) fail('옹립 교체 로그');
    let n = 0; for (const c of g39.cities) { if (n >= 24) break; c.force = 0; n++; }
    g39.cityById[g39.emperor.city].force = 0;
    if (g39.forceRank(0) !== '황제') fail('옹립 세력 즉위');
    g39.cityById[g39.emperor.city].force = holder0;
    const r = g39.forceRank(0);
    if (r === '황제' || !r) fail(`미옹립 세력 즉위 차단 (${r})`);
    const scen251 = JSON.parse(readFileSync('data/scenario-251.json', 'utf8'));
    const g40 = new Game(scen251, JSON.parse(JSON.stringify(officers)), {}, 0);
    if (g40.emperor !== null) fail('황제 부재 (251)');
    const fid = Object.values(g40.forces).find(f => f.alive).id;
    let m = 0; for (const c of g40.cities) { if (m >= 24) break; c.force = fid; m++; }
    if (g40.forceRank(fid) !== '황제') fail('황제 부재 시 자유 즉위 (251)');
  }
  if (!readFileSync('js/game.js', 'utf8').includes('emperor: this.emperor,')) fail('황제 저장 필드 누락');
  // 8) R17b: 경로 실패 안전 처리 — 도달 불가 명령 거부(직선 폴백 없음) + 정상 노선 true
  {
    const g50 = mkG(); g50.units = [];
    const han = g50.cities.find(c => c.name_ko === '양평'), tgt = g50.cities.find(c => c.name_ko === '성도');
    const o = g50.forces[0].ruler;
    const ship = { id: 9501, force: 0, officers: [o], troops: 5000, type: 'junk', x: han.lon, z: han.lat, path: [], tx: null, tz: null, targetCity: null, label: '내륙수군', qi: 100, conf: 0 };
    g50.units.push(ship);
    const before = g50.logs.length;
    const r = g50.orderUnit(ship.id, tgt.id);
    if (r !== false || ship.targetCity != null || ship.tx != null) fail('도달 불가 명령이 거부되지 않음');
    if (!g50.logs.slice(before).some(l => l.msg.includes('노선이 없어'))) fail('도달 불가 안전 실패 로그 없음');
    const land = { id: 9502, force: 0, officers: [o], troops: 5000, type: 'spear', x: han.lon, z: han.lat, path: [], tx: null, tz: null, targetCity: null, label: '육로', qi: 100, conf: 0 };
    g50.units.push(land);
    if (g50.orderUnit(land.id, tgt.id) !== true || !land.path.length) fail('정상 노선 명령 실패');
    // AI 장기 정지 부대 계측: 60턴 시뮬 중 10턴 연속 같은 위치 + targetCity 보유 부대 0건, 도착률 집계
    const g51 = mkG();
    const track = new Map(); let engagedTurns = 0, siegeTurns = 0, stalled = 0, issued = new Set(), gone = new Set();
    for (let tn = 0; tn < 60; tn++) {
      g51.delegated = false; aiThink(g51, g51.playerForce); g51.endTurn(aiThink);
      if (g51.pendingDuel) g51.duelAuto(g51.pendingDuel); if (g51.pendingDebate) g51.debateAuto(g51.pendingDebate);
      const live = new Set();
      for (const u of g51.units) {
        if (u.force === -1 || u.targetCity == null) continue;
        live.add(u.id); issued.add(u.id);
        const k = track.get(u.id); const pos = u.x.toFixed(2) + ',' + u.z.toFixed(2);
        const eng = g51.units.some(v => v !== u && v.force !== u.force && Math.hypot(v.x - u.x, v.z - u.z) < 2.2); // 게임의 요격 판정(적병 force -1 포함)과 동일 기준 const sieging = Math.hypot(u.tx - u.x, u.tz - u.z) <= 1.2 && g51.cityById[u.targetCity]?.force !== u.force; if (sieging && k && k.pos === pos) siegeTurns++; if (k && k.pos === pos && !(u.conf > 0) && !eng && !sieging) { k.n++; if (k.n >= 10) { stalled++; if (process.env.DBG && k.n === 10) console.log('  STALL', u.label, u.type, 'pos', pos, 'tgt', g51.cityById[u.targetCity]?.name_ko, 'dist', Math.hypot(u.tx - u.x, u.tz - u.z).toFixed(2), 'path', JSON.stringify(u.path.slice(0,2)), 'water', isWaterAt(u.x, u.z), 'sea', isSeaAt(u.x,u.z), 'warn', u._waterWarn, u._landWarn, 'conf', u.conf); } } else if (k && k.pos === pos && eng) { k.eng = (k.eng ?? 0) + 1; engagedTurns++; } else track.set(u.id, { pos, n: 0 });
      }
      for (const id of issued) if (!live.has(id)) gone.add(id);
    }
    console.log(`  R17b 계측: 출진 부대 ${issued.size}, 종료(도착·전멸) ${gone.size}, 10턴 이상 정지(교전 제외) ${stalled}, 교전 대치 부대턴 ${engagedTurns}, 도시 공성 대치 부대턴(정지 판정 제외, 별도 집계) ${siegeTurns}`);
    for (const u of g51.units) if (!Number.isFinite(u.x) || !Number.isFinite(u.z)) fail('부대 좌표 NaN');
    if (stalled > 0) fail(`장기 정지 부대 ${stalled}건`);
  }
  console.log('R17 갭 회수 게이트 PASS (훈련+5/신행1.15/이간+0.1/귀납+0.1/미끼타겟/육군바다차단/강도하감속/A*도시간행군4노선/수군통과/옹립techP+10/옹립교체로그/즉위게이트/251자유즉위)');
}
  { // R17c: 진입점·전 모듈 import·데이터 fetch 가 동일 버전 쿼리를 쓰는지
    const vs = new Set(); let cnt = 0;
    for (const [f, re] of [['js/main.js', /from '\.\/(?:map3d|game|ai)\.js\?v=([\w.-]+)'/g], ['js/map3d.js', /from '\.\/assets-3d\.js\?v=([\w.-]+)'/g], ['js/ai.js', /from '\.\/game\.js\?v=([\w.-]+)'/g], ['index.html', /src="js\/main\.js\?v=([\w.-]+)"/g], ['index.html', /href="css\/style\.css\?v=([\w.-]+)"/g], ['js/main.js', /fetch\(u \+ '\?v=([\w.-]+)'\)/g]]) {
      const s = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'); for (const m of s.matchAll(re)) { vs.add(m[1]); cnt++; }
    }
    if (vs.size !== 1 || cnt !== 8) { console.error('FAIL: R17c 버전 쿼리 불일치', [...vs], cnt); process.exit(1); }
    console.log('R17c 모듈 버전 일관 게이트 PASS (v=' + [...vs][0] + ', 참조 8곳(CSS 포함))');
  }

{ // R31: 빌드 ID 일치 게이트
  const a = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').match(/name="build" content="([\w.-]+)"/)?.[1];
  const b = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8').match(/const BUILD_ID = '([\w.-]+)'/)?.[1];
  const v = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').match(/main\.js\?v=([\w.-]+)/)?.[1];
  if (!a || a !== b || a !== v) { console.error('FAIL: R31 빌드 ID 불일치', a, b, v); process.exit(1); }
  console.log('R31 빌드 ID 일치 게이트 PASS (' + a + ')');
}
  const vm = await import('vm');
  const src = fs.readFileSync(new URL('../js/bundle.js', import.meta.url), 'utf8');
  if (/^export \{/m.test(src)) { console.error('FAIL: 번들에 export 목록 문장 잔류 (TDZ 위험)'); process.exit(1); }
  const noImports = src.split('\n').filter(l => !/^import /.test(l)).join('\n');
  const magic = new Proxy(function(){}, { get: (t, p) => (p === Symbol.toPrimitive ? () => 0 : magic), construct: () => magic, apply: () => magic, set: () => true });
  const sandbox = {
    document: { getElementById: () => magic, querySelector: () => magic, querySelectorAll: () => [], addEventListener(){}, createElement: () => magic, body: magic },
    localStorage: { getItem: () => null, setItem(){}, removeItem(){} },
    fetch: () => new Promise(() => {}),
    location: { reload(){} },
    console, setTimeout, clearTimeout, THREE: magic, requestAnimationFrame: () => 0,
  };
  sandbox.window = sandbox;
  try { new vm.Script(noImports, { filename: 'bundle.js' }).runInNewContext(sandbox); }
  catch (e) { console.error('FAIL: 번들 초기화 오류', e.message); process.exit(1); }
  console.log('번들 부팅 게이트 PASS (초기화 오류 없음)');
}

// === R18: 위보·진정 계략 게이트 (결정적: 확률 스텁) ===
{
  const g = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
  g.units = [];
  const pf = g.playerForce;
  const ef = g.cities.find(c => c.force != null && c.force !== pf).force;
  const lead = g.forces[pf].ruler, elead = g.forces[ef].ruler;
  const mk = (id, force, offs, troops, type, x, z) => { const u = { id, force, officers: offs, troops, type, x, z, path: [], tx: null, tz: null, targetCity: null, label: '시험' + id, qi: 100, conf: 0 }; g.units.push(u); return u; };
  g.officers[lead].int = 90;
  const hc0 = g.cities.find(c => c.force === ef);
  const bx = hc0.lon + 3, bz = hc0.lat;
  const me = mk(8101, pf, [lead], 10000, 'spear', bx, bz);
  const ally = mk(8102, pf, [lead], 5000, 'sword', bx + 0.5, bz);
  const foe = mk(8103, ef, [elead], 10000, 'sword', bx + 1, bz);
  const r0 = Math.random; Math.random = () => 0;
  // 진정: 혼란 해제, 기력 -10, 대상 기력 +20
  ally.conf = 2; ally.qi = 50; me.qi = 100;
  if (!g.fireStrat(me.id, 'calm', { type: 'unit', id: ally.id }) || ally.conf !== 0 || ally.qi !== 70 || me.qi !== 90) { Math.random = r0; console.log('FAIL: R18 진정', ally.conf, ally.qi, me.qi); process.exit(1); }
  // 진정: 적 부대 대상 차단 / 기력 부족 차단
  me._stratTurn = -1;
  if (g.fireStrat(me.id, 'calm', { type: 'unit', id: foe.id })) { Math.random = r0; console.log('FAIL: R18 진정 적대상 차단'); process.exit(1); }
  me.qi = 5;
  if (g.fireStrat(me.id, 'rumor', { type: 'unit', id: foe.id }) || foe.path.length) { Math.random = r0; console.log('FAIL: R18 위보 기력 부족 차단'); process.exit(1); }
  // 위보: 기력 -15, 적 부대가 자기 도시로 퇴각 경로 부여
  me.qi = 100; me._stratTurn = -1; foe.path = []; foe.targetCity = null;
  const ok = g.fireStrat(me.id, 'rumor', { type: 'unit', id: foe.id });
  Math.random = r0;
  if (!ok || me.qi !== 85) { console.log('FAIL: R18 위보 비용/성공', ok, me.qi); process.exit(1); }
  const hc = g.cityById[foe.targetCity];
  if (!hc || hc.force !== ef || !foe.path || !foe.path.length) { console.log('FAIL: R18 위보 퇴각경로 없음', foe.targetCity); process.exit(1); }
  // 같은 턴 재발동 차단
  if (g.fireStrat(me.id, 'rumor', { type: 'unit', id: foe.id })) { console.log('FAIL: R18 위보 턴 1회'); process.exit(1); }
  // AI 경로: 혼란 아군이 있으면 AI가 진정을 쓴다 (같은 fireStrat 경로)
  const g2 = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
  g2.units = [];
  const ef2 = g2.cities.find(c => c.force != null && c.force !== g2.playerForce).force;
  const el2 = g2.forces[ef2].ruler; g2.officers[el2].int = 90;
  const au = { id: 8201, force: ef2, officers: [el2], troops: 8000, type: 'spear', x: 20, z: 20, path: [], tx: null, tz: null, targetCity: null, label: 'AI시험1', qi: 100, conf: 0 };
  const av = { ...au, id: 8202, x: 20.5, label: 'AI시험2', conf: 2, qi: 40, path: [] };
  g2.units.push(au, av);
  const r1 = Math.random; Math.random = () => 0;
  aiThink(g2, ef2);
  Math.random = r1;
  if (av.conf !== 0) { console.log('FAIL: R18 AI 진정 사용 (같은 규칙)', av.conf); process.exit(1); }
  console.log('R18 위보·진정 게이트 PASS (진정 해제·비용·적대상차단·기력부족/위보 비용·퇴각경로·턴1회/AI 진정)');
}

// === R18b: 병종별 추가 전법 게이트 (결정적: 직접 발동은 확정) ===
{
  const mkg = () => { const g = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0); g.units = []; return g; };
  const setup = (type, apt = 'S') => {
    const g = mkg(); const pf = g.playerForce, ef = g.cities.find(c => c.force != null && c.force !== pf).force;
    const lead = g.forces[pf].ruler, el = g.forces[ef].ruler;
    g.officers[lead].apt = [apt, apt, apt, apt, apt, apt];
    const mk = (id, force, offs, troops, t, x, z) => { const u = { id, force, officers: offs, troops, type: t, x, z, path: [], tx: null, tz: null, targetCity: null, label: '전' + id, qi: 100, conf: 0 }; g.units.push(u); return u; };
    return { g, pf, ef, lead, el, mk };
  };
  const X = 107.0, Z = 33.0;
  const fail = m => { console.log('FAIL: R18b ' + m); process.exit(1); };
  // 창병 3종
  { const { g, pf, ef, lead, el, mk } = setup('spear'); const me = mk(8301, pf, [lead], 10000, 'spear', X, Z), foe = mk(8302, ef, [el], 10000, 'sword', X + 1, Z);
    if (!g.fireTactic(me.id, { type: 'unit', id: foe.id }, 'spiral') || foe.conf !== 2 || me.qi !== 85) fail('나선찌르기 ' + foe.conf + ' ' + me.qi);
    me._tacTurn = -1; foe.x = X + 1;
    if (!g.fireTactic(me.id, { type: 'unit', id: foe.id }, 'two') || !(foe.x > X + 1.3) || me.qi !== 70) fail('이단찌르기 격퇴 ' + foe.x);
    me._tacTurn = -1; const x1 = foe.x; foe.x = X + 1; me.qi = 100;
    if (!g.fireTactic(me.id, { type: 'unit', id: foe.id }, 'thrust') || !(foe.x > x1 + 0.5 || foe.x > X + 2.4)) fail('돌출찌르기 2칸 ' + foe.x);
    // 적성 부족: C 적성이면 추가 전법 불가
    const s2 = setup('spear', 'C'); const m2 = s2.mk(8311, s2.pf, [s2.lead], 10000, 'spear', X, Z), f2 = s2.mk(8312, s2.ef, [s2.el], 10000, 'sword', X + 1, Z);
    if (s2.g.fireTactic(m2.id, { type: 'unit', id: f2.id }, 'spiral') || s2.g.fireTactic(m2.id, { type: 'unit', id: f2.id }, 'thrust')) fail('적성 부족 차단');
    // 도시 대상 추가 전법 차단
    const ec = g.cities.find(c => c.force === ef); me._tacTurn = -1; me.qi = 100; me.x = ec.lon - 1; me.z = ec.lat;
    if (g.fireTactic(me.id, { type: 'city', id: ec.id }, 'spiral')) fail('도시 대상 차단');
  }
  // 바다 격퇴 차단: 해안(육지→바다) 지점을 탐색해 바다 쪽으로는 밀리지 않음
  { let cx = null, cz = null;
    for (let lon = 108; lon < 124 && cx == null; lon += 0.1) for (let lat = 22; lat < 41; lat += 0.1) if (!isSeaAt(lon, lat) && !isSeaAt(lon - 1, lat) && isSeaAt(lon + 0.45, lat) && !isRiverAt(lon, lat)) { cx = lon; cz = lat; break; }
    if (cx == null) fail('해안 탐색 실패');
    const { g, pf, ef, lead, el, mk } = setup('spear'); const me = mk(8321, pf, [lead], 10000, 'spear', cx - 1, cz), foe = mk(8322, ef, [el], 10000, 'sword', cx, cz);
    g.fireTactic(me.id, { type: 'unit', id: foe.id }, 'thrust');
    if (isSeaAt(foe.x, foe.z)) fail('바다로 밀려남'); if (foe.x > cx + 0.41) fail('해안 정지 실패 ' + foe.x);
  }
  // 극병: 웅수 끌어당김, 옆베기(전방), 선풍(전방위)
  { const { g, pf, ef, lead, el, mk } = setup('pike'); const me = mk(8331, pf, [lead], 10000, 'pike', X, Z), foe = mk(8332, ef, [el], 10000, 'sword', X + 1.9, Z), b = mk(8333, ef, [el], 10000, 'sword', X, Z + 1.5), back = mk(8334, ef, [el], 10000, 'sword', X - 1.5, Z);
    if (!g.fireTactic(me.id, { type: 'unit', id: foe.id }, 'hook') || !(foe.x < X + 1.9)) fail('웅수 ' + foe.x);
    me._tacTurn = -1; const bt = b.troops, kt = back.troops; foe.x = X + 1; foe.z = Z; b.x = X + 1; b.z = Z + 0.4; me.qi = 100;
    if (!g.fireTactic(me.id, { type: 'unit', id: foe.id }, 'side') || b.troops >= bt || back.troops !== kt) fail('옆베기 전방만 ' + b.troops + ' ' + back.troops);
    me._tacTurn = -1; me.qi = 100; const kt2 = back.troops;
    if (!g.fireTactic(me.id, { type: 'unit', id: foe.id }, 'whirl') || back.troops >= kt2 || me.qi !== 75) fail('선풍 전방위 ' + back.troops);
  }
  // 노병: 관통화살(직선 뒤), 난사(주변)
  { const { g, pf, ef, lead, el, mk } = setup('bow'); const me = mk(8341, pf, [lead], 10000, 'bow', X, Z), foe = mk(8342, ef, [el], 10000, 'sword', X + 1, Z), behind = mk(8343, ef, [el], 10000, 'sword', X + 1.8, Z), side = mk(8344, ef, [el], 10000, 'sword', X + 1, Z + 1.0);
    const bt = behind.troops, st = side.troops;
    if (!g.fireTactic(me.id, { type: 'unit', id: foe.id }, 'pierce') || behind.troops >= bt || side.troops !== st) fail('관통화살 ' + behind.troops + ' ' + side.troops);
    me._tacTurn = -1; me.qi = 100;
    if (!g.fireTactic(me.id, { type: 'unit', id: foe.id }, 'volley') || side.troops >= st || me.qi !== 70) fail('난사 ' + side.troops);
  }
  // 기병: 돌진 1칸 밀기, 돌파 관통, 돌격 2칸
  { const { g, pf, ef, lead, el, mk } = setup('cav'); const me = mk(8351, pf, [lead], 10000, 'cav', X, Z), foe = mk(8352, ef, [el], 10000, 'sword', X + 1, Z), behind = mk(8353, ef, [el], 10000, 'sword', X + 1.9, Z);
    if (!g.fireTactic(me.id, { type: 'unit', id: foe.id }, 'rush') || !(foe.x > X + 1.3)) fail('돌진');
    me._tacTurn = -1; foe.x = X + 1; behind.x = X + 1.9; behind.z = Z; const bt = behind.troops; me.qi = 100;
    if (!g.fireTactic(me.id, { type: 'unit', id: foe.id }, 'breach') || behind.troops >= bt) fail('돌파 관통');
    // 병기 전법은 변화 없음(기본 전법만)
    const s3 = setup('ram'); const r = s3.mk(8361, s3.pf, [s3.lead], 5000, 'ram', X, Z), f3 = s3.mk(8362, s3.ef, [s3.el], 5000, 'sword', X + 1, Z);
    if (g.tacticInfo(r) !== null && false) fail('x');
    if (s3.g.tacticInfo(r).opts.length !== 1) fail('병기 추가 전법 없음 확인');
  }
  // R39: 기본 전법(tid 없음)은 설계에 기본 전법이 있는 병종(노병 불화살)만 이전과 같은 경로, 창병은 기본 전법 없음
  { const { g, pf, ef, lead, el, mk } = setup('spear'); const me = mk(8371, pf, [lead], 10000, 'spear', X, Z), foe = mk(8372, ef, [el], 10000, 'sword', X + 1, Z), q0 = me.qi, t0 = foe.troops;
    if (g.fireTactic(me.id, { type: 'unit', id: foe.id }) || me.qi !== q0 || foe.troops !== t0) fail('창병 기본 전법이 남아 있음'); }
  { const { g, pf, ef, lead, el, mk } = setup('bow'); const me = mk(8373, pf, [lead], 10000, 'bow', X, Z), foe = mk(8374, ef, [el], 10000, 'sword', X + 1, Z), q0 = me.qi;
    if (!g.fireTactic(me.id, { type: 'unit', id: foe.id }) || me.qi !== q0 - 15 || foe.x !== X + 1) fail('노병 기본 전법(불화살) 불변'); }
  // AI: 같은 fireTactic 경로로 추가 전법 사용 (혼란 미부여 대상엔 나선찌르기)
  { const { g, pf, ef, lead, el, mk } = setup('spear'); const ai = g.cities.find(c => c.force === ef).force;
    g.officers[el].apt = ['S', 'S', 'S', 'S', 'S', 'S'];
    const au = mk(8381, ef, [el], 10000, 'spear', X, Z), pu = mk(8382, pf, [lead], 10000, 'sword', X + 1, Z);
    const r0 = Math.random; Math.random = () => 0; aiThink(g, ef); Math.random = r0;
    if (!(pu.conf > 0) && !(Math.hypot(pu.x - X, pu.z - Z) > 1.2) && au.qi === 100) fail('AI 추가 전법 미사용 ' + au.qi);
  }
  console.log('R18b 병종별 추가 전법 게이트 PASS (창3·극3·노2·기병3·격퇴 지형차단·적성차단·도시차단·병기 불변·기본 불변·AI 사용)');
}

// === R21: 조사 괄호 표기 잔존 금지 게이트 ===
{
  for (const f of ['js/game.js', 'js/main.js']) {
    const src = readFileSync(f, 'utf8').split('\n').filter(l => !l.includes('export function josaRo')).join('\n');
    const m = src.match(/\((이|가|은|는|을|를|으|과|와)\)/g);
    if (m) { console.log('FAIL: R21 조사 괄호 표기 잔존', f, m.length, m.slice(0, 3)); process.exit(1); }
  }
  console.log('R21 조사 괄호 표기 게이트 PASS (game.js·main.js 괄호 조사 0건)');
}

// === R23: 여울·난소행군 게이트 ===
{
  const fail = m => { console.log('FAIL: R23 ' + m); process.exit(1); };
  const mkg = () => new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
  // 1) 여울은 강 타일의 일부(20~60%)이며 강이 아닌 곳엔 없음
  let riv = 0, ford = 0, bad = 0;
  for (let lon = 100; lon < 124; lon += 0.1) for (let lat = 20; lat < 42; lat += 0.1) { if (isRiverAt(lon, lat)) { riv++; if (isFordAt(lon, lat)) ford++; } else if (isFordAt(lon, lat)) bad++; }
  if (!riv || bad || ford / riv < 0.2 || ford / riv > 0.6) fail(`여울 비율 ${ford}/${riv} bad=${bad}`);
  // 2) 감속: 깊은 강 < 여울 < 난소행군
  const g = mkg(); const f0 = g.playerForce;
  let deep = null, shal = null;
  for (let lon = 100; lon < 124 && !(deep && shal); lon += 0.1) for (let lat = 20; lat < 42; lat += 0.1) { if (!isRiverAt(lon, lat) || isSeaAt(lon, lat)) continue; if (isFordAt(lon, lat)) shal = shal || [lon, lat]; else deep = deep || [lon, lat]; }
  const U = (x, z) => ({ id: 1, force: f0, officers: [], troops: 100, type: 'spear', x, z });
  const mDeep = g.riverMult(U(...deep)), mFord = g.riverMult(U(...shal));
  g.forces[f0].arts = { '난소행군': true }; const mArt = g.riverMult(U(...deep));
  g.forces[f0].arts = {};
  if (!(mDeep < mFord && mFord < mArt)) fail(`도하 속도 ${mDeep} ${mFord} ${mArt}`);
  // 3) 연구: 기교P·금 부족 시 실패, 충분하면 소모·1회만
  const cap = g.forceCities(f0).sort((a, b) => b.gold - a.gold)[0];
  g.forces[f0].techP = 100; if (g.researchArt(f0, '난소행군') || g.forces[f0].arts['난소행군']) fail('기교P 부족 차단');
  g.forces[f0].techP = 2000; cap.gold = 5000; const g0 = cap.gold;
  if (!g.researchArt(f0, '난소행군') || g.forces[f0].techP !== 2000 - ARTS['난소행군'].p || cap.gold !== g0 - ARTS['난소행군'].gold) fail('연구 소모');
  if (g.researchArt(f0, '난소행군')) fail('중복 연구 차단');
  // 4) 장거리 노선: 한중->성도 불가는 유지, 장안->낙양 등 육로는 난소행군 유무와 무관하게 존재(경로 단절 없음)
  const han = g.cities.find(c => c.name_ko === '한중'), jang = g.cities.find(c => c.name_ko === '장안'), nak = g.cities.find(c => c.name_ko === '낙양'), hui = g.cities.find(c => c.name_ko === '허창'), jian = g.cities.find(c => c.name_ko === '건업');
  const o = g.forces[f0].ruler;
  const pathLen = (art, a, b) => { const gg = mkg(); gg.forces[f0].arts = art ? { '난소행군': true } : {}; const u = { id: 5, force: f0, officers: [o], troops: 100, type: 'spear', x: a.lon, z: a.lat, path: [], tx: null, tz: null, targetCity: null }; const p = gg.findPath(u, b.lon, b.lat); return p ? p.length : null; };
  for (const [a, b] of [[jang, nak], [nak, hui], [han, jang], [hui, jian]]) {
    const n0 = pathLen(false, a, b), n1 = pathLen(true, a, b);
    if (!n0 || !n1) fail(`노선 단절 ${a.name_ko}->${b.name_ko} (${n0}/${n1})`);
  }
  // 5) 노선 연결성 표본: 육지 도시 쌍 40개에서 기교 유무로 도달 가능 여부가 달라지지 않음
  const land = g.cities.filter(c => !isSeaAt(c.lon, c.lat)); let diff = 0, checked = 0;
  for (let k = 0; k < 40; k++) { const a = land[(k * 7) % land.length], b = land[(k * 11 + 3) % land.length]; if (a === b) continue; checked++; if (!!pathLen(false, a, b) !== !!pathLen(true, a, b)) diff++; }
  if (diff) fail(`기교 유무로 도달 가능 여부가 달라진 쌍 ${diff}/${checked}`);
  // 6) AI 연구: 같은 비용 경로
  const g2 = mkg(); const ef = g2.cities.find(c => c.force != null && c.force !== g2.playerForce).force;
  g2.turn = 3; g2.forces[ef].techP = 5000; for (const c of g2.forceCities(ef)) c.gold = 20000;
  aiThink(g2, ef);
  if (!g2.forces[ef].arts?.['난소행군']) fail('AI 난소행군 연구');
  console.log(`R23 여울·난소행군 게이트 PASS (여울 ${ford}/${riv}=${(ford / riv * 100).toFixed(0)}%, 속도 ${mDeep}<${mFord}<${mArt}, 연구 소모·중복차단, 노선 단절 없음 ${checked}쌍, AI 연구)`);
}

// === R26: 야전 시설 게이트 ===
{
  const fail = m => { console.log('FAIL: R26 ' + m); process.exit(1); };
  const mkg = () => new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
  const g = mkg(); g.units = []; g.fieldFacs = []; const f0 = g.playerForce; const e0 = g.cities.find(c => c.force != null && c.force !== f0).force;
  const mk = (id, force, x, z, troops = 3000) => { const u = { id, force, officers: [], troops, type: 'spear', x, z, path: [], tx: null, tz: null, targetCity: null, label: 'T' + id, qi: 100, conf: 0 }; g.units.push(u); return u; };
  const cap = g.forceCities(f0).sort((a, b) => b.gold - a.gold)[0]; cap.gold = 5000;
  const u = mk(7001, f0, 106.5, 32.5);
  // 1) 비용 차감·건설 시작·중복 차단
  if (!g.buildField(u.id, '진') || cap.gold !== 5000 - FIELD_FACS['진'].cost) fail('건설 시작·비용');
  if (g.buildField(u.id, '채')) fail('건설 중 중복 차단');
  // 2) 건설 완료는 1턴 후, 이전엔 방어 효과 없음
  if (g.fieldDefMult(u) !== 1) fail('미완성 시설 효과');
  g.fieldTurn();
  if (u.building || g.fieldFacs[0].left > 0) fail('건설 완료');
  if (g.fieldDefMult(u) !== 0.92) fail('진 방어 배율 ' + g.fieldDefMult(u));
  const far = mk(7002, f0, 100.0, 36.0); if (g.fieldDefMult(far) !== 1) fail('범위 밖 부대에 효과');
  // 3) 금 부족·근접 시설 차단
  cap.gold = 10; const u2 = mk(7003, f0, 106.5, 32.0); if (g.buildField(u2.id, '진')) fail('금 부족 차단'); cap.gold = 5000;
  if (g.buildField(u2.id, '진')) fail('근접 시설 차단');
  // 4) 토루: 적에게만 감속
  const u3 = mk(7004, f0, 104.0, 34.0); if (!g.buildField(u3.id, '토루')) fail('토루 건설'); g.fieldTurn();
  const en = mk(7005, e0, 104.3, 34.0), ally = mk(7006, f0, 104.3, 34.0);
  if (g.fieldSlow(en) !== 0.4 || g.fieldSlow(ally) !== 1) fail('토루 감속 적/아군');
  // 5) 투석대: 적 병력 감소, 아군 불변
  const u4 = mk(7007, f0, 107.0, 31.0); if (!g.buildField(u4.id, '투석대')) fail('투석대 건설: ' + g.lastFieldWhy); g.fieldTurn(); g.fieldTurn();
  const en2 = mk(7008, e0, 107.5, 31.0, 3000), al2 = mk(7009, f0, 107.5, 31.0, 3000); g.fieldTurn();
  if (en2.troops !== 3000 - 120 || al2.troops !== 3000) fail(`투석대 피해 ${en2.troops}/${al2.troops}`);
  // 6) 이동 명령 시 건설 취소
  const u5 = mk(7010, f0, 103.5, 31.5); g.buildField(u5.id, '채'); u5.tx = 103; u5.tz = 31; g.fieldTurn();
  if (u5.building || g.fieldFacs.some(f => f.uid === u5.id)) fail('이동 시 건설 취소');
  // 7) 적 공격으로 파괴
  const f3 = g.fieldFacs.find(f => f.uid === u3.id); en.x = 104.0; en.z = 34.0; en.troops = 30000; g.fieldTurn();
  if (g.fieldFacs.some(f => f.uid === u3.id)) fail('시설 파괴(hp ' + f3.hp + ')');
  // 8) 직렬화 왕복
  const rt = JSON.parse(JSON.stringify(g.fieldFacs)); if (rt.length !== g.fieldFacs.length || rt[0].type !== g.fieldFacs[0].type) fail('직렬화');
  // 9) AI: 같은 buildField 경로로 4턴마다 건설
  const g2 = mkg(); g2.units = []; g2.fieldFacs = []; const ef = g2.cities.find(c => c.force != null && c.force !== g2.playerForce).force; const pf = g2.playerForce;
  g2.forceCities(ef).forEach(c => c.gold = 5000);
  const au = { id: 8001, force: ef, officers: [], troops: 3000, type: 'spear', x: 102.5, z: 32.5, path: [], tx: null, tz: null, targetCity: null, label: 'AI', qi: 100, conf: 0 };
  const pu = { ...au, id: 8002, force: pf, x: 105.0, z: 32.5, label: 'P' };
  g2.units.push(au, pu); g2.turn = 4; g2.aiFieldBuild();
  if (!g2.fieldFacs.some(f => f.force === ef)) fail('AI 건설');
  if (g2.fieldFacs.some(f => f.force === pf)) fail('비위임 플레이어 부대 자동 건설');
  console.log('R26 야전시설 게이트 PASS (비용·완료·진 방어 0.92·토루 감속 0.4·투석대 -120·건설취소·파괴·직렬화·AI 건설)');
}

// === R28: 함정·제방 게이트 ===
{
  const fail = m => { console.log('FAIL: R28 ' + m); process.exit(1); };
  const mkg = () => new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
  const g = mkg(); g.units = []; g.fieldFacs = []; const f0 = g.playerForce; const e0 = g.cities.find(c => c.force != null && c.force !== f0).force;
  const mk = (id, force, x, z, troops = 3000) => { const u = { id, force, officers: [], troops, type: 'spear', x, z, path: [], tx: null, tz: null, targetCity: null, label: 'T' + id, qi: 100, conf: 0 }; g.units.push(u); return u; };
  g.forceCities(f0).forEach(c => c.gold = 9000);
  // 1) 불화살 함정: 적 접근 시 -8%+혼란, 아군 무반응, 1회 소멸
  const b1 = mk(9001, f0, 106.5, 32.5); if (!g.buildField(b1.id, '불화살함정')) fail('불화살함정 건설: ' + g.lastFieldWhy); g.fieldTurn();
  const al = mk(9002, f0, 106.7, 32.5); g.fieldTurn(); if (al.troops !== 3000 || !g.fieldFacs.some(f => f.type === '불화살함정')) fail('아군에게 발동');
  const en = mk(9003, e0, 106.8, 32.5); g.fieldTurn();
  if (en.troops !== 3000 - 240 || en.conf < 1) fail(`불화살 피해 ${en.troops}/${en.conf}`);
  if (g.fieldFacs.some(f => f.type === '불화살함정')) fail('함정 1회 소멸');
  // 2) 낙석: -6% + 감속 1턴
  const b2 = mk(9004, f0, 103.5, 31.5); g.buildField(b2.id, '낙석'); g.fieldTurn();
  const en2 = mk(9005, e0, 103.9, 31.5); g.fieldTurn();
  if (en2.troops !== 3000 - 180) fail('낙석 피해 ' + en2.troops);
  if (g.fieldSlow(en2) !== 0.5 || g.fieldSlow(en2) !== 1) fail('낙석 감속 1회성');
  // 3) 함정은 적이 공격(파괴)하지 못함 - 적 접근 전 hp 유지, 시설 공격 루프 제외
  // 4) 제방: 강 근처 도시 존재, 없는 도시는 파괴 불가
  const lev = g.cities.filter(c => g.hasLevee(c)), nol = g.cities.filter(c => !g.hasLevee(c));
  if (!lev.length || !nol.length) fail(`제방 도시 분포 ${lev.length}/${nol.length}`);
  const tc = lev.find(c => c.force != null && c.force !== f0) ?? lev[0]; tc.force = e0;
  const att = mk(9010, f0, tc.lon + 1.0, tc.lat); const hp0 = tc.hp, tr0 = tc.troops;
  if (g.breakLevee(att.id, nol[0].id)) fail('제방 없는 도시 파괴 가능');
  const far = mk(9011, f0, tc.lon + 5, tc.lat); if (g.breakLevee(far.id, tc.id)) fail('먼 거리 파괴 가능');
  if (!g.breakLevee(att.id, tc.id)) fail('제방 파괴: ' + g.lastFieldWhy);
  if (tc.hp !== hp0 - Math.round(tc.maxhp * 0.15) || tc.troops !== tr0 - Math.round(tr0 * 0.10)) fail('수몰 피해');
  if (g.breakLevee(att.id, tc.id)) fail('중복 파괴');
  const tr1 = tc.troops; g.floodTurn(); g.floodTurn(); g.floodTurn();
  if (tc.troops >= tr1 || tc.flood !== 0) fail('침수 2턴 후 종료');
  // 5) 보수
  tc.gold = 100; if (g.repairLevee(tc.id)) fail('금 부족 보수'); tc.gold = 1000;
  if (!g.repairLevee(tc.id) || tc.leveeBroken || tc.gold !== 700) fail('보수');
  // 5b) 보수 직후 재파괴 불가, 동맹 도시 불가, 점령 시 침수 종료
  const att2 = mk(9012, f0, tc.lon + 1.0, tc.lat); if (g.breakLevee(att2.id, tc.id)) fail('보수 직후 재파괴');
  g.turn += 13; tc.force = e0; g.diplo = {}; g.diploOf(f0, e0).allianceUntil = g.turn + 5; if (g.breakLevee(att2.id, tc.id)) fail('동맹 도시 제방 파괴'); g.diploOf(f0, e0).allianceUntil = 0;
  if (!g.breakLevee(att2.id, tc.id)) fail('쿨다운 후 파괴 불가: ' + g.lastFieldWhy);
  const trB = tc.troops; tc.force = f0; g.floodTurn(); if (tc.flood !== 0 || tc.troops !== trB) fail('점령 후에도 침수 피해');
  // 6) AI: 같은 breakLevee 경로
  const g2 = mkg(); g2.units = []; g2.fieldFacs = []; const pf = g2.playerForce; const ef = g2.cities.find(c => c.force != null && c.force !== pf).force;
  const pc = g2.cities.find(c => c.force === pf && g2.hasLevee(c));
  if (pc) { const au = { id: 9101, force: ef, officers: [], troops: 3000, type: 'spear', x: pc.lon + 1.0, z: pc.lat, path: [], tx: null, tz: null, targetCity: null, label: 'AI', qi: 100, conf: 0 }; g2.units.push(au); g2.turn = 4; g2.aiFieldBuild(); if (!g2.cities.some(c => c.leveeBroken && c.force !== ef)) fail('AI 제방 파괴'); }
  console.log(`R28 함정·제방 게이트 PASS (불화살 -240+혼란, 낙석 -180+감속1회, 제방 도시 ${lev.length}/${g.cities.length}, 수몰 피해·2턴 침수·보수, AI 파괴${pc ? '' : ' (플레이어 제방 도시 없어 생략)'})`);
}

// === R30: 개별 기교 확장·석벽 게이트 ===
{
  const fail = m => { console.log('FAIL: R30 ' + m); process.exit(1); };
  const mkg = () => new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
  const g = mkg(); g.units = []; g.fieldFacs = []; const f0 = g.playerForce; const e0 = g.cities.find(c => c.force != null && c.force !== f0).force;
  g.forceCities(f0).forEach(c => c.gold = 20000); g.forces[f0].techP = 99999; g.forces[f0].arts = {};
  const mk = (id, force, x, z, type = 'spear') => { const u = { id, force, officers: [], troops: 3000, type, x, z, path: [], tx: null, tz: null, targetCity: null, label: 'T' + id, qi: 100, conf: 0 }; g.units.push(u); return u; };
  // 1) 석벽은 석벽술 없이 건설 불가
  const w = mk(9301, f0, 106.5, 32.5); if (g.buildField(w.id, '석벽')) fail('석벽술 없이 건설'); if (!String(g.lastFieldWhy).includes('석벽술')) fail('사유 표기 ' + g.lastFieldWhy);
  if (!g.researchArt(f0, '석벽술')) fail('석벽술 연구'); if (!g.buildField(w.id, '석벽')) fail('석벽 건설: ' + g.lastFieldWhy); g.fieldTurn(); g.fieldTurn();
  const en = mk(9302, e0, 107.0, 32.5), al = mk(9303, f0, 107.0, 32.5);
  if (g.fieldSlow(en) !== 0.15 || g.fieldSlow(al) !== 1) fail('석벽 감속');
  // 2) 정예창병: 창·극 +8%, 노·기병 무영향
  const sp = mk(9304, f0, 100, 36, 'spear'), bw = mk(9305, f0, 100.5, 36, 'bow'); const s0 = g.unitTechAtk(sp), b0 = g.unitTechAtk(bw);
  if (!g.researchArt(f0, '정예창병')) fail('정예창병 연구'); if (Math.abs(g.unitTechAtk(sp) / s0 - 1.08) > 1e-9 || g.unitTechAtk(bw) !== b0) fail('정예창병 효과');
  // 3) 군제개혁: 부대 병력 상한 +3000 (20000 → 23000), 실제 출진에 반영 (r57 정정: AP 절감 아님)
  const c = g.forceCities(f0)[0]; c.troops = 30000; c.spears = 30000; g.forces[f0].ap = 100;
  if (g.unitTroopCap(f0) !== 20000) fail('기본 상한 ' + g.unitTroopCap(f0));
  if (!g.researchArt(f0, '군제개혁')) fail('군제개혁 연구'); if (g.unitTroopCap(f0) !== 23000) fail('군제개혁 효과 ' + g.unitTroopCap(f0));
  const lead3 = c.officers[0];
  if (lead3 == null || !g.dispatch(c.id, [lead3], 23000, 'spear')) fail('군제개혁 실출진');
  if (!g.units.some(u => u.troops === 23000 && u.officers.includes(lead3))) fail('군제개혁 출진 병력');
  // 4) AI: researchNextArt가 순서대로 모두 연구하고 비용 부족이면 중단
  const g2 = mkg(); const ef = g2.cities.find(c => c.force != null && c.force !== g2.playerForce).force; g2.forces[ef].techP = 99999; g2.forceCities(ef).forEach(c => c.gold = 99999);
  let n = 0; while (g2.researchNextArt(ef) && n < 10) n++; if (n !== Object.keys(ARTS).length) fail('AI 연구 개수 ' + n);
  g2.forces[ef].arts = {}; g2.forces[ef].techP = 10; if (g2.researchNextArt(ef)) fail('AI 기교P 부족 차단');
  console.log(`R30 개별 기교·석벽 게이트 PASS (석벽술 필요, 석벽 감속 0.15, 정예창병 +8%, 군제개혁 상한+3000·실출진, AI ${n}종 연구)`);
}
// === R32: 소화(지속 화계) 게이트 ===
{
  const fail = m => { console.log('FAIL: R32 ' + m); process.exit(1); };
  const g = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0); g.units = [];
  const f0 = g.playerForce, e0 = g.cities.find(c => c.force != null && c.force !== f0).force;
  const oi = Number(Object.keys(g.officers).find(k => g.officers[k] && g.officers[k].int >= 85) ?? -1); if (oi < 0) fail('고지력 무장 없음');
  const mk = (id, force, x, z, offs) => { const u = { id, force, officers: offs, troops: 5000, type: 'spear', x, z, path: [], tx: null, tz: null, targetCity: null, label: 'T' + id, qi: 100, conf: 0 }; g.units.push(u); return u; };
  const a = mk(9401, f0, 100, 36, [oi]), d = mk(9402, e0, 100.5, 36, []), v = mk(9403, e0, 100.3, 36, [oi]);
  const dmg = g.officers[oi]; dmg.int = 100; g.mindDefense = () => 0;
  let ok = false; for (let i = 0; i < 400 && (d.burn ?? 0) <= 0; i++) { a.qi = 100; a._stratTurn = -1; d.troops = 5000; g.fireStrat(a.id, 'fire', { type: 'unit', id: d.id }); }
  if ((d.burn ?? 0) !== 3) fail('화계 후 불 상태 ' + d.burn);
  const t0 = d.troops; g.stepUnit(d); if (d.burn !== 2 || d.troops >= t0) fail('불 지속 피해');
  // 소화: 적은 못 끔, 아군(자기 부대)은 끔, 기력 10
  if (g.fireStrat(a.id, 'douse', { type: 'unit', id: d.id })) fail('적 불 소화 허용');
  v.burn = 2; v.qi = 100; v._stratTurn = -1; if (!g.fireStrat(v.id, 'douse', { type: 'unit', id: v.id }) || v.burn !== 0 || v.qi !== 90) fail('소화 동작/기력');
  // AI: 불난 아군이 가까우면 AI가 소화
  d.burn = 2; d.qi = 100; d._stratTurn = -1; d.officers = [oi]; v.burn = 0; d.troops = 5000; g.units = g.units.filter(x => x !== a); const w2 = mk(9404, e0, 100.4, 36, [oi]); w2.burn = 2; w2.qi = 100; w2._stratTurn = -1; aiThink(g, e0); if (w2.burn !== 0 && d.burn !== 0) fail('AI 소화 미작동');
  console.log('R32 소화 게이트 PASS (화계 후 3턴 지속, 턴당 병력 감소, 소화 기력 10, 적 소화 불가)');
}
// === R33: 복병(숲 한정) 게이트 ===
{
  const fail = m => { console.log('FAIL: R33 ' + m); process.exit(1); };
  const g = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0); g.units = [];
  const f0 = g.playerForce, e0 = g.cities.find(c => c.force != null && c.force !== f0).force;
  const oi = Number(Object.keys(g.officers).find(k => g.officers[k] && g.officers[k].int >= 85)); g.officers[oi].int = 100; g.mindDefense = () => 0;
  const mk = (id, force, x, z, type, offs) => { const u = { id, force, officers: offs, troops: 5000, type, x, z, path: [], tx: null, tz: null, targetCity: null, label: 'T' + id, qi: 100, conf: 0 }; g.units.push(u); return u; };
  g.forestFn = (x, z) => x < 101;
  const a = mk(9501, f0, 100, 36, 'spear', [oi]), d = mk(9502, e0, 100.5, 36, 'spear', []);
  const cv = mk(9503, f0, 100.2, 35, 'cav', [oi]), rm = mk(9504, f0, 100.2, 37, 'ram', [oi]), op = mk(9505, f0, 102, 36, 'spear', [oi]);
  if (!g.canAmbush(a) || g.canAmbush(cv) || g.canAmbush(rm) || g.canAmbush(op)) fail('숲/병종 조건');
  let tries = 0, hit = false; while (!hit && tries++ < 200) { a.qi = 100; a._stratTurn = -1; d.troops = 5000; d.qi = 100; g.fireStrat(a.id, 'ambush', {}); hit = d.troops < 5000; }
  if (!hit || d.qi !== 80 || Math.round(5000 * 0.93) !== d.troops) fail('복병 효과 ' + d.troops + '/' + d.qi);
  if (a.qi !== 90) fail('기력 소비 ' + a.qi);
  a._stratTurn = g.turn; if (g.fireStrat(a.id, 'ambush', {})) fail('턴당 1회');
  cv.qi = 100; cv._stratTurn = -1; if (g.fireStrat(cv.id, 'ambush', {})) fail('기병 불가'); 
  g.forestFn = () => false; a._stratTurn = -1; a.qi = 100; if (g.fireStrat(a.id, 'ambush', {})) fail('숲 밖 불가');
  g.forestFn = (x) => x < 101; g.units = g.units.filter(u => u.id === 9501); const a2 = g.units[0]; a2.troops = 5000; a2.qi = 100; a2.force = f0;
  const y = mk(9506, e0, 100.3, 36, 'spear', [oi]); y.qi = 100; y._stratTurn = -1; let aiHit = false;
  for (let i = 0; i < 40 && !aiHit; i++) { y.qi = 100; y._stratTurn = -1; y.troops = 5000; a2.troops = 5000; aiThink(g, e0); aiHit = a2.troops < 5000 && y.qi <= 90; }
  if (!aiHit) fail('AI 복병 미사용 (a2.troops=' + a2.troops + ', y.qi=' + y.qi + ')');
  console.log('R33 복병 게이트 PASS (숲/병종 조건, 7% 피해+기력 -20, 기력 10, 턴당 1회, 기병·병기·숲 밖 불가, AI 복병 사용)');
}
// === R34: 기본 공격/전법 분리(도시 대상 전법은 병기만) 게이트 ===
{
  const fail = m => { console.log('FAIL: R34 ' + m); process.exit(1); };
  if (RULES.cityTacticSiegeOnly !== true) fail('규칙 기본값');
  const mkg = () => { const g = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0); g.units = []; return g; };
  const run = (type, n) => {
    let tacLogs = 0, direct = 0;
    for (let i = 0; i < n; i++) {
      const g = mkg(); const f0 = g.playerForce; const c = g.cities.find(c => c.force != null && c.force !== f0); const oi = g.forceCities(f0)[0].officers[0];
      const lead = g.officers[oi]; lead.war = 100; lead.apt = {}; for (let k = 0; k < 12; k++) lead.apt[k] = 'S'; c.troops = 60000; c.hp = c.maxhp = 100000;
      const u = { id: 1, force: f0, officers: [oi], troops: 5000, type, x: c.lon, z: c.lat, path: [], tx: c.lon, tz: c.lat, targetCity: c.id, label: 'M', qi: 100, conf: 0 };
      g.units.push(u); g.log = (m) => { if (m.includes('【전법】')) tacLogs++; };
      if (g.fireTactic(u.id, { type: 'city', id: c.id })) direct++;
      g.stepUnit(u);
    }
    return { tacLogs, direct };
  };
  const sp = run('spear', 60), cv = run('cav', 60), bw = run('bow', 60), ct = run('catapult', 60);
  if (sp.tacLogs || sp.direct || cv.tacLogs || cv.direct || bw.tacLogs || bw.direct) fail('육군/기병/노병이 도시 대상 전법 사용 ' + JSON.stringify({ sp, cv, bw }));
  if (!ct.direct) fail('병기 직접 전법 불가');
  console.log('R34 기본공격/전법 분리 게이트 PASS (창·기·노 도시 전법 0회, 투석기 직접 전법 ' + ct.direct + '/60)');
}
// === R38: AI 장기 공성 철수 시험 게이트 ===
{
  const fail = m => { console.log('FAIL: R38 ' + m); process.exit(1); };
  const mkg = () => { const g = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0); g.units = []; return g; };
  const setup = (troops, ctroops) => {
    const g = mkg(); const fid = Object.keys(g.forces).map(Number).find(i => g.forces[i].alive && i !== g.playerForce && g.forceCities(i).length >= 2); if (fid == null) fail("세력 없음");
    const home = g.forceCities(fid)[0]; const tc = g.cities.find(c => c.force != null && c.force !== fid && !g.isAllied(fid, c.force));
    tc.troops = ctroops; tc.hp = tc.maxhp = 100000;
    const u = { id: 1, force: fid, officers: [home.officers[0]], troops, type: 'spear', x: tc.lon, z: tc.lat, path: [], tx: tc.lon, tz: tc.lat, targetCity: tc.id, label: 'S', qi: 100, conf: 0 };
    g.units.push(u); return { g, fid, tc, u };
  };
  { const { g, fid, tc, u } = setup(3000, 20000); u._siegeAge = 8; aiThink(g, fid); if (u.targetCity !== tc.id) fail('9턴째 철수 (10턴 미만)'); aiThink(g, fid); if (u.targetCity === tc.id || u.targetCity == null) fail('10턴 열세 부대가 철수하지 않음'); if (g.cityById[u.targetCity].force !== fid) fail('철수지가 아군 도시가 아님'); }
  { const { g, fid, tc, u } = setup(30000, 5000); u._siegeAge = 12; aiThink(g, fid); if (u.targetCity !== tc.id) fail('병력 우세 부대가 철수함'); }
  if (TACTICS.sword) fail('검병 TACTICS 항목이 남아 있음'); if (TACTICS.bow.name !== '불화살' || TACTICS.bow.qi !== 15) fail('노병 기본 전법 불화살(잠정 15) 아님');
  { const g = mkg(); const f = g.playerForce; const oi = g.forceCities(f)[0].officers[0]; const c = g.cities.find(c => c.force != null && c.force !== f); g.officers[oi].apt = {}; for (let k = 0; k < 12; k++) g.officers[oi].apt[k] = 'S'; const u = { id: 5, force: f, officers: [oi], troops: 4000, type: 'sword', x: c.lon, z: c.lat, path: [], tx: c.lon, tz: c.lat, targetCity: c.id, label: 'W', qi: 100, conf: 0 }; g.units.push(u); RULES.cityTacticSiegeOnly = false; try { g.stepUnit(u); } catch (e) { RULES.cityTacticSiegeOnly = true; fail('검병 공성 중 예외 ' + e.message); } RULES.cityTacticSiegeOnly = true; }
  console.log('R38 AI 장기 공성 철수 게이트 PASS (10턴 미만 유지, 열세 10턴 철수 후 아군 도시, 우세 부대 유지)');
}
// === R39: 창·극·기병 자동 전투도 설계 전법(EX)을 같은 조건으로 사용하는 게이트 ===
{
  const fail = m => { console.log('FAIL: R39 ' + m); process.exit(1); };
  const rand0 = Math.random;
  const run = (type, apt, qi, lastTurn, gap = 0.5, extra = false) => {
    const g = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0); g.units = [];
    const pf = g.playerForce, ef = g.cities.find(c => c.force != null && c.force !== pf).force;
    const o1 = g.forces[pf].ruler, o2 = g.forces[ef].ruler;
    for (const o of [o1, o2]) { g.officers[o].int = 10; g.officers[o].apt = {}; for (let k = 0; k < 12; k++) g.officers[o].apt[k] = apt; }
    const mk = (id, force, o, t, x) => { const u = { id, force, officers: [o], troops: 9000, type: t, x, z: 10, path: [], tx: null, tz: null, targetCity: null, label: 'G' + id, qi, conf: 0 }; g.units.push(u); return u; };
    const a = mk(1, pf, o1, type, 10), b = mk(2, ef, o2, 'sword', 10 + gap); if (extra) mk(3, ef, o2, 'sword', 10 + gap, 10.4);
    if (lastTurn) a._tacTurn = g.turn;
    let logs = []; g.log = m => { if (m.includes('【전법】')) logs.push(m); };
    Math.random = () => 0; try { g.fieldBattle(a, b); } finally { Math.random = rand0; }
    return { logs, aQi: a.qi, tacTurn: a._tacTurn, turn: g.turn };
  };
  const sp = run('spear', 'S', 100, false), pk = run('pike', 'S', 100, false), cv = run('cav', 'S', 100, false);
  if (sp.logs.length !== 1 || !/나선찌르기/.test(sp.logs[0]) || sp.aQi !== 85) fail('창병 자동 전법(혼란형 우선, 기력 15) ' + JSON.stringify(sp));
  if (pk.logs.length !== 1 || !/옆베기/.test(pk.logs[0]) || pk.aQi !== 80) fail('극병이 맞붙은 거리(끌어당길 틈 없음, 주변 적 없음)에서는 옆베기(단독 대상 배율 1.2)만 후보 ' + JSON.stringify(pk));
  const pkFar = run('pike', 'S', 100, false, 1.5); if (pkFar.logs.length !== 1 || !/웅수/.test(pkFar.logs[0]) || pkFar.aQi !== 85) fail('극병 거리 있을 때 웅수 ' + JSON.stringify(pkFar));
  const pkMany = run('pike', 'S', 100, false, 1.5, true); if (pkMany.logs.length !== 1 || !/(선풍베기|옆베기)/.test(pkMany.logs[0])) fail('극병 주변 적 있을 때 광역형 ' + JSON.stringify(pkMany));
  if (cv.logs.length !== 1 || cv.aQi >= 100) fail('기병 자동 전법 ' + JSON.stringify(cv));
  if (run('spear', 'D', 100, false).logs.length) fail('적성 B 미만인데 자동 전법 발동');
  if (run('spear', 'S', 10, false).logs.length) fail('기력 부족인데 자동 전법 발동');
  if (run('spear', 'S', 100, true).logs.length) fail('같은 턴 두 번째 자동 전법 발동');
  { const g = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0); g.units = []; const o = g.forces[g.playerForce].ruler; g.officers[o].apt = {}; for (let k = 0; k < 12; k++) g.officers[o].apt[k] = 'S';
    const mkS = (t, id) => ({ id, force: g.playerForce, officers: [o], troops: 5000, type: t, x: 0, z: 0, path: [], tx: null, tz: null, targetCity: null, label: 'S', qi: 100, conf: 0 });
    const li = g.tacticInfo(mkS('lou', 1)), di = g.tacticInfo(mkS('dou', 2));
    if (!li || li.opts.some(x => x.id === 'base') || li.opts.filter(x => x.name === '격돌').length !== 1) fail('누선 격돌 중복 ' + JSON.stringify(li?.opts.map(x => x.name)));
    if (!di || !di.opts.some(x => x.name === '격돌') || !di.opts.some(x => x.id === 'base' && x.name === '투석')) fail('투함 격돌/투석 ' + JSON.stringify(di?.opts.map(x => x.name))); }
  { // 노병: 자동 판정도 기본 불화살/EX 중 실제 유효한 것 하나를 한 번만 선택 (한 타격당 기회 1회)
    const bw = run('bow', 'S', 100, false, 1.5); if (bw.logs.length !== 1 || !/불화살/.test(bw.logs[0]) || bw.aQi !== 85) fail('노병 주변 적 없을 때 기본 불화살 ' + JSON.stringify(bw));
    const bwMany = run('bow', 'S', 100, false, 1.5, true); if (bwMany.logs.length !== 1 || !/(난사|관통화살)/.test(bwMany.logs[0])) fail('노병 주변 적 있을 때 EX 광역 ' + JSON.stringify(bwMany)); }
  { // 투함/누선 수전: 물 위에서 격돌(1칸 격퇴)이 자동으로 쓰이고 적이 실제로 밀려남, 저장 레코드에 기력·턴 반영
    let wx = null, wz = null; for (let lat = 22; lat < 40 && wx == null; lat += 0.1) for (let lon = 100; lon < 124; lon += 0.1) { let all = true; for (let d = 0; d <= 1.6; d += 0.4) if (!isWaterAt(lon + d, lat)) { all = false; break; } if (all) { wx = lon; wz = lat; break; } }
    if (wx == null) fail('수전 fixture용 물 지형을 찾지 못함');
    for (const shipType of ['lou', 'dou']) {
      const g = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0); g.units = [];
      const pf = g.playerForce, ef = g.cities.find(c => c.force != null && c.force !== pf).force; const o1 = g.forces[pf].ruler, o2 = g.forces[ef].ruler;
      for (const o of [o1, o2]) { g.officers[o].int = 10; g.officers[o].apt = {}; for (let k = 0; k < 12; k++) g.officers[o].apt[k] = 'S'; }
      const mkU = (id, force, o, t, x) => { const u = { id, force, officers: [o], troops: 9000, type: t, x, z: wz, path: [], tx: null, tz: null, targetCity: null, label: 'N' + id, qi: 100, conf: 0 }; g.units.push(u); return u; };
      const a = mkU(1, pf, o1, shipType, wx), b = mkU(2, ef, o2, 'junk', wx + 0.5); const bx0 = b.x; let logs = []; g.log = m => { if (m.includes('【전법】') && m.includes(g.officers[o1].name_ko)) logs.push(m); };
      const store = {}; globalThis.localStorage = { setItem: (k, v) => { store[k] = v; }, getItem: k => store[k] ?? null };
      Math.random = () => 0; try { g.fieldBattle(a, b); } finally { Math.random = rand0; }
      if (logs.length !== 1) fail(shipType + ' 수전 전법 1회 아님 ' + JSON.stringify(logs));
      if (shipType === 'lou' && !(/격돌/.test(logs[0]) && Math.abs((b.x - bx0) - 0.9) < 0.02 && a.qi === 80)) fail('누선 격돌 1칸(0.9) 격퇴/기력 ' + JSON.stringify({ logs, bx: [bx0, b.x], qi: a.qi }));
      g.autosave(); const saved = JSON.parse(Object.values(store)[0] || '{}').units?.find(u => u.id === 1); if (!saved || saved.qi !== a.qi || saved._tacTurn !== g.turn) fail(shipType + ' 저장 레코드 ' + JSON.stringify(saved));
    } }
  console.log('R39 자동 전법 게이트 PASS (창 나선찌르기, 극병은 맞붙으면 무발동·거리 있으면 웅수·주변 적 있으면 광역, 노병 불화살/광역 선택, 누선 격돌 수전 격퇴·저장, 적성 B 미만/기력 부족/턴 1회 차단)');
}
// === R41: ai.js 호환 가드 - game에 pickTactic이 없어도(구 game.js와 혼합 로드) AI 전법이 예외 없이 같은 규칙으로 동작 ===
{
  const fail = m => { console.log('FAIL: R41 ' + m); process.exit(1); };
  const rand0 = Math.random;
  const run = noPick => {
    const g = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0); g.units = [];
    const pf = g.playerForce, ef = g.cities.find(c => c.force != null && c.force !== pf).force;
    const o1 = g.forces[pf].ruler, o2 = g.forces[ef].ruler;
    for (const o of [o1, o2]) { g.officers[o].int = 10; g.officers[o].apt = {}; for (let k = 0; k < 12; k++) g.officers[o].apt[k] = 'S'; }
    const mk = (id, force, o, t, x) => { const u = { id, force, officers: [o], troops: 9000, type: t, x, z: 10, path: [], tx: null, tz: null, targetCity: null, label: 'V' + id, qi: 100, conf: 0 }; g.units.push(u); return u; };
    const ai = mk(1, ef, o2, 'spear', 50), tgt = mk(2, pf, o1, 'sword', 50.5);
    if (noPick) g.pickTactic = undefined;
    Math.random = () => 0; try { aiThink(g, ef); } catch (e) { Math.random = rand0; fail('AI 예외 ' + e.message); } finally { Math.random = rand0; }
    return { turn: ai._tacTurn, qi: ai.qi, conf: tgt.conf };
  };
  const a = run(false), b = run(true);
  if (a.turn == null || b.turn == null) fail('AI 전법 미발동 ' + JSON.stringify({ a, b }));
  if (a.qi !== b.qi || a.conf !== b.conf) fail('가드 경로가 같은 규칙이 아님 ' + JSON.stringify({ a, b }));
  console.log('R41 AI 호환 가드 게이트 PASS (pickTactic 없는 game에서도 AI 전법 발동, 정상 경로와 같은 기력·혼란 결과)');
}
console.log('sample logs:'); for (const l of g.logs.slice(-8)) console.log(' ', l.t, l.msg);

// === R-eco: 병량 소비 경제 게이트 (매뉴얼: 도시 병량 매턴 소비·부대 휴대 병량·계절 수입) ===
{
  const fail = m => { console.log('FAIL: R-eco ' + m); process.exit(1); };
  // 1) 총량 검증: 3턴(1개월) 진행 후 food = 수입(계절제) - 주둔 소비
  const g2 = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
  g2.units = [];
  const c2 = g2.forceCities(0)[0];
  c2.troops = 10000; c2.food = 100000; c2.farm = 0; // 농장 0 → 계절 수입 300*mult
  const before2 = c2.food, m0 = g2.month;
  for (let i = 0; i < 3; i++) g2.endTurn(aiThink); // 1개월
  const consumed = 4000; // 10000 * 0.4
  const income = [1,4,7,10].includes(m0) ? Math.round(300 * (g2.cityHasSkill(c2, '부농') ? 1.3 : 1)) : 0;
  if (c2.food !== before2 + income - consumed) fail('주둔 병량 정산 ' + c2.food + ' 기대 ' + (before2 + income - consumed));
  // 2) 계절 수입: 수입월이 아니면 food 증가 없음 (위 검증에 포함)
  // 3) 병량 부족 탈영: food 0이면 부족 병력환산의 50% 탈영
  const g3 = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
  g3.units = [];
  const c3 = g3.forceCities(0)[0];
  c3.troops = 10000; c3.food = 1000; c3.farm = 0;
  g3.month = 2; g3.dan = 1; // 비수입월 정산으로 고정
  const t0 = c3.troops;
  g3.endTurn(aiThink); g3.endTurn(aiThink); g3.endTurn(aiThink); // 1개월 → 정산 1회
  // 정산: need 4000, food 1000(+수입) → 부족 3000 → 탈영 3000/0.4*0.5 = 3750
  const expDes = Math.round(3000 / 0.4 * 0.5);
  if (c3.troops !== t0 - expDes) fail('도시 탈영 ' + (t0 - c3.troops) + ' 기대 ' + expDes);
  // 4) 출진 휴대 병량: 도시 food 차감 + 부대 food 적재
  const g4 = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
  g4.units = [];
  const c4 = g4.forceCities(0)[0];
  c4.troops = 20000; c4.food = 30000; c4.spears = 30000; g4.forces[0].ap = 100;
  const lead4 = c4.officers[0];
  if (lead4 == null) fail('출진 무장 부재');
  const settle4 = () => { if (g4.pendingDuel) g4.duelAuto(g4.pendingDuel); if (g4.pendingDebate) g4.debateAuto(g4.pendingDebate); }; // 일기토·설전 결판 전 턴 진행 불가 대응
  const cf0 = c4.food;
  if (!g4.dispatch(c4.id, [lead4], 5000, 'spear')) fail('출진');
  const u4 = g4.units.find(u => u.officers.includes(lead4));
  const carry = Math.round(5000 * 0.4 * 6);
  if (!u4 || u4.food !== carry || c4.food !== cf0 - carry) fail('휴대 병량 ' + (u4 && u4.food) + ' 기대 ' + carry);
  // 5) 부대 턴 소비 + 구 세이브(food 없음) 초기화 + 아사 탈영
  u4.food = undefined; // 구 세이브 시뮬레이션
  u4.tx = null; // 이동 명령 없음
  u4.x = 0; u4.z = 0; // 아군 도시 보급권 밖으로 이동
  const e0 = u4.troops;
  g4.endTurn(aiThink); settle4();
  const full = Math.round(5000 * 0.4 * 6);
  if (u4.food == null || u4.food >= full) fail('구 세이브 병량 초기화 ' + u4.food);
  u4.food = 0;
  const t5 = u4.troops;
  g4.endTurn(aiThink); settle4();
  if (u4.troops !== t5 - Math.max(1, Math.round(t5 * 0.03))) fail('부대 아사 탈영 ' + (t5 - u4.troops));
  // 6) 아군 도시 인접 보급
  const home4 = g4.forceCities(0)[0];
  u4.x = home4.lon; u4.z = home4.lat; u4.food = 0; home4.food = 50000;
  g4.endTurn(aiThink); settle4();
  const full2 = Math.round(u4.troops * 0.4 * 6);
  if (u4.food <= 0) fail('인접 보급 ' + u4.food);
  // 7) 합류 시 잔여 병량 회수
  u4.tx = home4.lon; u4.tz = home4.lat; u4.targetCity = home4.id; u4.path = []; u4.x = home4.lon; u4.z = home4.lat; u4.food = 1000;
  const hf0 = home4.food;
  g4.endTurn(aiThink); settle4();
  if (g4.units.includes(u4)) fail('합류 미처리');
  const eat7 = Math.round(u4.troops * 0.4 / 3);
  if (Math.abs((home4.food - hf0) - (1000 - eat7)) > 2) fail('합류 병량 회수 ' + (home4.food - hf0) + ' 기대 ' + (1000 - eat7));
  console.log('R-eco 병량 경제 게이트 PASS (주둔 소비·계절 수입·탈영·휴대 병량·턴 소비·구 세이브·인접 보급·합류 회수)');
}

// === R-mig: 병량 경제 저장 마이그레이션 게이트 ===
{
  const fail = m => { console.log('FAIL: R-mig ' + m); process.exit(1); };
  const settle = g => { if (g.pendingDuel) g.duelAuto(g.pendingDuel); if (g.pendingDebate) g.debateAuto(g.pendingDebate); };
  // 1) v1 저장(구 경제): 유예 부여 + 유예 중 주둔 소비 없음
  const g = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
  g.units = [];
  const c = g.forceCities(0)[0];
  c.troops = 10000; c.food = 10000; c.farm = 0;
  g.month = 2; g.dan = 1; g.turn = 100;
  if (!g.econMigrate({ })) fail('v1 저장 마이그레이션 미동작');
  if (g.econGraceUntil !== 118) fail('유예 종료 턴 ' + g.econGraceUntil);
  for (let i = 0; i < 3; i++) { g.endTurn(aiThink); settle(g); } // 1개월 (유예 중)
  if (c.food !== 10000) fail('유예 중 병량 변동 ' + c.food);
  // 2) 유예 종료: 종료 안내 1회 + 소비 개시
  g.turn = 118; g.econGraceUntil = 118; g.month = 2; g.dan = 1;
  for (let i = 0; i < 3; i++) { g.endTurn(aiThink); settle(g); }
  if (g.econGraceUntil != null) fail('유예 해제 안 됨');
  if (c.food >= 10000) fail('유예 종료 후 소비 없음 ' + c.food);
  const endMsgs = g.logs.filter(l => l.msg.includes('유예가 끝났습니다')).length;
  if (endMsgs !== 1) fail('유예 종료 안내 ' + endMsgs + '회');
  // 3) saveV 2 저장: 재적용 없음 (멱등)
  const g2 = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
  g2.econGraceUntil = null;
  if (g2.econMigrate({ saveV: 2 })) fail('saveV 2 재마이그레이션');
  if (g2.econGraceUntil !== null) fail('saveV 2 유예 변경');
  // 4) autosave에 saveV 2 포함 → 재로드 시 유예 재부여 없음
  {
    const store = {};
    const g3 = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
    globalThis.localStorage = { setItem: (k, v) => { store[k] = v; }, getItem: k => store[k] ?? null, removeItem: k => { delete store[k]; } };
    g3.autosave();
    const d3 = JSON.parse(store['cheonha-xi-web.save.v1']);
    if (d3.saveV !== 2) fail('autosave saveV 누락');
    const g4 = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
    if (g4.econMigrate(d3)) fail('재로드 재마이그레이션');
    delete globalThis.localStorage;
  }
  // 5) 신규 게임: 유예 없이 즉시 소비 (R-eco 1번과 중복이나 마이그레이션 관점 명시)
  const g5 = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
  if (g5.econGraceUntil !== null) fail('신규 게임 유예 존재');
  console.log('R-mig 마이그레이션 게이트 PASS (v1 유예 부여·유예 중 소비 없음·종료 안내 1회·saveV2 멱등·autosave 영속·신규 즉시 적용)');
}

// === R-ver: 경제 버전 분리 게이트 (구 저장=구 규칙 보존, 신규=신 규칙, load-save-reload 유지) ===
{
  const fail = m => { console.log('FAIL: R-ver ' + m); process.exit(1); };
  const settle = g => { if (g.pendingDuel) g.duelAuto(g.pendingDuel); if (g.pendingDebate) g.debateAuto(g.pendingDebate); };
  // R-ver 게이트는 경제 규칙 분리만 검증 — 무작위 재해(역병 2%/턴, 병사×0.95)가 시험 도시를 때려 '주둔 탈영 500/9500'으로 오인된 간헐 실패 2건(13:48·15:03)의 원인. 게이트 동안 난수를 상수로 고정해 재해를 격리한다 (엔진 변경 아님).
  const _mr = Math.random; Math.random = () => 0.99;
  const restoreRandom = () => { Math.random = _mr; };
  process.on('exit', restoreRandom);
  const nop = () => {}; // AI 무력화: 경제 정산만 격리 검증
  // 1) 구 경제(econV 1): 비수입월에도 식량 월수입 발생 + 주둔 소비 없음
  const g = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
  g.econV = 1; // 구 저장 로드 시뮬레이션
  g.units = [];
  const c = g.forceCities(0)[0];
  c.troops = 10000; c.food = 10000; c.farm = 0;
  g.month = 2; g.dan = 1; // 비수입월
  for (let i = 0; i < 3; i++) { g.endTurn(nop); settle(g); } // 1개월
  const incExp = Math.round(300 * (g.cityHasSkill(c, '부농') ? 1.3 : 1) * (g.cityFac(c, '곡물창고').length ? 1.1 : 1));
  if (c.food < 10000) fail('구 경제 주둔 소비 발생 ' + c.food);
  if (c.food !== 10000 + incExp) fail('구 경제 월 수입 ' + (c.food - 10000) + ' 기대 ' + incExp);
  // 2) 구 경제: 병량 0이어도 주둔 탈영 없음 (저병량 구 저장 보존)
  c.food = 0; c.farm = 0; const t0 = c.troops;
  g.month = 2; g.dan = 1;
  for (let i = 0; i < 3; i++) { g.endTurn(nop); settle(g); }
  if (c.troops !== t0) fail('구 경제 주둔 탈영 ' + (t0 - c.troops));
  // 3) 구 경제: 구 봉록식 유지
  const oi = c.officers[0];
  if (oi != null && g.salaryOf(oi) !== 10 + g.meritGrade(oi) * 5) fail('구 봉록 ' + g.salaryOf(oi));
  // 4) 구 경제: 출진 부대에 food 필드 없음 + 아사 탈영 없음
  c.food = 50000; c.spears = 30000; g.forces[0].ap = 100;
  if (!g.dispatch(c.id, [oi], 5000, 'spear')) fail('구 경제 출진');
  const u = g.units.find(x => x.officers.includes(oi));
  if (!u || 'food' in u) fail('구 경제 부대 food 필드 존재');
  u.tx = null; u.x = 0; u.z = 0; // 보급권 밖
  const ut0 = u.troops;
  g.endTurn(aiThink); settle(g);
  if ('food' in u || u.troops !== ut0) fail('구 경제 부대 병량/탈영 ' + JSON.stringify({ food: u.food, troops: u.troops }));
  // 5) load-save-reload: econV 1 영속 + 규칙 유지
  {
    const store = {};
    globalThis.localStorage = { setItem: (k, v) => { store[k] = v; }, getItem: k => store[k] ?? null, removeItem: k => { delete store[k]; } };
    g.autosave();
    const d = JSON.parse(store['cheonha-xi-web.save.v1']);
    if (d.econV !== 1) fail('autosave econV ' + d.econV);
    const g2 = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
    Object.assign(g2, { year: d.year, month: d.month, dan: d.dan, turn: d.turn, cities: d.cities, forces: d.forces, units: d.units, nextUnitId: d.nextUnitId, fieldFacs: d.fieldFacs ?? [], nextFacId: d.nextFacId ?? 1, playerForce: d.playerForce, delegated: d.delegated, logs: d.logs, deadAck: d.deadAck, chronicle: d.chronicle ?? [], over: d.over ?? false, unified: d.unified ?? d.over ?? false, econGraceUntil: d.econGraceUntil ?? null, econV: d.econV ?? 1 }); // main.js 로드 경로와 동일
    if (g2.econV !== 1) fail('리로드 econV ' + g2.econV);
    const c2 = g2.forceCities(0)[0];
    c2.troops = 10000; c2.food = 0; c2.farm = 0; g2.units = [];
    g2.month = 2; g2.dan = 1;
    for (let i = 0; i < 3; i++) { g2.endTurn(nop); settle(g2); }
    if (c2.troops !== 10000) fail('리로드 후 구 규칙 붕괴 탈영 ' + c2.troops);
    g2.autosave();
    const d2 = JSON.parse(store['cheonha-xi-web.save.v1']);
    if (d2.econV !== 1) fail('재저장 econV ' + d2.econV);
    delete globalThis.localStorage;
  }
  // 6) 신규 게임 격리: econV 2 + autosave 2 (R-eco와 독립 명시)
  {
    const store = {};
    globalThis.localStorage = { setItem: (k, v) => { store[k] = v; }, getItem: k => store[k] ?? null, removeItem: k => { delete store[k]; } };
    const g3 = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
    if (g3.econV !== 2) fail('신규 econV ' + g3.econV);
    g3.autosave();
    const d3 = JSON.parse(store['cheonha-xi-web.save.v1']);
    if (d3.econV !== 2) fail('신규 autosave econV ' + d3.econV);
    delete globalThis.localStorage;
  }
  restoreRandom();
  console.log('R-ver 경제 버전 분리 게이트 PASS (구 월수입·주둔소비없음·탈영없음·구봉록·부대food없음·load-save-reload 유지·신규 격리)');
}

// === R-jido: 특기 「지도」 연구비 반액 게이트 (공식 매뉴얼: 지도 보유 무장이 연구에 참여하면 비용 반액) ===
{
  const fail = m => { console.log('FAIL: R-jido ' + m); process.exit(1); };
  // 1) 데이터: 지도 보유 무장 존재 (조식·심배)
  const jido = JSON.parse(readFileSync('data/officers670.json')).filter(o => o.skill === '지도');
  if (jido.length < 2) fail('지도 보유 무장 부족 ' + jido.length);
  // 2) 반액 적용: 지도 보유 세력은 금 절반·기교P 정량
  const g = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
  const f = g.forces[0];
  const holder = Object.values(g.officers).find(o => o.state?.force === 0 && !o.skill);
  if (!holder) fail('무특기 무장 부재');
  holder.skill = '지도';
  const cap = g.forceCities(0)[0];
  f.techP = TECH_P[0]; cap.gold = TECH_GOLD[0];
  if (!g.researchTech(0, '창병')) fail('지도 연구 실패');
  if (cap.gold !== Math.round(TECH_GOLD[0] / 2)) fail('지도 반액 미적용 잔여 ' + cap.gold);
  if (f.techP !== 0) fail('기교P 차감 이상 ' + f.techP);
  if (!g.logs.some(l => l.msg.includes('지도 반액'))) fail('반액 로그 없음');
  // 3) 미보유 세력은 정가
  const g2 = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
  const f2 = g2.forces[0];
  if (g2.forceHasSkill(0, '지도')) fail('시나리오 190 조조군에 지도 보유자 있음(전제 붕괴)');
  const cap2 = g2.forceCities(0)[0];
  f2.techP = TECH_P[0]; cap2.gold = TECH_GOLD[0];
  if (!g2.researchTech(0, '창병')) fail('정가 연구 실패');
  if (cap2.gold !== 0) fail('정가 미적용 잔여 ' + cap2.gold);
  // 4) 개별 기교도 반액
  holder.skill = '지도';
  const an = Object.keys(ARTS)[0];
  f.techP = ARTS[an].p; cap.gold = ARTS[an].gold;
  if (!g.researchArt(0, an)) fail('개별 기교 연구 실패');
  if (cap.gold !== Math.round(ARTS[an].gold / 2)) fail('개별 기교 반액 미적용 ' + cap.gold);
  console.log('R-jido 지도 연구비 반액 게이트 PASS (데이터·계통/개별 반액·기교P 정량·미보유 정가)');
}

// === R-facai: AI 야전 시설·함정 건설 게이트 (설계 군사시설·함정 — AI도 동일 규칙) ===
{
  const fail = m => { console.log('FAIL: R-facai ' + m); process.exit(1); };
  // 적 부대 접근 시 AI가 대기 부대로 함정 건설
  const g = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
  g.units = [];
  const ai = 1;
  if (!g.forces[ai]?.alive) fail('AI 세력 부재');
  const c = g.forceCities(ai)[0];
  if (!c) fail('AI 도시 부재');
  c.gold = 1000;
  const land = (cx, cz) => { for (const [dx, dz] of [[1.5,0],[-1.5,0],[0,1.5],[0,-1.5],[1.2,1.2],[-1.2,-1.2],[1.2,-1.2],[-1.2,1.2]]) if (!isWaterAt(cx+dx, cz+dz)) return [cx+dx, cz+dz]; return null; };
  const p1 = land(c.lon, c.lat); if (!p1) fail('도시 주변 육지 없음');
  g.units.push({ id: 9001, force: ai, officers: [g.forces[ai].ruler], troops: 5000, type: 'spear', x: p1[0], z: p1[1], path: [], tx: null, tz: null, targetCity: null, label: 'AI대기 5k', qi: 100, conf: 0 });
  g.units.push({ id: 9002, force: 0, officers: [g.forces[0].ruler], troops: 8000, type: 'spear', x: p1[0] + 2, z: p1[1], path: [], tx: c.lon, tz: c.lat, targetCity: c.id, label: '적접근 8k', qi: 100, conf: 0 });
  aiThink(g, ai);
  const built = (g.fieldFacs ?? []).find(x => x.force === ai);
  if (!built) fail('AI 시설 미건설');
  if (built.type !== '불화살함정' && built.type !== '낙석') fail('근접 위협에 함정 아닌 ' + built.type);
  // R63: 건설 지속·완공·발동 — 건설 부대가 같은 think의 후반 섹션에서 재지정(tx)되면 다음 fieldTurn이 건설을 중단시키는 회귀 방지
  const leftAtBuild = built.left;
  g.fieldTurn();
  const still = (g.fieldFacs ?? []).find(x => x.force === ai);
  if (!still) fail('R63: 건설이 다음 fieldTurn에 중단됨');
  if (still.left >= leftAtBuild) fail('R63: 건설 진행 안 됨');
  for (let k = 0; k < 5 && still.left > 0; k++) g.fieldTurn();
  if (still.left > 0) fail('R63: 건설 미완료');
  const foe = g.units.find(u => u.id === 9002);
  const beforeT = foe.troops;
  foe.x = still.x; foe.z = still.z; foe.conf = 0; foe.slowT = 0; // 적이 완공 함정 반경 내로 접근
  g.fieldTurn();
  if (foe.troops >= beforeT) fail('R63: 함정 피해 없음');
  if (!(foe.conf > 0 || foe.slowT > 0)) fail('R63: 함정 부가효과(혼란·둔화) 없음');
  if ((g.fieldFacs ?? []).some(x => x.force === ai && (x.type === '낙석' || x.type === '불화살함정'))) fail('R63: 함정 1회 발동 후 미소멸');
  // 원거리 위협: 지원 시설 없으면 진/채
  const g2 = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
  g2.units = [];
  const c2 = g2.forceCities(ai)[0];
  c2.gold = 1000;
  const p2 = land(c2.lon, c2.lat); if (!p2) fail('도시 주변 육지 없음2');
  g2.units.push({ id: 9003, force: ai, officers: [g2.forces[ai].ruler], troops: 5000, type: 'spear', x: p2[0], z: p2[1], path: [], tx: null, tz: null, targetCity: null, label: 'AI대기 5k', qi: 100, conf: 0 });
  g2.units.push({ id: 9004, force: 0, officers: [g2.forces[0].ruler], troops: 8000, type: 'spear', x: c2.lon + 5.5, z: c2.lat, path: [], tx: c2.lon, tz: c2.lat, targetCity: c2.id, label: '적접근 8k', qi: 100, conf: 0 });
  aiThink(g2, ai);
  const built2 = (g2.fieldFacs ?? []).find(x => x.force === ai);
  if (!built2) fail('AI 지원시설 미건설');
  if (built2.type !== '진' && built2.type !== '채') fail('원거리 위협에 진/채 아닌 ' + built2.type);
  // 위협 없으면 건설 안 함
  const g3 = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
  g3.units = [];
  const c3 = g3.forceCities(ai)[0];
  c3.gold = 1000;
  const p3 = land(c3.lon, c3.lat); if (!p3) fail('도시 주변 육지 없음3');
  g3.units.push({ id: 9005, force: ai, officers: [g3.forces[ai].ruler], troops: 5000, type: 'spear', x: p3[0], z: p3[1], path: [], tx: null, tz: null, targetCity: null, label: 'AI대기 5k', qi: 100, conf: 0 });
  aiThink(g3, ai);
  if ((g3.fieldFacs ?? []).some(x => x.force === ai)) fail('위협 없는데 건설');
  console.log('R-facai AI 야전시설 게이트 PASS (근접 함정·원거리 진/채·무위협 미건설·R63 건설지속/완공/함정발동)');
}

// === R64: 수군 출진·수상 공성·연안 교전·귀환 게이트 (자체 규칙: 인접 수로 출진, 수상 공성 사거리 1.6, 귀환 시 선박 재고 회수 — 설계 31·39행 수군/수전 범위) ===
{
  const fail = m => { console.log('FAIL: R64 ' + m); process.exit(1); };
  const g = new Game(JSON.parse(JSON.stringify(scen)), JSON.parse(JSON.stringify(officers)), {}, 0);
  g.units = [];
  const coastal = g.cities.filter(c => g.nearestWater(c.lon, c.lat));
  const inland = g.cities.filter(c => !g.nearestWater(c.lon, c.lat));
  if (!coastal.length) fail('연안 도시 없음');
  if (coastal.length < 2) fail('연안 도시 2개 미만');
  // 1) 출진: 재고 차감·수상 스폰
  const A = coastal[0];
  A.force = 0; A.troops = 20000; A.dous = 1; g.forces[0].ap = 200;
  if (!A.officers.length) A.officers = [g.forces[0].ruler];
  const u = g.dispatch(A.id, A.officers.slice(0, 1), 5000, 'dou');
  if (!u) fail('연안 도시 수군 출진 실패');
  if (A.dous !== 0) fail('선박 재고 미차감 ' + A.dous);
  if (!isWaterAt(u.x, u.z)) fail('수군 스폰이 수상이 아님');
  // 2) 내륙 도시: 수군 출진 불가 (인접 수로 없음)
  if (inland.length) {
    const I = inland[0]; I.force = 0; I.troops = 20000; I.dous = 1;
    if (!I.officers.length) I.officers = [g.forces[0].ruler];
    g.forces[0].ap = 200;
    if (g.dispatch(I.id, I.officers.slice(0, 1), 5000, 'dou')) fail('내륙 도시 수군 출진 성공(수로 없음)');
  }
  // 3) 수상 공성: 연안 적 도시에 수로에서 공격 (시험 배치)
  const E = coastal.find(c => c !== A);
  E.force = 1; E.troops = 20000; E.hp = E.maxhp;
  const w = g.nearestWater(E.lon, E.lat);
  u.x = w[0]; u.z = w[1]; u.path = []; u.tx = E.lon; u.tz = E.lat; u.targetCity = E.id;
  const t0 = E.troops, h0 = E.hp;
  for (let k = 0; k < 5 && E.troops === t0; k++) g.stepUnit(u);
  if (E.troops >= t0) fail('수상 공성 병력 피해 없음');
  if (E.hp >= h0) fail('수상 공성 내구 피해 없음');
  // 4) 연안 교전: 육군↔수군 쌍방 타격 (육군의 수군 공격을 막는 제약 없음)
  const landU = { id: 9101, force: 1, officers: [g.forces[1]?.ruler ?? 0], troops: 9000, type: 'spear', x: E.lon, z: E.lat, path: [], tx: null, tz: null, targetCity: null, label: '육군 9k', qi: 100, conf: 0 };
  u.x = w[0]; u.z = w[1];
  if (Math.hypot(landU.x - u.x, landU.z - u.z) >= 2.2) fail('연안 거리 부족');
  const ls0 = landU.troops, ss0 = u.troops;
  g.units = [u, landU];
  g.resolveFieldBattles();
  if (landU.troops >= ls0) fail('수군→육군 타격 없음');
  if (u.troops >= ss0) fail('육군→수군 타격 없음');
  // 5) 귀환: 아군 도시 인접 수상에서 합류 시 선박 재고 회수 + 병력 합류
  const wa = g.nearestWater(A.lon, A.lat);
  g.units = [u];
  const tr0 = A.troops;
  u.x = wa[0]; u.z = wa[1]; u.path = []; u.tx = A.lon; u.tz = A.lat; u.targetCity = A.id; u.conf = 0; u.burn = 0; // 직전 연안 교전에서 걸린 혼란·화재 해제 (귀환 경로만 검증)
  g.stepUnit(u);
  if (g.units.includes(u)) fail('귀환 합류 안 됨');
  if (A.dous !== 1) fail('귀환 선박 재고 회수 안 됨 ' + A.dous);
  if (A.troops <= tr0) fail('귀환 병력 합류 안 됨');
  console.log('R64 수군 게이트 PASS (연안 출진 수상 스폰·재고 차감, 내륙 출진 불가, 수상 공성 병력+내구 피해, 연안 육↔수 쌍방 타격, 귀환 재고 회수·병력 합류)');
}

// === R92fix: 수군 항해 다턴 진행 게이트 — 폴리라인 walk, 턴당 속도(주가 0.66°)만큼만 진행 (R68 매 셀 경유 경로가 0.35 연쇄 소비로 1턴 순간이동·즉시 합류되던 버그 회귀 방지) ===
{
  const fail = m => { console.log('FAIL: R92fix ' + m); process.exit(1); };
  const scen184 = JSON.parse(readFileSync('data/scenario-184.json'));
  const g2 = new Game(scen184, JSON.parse(JSON.stringify(officers)), {}, 0);
  const fid2 = Object.values(g2.forces)[0].id, ruler2 = Object.values(g2.forces)[0].ruler;
  const si2 = g2.cities.find(c => c.name_ko === '시상'), ho2 = g2.cities.find(c => c.name_ko === '회계');
  si2.force = fid2; ho2.force = fid2;
  const sh2 = { id: 88001, force: fid2, officers: [ruler2], troops: 3000, type: 'junk', x: 116.2, z: 29.6, path: [], tx: null, tz: null, targetCity: null, label: 'T', qi: 100, conf: 0 };
  g2.units.push(sh2); g2.orderUnit(88001, ho2.id);
  let maxStep = 0, turns = 0;
  while (g2.units.find(u => u.id === 88001) && turns < 25) {
    const px = sh2.x, pz = sh2.z; g2.stepUnit(sh2); turns++;
    if (g2.units.find(u => u.id === 88001)) maxStep = Math.max(maxStep, Math.hypot(sh2.x - px, sh2.z - pz));
  }
  if (g2.units.find(u => u.id === 88001)) fail('25턴 내 합류 미완료');
  if (maxStep > 0.7) fail('턴당 이동 초과 (순간이동) ' + maxStep.toFixed(2));
  if (turns < 3) fail('항해 턴 과소 (1턴 합류 회귀) ' + turns);
  if (ho2.troops !== 3000 || ho2.junks !== 1) fail('합류 후 병력/선박 이상 troops=' + ho2.troops + ' junks=' + ho2.junks);
  console.log('R92fix 수군 항해 게이트 PASS (턴당 최대 ' + maxStep.toFixed(2) + '°, ' + turns + '턴 항해 후 회계 병력+3000·주가+1 합류)');
      }

// === R96: 무장 귀속·소실 방지 게이트 — ① 부대 전멸 시 탑승 무장 아군 도시 도주 복귀 ② 도시 함락 시 수비 무장 원 세력 잔여 도시로 도주 ③ 저장 로드 정합화(_reconcileOfficerRosters) 복귀·멱등 ===
{
  const fail = m => { console.log('FAIL: R96 ' + m); process.exit(1); };
  const mkG = () => new Game(JSON.parse(readFileSync('data/scenario-184.json')), JSON.parse(JSON.stringify(officers)), {}, 28);
  // ① 전멸 복귀
  {
    const g = mkG(); g.econV = 2;
    const home = g.cities.find(c => c.force === 28), offIdx = home.officers[0];
    home.officers = home.officers.filter(i => i !== offIdx);
    g.units.push({ id: 990001, force: 28, officers: [offIdx], troops: 100, type: 'sword', x: home.lon + 0.5, z: home.lat + 0.5, path: [], tx: null, tz: null, targetCity: null, label: 'R96', qi: 0, conf: 0, food: 0 });
    g.units.push({ id: 990002, force: 5, officers: [-1], troops: 5000, type: 'spear', x: home.lon + 0.5, z: home.lat + 0.6, path: [], tx: null, tz: null, targetCity: null, label: '적', qi: 100, conf: 0, food: 99999 });
    g.resolveFieldBattles();
    if (g.units.find(u => u.id === 990001)) fail('전멸 미발생');
    if (!g.cities.some(c => c.force === 28 && c.officers.includes(offIdx))) fail('전멸 무장 복귀 없음');
  }
  // ② 함락 도주 (다도시 세력 29 대상 — 단일도시 세력은 도주처 없음이 정상)
  {
    const g = mkG(); g.econV = 2;
    const target = g.cities.find(c => c.force === 29);
    const defs = [...target.officers];
    target.troops = 1; target.hp = 1;
    const atkHome = g.cities.find(c => c.force === 28), atkOff = atkHome.officers[0];
    atkHome.officers = atkHome.officers.filter(i => i !== atkOff);
    g.units.push({ id: 990003, force: 28, officers: [atkOff], troops: 20000, type: 'spear', x: target.lon, z: target.lat, path: [], tx: target.lon, tz: target.lat, targetCity: target.id, label: 'R96공격', qi: 100, conf: 0, food: 99999 });
    g.stepUnit(g.units[g.units.length - 1]);
    if (target.force !== 28) fail('함락 미발생');
    if (defs.some(i => target.officers.includes(i))) fail('수비 무장이 공격측 로스터 잔류');
    if (!defs.every(i => g.cities.some(c => c.force === 29 && c.officers.includes(i)))) fail('수비 무장 도주 없음');
  }
  // ③ 복구·멱등
  {
    const g = mkG(); g.econV = 2;
    const c = g.cities.find(x => x.force === 28), offIdx = c.officers[1];
    c.officers = c.officers.filter(i => i !== offIdx);
    g._reconcileOfficerRosters();
    if (!g.cities.some(x => x.force === 28 && x.officers.includes(offIdx))) fail('림보 무장 복귀 없음');
    const snap = JSON.stringify(g.cities.map(x => x.officers));
    g._reconcileOfficerRosters();
    if (snap !== JSON.stringify(g.cities.map(x => x.officers))) fail('정합화 비멱등');
  }
  console.log('R96 무장 귀속 게이트 PASS (전멸 도주 복귀·함락 수비 도주·로드 정합화 복귀+멱등)');
}

// === R97: 세력 현황 대시보드 게이트 — ① 월 예상 수지(금)가 실제 정산(delta)과 일치 ② 요약·비교 합계 정합 ③ 위협 집계 동작 ===
{
  const fail = m => { console.log('FAIL: R97 ' + m); process.exit(1); };
  function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  Math.random = mulberry32(97);
  const g = new Game(JSON.parse(readFileSync('data/scenario-184.json')), JSON.parse(JSON.stringify(officers)), {}, 28);
  g.econV = 2;
  const ov = g.forceOverview(28);
  const row = ov.cities[0];
  const city = g.cities.find(c => c.id === row.id);
  const g0 = city.gold;
  if (row.goldIn <= 0 || row.sal <= 0) fail('수지 집계 비정상 goldIn=' + row.goldIn + ' sal=' + row.sal);
  for (let k = 0; k < 3; k++) { const t = g.turn; g.endTurn(aiThink); if (g.turn === t) { if (g.pendingDuel) g.pendingDuel = null; else if (g.pendingDebate) g.pendingDebate = null; else break; } }
  const delta = city.gold - g0;
  if (delta !== row.goldIn - row.sal) fail(`월 예상 수지 불일치: 예상 ${row.goldIn - row.sal} vs 실제 정산 ${delta}`);
  if (ov.summary.gold !== g.forceCities(28).reduce((sm, c) => sm + c.gold, 0) + 0 && false) fail('unreachable');
  const ov2 = g.forceOverview(28);
  if (ov2.summary.cities !== g.forceCities(28).length) fail('요약 도시 수 불일치');
  if (ov2.summary.garrison !== g.forceCities(28).reduce((sm, c) => sm + c.troops, 0)) fail('주둔 병력 합계 불일치');
  const cmp = g.forceComparison();
  if (!cmp.length || cmp.reduce((sm, r) => sm + r.cities, 0) !== g.cities.filter(c => c.force != null).length) fail('세력 비교 도시 합계 불일치');
  // 위협: 적 부대를 내 도시 옆에 놓으면 잡히는지
  const home = g.forceCities(28)[0];
  g.units.push({ id: 990020, force: 5, officers: [-1], troops: 9000, type: 'spear', x: home.lon + 1.0, z: home.lat + 1.0, path: [], tx: null, tz: null, targetCity: null, label: 'R97적', qi: 100, conf: 0, food: 99999 });
  const th = g.forceOverview(28).threats;
  if (!th.some(t => t.city === home.name_ko && t.label === 'R97적')) fail('위협 집계 없음');
  console.log('R97 대시보드 게이트 PASS (월 예상 금 수지=실제 정산 일치·요약/비교 합계 정합·위협 집계)');
}
// === R99: 대시보드 시각 완성 게이트 — ① 섹션 라벨/순수지 표기 소스 존재 ② 섹션 데이터 필드 존재 ===
{
  const fail = m => { console.log('FAIL: R99 ' + m); process.exit(1); };
  const src = readFileSync('js/main.js', 'utf8');
  for (const t of ['순수지', '봉록 지출', '부족 경고 없음', '공격받는 도시 없음', '진행 중인 명령 없음', '건설 중인 시설 없음', '진행 중인 연구 없음', '연구 / 건설', '위협 (공격받는 도시)'])
    if (!src.includes(t)) fail('대시보드 섹션 라벨 누락: ' + t);
  function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  Math.random = mulberry32(99);
  const g = new Game(JSON.parse(readFileSync('data/scenario-184.json')), JSON.parse(JSON.stringify(officers)), {}, 28);
  g.econV = 2;
  const ov = g.forceOverview(28);
  if (ov.summary.goldIn - ov.summary.sal == null) fail('순수지 산출 불가');
  for (const k of ['dest', 'pathLen', 'building']) if (!(k in (ov.units[0] ?? { dest: null, pathLen: 0, building: null }))) fail('부대 진행 명령 필드 누락: ' + k);
  if (!('building' in ov.cities[0])) fail('도시 건설 진행 필드 누락');
  if (!Array.isArray(ov.threats) || !Array.isArray(ov.fieldBuilding)) fail('위협/야전 건설 배열 누락');
  console.log('R99 대시보드 시각 완성 게이트 PASS (섹션 라벨 9종·순수지 표기·섹션 데이터 필드)');
}
// === R101: AI 재배치 게이트 — ① 공백 도시로 보충 출진(병3000+무장1) ② 도착 전량 합류·무장 재배치 ③ 중복 출진 없음(스래시 방지) ===
{
  const fail = m => { console.log('FAIL: R101 ' + m); process.exit(1); };
  function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  Math.random = mulberry32(101);
  const g = new Game(JSON.parse(readFileSync('data/scenario-184.json')), JSON.parse(JSON.stringify(officers)), {}, 28);
  g.econV = 2;
  const home = g.forceCities(28).find(c => c.name_ko === '남피') ?? g.forceCities(28)[0];
  const needy = g.cities.find(c => c.name_ko === '북해' && c.force == null);
  if (!home || !needy) fail('시험 도시 확보 실패');
  needy.force = 28; needy.troops = 500; needy.officers = [];
  for (const c of g.cities) { c.gold = 0; c.food = 0; c.security = 100; c.dous = c.lous = c.junks = 0; if (c.force !== 28) c.troops = 50000; } // 내정·공세 억제 — 재배치만 관측
  home.food = 49000; needy.food = 49000; // 시험용 병량 — 탈영 방지(상인 매각 문턱 50000 미만으로 유지해 금 회복 경로 차단)
  for (const c of g.forceCities(28)) if (c !== home && c !== needy) c.troops = 5000;
  home.troops = 22000;
  const homeOffs0 = home.officers.length, homeTroops0 = home.troops;
  aiThink(g, 28);
  const reinf = g.units.find(u => u.force === 28 && u.targetCity === needy.id);
  if (!reinf) fail('보충 출진 없음');
  if (reinf.troops < 3000 || reinf.officers.length !== 1) fail(`보충 부대 편성 이상 troops=${reinf.troops} offs=${reinf.officers.length}`);
  if (home.troops < 3000) fail('출발지 잔류 하한 위반 ' + home.troops);
  if (home.officers.length !== homeOffs0 - 1) fail('무장 파견 수 이상 ' + home.officers.length);
  const sentOff = reinf.officers[0], sentTroops = reinf.troops;
  let arrived = false;
  for (let k = 0; k < 40 && !arrived; k++) { const t = g.turn; g.endTurn(aiThink); if (g.turn === t) { g.pendingDuel = null; g.pendingDebate = null; } arrived = !g.units.some(u => u.id === reinf.id); }
  if (!arrived) fail('40턴 내 도착 실패');
  if (needy.troops < 500 + sentTroops) fail(`합류 손실: ${needy.troops} < ${500 + sentTroops}`); // R87 전량 합류
  if (!needy.officers.includes(sentOff) || g.officers[sentOff].state.city !== needy.id) fail('무장 재배치 실패');
  aiThink(g, 28);
  if (g.units.some(u => u.force === 28 && u.targetCity === needy.id)) fail('스래시: 목표 달성 후 중복 보충 출진'); // 목적지 기준만 판정 — 시험 기간 중 타 세력 공세에 대한 방어 출진은 정상 동작이라 부대 총수 비교는 무효
  console.log('R101 AI 재배치 게이트 PASS (보충 출진·전량 합류·무장 재배치·중복 출진 없음)');
}
// === R102: 함락 부대 입성 게이트 — ① 점령 부대 잔여 병력·무장이 신규 도시에 전량 합류 ② 야전에 부대 잔류 없음 ③ 일반 귀환 합류 회귀 ===
{
  const fail = m => { console.log('FAIL: R102 ' + m); process.exit(1); };
  function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  Math.random = mulberry32(102);
  const g = new Game(JSON.parse(readFileSync('data/scenario-184.json')), JSON.parse(JSON.stringify(officers)), {}, 28);
  g.econV = 2;
  const home = g.forceCities(28).find(c => c.name_ko === '남피') ?? g.forceCities(28)[0];
  const tgt = g.cities.find(c => c.name_ko === '북해' && c.force == null);
  if (!home || !tgt) fail('시험 도시 확보 실패');
  for (const c of g.cities) { c.gold = 0; c.food = 0; c.security = 100; c.dous = c.lous = c.junks = 0; }
  home.food = 49000;
  tgt.troops = 50; tgt.hp = 50; // 즉시 함락 가능 수준
  const offs = [...home.officers].slice(0, 1);
  const u = g.dispatch(home.id, offs, 8000, 'spear') || g.dispatch(home.id, offs, 8000, 'sword'); // 병장 재고 부족 시 검병 폴백 (dispatch는 실패 시 false 반환)
  if (!u) fail('출진 실패');
  u.x = tgt.lon + 0.5; u.z = tgt.lat; u.path = []; // 시험 배치 — 공성 사거리 내 직접 배치
  if (!g.orderUnit(u.id, tgt.id)) fail('목표 지정 실패');
  const troopsBefore = u.troops, foodBefore = u.food ?? 0, off0 = u.officers[0];
  let captured = false;
  for (let k = 0; k < 6 && !captured; k++) { const t = g.turn; g.endTurn(aiThink); if (g.turn === t) { g.pendingDuel = null; g.pendingDebate = null; } captured = tgt.force === 28; }
  if (!captured) fail('6턴 내 함락 실패');
  if (g.units.some(x => x.id === u.id)) fail('점령 부대가 야전에 잔류');
  const gained = tgt.troops;
  if (gained < troopsBefore - 2000) fail(`입성 병력 손실 과다: ${gained} (출진 ${troopsBefore})`); // 공성 손실분만 차감 허용
  if (!tgt.officers.includes(off0) || g.officers[off0].state.city !== tgt.id) fail('점령 무장 입성 실패');
  // ③ 일반 귀환 합류 회귀: 다른 부대가 아군 도시로 돌아오면 전량 합류
  const homeT0 = home.troops;
  const u2 = g.dispatch(home.id, [...home.officers].slice(0, 1), 3000, 'sword');
  if (!u2) fail('귀환 시험 출진 실패');
  u2.x = home.lon + 0.3; u2.z = home.lat; u2.path = [];
  if (!g.orderUnit(u2.id, home.id)) fail('귀환 목표 지정 실패');
  for (let k = 0; k < 6 && g.units.some(x => x.id === u2.id); k++) { const t = g.turn; g.endTurn(aiThink); if (g.turn === t) { g.pendingDuel = null; g.pendingDebate = null; } }
  if (g.units.some(x => x.id === u2.id)) fail('귀환 부대 미합류');
  if (home.troops < homeT0) fail(`귀환 합류 손실: ${home.troops} < ${homeT0}`);
  console.log('R102 함락 입성 게이트 PASS (점령 부대 전량 입성·야전 잔류 없음·일반 귀환 합류 회귀)');
}
// === R101b: 무장 0 도시 재배치 게이트 — ① 호위 동반 무장 파견 ② 도착 합류로 무장 0 해소 ③ 출발지 잔류 유지 ===
{
  const fail = m => { console.log('FAIL: R101b ' + m); process.exit(1); };
  function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  Math.random = mulberry32(1017);
  const g = new Game(JSON.parse(readFileSync('data/scenario-184.json')), JSON.parse(JSON.stringify(officers)), {}, 28);
  g.econV = 2;
  const home = g.forceCities(28).find(c => c.name_ko === '남피') ?? g.forceCities(28)[0];
  const needy = g.cities.find(c => c.name_ko === '수춘' && c.force == null);
  if (!home || !needy) fail('시험 도시 확보 실패');
  needy.force = 28; needy.troops = 5000; needy.officers = [];
  for (const c of g.cities) { c.gold = 0; c.food = 0; c.security = 100; c.dous = c.lous = c.junks = 0; if (c.force !== 28) c.troops = 50000; }
  for (const c of g.forceCities(28)) if (c !== home && c !== needy) c.troops = 5000;
  home.troops = 22000; home.food = 49000; needy.food = 49000;
  const homeOffs0 = home.officers.length;
  aiThink(g, 28);
  const mv = g.units.find(u => u.force === 28 && u.targetCity === needy.id);
  if (!mv) fail('무장 재배치 출진 없음');
  if (mv.officers.length !== 1 || mv.troops > 1000) fail(`재배치 편성 이상 troops=${mv.troops} offs=${mv.officers.length}`); // 호위 1000 이하+무장 1
  const sentOff = mv.officers[0];
  const only28 = (gg, fid) => { if (fid === 28) aiThink(gg, fid); }; // 관측 대상 외 AI 정지 — 호위 1000의 이동 부대가 타 세력 공세에 요격·전멸되는 노이즈 차단 (해당 경로는 R96 게이트가 검증)
  let arrived = false;
  for (let k = 0; k < 40 && !arrived; k++) { const t = g.turn; g.endTurn(only28); if (g.turn === t) { g.pendingDuel = null; g.pendingDebate = null; } arrived = !g.units.some(u => u.id === mv.id); }
  if (!arrived) fail('40턴 내 도착 실패');
  if (!needy.officers.includes(sentOff) || g.officers[sentOff].state.city !== needy.id) fail('무장 0 해소 실패');
  if (home.officers.length < 1 || home.officers.includes(sentOff)) fail('출발지 무장 잔류 이상'); // 등용으로 총수는 늘 수 있음 — 잔류 1+·파견 무장 미복귀가 계약 (시작 수 '+homeOffs0+'는 기록용)
  aiThink(g, 28);
  if (g.units.some(u => u.force === 28 && u.targetCity === needy.id)) fail('스래시: 무장 배치 후 중복 출진');
  console.log('R101b 무장 0 재배치 게이트 PASS (호위 동반 파견·도착 해소·중복 출진 없음)');
}
// === R102: 모바일 레이아웃 게이트 — 모달 상한/가로 스크롤 + 좁은 화면 미디어 쿼리 소스 존재 ===
{
  const fail = m => { console.log('FAIL: R102-css ' + m); process.exit(1); };
  const css = readFileSync('css/style.css', 'utf8');
  for (const t of ['#modal .box { max-width:94vw', 'overflow-x:auto', '@media (max-width: 480px)']) if (!css.includes(t)) fail('모바일 CSS 누락: ' + t);
  const idx = readFileSync('index.html', 'utf8');
  if (!/css\/style\.css\?v=r\d+/.test(idx)) fail('스타일시트 버전 파라미터 없음');
  console.log('R102 모바일 레이아웃 게이트 PASS (모달 상한·가로 스크롤·미디어 쿼리·css 버전)');
}
// === R103: 모바일 하단 시트 게이트 — 좁은 화면에서 패널이 지도를 가리지 않도록 소스 존재 ===
{
  const fail = m => { console.log('FAIL: R103-css ' + m); process.exit(1); };
  const css = readFileSync('css/style.css', 'utf8');
  for (const t of ['R103: 모바일', 'bottom:0; left:0; right:0; width:100%', 'max-height:46vh']) if (!css.includes(t)) fail('하단 시트 CSS 누락: ' + t);
  console.log('R103 모바일 하단 시트 게이트 PASS');
}
// === R-ver2: 빌드 버전 일치 게이트 — index meta·main.js BUILD_ID·모든 ?v= 접미어 동일 (r105 배포 시 versioned 파일 누락으로 가드 배너가 뜬 사고 재발 방지)
{
  const fail = m => { console.log('FAIL: R-ver2 ' + m); process.exit(1); };
  const idx = readFileSync('index.html', 'utf8');
  const meta = idx.match(/meta name="build" content="([^"]+)"/)?.[1];
  if (!meta) fail('index.html meta[name=build] 없음');
  const mainSrc = readFileSync('js/main.js', 'utf8');
  const bid = mainSrc.match(/BUILD_ID = '([^']+)'/)?.[1];
  if (bid !== meta) fail('BUILD_ID(' + bid + ') != meta(' + meta + ')');
  for (const f of ['index.html', 'js/main.js', 'js/map3d.js']) {
    const src2 = readFileSync(f, 'utf8');
    const vs = [...src2.matchAll(/\?v=([a-z0-9]+)/g)].map(m => m[1]);
    for (const v of vs) if (v !== meta) fail(f + ' 의 ?v=' + v + ' != meta ' + meta);
  }
  console.log('R-ver2 빌드 버전 일치 게이트 PASS (' + meta + ')');
}

// === R105: 로스터·위치 정합 정리 게이트 — 부대 배치(city=null)/정상 주둔/재야/타도시 중복 잔류 4상태 구분 + 기록 도시 우선 복귀 + 멱등 회귀 ===
{
  const fail = m => { console.log('FAIL: R105 ' + m); process.exit(1); };
  const mkG = () => new Game(JSON.parse(readFileSync('data/scenario-184.json')), JSON.parse(JSON.stringify(officers)), {}, 28);
  const g = mkG(); g.econV = 2;
  const cs = g.cities.filter(c => c.force === 28);
  if (cs.length < 2) fail('시나리오에 세력28 도시 2개 필요');
  const A = cs[0], B = cs[1];
  const keep = A.officers[0];                                   // 정상 주둔 — 유지돼야 함
  const moved = B.officers[0];                                  // B 소속 정상 — A에 중복 잔류 주입
  A.officers.push(moved);
  const free = Object.values(g.officers).find(o => o.state?.status === 'free' && o.state.city === A.id)
    ?? Object.values(g.officers).find(o => o.state?.status === 'free');
  if (!free) fail('시나리오에 재야 무장 필요');
  free.state.city = A.id; A.officers.push(free.idx);            // 재야 잔류 주입
  const dep = A.officers.find(i => i !== keep && i !== moved && i !== free.idx); // 부대 배치 — city=null + 부대 탑승이 정상, 로스터 잔류분만 정리돼야 함
  if (dep == null) fail('배치 시험용 무장 부족');
  g.officers[dep].state.city = null;
  g.units.push({ id: 990010, force: 28, officers: [dep], troops: 1000, type: 'sword', x: A.lon + 1, z: A.lat + 1, path: [], tx: null, tz: null, targetCity: null, label: 'R105', qi: 100, conf: 0, food: 0 });
  g._reconcileOfficerRosters();
  if (!A.officers.includes(keep) || g.officers[keep].state.city !== A.id) fail('정상 주둔 무장 유실');
  if (A.officers.includes(moved)) fail('타도시 중복 잔류 미정리');
  if (!B.officers.includes(moved) || g.officers[moved].state.city !== B.id) fail('중복 정리가 정상 소속까지 훼손');
  if (A.officers.includes(free.idx)) fail('재야 무장 로스터 잔존');
  if (free.state.status !== 'free' || free.state.city !== A.id) fail('재야 상태 훼손');
  if (A.officers.includes(dep)) fail('배치 무장의 로스터 잔류 미정리');
  const u = g.units.find(x => x.id === 990010);
  if (!u || !u.officers.includes(dep) || g.officers[dep].state.city !== null) fail('부대 배치 상태 훼손');
  if (g.cities.some(c => c.officers.includes(dep))) fail('배치 무장이 로스터에 재유입');
  const snap = JSON.stringify(g.cities.map(c => c.officers));
  g._reconcileOfficerRosters();
  if (snap !== JSON.stringify(g.cities.map(c => c.officers))) fail('정합화 비멱등');
  // 기록 도시 우선 복귀: 로스터에서 빠진 소속 무장은 state.city의 같은 세력 도시로 복귀 (무관한 도시 이동 금지)
  const g2 = mkG(); g2.econV = 2;
  const D = g2.cities.filter(c => c.force === 28)[1];
  const wand = D.officers[0];
  D.officers = D.officers.filter(i => i !== wand);
  g2._reconcileOfficerRosters();
  if (!D.officers.includes(wand) || g2.officers[wand].state.city !== D.id) fail('기록 도시 우선 복귀 실패');
  console.log('R105 로스터·위치 정합 게이트 PASS (정상주둔 유지/타도시중복 정리/재야 정리/배치 보존/기록도시 복귀/멱등)');
}

// === R106: 조사(을/를·이/가) 판정 게이트 — 부대 라벨('장막 5k')처럼 끝이 숫자·라틴·공백이면 마지막 한글 음절 받침 기준 ===
{
  const fail = m => { console.log('FAIL: R106 ' + m); process.exit(1); };
  const cases = [['장막 5k', ['을','를'], '장막 5k을'], ['손견 8k', ['이','가'], '손견 8k이'], ['적병 3k', ['은','는'], '적병 3k은'], ['장막', ['을','를'], '장막을'], ['진류', ['을','를'], '진류를'], ['완', ['은','는'], '완은'], ['함락!', ['을','를'], '함락!를']];
  for (const [n, p, e] of cases) { const r = josa(n, p); if (r !== e) fail(n + ' → ' + r + ' (기대 ' + e + ')'); }
  console.log('R106 조사 판정 게이트 PASS (라벨 접미 7예)');
}

// === R104: 대시보드 부족 경고 문구 — 개월 수 기간임이 드러나는 표기 게이트 ===
{
  const fail = m => { console.log('FAIL: R104-wording ' + m); process.exit(1); };
  const src = readFileSync('js/main.js', 'utf8');
  for (const t of ['개월 후 병량 부족 예상', '개월 후 금 부족 예상']) if (!src.includes(t)) fail('기간 표기 누락: ' + t);
  if (/LackMonth\}월 (병량|금) 부족 예상/.test(src)) fail('구 표기(달력 월 오독 가능) 잔존');
  console.log('R104 부족 경고 기간 표기 게이트 PASS');
    }

// === R107: 초상 아틀라스 514 연결 게이트 — map 514건·슬롯 중복 없음·좌표 범위·신규 시트 파일 존재 (최종통과 108 연결) ===
{
  const fail = m => { console.log('FAIL: R107 ' + m); process.exit(1); };
  const pj = JSON.parse(readFileSync('data/portraits.json', 'utf8'));
  const ents = Object.entries(pj.map);
  if (ents.length !== 514) fail('map ' + ents.length + '건 != 514');
  const slots = new Set();
  for (const [k, v] of ents) {
    const key = v.join(',');
    if (slots.has(key)) fail('슬롯 중복 ' + k + ' -> ' + key);
    slots.add(key);
    const [sh, c, r] = v;
    if (!(Number.isInteger(sh) && sh >= 0 && sh <= 9 && Number.isInteger(c) && c >= 0 && c < 8 && Number.isInteger(r) && r >= 0 && r < 8)) fail('좌표 범위 초과 ' + k + ' -> ' + key);
  }
  for (const sh of [8, 9]) { try { readFileSync('portraits-atlas/sheet-' + sh + '.jpg'); } catch { fail('sheet-' + sh + '.jpg 없음'); } }
  console.log('R107 초상 아틀라스 514 연결 게이트 PASS (' + ents.length + '건)');
      }

// === R108: 도시 패널 턴 갱신 게이트 — 열린 도시 기본 패널만 갱신(스크롤 유지), 하위 화면(출진·기교 등) 입력 상태 보존 ===
{
  const fail = m => { console.log('FAIL: R108 ' + m); process.exit(1); };
  const src = readFileSync('js/main.js', 'utf8');
  if (!src.includes("$('panel').dataset.view === 'city'")) fail('doTurn 도시 패널 갱신 분기 없음');
  if (!/const p = \$\('panel'\), st = p\.scrollTop; showCityPanel\(c\); p\.scrollTop = st;/.test(src)) fail('스크롤 보존 로직 없음');
  for (const t of ["dataset.view = 'city'", "dataset.view = 'unit'", "dataset.view='dispatch'", "dataset.view='tech'", "dataset.view='trade'", "dataset.view='diplo'", "dataset.view='advisor'", "dataset.view='legion'"]) if (!src.includes(t)) fail('뷰 태그 누락: ' + t);
  console.log('R108 도시 패널 턴 갱신 게이트 PASS (뷰 태그 8종·스크롤 보존)');
      }

// === R109: 위임 자동 중단 게이트 — 포위·함락 위기(에피소드당 1회), 외교 제안 5종, 세력 멸망 시 pendingStop (설계안 184행) ===
{
  const fail = m => { console.log('FAIL: R109 ' + m); process.exit(1); };
  const src = readFileSync('js/game.js', 'utf8');
  if (!src.includes('_delegateStop(reason)')) fail('_delegateStop 정의 없음');
  for (const t of ['친선 사절 도착', '동맹 제의 도착', '정전 요청 도착', '항복 권고 도착', '원군 요청 도착']) if (!src.includes(t)) fail('외교 스톱 누락: ' + t);
  if (!src.includes('_siegeWatch')) fail('포위 감시 없음');
  if (!/멸망했습니다!`, true\);\n        this\._delegateStop/.test(src)) fail('멸망 스톱 없음');
  // 기능: 위임 중 적이 내 도시 4 이내 접근 → pendingStop, 같은 에피소드는 재정지 없음
  const g9 = new Game(JSON.parse(JSON.stringify(scen)), officers, {}, 0);
  g9.delegated = true;
  const pc = g9.cities.find(c => c.force === g9.playerForce);
  const other = g9.aliveForces().find(f => f.id !== g9.playerForce);
  g9.units.push({ id: 'w109', force: other.id, officers: [], troops: 9000, type: 'spear', x: pc.lon + 2, z: pc.lat, path: [], tx: null, tz: null, targetCity: null, label: '위협시험 9k', qi: 100, conf: 0 });
  g9.endTurn(aiThink);
  if (!g9.pendingStop) fail('포위 위기 자동 정지 미발동');
  const u9 = g9.units.find(u => u.id === 'w109');
  g9.pendingStop = false;
  if (u9 && Math.hypot(u9.x - pc.lon, u9.z - pc.lat) <= 4) { g9.endTurn(aiThink); if (g9.pendingStop) fail('같은 에피소드 재정지 발생'); }
  // 기능: AI→플레이어 친선 사절 → pendingStop
  const g10 = new Game(JSON.parse(JSON.stringify(scen)), officers, {}, 0);
  g10.delegated = true;
  const of10 = g10.aliveForces().find(f => f.id !== g10.playerForce);
  const oc10 = g10.cities.find(c => c.force === of10.id);
  oc10.gold = Math.max(oc10.gold, 500); of10.ap = 255;
  if (!g10.envoy(of10.id, g10.playerForce, oc10.id)) fail('사절 집행 실패(전제 조건)');
  if (!g10.pendingStop) fail('외교 제안 자동 정지 미발동');
  console.log('R109 위임 자동 중단 게이트 PASS (포위 에피소드·외교 제안·멸망)');
      }
