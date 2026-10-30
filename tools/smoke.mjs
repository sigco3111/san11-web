import { Game, UNIT_TYPES } from '../js/game.js';
import { aiThink } from '../js/ai.js';
import { readFileSync } from 'fs';
const officers = {}; for (const o of JSON.parse(readFileSync('data/officers670.json'))) officers[o.idx] = o;
const scen = JSON.parse(readFileSync('data/scenario-190.json'));
const g = new Game(scen, officers, {}, 0); // 조조로 시작
console.log('start forces:', g.aliveForces().length, 'units:', g.units.length);
// 전법/계략 발동 카운트
let tacN = 0, stratN = 0;
const origLog = g.log.bind(g);
g.log = (m, mine) => { if (m.includes('【전법】')) tacN++; if (m.includes('【계략】')) stratN++; origLog(m, mine); };
// 레거시 세이브 호환: qi/conf 필드 없는 부대가 있어도 턴이 정상 진행되어야 함
const enemy = g.cities.find(c => c.force != null && c.force !== g.playerForce);
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
console.log('tactics fired:', tacN, '| stratagems fired:', stratN);
if (g.units.find(u => u.id === 9999) && g.units.find(u => u.id === 9999).qi === undefined) {
  // 아직 전투에 도달하지 않았으면 기력 미회복 상태일 수 있음 — 오류 없이 진행됐으면 통과
}
console.log('sample logs:'); for (const l of g.logs.slice(-8)) console.log(' ', l.t, l.msg);
