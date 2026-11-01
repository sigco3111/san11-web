// R126: 적(賊) 게이트 — ① 출현(치안<80·육지·도시 미중첩·18턴 시한) ② 이동 ③ 도착 시설 파괴 ④ 시설 없으면 금 약탈 ⑤ 시한 만료·병력0 소멸 (설계안 101행, 자체 수치)
// 대형 suite(tools/smoke.mjs) 편집 제약 회피용 분리 게이트. 실행: node tools/smoke-r126-bandit.mjs (repo 루트에서)
import { Game, isWaterAt } from '../js/game.js';
import { readFileSync } from 'fs';
const officers = {}; for (const o of JSON.parse(readFileSync('data/officers670.json'))) officers[o.idx] = o;
const fail = (m, ...a) => { console.log('FAIL: R126 ' + m, ...a); process.exit(1); };
const mkG = () => new Game(JSON.parse(readFileSync('data/scenario-184.json')), JSON.parse(JSON.stringify(officers)), {}, 28);
// ① 출현: 치안 79 도시에 spawnBandits → 육지 셀, 도시 1.5 미중첩, force -1, 3000, until=turn+18
{
  const g = mkG(); g.units = [];
  const c = g.cities.find(x => x.force === 28); c.security = 79;
  const n0 = g.units.length;
  g.spawnBandits(c);
  const u = g.units.find(x => x.force === -1);
  if (g.units.length !== n0 + 1 || !u) fail('적 출현 안 됨');
  if (u.troops !== 3000 || u.targetCity !== c.id || u.until !== g.turn + 18) fail('적 초기값 부정합', u.troops, u.targetCity, u.until, g.turn);
  if (isWaterAt(u.x, u.z)) fail('적 출현지 수상');
  if (g.cities.some(o => Math.hypot(o.lon - u.x, o.lat - u.z) < 1.5)) fail('적 출현지 도시 근접');
}
// ② 이동: 사거리 밖에서 목표 도시 방향으로 접근 (dz=1: 직선 경로 수상 차단 회피 — 시험 배치)
{
  const g = mkG(); g.units = [];
  const c = g.cities.find(x => x.force === 28);
  const u = { id: 980010, force: -1, officers: [], troops: 3000, type: 'spear', x: c.lon + 4, z: c.lat + 1, path: [], tx: null, tz: null, targetCity: c.id, label: '적', qi: 100, conf: 0, until: g.turn + 18 };
  g.units.push(u);
  const d0 = Math.hypot(c.lon - u.x, c.lat - u.z);
  g.banditAct(u);
  const d1 = Math.hypot(c.lon - u.x, c.lat - u.z);
  if (!(d1 < d0)) fail('적 이동 접근 없음', d0, d1);
  if (!g.units.includes(u)) fail('이동 중 적 소멸');
}
// ③ 도착·시설 파괴: 완성 시설 1개 제거 + 치안 -5 + 소멸 (미완성 시설·금 무접촉)
{
  const g = mkG(); g.units = [];
  const c = g.cities.find(x => x.force === 28);
  c.facilities = [{ id: 970010, type: '시장', done: true, left: 0 }, { id: 970011, type: '농장', done: false, left: 2 }];
  c.security = 70; const g0 = c.gold;
  const u = { id: 980011, force: -1, officers: [], troops: 3000, type: 'spear', x: c.lon + 1, z: c.lat, path: [], tx: null, tz: null, targetCity: c.id, label: '적', qi: 100, conf: 0, until: g.turn + 18 };
  g.units.push(u);
  g.banditAct(u);
  if (g.units.includes(u)) fail('도착 후 적 미소멸');
  if ((c.facilities ?? []).some(f => f.id === 970010)) fail('완성 시설 미파괴');
  if (!(c.facilities ?? []).some(f => f.id === 970011)) fail('미완성 시설 파괴됨');
  if (c.security !== 65) fail('파괴 후 치안 -5 아님', c.security);
  if (c.gold !== g0) fail('시설 파괴 분기에서 금 변동', g0, c.gold);
}
// ④ 시설 없으면 금 약탈: min(gold,500) + 치안 -5
{
  const g = mkG(); g.units = [];
  const c = g.cities.find(x => x.force === 28);
  c.facilities = []; c.gold = 1000; c.security = 80;
  const u = { id: 980012, force: -1, officers: [], troops: 3000, type: 'spear', x: c.lon + 1, z: c.lat, path: [], tx: null, tz: null, targetCity: c.id, label: '적', qi: 100, conf: 0, until: g.turn + 18 };
  g.units.push(u);
  g.banditAct(u);
  if (c.gold !== 500) fail('약탈 금액 부정합', c.gold);
  if (c.security !== 75) fail('약탈 치안 -5 아님', c.security);
  const c2 = g.cities.find(x => x.force === 29) ?? c;
  c2.facilities = []; c2.gold = 300;
  const u2 = { id: 980013, force: -1, officers: [], troops: 3000, type: 'spear', x: c2.lon + 1, z: c2.lat, path: [], tx: null, tz: null, targetCity: c2.id, label: '적', qi: 100, conf: 0, until: g.turn + 18 };
  g.units.push(u2);
  g.banditAct(u2);
  if (c2.gold !== 0) fail('잔금 미만 약탈 상한 부정합', c2.gold);
}
// ⑤ 시한 만료·병력 0 소멸
{
  const g = mkG(); g.units = [];
  const c = g.cities.find(x => x.force === 28);
  const u = { id: 980014, force: -1, officers: [], troops: 3000, type: 'spear', x: c.lon + 4, z: c.lat, path: [], tx: null, tz: null, targetCity: c.id, label: '적', qi: 100, conf: 0, until: g.turn };
  g.units.push(u);
  g.banditAct(u);
  if (g.units.includes(u)) fail('시한 만료 적 미소멸');
  const u2 = { id: 980015, force: -1, officers: [], troops: 0, type: 'spear', x: c.lon + 4, z: c.lat, path: [], tx: null, tz: null, targetCity: c.id, label: '적', qi: 100, conf: 0, until: g.turn + 18 };
  g.units.push(u2);
  g.banditAct(u2);
  if (g.units.includes(u2)) fail('병력 0 적 미소멸');
}
console.log('R126 적(賊) 게이트 PASS (출현 조건·위치/초기값, 이동 접근, 시설 파괴·치안, 금 약탈 상한, 시한/병력0 소멸)');
