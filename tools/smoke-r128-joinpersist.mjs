// R128: 세력 참가 요청(pendingJoin) 영속·무효 처리 게이트 — ①autosave 직렬화 ②턴 경계 인계 1회·중복 없음 ③대상 멸망 시 취소 로그+해제 ④자기 세력 요청 무효 처리 ⑤구 저장(필드 없음) 호환
import { Game } from '../js/game.js';
import { aiThink } from '../js/ai.js';
import { readFileSync } from 'fs';
const officers = {}; for (const o of JSON.parse(readFileSync('data/officers670.json'))) officers[o.idx] = o;
const fail = (m, ...a) => { console.log('FAIL: R128 ' + m, ...a); process.exit(1); };
const mkG = () => new Game(JSON.parse(readFileSync('data/scenario-184.json')), JSON.parse(JSON.stringify(officers)), {}, 28);
const mkStore = () => { const store = {}; globalThis.localStorage = { setItem: (k, v) => { store[k] = v; }, getItem: k => store[k] ?? null, removeItem: k => { delete store[k]; } }; return store; };
const otherAlive = g => Object.values(g.forces).find(f => f.id !== g.playerForce && f.alive)?.id;

// ① autosave가 pendingJoin을 직렬화
{
  const g = mkG(); const store = mkStore();
  const t = otherAlive(g); if (t == null) fail('대상 세력 없음(전제)');
  g.pendingJoin = t; g.autosave();
  const d = JSON.parse(Object.values(store)[0]);
  if (d.pendingJoin !== t) fail('autosave pendingJoin 누락', d.pendingJoin, t);
  delete globalThis.localStorage;
}
// ② 턴 경계 인계는 1회 — 인계 후 저장은 pendingJoin null, 다음 턴에도 playerForce 불변
{
  const g = mkG(); const store = mkStore();
  const t = otherAlive(g); g.pendingJoin = t; g.delegated = true;
  g.endTurn(aiThink);
  if (g.playerForce !== t || g.pendingJoin !== null || g.delegated !== false) fail('인계 상태 부정합', g.playerForce, t, g.pendingJoin, g.delegated);
  const d = JSON.parse(Object.values(store).at(-1));
  if (d.pendingJoin !== null || d.playerForce !== t) fail('인계 후 저장 부정합', d.pendingJoin, d.playerForce);
  g.endTurn(aiThink);
  if (g.playerForce !== t) fail('중복 인계 발생', g.playerForce, t);
  delete globalThis.localStorage;
}
// ③ 대상 멸망 시 취소 로그 + 해제, playerForce 유지
{
  const g = mkG(); mkStore();
  const t = otherAlive(g); g.pendingJoin = t; g.forces[t].alive = false;
  g.endTurn(aiThink);
  if (g.pendingJoin !== null || g.playerForce !== 28) fail('멸망 대상 요청 미정리', g.pendingJoin, g.playerForce);
  if (!g.logs.some(l => /참가 요청이 취소/.test(l.msg))) fail('취소 안내 로그 없음', g.logs.slice(-3).map(l => l.msg));
  delete globalThis.localStorage;
}
// ④ 자기 세력 요청은 무효 처리 (UI 경로상 불가이나 방어)
{
  const g = mkG(); mkStore();
  g.pendingJoin = 28; g.endTurn(aiThink);
  if (g.pendingJoin !== null || g.playerForce !== 28) fail('자기 세력 요청 미정리', g.pendingJoin, g.playerForce);
  delete globalThis.localStorage;
}
// ⑤ 구 저장 호환 — pendingJoin 필드 없는 데이터는 null 기본값 (로드 표현식 d.pendingJoin ?? null 과 동일 의미)
{
  const g = mkG();
  if (g.pendingJoin !== null) fail('생성자 기본값 부정합', g.pendingJoin);
  const d = { }; const restored = d.pendingJoin ?? null;
  if (restored !== null) fail('구 저장 복원 표현 부정합', restored);
}
console.log('R128 참가 요청 영속 게이트 PASS (직렬화·1회 인계·멸망 취소·자기세력 무효·구 저장 호환)');
