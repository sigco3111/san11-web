// R129: 위임 자동 정지(pendingStop) 시 안개(시야) 즉시 재적용 — 소스 게이트
// 결함: setAuto 루프의 pendingStop 분기가 refreshHud()만 호출해 위임 중 보이던 시야 밖 적 부대 메시가 다음 턴 갱신까지 화면에 남았음.
import { readFileSync } from 'fs';
const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const m = main.match(/pendingStop = false; game\.delegated = false; setAuto\(false\); (\w+)\(\);/);
if (!m) { console.error('R129 FAIL: pendingStop 분기를 찾지 못함'); process.exit(1); }
if (m[1] !== 'refreshAll') { console.error(`R129 FAIL: pendingStop 분기가 ${m[1]}() 호출 (refreshAll 필요)`); process.exit(1); }
console.log('R129 위임 정지 안개 재적용 게이트 PASS (pendingStop → refreshAll)');
