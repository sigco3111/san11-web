import { Game, UNIT_TYPES } from '../js/game.js';
import { aiThink } from '../js/ai.js';
import { readFileSync } from 'fs';
const officers = {}; for (const o of JSON.parse(readFileSync('data/officers670.json'))) officers[o.idx] = o;
const scen = JSON.parse(readFileSync('data/scenario-190.json'));
const g = new Game(scen, officers, {}, 0); // 조조로 시작
console.log('start forces:', g.aliveForces().length, 'units:', g.units.length);
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
console.log('sample logs:'); for (const l of g.logs.slice(-8)) console.log(' ', l.t, l.msg);
