// 전체 smoke 일괄 실행 진입점 — 게이트 분리 파일이 늘어도 호출 누락이 없도록 이 목록에 등록한다.
// 실행: node tools/smoke-all.mjs (repo 루트에서)
import { spawnSync } from 'child_process';
const SUITES = [
  'tools/smoke-r174-landpath.mjs',
  'tools/smoke-r172-delegate.mjs',
  'tools/smoke-r170-rewardvalid.mjs',
  'tools/smoke-r169-traderefresh.mjs',
  'tools/smoke-r168-movevalid.mjs',
  'tools/smoke-r166-peacemove.mjs',
  'tools/smoke-r165-mode.mjs',
  'tools/smoke-r164-trucewatch.mjs',
  'tools/smoke-r163-savecontinuity.mjs',
  'tools/smoke-r162-advisor.mjs',
  'tools/smoke-r161-dispatchrefresh.mjs',
  'tools/smoke-r160-pathmemo.mjs',
  'tools/smoke-r159-recapture.mjs',
  'tools/smoke-r158-startroster.mjs',
  'tools/smoke-r153-personnel.mjs',
  'tools/smoke-r152-equipment.mjs',
  'tools/smoke-r151-domestic.mjs',
  'tools/smoke.mjs',             // R1~R112 등 57게이트
  'tools/smoke-r126-bandit.mjs', // R126 적(賊) 1게이트
  'tools/smoke-r127-trade.mjs',  // R127 상인 거래 실패 사유 1게이트
  'tools/smoke-r128-joinpersist.mjs', // R128 참가 요청 영속 1게이트
  'tools/smoke-r129-fog.mjs',     // R129 위임 정지 안개 재적용 1게이트
  'tools/smoke-r132-review.mjs',  // R132 월 결산 16게이트
  'tools/smoke-r133-verify.mjs',  // R133 미검증 해소: 난소행군·여울/개발지·철거·병장 고정량 22게이트
  'tools/smoke-r134-terrain.mjs', // R134 전법 지형 금지·격퇴 연쇄 충돌·월 결산 라벨 21게이트
  'tools/smoke-r135-cityfac.mjs', // R135 도시 시설 지도 표시 8게이트(정적 대조 — 렌더는 실UI)
];
let failed = 0;
for (const f of SUITES) {
  console.log(`\n===== ${f} =====`);
  const r = spawnSync('node', [f], { stdio: 'inherit' });
  if (r.status !== 0) { console.log(`FAIL: ${f} (exit ${r.status})`); failed++; }
}
console.log(failed ? `\nSMOKE-ALL FAIL (${failed}/${SUITES.length} suites)` : `\nSMOKE-ALL PASS (${SUITES.length}/${SUITES.length} suites)`);
process.exit(failed ? 1 : 0);
