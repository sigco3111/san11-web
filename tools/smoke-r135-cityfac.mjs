// R135 게이트: 도시 내정 시설 지도 표시 (시각 전용) — 정적 대조 + 규칙 불변 확인. 렌더 픽셀 검증은 실UI 캡처가 담당 (map3d는 THREE 의존이라 node 실행 불가)
import { FACILITIES } from '../js/game.js';
import { readFileSync } from 'fs';
let fail = 0; const ok = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + name); if (!cond) fail++; };
const m = readFileSync('js/map3d.js', 'utf8'), mn = readFileSync('js/main.js', 'utf8');
const styleBlock = (m.match(/CITY_FAC_STYLE = \{([\s\S]*?)\n  \};/) ?? [])[1] ?? '';
const styled = [...styleBlock.matchAll(/'([^']+)': \{ geo/g)].map(x => x[1]);
ok('스타일표가 FACILITIES 19종 전체를 커버 (누락: ' + Object.keys(FACILITIES).filter(k => !styled.includes(k)).join(',') + ')', Object.keys(FACILITIES).every(k => styled.includes(k)) && styled.length === 19);
ok('형태 8종 정의(market·farm·barn·barracks·smith·stable·dock·gov)와 매핑 일치', (() => { const geos = new Set([...styleBlock.matchAll(/geo: '([a-z]+)'/g)].map(x => x[1])); return ['market','farm','barn','barracks','smith','stable','dock','gov'].every(g => geos.has(g)) && geos.size === 8; })());
ok('미지 유형 폴백(?? barn/회색) 존재 — 신규 시설 추가 시 깨지지 않음', /CITY_FAC_STYLE\[type\] \?\?/.test(m));
ok('공사 중 반투명 표기(done=false → opacity .55, 야전 시설 R26과 동일 관례)', /transparent: !done, opacity: done \? 1 : 0\.55/.test(m));
ok('시설 구성 변경 도시만 재구성(sig 비교) + 제거 동기화', /cur\.sig === sig/.test(m) && /if \(!keep\.has\(Number\(id\)\)\)/.test(m));
ok('main 동기화 호출: cityVisible 필터(R14 시야 밖 적 도시 제외) + toWorld 변환', /syncCityFacs\?\.\(game\.cities\.filter\(c => game\.cityVisible\(c\)\)/.test(mn) && /facs: \(c\.facilities \?\? \[\]\)\.map/.test(mn));
ok('규칙 변경 없음: game.js 시설 산식(cityFac·cityFacLv·facSlots) 미수정 — 렌더만 추가', (() => { const g = readFileSync('js/game.js', 'utf8'); return g.includes("cityFac(c, t) { return (c.facilities ?? []).filter(f => f.type === t && f.done); }") && !/syncCityFacs/.test(g); })());
ok('빌드: BUILD_ID/meta/쿼리 버전 일치', (() => { const idx = readFileSync('index.html', 'utf8'); const bid = (mn.match(/BUILD_ID = '([^']+)'/) ?? [])[1]; const meta = (idx.match(/name="build" content="([^"]+)"/) ?? [])[1]; const refs = new Set([...(mn + idx + readFileSync('js/map3d.js', 'utf8') + readFileSync('js/ai.js', 'utf8')).matchAll(/\?v=(r\d+)/g)].map(x => x[1])); return !!bid && bid === meta && refs.size === 1 && refs.has(bid); })());
console.log(fail ? 'R135 ' + fail + ' FAIL' : 'R135 ALL PASS');
process.exit(fail ? 1 : 0);
