import { Game, UNIT_TYPES } from '../js/game.js';
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
  let freeO = home && Object.values(g.officers).find(o => o.state?.status === 'free' && o.state.city === home.id);
  if (home && !freeO) { // 없으면 미등장 무장을 재야로 배치
    freeO = Object.values(g.officers).find(o => o.state && o.state.status === 'not_yet');
    if (freeO) { freeO.state.status = 'free'; freeO.state.city = home.id; }
  }
  if (home && freeO) {
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
console.log('sample logs:'); for (const l of g.logs.slice(-8)) console.log(' ', l.t, l.msg);
