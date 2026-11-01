// R133 게이트: 기존 구현의 검증 부재 해소 — 간도·여울·난소행군(R23) / 개발지·담당·공기 단축·철거 / 병장 자동생산 고정량
// 규칙 변경 없이 현재 코드 동작을 수치로 고정한다.
import { Game, FACILITIES, ARTS, isRiverAt, isFordAt } from '../js/game.js';
import { aiThink } from '../js/ai.js';
import { readFileSync } from 'fs';
const officers = {}; for (const o of JSON.parse(readFileSync('data/officers670.json'))) officers[o.idx] = o;
const scen = JSON.parse(readFileSync('data/scenario-190.json'));
const store = {}; globalThis.localStorage = { setItem: (k, v) => { store[k] = v; }, getItem: k => store[k] ?? null, removeItem(){} };
const g = new Game(scen, officers, {}, 0);
const pf = g.playerForce;
let fail = 0; const ok = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + name); if (!cond) fail++; };

// --- 난소행군 기교 정의 ---
const art = ARTS['난소행군'];
ok('난소행군 기교 존재·기교P 800·금 2000', !!art && art.p === 800 && art.gold === 2000);

// --- 여울·깊은 강 좌표 확보 (실제 강 데이터에서 탐색) ---
let ford = null, deep = null;
outer: for (let lon = 110; lon <= 122 && !(ford && deep); lon += 0.1) {
  for (let lat = 25; lat <= 38; lat += 0.1) {
    if (!isRiverAt(lon, lat)) continue;
    if (isFordAt(lon, lat)) { if (!ford) ford = { lon, lat }; }
    else if (!deep) deep = { lon, lat };
    if (ford && deep) break outer;
  }
}
ok('강·여울 좌표 확보', !!ford && !!deep);
const u = { force: pf, x: 0, z: 0 };
u.x = deep.lon; u.z = deep.lat;
ok('깊은 강 감속 0.35 (미보유)', g.riverMult(u) === 0.35);
u.x = ford.lon; u.z = ford.lat;
ok('여울 감속 0.6 (미보유)', g.riverMult(u) === 0.6);
g.forces[pf].arts = { ...(g.forces[pf].arts ?? {}), '난소행군': true };
ok('난소행군 보유 시 도하 0.8', g.riverMult(u) === 0.8);
ok('간도 통과 0.6 (미보유 기준은 별도 세력)', (() => { const other = g.aliveForces().find(f => f.id !== pf); return other ? g.passMult({ force: other.id }) === 0.6 : false; })());
ok('간도 통과 0.9 (난소행군 보유)', g.passMult({ force: pf }) === 0.9);
delete g.forces[pf].arts['난소행군'];

// --- 개발지 수 ---
const city = g.forceCities(pf)[0];
ok('개발지 일반 도시 8', g.facSlots({ ...city, metropolis: false }) === 8);
ok('개발지 대도시 12', g.facSlots({ ...city, metropolis: true }) === 12);

// --- 건설: 담당 최대 3명·비용·AP·슬롯 제한 ---
city.gold = 99999; g.forces[pf].ap = 255; city.facilities = [];
// 담당 후보 4명 확보 (부족하면 스텁 무장 추가)
while (city.officers.length < 4) { const ni = 9000 + city.officers.length; g.officers[ni] = { idx: ni, name_ko: '스텁' + ni, pol: 90, state: { force: pf, city: city.id } }; city.officers.push(ni); }
const b4 = city.officers.slice(0, 4);
ok('건설 시작 성공', g.buildFacility(city.id, '시장', b4));
const fc = city.facilities[city.facilities.length - 1];
ok('담당 4명 지정 → 3명으로 제한', fc.builders.length === 3);
ok('건설 비용 차감(시장 ' + FACILITIES['시장'].cost + ')', city.gold === 99999 - FACILITIES['시장'].cost);
ok('건설 AP 20 소비', g.forces[pf].ap === 235);
// 슬롯 한도: 슬롯을 꽉 채우면 추가 건설 실패
city.facilities = Array.from({ length: 8 }, (_, i) => ({ type: '시장', progress: 0, builders: [], done: false }));
ok('슬롯 초과 건설 실패', g.buildFacility(city.id, '농장', b4) === false);
city.facilities = [];

// --- 공기 단축: 정치 합산 250 이상이면 턴당 2, 미만이면 1 ---
city.gold = 99999; g.forces[pf].ap = 255;
const low = b4.slice(0, 1); // 1명(pol 90) → 합산 90
g.officers[low[0]].pol = 90;
ok('저정치 건설 시작', g.buildFacility(city.id, '시장', low));
const pols = b4.slice(0, 3); for (const i of pols) g.officers[i].pol = 100; // 합산 300 ≥ 250
ok('고정치 건설 시작', g.buildFacility(city.id, '농장', pols));
const slowFac = city.facilities.find(f => f.type === '시장');
const fastFac = city.facilities.find(f => f.type === '농장');
const noop = () => {}; g.endTurn(noop); if (g.pendingDuel) g.duelAuto(g.pendingDuel); if (g.pendingDebate) g.debateAuto(g.pendingDebate); // AI 간섭(담당 이동) 없이 공기 진행만 관측
ok('정치 합산 <250 → 진행 +1', slowFac.progress === 1);
ok('정치 합산 ≥250 → 진행 +2', fastFac.progress === 2);

// --- 철거 ---
const n0 = city.facilities.length;
ok('철거 성공', g.demolishFacility(city.id, 0) && city.facilities.length === n0 - 1);
ok('철거 무효 인덱스 실패', g.demolishFacility(city.id, 99) === false);
city.facilities = [];

// --- 병장 자동생산 고정량(월): 대장간 있으면 창·극·노 각 +100, 특색 도시는 해당 병장 +400 ---
const c2 = g.forceCities(pf)[1] ?? city;
c2.specialty = [];
c2.facilities = [{ type: '대장간', progress: 99, builders: [], done: true }];
const s0 = [c2.spears, c2.pikes, c2.bows];
// 월 경계까지 진행 (현재 dan 기준 최대 3턴)
while (g.dan !== 1) { aiThink(g, pf); g.endTurn(aiThink); if (g.pendingDuel) g.duelAuto(g.pendingDuel); if (g.pendingDebate) g.debateAuto(g.pendingDebate); }
aiThink(g, pf); g.endTurn(aiThink); if (g.pendingDuel) g.duelAuto(g.pendingDuel); if (g.pendingDebate) g.debateAuto(g.pendingDebate);
ok('대장간 보유 도시 월 창·극·노 +100', c2.spears - s0[0] === 100 && c2.pikes - s0[1] === 100 && c2.bows - s0[2] === 100);
// 특색 도시: 창 특색이면 창만 +400
c2.specialty = ['창'];
const s1 = [c2.spears, c2.pikes, c2.bows];
while (g.dan !== 1) { aiThink(g, pf); g.endTurn(aiThink); if (g.pendingDuel) g.duelAuto(g.pendingDuel); if (g.pendingDebate) g.debateAuto(g.pendingDebate); }
aiThink(g, pf); g.endTurn(aiThink); if (g.pendingDuel) g.duelAuto(g.pendingDuel); if (g.pendingDebate) g.debateAuto(g.pendingDebate);
ok('특색(창) 도시 월 창 +400·나머지 +0', c2.spears - s1[0] === 400 && c2.pikes - s1[1] === 0 && c2.bows - s1[2] === 0);

console.log(fail ? `FAIL ${fail}` : 'R133 ALL PASS');
process.exit(fail ? 1 : 0);
