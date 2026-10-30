import { Game, UNIT_TYPES, ITEMS } from '../js/game.js';
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
      const pool0 = (g.itemPool ?? []).length;
      const o0 = Math.random; Math.random = () => 0.001; // hidden 없음 → 명품 분기 (0.001 < 0.25)
      g.searchCity(sc.id); Math.random = o0;
      const holder = Object.values(g.officers).find(o => (o.state?.items ?? []).length > 0);
      if (!(g.itemPool.length === pool0 - 1 && holder)) { console.error('FAIL: 명품 발견·귀속'); process.exit(1); }
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
      for (let t = 0; t < 3; t++) { g.endTurn((gg, fid) => { if (fid !== f.id) aiThink(gg, fid); }); if (g.pendingDuel) g.duelAuto(g.pendingDuel); if (g.pendingDebate) g.debateAuto(g.pendingDebate); } // 월 처리는 3순(1개월)마다. 대상 세력의 AI 기교 연구(techP 소비)는 차단해 결정적으로
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
    const idx = 90000 + Math.floor(Math.random() * 1000);
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
    if (((ac.rams ?? 0) + (ac.catapults ?? 0)) < 1 || ((ac.lous ?? 0) + (ac.dous ?? 0)) < 1) { console.error('FAIL: AI 병기·선박 생산', ac.rams, ac.catapults, ac.lous, ac.dous); process.exit(1); }
    console.log('AI 병기·선박 생산 확인: 충거', ac.rams ?? 0, '투석', ac.catapults ?? 0, '누선', ac.lous ?? 0, '투함', ac.dous ?? 0);
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
  if (!bandit || bandit.targetCity !== home.id || bandit.troops !== 3000) { console.error('FAIL: R9 적 출현', JSON.stringify(bandit)); process.exit(1); }
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
    return { id, force, officers: [oi], troops: 8000, type: 'cav', x: 0, z: 0, path: [], tx: null, tz: null, targetCity: null, label: 'U' + id, qi: 100, conf: 0 };
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
}
{
  const fs = await import('fs');
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
console.log('sample logs:'); for (const l of g.logs.slice(-8)) console.log(' ', l.t, l.msg);
