// R134 게이트: 설계 34행 — ① 전법 사용 불가 지형(자체 표: 기병 숲·간도, 창병 숲 — 시전자 타일 기준, 사유 표시) ② 격퇴 연쇄 충돌(자체 25%·1단 종결·최소 1 잔존·평화 제3자 보호) ③ 월 결산 라벨
// 전부 명시 fixture(배치 시험) — 자연 발동률 증거 아님. 실행: node tools/smoke-r134-terrain.mjs (repo 루트)
import { Game, TAC_TERRAIN_BLOCK } from '../js/game.js';
import { readFileSync } from 'fs';
const officers = {}; for (const o of JSON.parse(readFileSync('data/officers670.json'))) officers[o.idx] = o;
const store = {}; globalThis.localStorage = { setItem: (k, v) => { store[k] = v; }, getItem: k => store[k] ?? null, removeItem(){} };
let fail = 0; const ok = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + name); if (!cond) fail++; };
const mkG = () => { const g = new Game(JSON.parse(readFileSync('data/scenario-190.json')), JSON.parse(JSON.stringify(officers)), {}, 0); g.units = []; g.forestFn = () => false; g.mountainFn = () => false; return g; };
const pf = 0, ef = 1;
const APT_POS = { spear: 0, pike: 1, bow: 2, cav: 3 }; const mkOff = (g, aptKey, _lv) => { const idx = 900000 + Object.keys(g.officers).length; const apt = ['C','C','C','C','C','C']; apt[APT_POS[aptKey]] = 'S'; g.officers[idx] = { idx, name_ko: '시험무장', war: 80, int: 60, apt }; return idx; };
const mkU = (g, offIdx, o) => { const u = { id: 910000 + g.units.length, force: pf, officers: [offIdx], troops: 5000, type: 'cav', qi: 100, conf: 0, x: 10, z: 10, ...o }; g.units.push(u); return u; };

// --- ① 지형 금지 ---
ok('금지표: 기병 숲·간도 / 창병 숲', JSON.stringify(TAC_TERRAIN_BLOCK) === JSON.stringify({ spear: ['forest'], cav: ['forest', 'pass'] }));
{ const g = mkG(); const u = mkU(g, mkOff(g, 'cav', 3), {}); g.forestFn = () => true;
  const info = g.tacticInfo(u);
  ok('숲 위 기병: 옵션 3종 모두 block + 사유(숲)', !!info && info.opts.length >= 3 && info.opts.every(o => o.block && /^숲에서는/.test(o.block))); }
{ const g = mkG(); const u = mkU(g, mkOff(g, 'cav', 3), {}); g.mountainFn = () => true;
  const info = g.tacticInfo(u); ok('간도 위 기병: 모두 block + 사유(간도)', !!info && info.opts.every(o => o.block && /^간도에서는/.test(o.block))); }
{ const g = mkG(); const u = mkU(g, mkOff(g, 'cav', 3), {});
  const info = g.tacticInfo(u); ok('평지 기병: block 없음(옵션 3종)', !!info && info.opts.length >= 3 && info.opts.every(o => !o.block)); }
{ const g = mkG(); const u = mkU(g, mkOff(g, 'spear', 3), { type: 'spear' }); g.forestFn = () => true;
  const info = g.tacticInfo(u); ok('숲 위 창병: 모두 block(사유는 숲만)', !!info && info.opts.length >= 3 && info.opts.every(o => o.block && /숲/.test(o.block) && !/간도/.test(o.block))); }
{ const g = mkG(); const u = mkU(g, mkOff(g, 'spear', 3), { type: 'spear' }); g.mountainFn = () => true;
  const info = g.tacticInfo(u); ok('간도 위 창병: block 없음(창병은 숲만 금지)', !!info && info.opts.every(o => !o.block)); }
{ const g = mkG(); const u = mkU(g, mkOff(g, 'bow', 3), { type: 'bow' }); g.forestFn = () => true;
  const info = g.tacticInfo(u); ok('숲 위 노병: 금지 없음(표에 없는 병종)', !!info && info.opts.every(o => !o.block)); }
{ const g = mkG(); const u = mkU(g, mkOff(g, 'cav', 3), {}); g.forestFn = () => true;
  const eu = mkU(g, mkOff(g, 'spear', 2), { type: 'sword', force: ef, x: 11, z: 10 });
  const tid = g.tacticInfo(u).opts.find(o => o.id !== 'base').id; const qi0 = u.qi;
  const r = g.fireTactic(u.id, { type: 'unit', id: eu.id }, tid);
  ok('숲 위 기병 직접 발동 거부 + 사유 로그 + 기력 무소모', r === false && u.qi === qi0 && g.logs.some(l => /숲에서는/.test(l.msg))); }
ok('UI: block 옵션은 disabled 버튼 + 사유 텍스트(main.js)', /o\.block \? `<button[^`]*disabled[^`]*\$\{o\.block\}/.test(readFileSync('js/main.js', 'utf8')));
ok('월 결산 라벨: 세계 주요 기록(최근 8건), 구 라벨 잔존 없음', (() => { const m = readFileSync('js/main.js', 'utf8'); return /<h4[^>]*>세계 주요 기록\(최근 8건\)<\/h4>/.test(m) && !/<h4[^>]*>주요 기록<\/h4>/.test(m); })());

// --- ② 격퇴 연쇄 충돌 ---
const pushSetup = (thirdFid = null, truce = false) => {
  const g = mkG(); const u = mkU(g, mkOff(g, 'spear', 3), { type: 'spear', x: 10, z: 10 });
  const d = mkU(g, mkOff(g, 'spear', 1), { type: 'sword', force: ef, x: 11, z: 10, troops: 4000 });
  const v = mkU(g, mkOff(g, 'spear', 1), { type: 'sword', force: thirdFid ?? pf, x: 12.8, z: 10, troops: 3000 });
  if (thirdFid != null) { g.forces[thirdFid] = { fid: thirdFid, name: '제3세력', color: '#888888', alive: true, cities: [], gold: 0, food: 0, tech: {}, arts: {}, relations: {} }; if (truce) g.diploOf(pf, thirdFid).truceUntil = g.turn + 10; }
  return { g, u, d, v };
};
{ const { g, u, d, v } = pushSetup(); const [ux, uz] = g._tacPushDir(u, d);
  const note = g._tacExtra(u, d, { eff: 'push', n: 2 }, 1000);
  ok('연쇄: 밀린 부대+시전자측 아군 충돌 부대 양측 25%(반올림 250)', d.troops === 3750 && v.troops === 2750);
  ok('연쇄: 노트 "연쇄 충돌(양측 -250)"', /연쇄 충돌\(양측 -250\)/.test(note));
  ok('연쇄: 충돌 부대는 밀리지 않음(1단 종결)·밀린 부대는 충돌 지점 앞 정지', v.x === 12.8 && d.x > 11 && Math.hypot(v.x - d.x, v.z - d.z) >= 0.34); }
{ const { g, u, d, v } = pushSetup(); v.x = 99; v.z = 99; g.seaFn = (x) => x > 11.2;
  const dt0 = d.troops; g._tacExtra(u, d, { eff: 'push', n: 2 }, 1000);
  ok('연쇄: 지형(해상) 막힘 정지는 추가 피해 없음', d.troops === dt0); }
{ const { g, u, d, v } = pushSetup(99, true); // 정전 제3자
  const note = g._tacExtra(u, d, { eff: 'push', n: 2 }, 1000);
  ok('연쇄: 평화 제3자(정전) 충돌 부대 피해 0 — 공격 금지 우회 방지', v.troops === 3000 && d.troops === 3750 && /평화 세력 피해 없음/.test(note)); }
{ const { g, u, d, v } = pushSetup(99, false); // 평화 아닌 제3 적 세력
  g._tacExtra(u, d, { eff: 'push', n: 2 }, 1000);
  ok('연쇄: 평화 아닌 제3 세력 충돌 부대는 피해(전투 대상 범위)', v.troops === 2750); }
{ const { g, u, d, v } = pushSetup(); d.troops = 100; v.troops = 50;
  g._tacExtra(u, d, { eff: 'push', n: 2 }, 1000);
  ok('연쇄: 최소 1 잔존(연쇄만으로 멸망 불가 — 자체 상한)', d.troops === 1 && v.troops === 1 && g.units.includes(d) && g.units.includes(v)); }
{ const { g, u, d, v } = pushSetup(); d.troops -= 1000; // 주 피해 적용된 상태(fireTactic 흐름)에서
  g._tacExtra(u, d, { eff: 'push', n: 2 }, 1000);
  ok('연쇄: 주 피해와 별개의 의도된 추가 피해(3000 → 2750)', d.troops === 2750); }
{ const { g, u, d, v } = pushSetup(); v.x = 99; v.z = 99;
  g._tacExtra(u, d, { eff: 'push', n: 2 }, 1000);
  ok('자유 격퇴: 연쇄 없이 기존 동작(전체 이동·추가 피해 없음)', d.troops === 4000 && Math.abs(d.x - 12.8) < 0.01); }
{ const g = mkG(); const u = mkU(g, mkOff(g, 'pike', 3), { type: 'pike', x: 10, z: 10 });
  const d = mkU(g, mkOff(g, 'spear', 1), { type: 'sword', force: ef, x: 12, z: 10, troops: 4000 });
  g._tacExtra(u, d, { eff: 'pull', n: 2 }, 1000);
  ok('끌어당김(pull): 연쇄 피해 없음(기획은 격퇴 한정)', d.troops === 4000); }

// --- ③ 빌드 버전 일치 ---
{ const m = readFileSync('js/main.js', 'utf8'), idx = readFileSync('index.html', 'utf8');
  const no132 = ['js/main.js', 'js/map3d.js', 'js/ai.js', 'index.html'].every(f => !readFileSync(f, 'utf8').includes('r132'));
  ok('빌드: BUILD_ID/meta r133 + 캐스케이드 8곳(r132 잔존 0)', /BUILD_ID = 'r133'/.test(m) && /name="build" content="r133"/.test(idx) && no132); }
console.log(fail ? 'R134 ' + fail + ' FAIL' : 'R134 ALL PASS');
process.exit(fail ? 1 : 0);
