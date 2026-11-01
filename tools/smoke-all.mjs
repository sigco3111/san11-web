// 전체 smoke 일괄 실행 진입점 — 게이트 분리 파일이 늘어도 호출 누락이 없도록 이 목록에 등록한다.
// 실행: node tools/smoke-all.mjs (repo 루트에서)
import { spawnSync } from 'child_process';
const SUITES = [
  'tools/smoke.mjs',             // R1~R112 등 57게이트
  'tools/smoke-r126-bandit.mjs', // R126 적(賊) 1게이트
  'tools/smoke-r127-trade.mjs',  // R127 상인 거래 실패 사유 1게이트
  'tools/smoke-r128-joinpersist.mjs', // R128 참가 요청 영속 1게이트
  'tools/smoke-r129-fog.mjs',     // R129 위임 정지 안개 재적용 1게이트
];
let failed = 0;
for (const f of SUITES) {
  console.log(`\n===== ${f} =====`);
  const r = spawnSync('node', [f], { stdio: 'inherit' });
  if (r.status !== 0) { console.log(`FAIL: ${f} (exit ${r.status})`); failed++; }
}
console.log(failed ? `\nSMOKE-ALL FAIL (${failed}/${SUITES.length} suites)` : `\nSMOKE-ALL PASS (${SUITES.length}/${SUITES.length} suites)`);
process.exit(failed ? 1 : 0);
