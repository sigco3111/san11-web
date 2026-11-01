// R132 게이트: 월 결산 스냅샷 증감 산식·기준 없음·영속
import { Game } from '../js/game.js';
import { aiThink } from '../js/ai.js';
import { readFileSync } from 'fs';
const officers = {}; for (const o of JSON.parse(readFileSync('data/officers670.json'))) officers[o.idx] = o;
const scen = JSON.parse(readFileSync('data/scenario-190.json'));
const store = {}; globalThis.localStorage = { setItem: (k, v) => { store[k] = v; }, getItem: k => store[k] ?? null, removeItem(){} };
const g = new Game(scen, officers, {}, 0);
const pf = g.playerForce;
let fail = 0; const ok = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + name); if (!cond) fail++; };

// 1개월(3턴) 진행 → 첫 결산: from=null(집계 기준 없음)
for (let t = 0; t < 3; t++) { aiThink(g, pf); g.endTurn(aiThink); if (g.pendingDuel) g.duelAuto(g.pendingDuel); if (g.pendingDebate) g.debateAuto(g.pendingDebate); }
ok('첫 결산 존재', !!g.monthlyReview);
ok('첫 결산 from=null(기준 없음)', g.monthlyReview && g.monthlyReview.from === null);
const exp1 = g._forceSnapshot(pf);
ok('첫 결산 to=현재 스냅샷 일치', JSON.stringify(g.monthlyReview.to) === JSON.stringify(exp1));
const m1 = g.monthlyReview.m;

// 1개월 더 → 둘째 결산: from=직전 스냅샷, Δ = to-from 실제 합계와 일치
const base = JSON.parse(JSON.stringify(g._reviewBase.s));
for (let t = 0; t < 3; t++) { aiThink(g, pf); g.endTurn(aiThink); if (g.pendingDuel) g.duelAuto(g.pendingDuel); if (g.pendingDebate) g.debateAuto(g.pendingDebate); }
const rv = g.monthlyReview;
ok('둘째 결산 월 진행', rv.m === (m1 % 12) + 1 || (m1 === 12 && rv.m === 1));
ok('from=직전 기준 스냅샷', JSON.stringify(rv.from) === JSON.stringify(base));
const exp2 = g._forceSnapshot(pf);
ok('to=현재 스냅샷 일치', JSON.stringify(rv.to) === JSON.stringify(exp2));
for (const k of ['gold', 'food', 'troops', 'field', 'cities', 'units', 'officers']) ok(`Δ ${k} 산식`, rv.to[k] - rv.from[k] === exp2[k] - base[k]);

// 영속: autosave 페이로드에 monthlyReview/reviewBase 포함
g.autosave();
const saved = JSON.parse(store['cheonha-xi-web.save.v1']);
ok('세이브 monthlyReview 영속', JSON.stringify(saved.monthlyReview) === JSON.stringify(g.monthlyReview));
ok('세이브 reviewBase 영속', JSON.stringify(saved.reviewBase) === JSON.stringify(g._reviewBase));

// 세력 전환 시 기준 리셋 (fid 불일치 → from=null)
const other = g.aliveForces().find(f => f.id !== pf)?.id;
if (other != null) {
  g.playerForce = other;
  aiThink(g, other); g.endTurn(aiThink);
  // dan이 3의 배수가 아니면 결산 갱신 없음 — 월 경계까지 진행
  while (g.dan !== 1) { aiThink(g, other); g.endTurn(aiThink); if (g.pendingDuel) g.duelAuto(g.pendingDuel); if (g.pendingDebate) g.debateAuto(g.pendingDebate); }
  // 다음 월 경계 1회
  aiThink(g, other); g.endTurn(aiThink); if (g.pendingDuel) g.duelAuto(g.pendingDuel); if (g.pendingDebate) g.debateAuto(g.pendingDebate);
  while (g.monthlyReview?.from !== null && g.dan !== 1) { aiThink(g, other); g.endTurn(aiThink); if (g.pendingDuel) g.duelAuto(g.pendingDuel); if (g.pendingDebate) g.debateAuto(g.pendingDebate); }
  ok('세력 전환 후 첫 결산 from=null', g.monthlyReview.from === null);
}
process.exit(fail ? 1 : 0);
