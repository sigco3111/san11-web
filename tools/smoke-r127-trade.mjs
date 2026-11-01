// R127: 상인 거래 실패 사유 안내 게이트 — ①매입 성공(금/병량/AP) ②매각 성공 ③금 부족 거부+사유 ④병량 부족 거부+사유 ⑤AP 부족 거부+사유 (무응답 방지, R112와 동일 패턴)
import { Game } from '../js/game.js';
import { readFileSync } from 'fs';
const officers = {}; for (const o of JSON.parse(readFileSync('data/officers670.json'))) officers[o.idx] = o;
const fail = (m, ...a) => { console.log('FAIL: R127 ' + m, ...a); process.exit(1); };
const mkG = () => new Game(JSON.parse(readFileSync('data/scenario-184.json')), JSON.parse(JSON.stringify(officers)), {}, 28);
// ① 매입 성공
{
  const g = mkG();
  const c = g.cities.find(x => x.force === 28); c.gold = 5000; c.food = 10000; g.forces[28].ap = 100;
  const rate = g.tradeRate();
  if (g.trade(c.id, 'buy', 2) !== true) fail('매입 2롯트 거부(전제)');
  if (c.gold !== 3000 || c.food !== 10000 + rate * 2 || g.forces[28].ap !== 90) fail('매입 수치 부정합', c.gold, c.food, g.forces[28].ap, rate);
  if (g.lastTradeWhy !== null) fail('성공 후 사유 잔존', g.lastTradeWhy);
}
// ② 매각 성공
{
  const g = mkG();
  const c = g.cities.find(x => x.force === 28); c.gold = 1000; c.food = 50000; g.forces[28].ap = 100;
  const rate = g.tradeRate();
  if (g.trade(c.id, 'sell', 3) !== true) fail('매각 3롯트 거부(전제)');
  if (c.gold !== 4000 || c.food !== 50000 - rate * 3 || g.forces[28].ap !== 90) fail('매각 수치 부정합', c.gold, c.food, g.forces[28].ap, rate);
}
// ③ 금 부족 거부 + 사유
{
  const g = mkG();
  const c = g.cities.find(x => x.force === 28); c.gold = 2000; g.forces[28].ap = 100;
  const g0 = c.gold, f0 = c.food;
  if (g.trade(c.id, 'buy', 5) !== false) fail('금 부족 매입 허용');
  if (!/금이 부족합니다/.test(g.lastTradeWhy ?? '') || !g.lastTradeWhy.includes('5000')) fail('금 부족 사유 없음·부정확', g.lastTradeWhy);
  if (c.gold !== g0 || c.food !== f0 || g.forces[28].ap !== 100) fail('거부 후 상태 변동');
}
// ④ 병량 부족 거부 + 사유
{
  const g = mkG();
  const c = g.cities.find(x => x.force === 28); c.food = 1000; g.forces[28].ap = 100;
  const g0 = c.gold, f0 = c.food;
  if (g.trade(c.id, 'sell', 1) !== false) fail('병량 부족 매각 허용');
  if (!/병량이 부족합니다/.test(g.lastTradeWhy ?? '')) fail('병량 부족 사유 없음', g.lastTradeWhy);
  if (c.gold !== g0 || c.food !== f0 || g.forces[28].ap !== 100) fail('거부 후 상태 변동');
}
// ⑤ AP 부족 거부 + 사유
{
  const g = mkG();
  const c = g.cities.find(x => x.force === 28); c.gold = 9000; c.food = 90000; g.forces[28].ap = 5;
  if (g.trade(c.id, 'buy', 1) !== false) fail('AP 부족 매입 허용');
  if (!/행동력이 부족합니다/.test(g.lastTradeWhy ?? '')) fail('AP 부족 사유 없음', g.lastTradeWhy);
  if (c.gold !== 9000 || c.food !== 90000) fail('거부 후 상태 변동');
}
console.log('R127 상인 거래 실패 사유 게이트 PASS (매입/매각 성공 수치·AP, 금/병량/AP 부족 거부+사유, 거부 후 상태 무변동)');
