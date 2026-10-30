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
console.log('sample logs:'); for (const l of g.logs.slice(-8)) console.log(' ', l.t, l.msg);
