// 게임 상태·턴 엔진 (삼국지11 기본 구조의 단순화 1차 구현)
export const SAVE_KEY = 'cheonha-xi-web.save.v1';
export const FORCE_COLORS = ['#4a7fd4','#d44a4a','#4ad47f','#d4a44a','#9a4ad4','#4ad4d4','#d44a8f','#8fd44a','#d47f4a','#6a6ad4','#d4d44a','#4a9a6a','#c46a4a','#7a4a2a','#2a7a8a','#8a2a4a','#5a8a2a','#aa6aaa','#4a5a9a','#9a8a3a','#3a7a4a','#b45a7a','#6aaac4','#c48a3a','#7a3a9a','#3a9a8a','#aa4a3a','#5a7a2a','#8a6aaa','#4a8aaa','#ca7a5a','#3a6a3a','#9a4a6a','#6a8a4a','#4a4aaa','#aa9a3a','#3a8a6a','#b46a8a','#5a9aca'];
export function forceColor(fid) { const n = FORCE_COLORS.length; return FORCE_COLORS[((fid % n) + n) % n]; }

export const UNIT_TYPES = {
  sword: { name: '검병', atk: 0.7, def: 0.8, move: 1.0, cost: {} },
  spear: { name: '창병', atk: 1.0, def: 1.0, move: 1.0, cost: { spears: 1 } },
  pike:  { name: '극병', atk: 0.9, def: 1.2, move: 1.0, cost: { pikes: 1 } },
  bow:   { name: '노병', atk: 0.8, def: 0.7, move: 1.0, cost: { bows: 1 } },
  cav:   { name: '기병', atk: 1.2, def: 0.9, move: 1.6, cost: { horses: 1 } },
  // 병기 (공방 생산, 자체 수치) — siege: 대도시 피해 배율, burn: 화염 추가 피해
  ram:      { name: '충거',   atk: 0.6, def: 0.9, move: 0.7, cost: { rams: 1 }, perUnit: true,      siege: 3.0 },
  tower:    { name: '정란',   atk: 0.9, def: 0.8, move: 0.7, cost: { towers: 1 }, perUnit: true,    siege: 1.2 },
  beast:    { name: '목수',   atk: 1.0, def: 0.7, move: 0.7, cost: { beasts: 1 }, perUnit: true,    siege: 1.5, burn: true },
  catapult: { name: '투석기', atk: 0.7, def: 0.6, move: 0.6, cost: { catapults: 1 }, perUnit: true, siege: 2.4 },
  // 수군 (조선소 건조, 자체 수치) — ship: 강·바다에서만 기동
  junk: { name: '주가', atk: 0.7, def: 0.7, move: 1.2, cost: { junks: 1 }, perUnit: true, ship: true },
  lou:  { name: '누선', atk: 0.9, def: 0.9, move: 1.1, cost: { lous: 1 }, perUnit: true,  ship: true },
  dou:  { name: '투함', atk: 1.1, def: 1.0, move: 1.0, cost: { dous: 1 }, perUnit: true,  ship: true },
};
// R34: 기본 공격과 전법 분리 - 도시는 기본 공격이 원칙, 도시 대상 전법은 병기(공성) 부대만 (설계 64~72행: 전법은 부대 대상, 병기는 거점 대상)
export const RULES = { cityTacticSiegeOnly: true };
export const SIEGE_TYPES = new Set(['ram', 'tower', 'beast', 'catapult']);
export const SHIP_TYPES = new Set(['junk', 'lou', 'dou']);
// 병기 생산·선박 건조 (자체 비용). 특색 도시는 25% 할인 (설계안: 특색 병장 생산 비용 감소, 병기·배는 자동 생산 제외)
export const SIEGE_BUILD = { ram: { name: '충거', gold: 600, store: 'rams' }, tower: { name: '정란', gold: 500, store: 'towers' }, beast: { name: '목수', gold: 800, store: 'beasts' }, catapult: { name: '투석기', gold: 1000, store: 'catapults' } };
export const SHIP_BUILD = { junk: { name: '주가', gold: 400, store: 'junks' }, lou: { name: '누선', gold: 700, store: 'lous' }, dou: { name: '투함', gold: 1100, store: 'dous' } };

// === 전법·계략·기력 (자체 명명·자체 수치 — 원작 수치 미참조) ===
const APT_IDX = { spear: 0, pike: 1, bow: 2, cav: 3, ram: 4, tower: 4, beast: 4, catapult: 4, junk: 5, lou: 5, dou: 5 }; // data apt 순서: 창 극 노 기 병기 수군 (검병은 적성 없음)
const APT_LV = g => ({ S: 3, A: 2, B: 1 })[g] ?? 0;
export const TACTICS = {
  bow:   { name: '불화살', qi: 15, mult: 1.6 }, // 설계 노병 불화살(기력 15는 설계에서도 확인 필요 표기 - 이 게임의 잠정값). 연사(기력 20)는 설계 밖 자체 전법이어서 대체
  ram:      { name: '파쇄',   qi: 20, mult: 2.4 },                    // 충거: 거점 대데미지
  tower:    { name: '불화살', qi: 15, mult: 1.7 },                    // 정란: 병사 살상
  beast:    { name: '방사',   qi: 20, mult: 1.6, burn: true },        // 목수: 화염 공격
  catapult: { name: '투석',   qi: 25, mult: 2.4 },                    // 투석기: 대데미지
  junk: { name: '불화살', qi: 15, mult: 1.7 },                  // 수군 공통 (B 이상)
  dou:  { name: '투석',   qi: 25, mult: 2.5, minApt: 3 },       // 투함 (S)
};
// R18: 병종별 추가 전법 (설계 68~72행 명칭·적성·기력, 효과 수치는 자체. minApt: B=1 A=2 S=3). 부대 대상에만 적용
export const TACTICS_EX = {
  spear: [
    { id: 'spiral', name: '나선찌르기', qi: 15, minApt: 2, eff: 'conf', mult: 1.0 },
    { id: 'two',    name: '이단찌르기', qi: 15, minApt: 1, eff: 'push', n: 1, mult: 1.2 },
    { id: 'thrust', name: '돌출찌르기', qi: 20, minApt: 3, eff: 'push', n: 2, mult: 1.3 },
  ],
  pike: [
    { id: 'hook',  name: '웅수',     qi: 15, minApt: 1, eff: 'pull', mult: 1.0 },
    { id: 'side',  name: '옆베기',   qi: 20, minApt: 2, eff: 'side', mult: 1.2 },
    { id: 'whirl', name: '선풍베기', qi: 25, minApt: 3, eff: 'whirl', mult: 1.0 },
  ],
  bow: [
    { id: 'pierce', name: '관통화살', qi: 20, minApt: 2, eff: 'pierce', mult: 1.3 },
    { id: 'volley', name: '난사',     qi: 30, minApt: 3, eff: 'volley', mult: 1.0 },
  ],
  cav: [
    { id: 'rush',   name: '돌진', qi: 10, minApt: 1, eff: 'push', n: 1, mult: 1.3 },
    { id: 'breach', name: '돌파', qi: 20, minApt: 2, eff: 'pierce', mult: 1.6 },
    { id: 'charge', name: '돌격(밀기)', qi: 25, minApt: 3, eff: 'push', n: 2, mult: 2.0 },
  ],
  lou: [{ id: 'ram', name: '격돌', qi: 20, minApt: 2, eff: 'push', n: 1, mult: 2.0 }], // 설계 격돌(누선·투함, 1칸 격퇴, A 이상) 한 항목: 기본 항목과 중복이던 것을 하나로
  dou: [{ id: 'ram', name: '격돌', qi: 20, minApt: 2, eff: 'push', n: 1, mult: 2.0 }],
};
export const STRATS = {
  fire:    { name: '화계', qi: 30, minInt: 75 },            // 공격측: 수비 병력 추가 소각
  confuse: { name: '혼란', cooldown: 3, minInt: 80, turns: 2 }, // 수비측: 공격 부대 행동 정지
  rumor:   { name: '위보', qi: 15, minInt: 80 },            // R18: 적 부대를 가까운 자기 도시로 퇴각 (설계 15, 확률 자체)
  calm:    { name: '진정', qi: 10, minInt: 70 },
  ambush:  { name: '복병', qi: 10, minInt: 60 },          // R33: 숲에서 인접 적 기습, 기병·병기 불가 (자체 수치)
  douse:   { name: '소화', qi: 10, minInt: 60 },           // R32: 화계로 붙은 불(3턴, 턴당 병력 -4%) 끄기 (자체 수치)            // R18: 아군 부대 혼란 해제·기력 +20 (자체 수치)
};

// === 기교 연구 (자체 수치) ===
// R23: 개별 기교 (설계 106행 예시 명칭, 비용·효과는 자체) - 기교P+금으로 연구
export const ARTS = {
  '난소행군': { p: 800, gold: 2000, desc: '강·여울 도하 감속 완화 (깊은 강 이동 0.35→0.8, 여울 0.6→0.8, 경로 비용 완화)' },
  '석벽술':   { p: 600, gold: 1500, desc: '야전 시설 「석벽」을 지을 수 있음 (적 육군 통행을 크게 방해)' },
  '정예창병': { p: 700, gold: 1800, desc: '창병·극병 공격력 +8%' },
  '군제개혁': { p: 900, gold: 2500, desc: '군사 커맨드(출진·징병·병기·선박 생산) 행동력 15% 절감' },
};
export const TECH_BRANCHES = ['창병','극병','노병','기병','연병','발명','방위','화공'];
export const TECH_P = [1000, 2000, 3000, 5000];      // 단계별 필요 기교P
// === R13: 능력연구 4계통 (설계안 120행 PK 채택, 계통·단계·수치는 자체 설계) ===
export const AB_BRANCHES = { '공격': 'war', '방어': 'ldr', '계략': 'int', '내정': 'pol' };
export const AB_P = [500, 1500, 3000]; // 계통당 3단계 필요 기교P
export const AB_SKILL = { '공격': '맹돌', '방어': '강직', '계략': '논객', '내정': '치안' }; // 3단계 완료 시 특기 습득 (자체 선택)
export const TECH_GOLD = [1000, 2000, 5000, 10000];  // 단계별 연구 비용 (금)
export const TECH_DESC = {
  '창병': '창병 부대 공격력 단계당 +5%', '극병': '극병 부대 공격력 단계당 +5%',
  '노병': '노병 부대 공격력 단계당 +5%', '기병': '기병 부대 공격력 단계당 +5%',
  '연병': '부대가 받는 피해 단계당 -3%', '발명': '공성(성 공격) 피해 단계당 +10%',
  '방위': '도시가 받는 피해 단계당 -5%', '화공': '화계 피해 단계당 +15%',
};
const TYPE2TECH = { spear: '창병', pike: '극병', bow: '노병', cav: '기병' };

// === 내정시설 (자체 수치) ===
// R26: 야전 시설 (설계 군사시설·함정 항목의 일부 - 진·채·토루·투석대. 비용·수치·효과 모두 이 게임 자체 규칙)
export const FIELD_FACS = {
  '진':     { cost: 150, turns: 1, hp: 400, r: 3.0, desc: '반경 3 안 아군 부대가 받는 피해 -8%, 매 턴 기력 +3' },
  '채':     { cost: 350, turns: 2, hp: 900, r: 3.5, desc: '반경 3.5 안 아군 부대가 받는 피해 -15%, 매 턴 기력 +5' },
  '석벽':   { cost: 300, turns: 2, hp: 900, r: 1.2, art: '석벽술', desc: '(기교 「석벽술」 필요) 적 육군이 반경 1.2 안에서 이동 속도 15%로 감소 (강한 통행 방해)' },
  '토루':   { cost: 120, turns: 1, hp: 300, r: 1.4, desc: '적 육군이 반경 1.4 안에서 이동 속도 40%로 감소 (통행 방해)' },
  '투석대': { cost: 300, turns: 2, hp: 500, r: 3.0, desc: '매 턴 반경 3 안 적 부대 병력의 4%(최소 100) 피해' },
};
// R28: 함정 (설계 함정 항목: 불화살 함정·낙석 - 수치·효과 자체). 1회 발동 후 소멸, 적에게는 보이지 않음
export const TRAPS = {
  '불화살함정': { cost: 120, turns: 1, hp: 1, r: 0.9, desc: '밟은 적 육군 병력 8% 피해 + 혼란 1턴 (1회)' },
  '낙석':       { cost: 100, turns: 1, hp: 1, r: 1.0, desc: '지나는 적 육군 병력 6% 피해 + 이동 속도 반감 1턴 (1회)' },
};
Object.assign(FIELD_FACS, TRAPS);
export const FIELD_FAC_MAX = 10; // 세력당 최대 수
export const FACILITIES = {
  '시장':   { cost: 200, turns: 2, desc: '매월 금 수입 +25%' },
  '농장':   { cost: 200, turns: 2, desc: '매월 병량 수입 +25%' },
  '조폐':   { cost: 300, turns: 3, desc: '이 도시 시장 효과 1.5배' },
  '곡창':   { cost: 300, turns: 3, desc: '이 도시 농장 효과 1.5배' },
  '병영':   { cost: 300, turns: 3, desc: '징병량 +30%' },
  '대장간': { cost: 300, turns: 3, desc: '매월 창·극·노 자동 생산 (특색 병장은 대량)' },
  '마구간': { cost: 400, turns: 3, desc: '매월 군마 자동 생산 (특색 군마는 대량)' },
  '공방':   { cost: 300, turns: 3, desc: '병기 생산: 충거·정란·목수·투석기 (특색 병기 도시 할인)' },
  '조선소': { cost: 300, turns: 3, desc: '선박 건조: 주가·누선·투함 (특색 선박 도시 할인)' },
  // R13: PK 신 내정시설 10종 (설계안 121행 — 부절대·군사부는 설계안 명명, 나머지는 자체 설계·자체 수치)
  '부절대': { cost: 400, turns: 3, desc: '턴 시작 행동력 회복 +10 (합산 최대 +30)' },
  '군사부': { cost: 400, turns: 3, desc: '이 도시의 군사 커맨드(출진·징병·생산) 행동력 25% 절감' },
  '인재부': { cost: 400, turns: 3, desc: '이 도시의 인사 커맨드(수색·등용·이동) 행동력 25% 절감' },
  '외교부': { cost: 400, turns: 3, desc: '이 도시의 외교 커맨드 행동력 25% 절감' },
  '회계청': { cost: 400, turns: 3, desc: '이 도시 금 수입 +10%' },
  '곡물창고': { cost: 400, turns: 3, desc: '이 도시 병량 수입 +10%' },
  '훈련장': { cost: 400, turns: 3, desc: '이 도시에 주둔한 부대 기력 회복 +5' },
  '의관':   { cost: 400, turns: 3, desc: '이 도시 부상 무장 회복 2배' },
  '감찰소': { cost: 400, turns: 3, desc: '이 도시 치안 매월 +2' },
  '서재':   { cost: 400, turns: 3, desc: '세력 기교P 매월 +10 (합산 최대 +30)' },
};


// === 수상 판정 (map3d의 윤곽·강 데이터와 동일 좌표, 게임 규칙용 자체 구현) ===
const W_OUTLINE = [
[101,28],[101.5,31],[103,33.5],[104,36],[105.5,37.5],[107,39],[109,40.2],[111,40.8],[114,41.2],[117,41.2],[120,41.8],[123,42.3],[125.5,41.5],[125,40.3],[124,39.7],[122.5,38.7],[121.5,38.8],[119,38.3],[117.8,38.5],[117.5,37.7],[118.5,37.3],[119.5,36.8],[120.8,36.5],[121,35.3],[120.2,34.4],[120.3,33],[120.8,31.8],[121.6,31.1],[121.6,29.8],[120.8,28.3],[119.8,27],[118.7,25.8],[117.5,24.6],[115.8,23.3],[113.8,22.6],[111.5,21.9],[109.8,21.8],[108.2,22.3],[106.5,23.2],[104.5,23.8],[102.5,24.8],[101.2,26.2]];
const W_RIVERS = [
  [[102.5,36.5],[105,36.8],[106.5,38.5],[108.5,40.1],[110.5,40.1],[111.8,39.2],[112.3,37.8],[111.3,36],[110.6,34.7],[111.8,34.6],[113.5,34.9],[115,35.4],[116.5,36.6],[118,37.4],[118.9,37.7]],
  [[104.1,28.8],[105.5,29.2],[106.6,29.6],[107.8,30.3],[109.3,31],[110.5,30.8],[111.5,30.2],[112.6,29.9],[114.3,30.5],[115.8,29.7],[117,30.6],[118.2,31.4],[119.3,32.1],[120.6,32.1],[121.4,31.5]],
  [[110.5,26],[112,26.8],[113,28.2],[112.9,29.3]],
];
function wInOutline(lon, lat) {
  let inside = false;
  for (let i = 0, j = W_OUTLINE.length-1; i < W_OUTLINE.length; j = i++) {
    const [xi,yi] = W_OUTLINE[i], [xj,yj] = W_OUTLINE[j];
    if (((yi>lat)!==(yj>lat)) && (lon < (xj-xi)*(lat-yi)/(yj-yi)+xi)) inside = !inside;
  }
  return inside;
}
const W_EAST_COAST = W_OUTLINE.slice(12, 38);
const W_SOUTH_COAST = W_OUTLINE.slice(37, 43);
function wChainLonAtLat(chain, lat) {
  for (let i = 0; i < chain.length-1; i++) {
    const [x1,y1] = chain[i], [x2,y2] = chain[i+1];
    if ((y1 >= lat && y2 <= lat) || (y2 >= lat && y1 <= lat)) return y1 === y2 ? Math.max(x1,x2) : x1 + (x2-x1)*(lat-y1)/(y2-y1);
  }
  return chain[chain.length-1][0];
}
function wChainLatAtLon(chain, lon) {
  for (let i = 0; i < chain.length-1; i++) {
    const [x1,y1] = chain[i], [x2,y2] = chain[i+1];
    if ((x1 <= lon && x2 >= lon) || (x2 <= lon && x1 >= lon)) return x1 === x2 ? Math.max(y1,y2) : y1 + (y2-y1)*(lon-x1)/(x2-x1);
  }
  return chain[0][1];
}
export function isSeaAt(lon, lat) {
  if (wInOutline(lon, lat)) return false;
  if (lat <= W_EAST_COAST[0][1]) {
    const coastLon = lat <= 21.8 ? 109.8 : wChainLonAtLat(W_EAST_COAST, lat);
    if (lon > coastLon) return true;
  }
  if (lon >= W_SOUTH_COAST[W_SOUTH_COAST.length-1][0] && lon <= W_SOUTH_COAST[0][0]) {
    if (lat < wChainLatAtLon(W_SOUTH_COAST, lon)) return true;
  }
  return false;
}
function wDistToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2-x1, dy = y2-y1, l2 = dx*dx + dy*dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px-x1)*dx + (py-y1)*dy) / l2));
  return Math.hypot(px - (x1 + t*dx), py - (y1 + t*dy));
}
export function isRiverAt(lon, lat) {
  for (const line of W_RIVERS)
    for (let i = 0; i < line.length-1; i++)
      if (wDistToSeg(lon, lat, line[i][0], line[i][1], line[i+1][0], line[i+1][1]) < 0.55) return true;
  return false;
}
// R23: 여울(浅瀬) - 강 타일 중 일부(결정적 40%)만 얕아 통과가 쉽다. 설계 92행 간도·여울 통행 방해의 자체 단순화: 통행 불가가 아니라 감속·경로비용으로 표현
export function isFordAt(lon, lat) { return isRiverAt(lon, lat) && (((Math.round(lon * 10) * 31 + Math.round(lat * 10) * 17) % 5) + 5) % 5 < 2; }
export function isWaterAt(lon, lat) { return isSeaAt(lon, lat) || isRiverAt(lon, lat); }

// === 명품 (설계안 분류: 명마·활·검·서적·장병·옥새, 명칭·수치 자체) ===
export const ITEMS = [
  { id: 'fangtian', name: '방천화극', kind: 'weapon' }, { id: 'qinglong', name: '청룡언월도', kind: 'weapon' }, { id: 'shemao', name: '사모', kind: 'weapon' },
  { id: 'chitu', name: '적토마', kind: 'horse' }, { id: 'dilu', name: '적로', kind: 'horse' }, { id: 'jiaohuang', name: '조황', kind: 'horse' },
  { id: 'yangbow', name: '양기궁', kind: 'bow' },
  { id: 'qinggang', name: '청강검', kind: 'sword' }, { id: 'yitian', name: '의천검', kind: 'sword' },
  { id: 'laozi', name: '노자', kind: 'book' }, { id: 'sunzi', name: '손자병법', kind: 'book' },
  { id: 'yuxi', name: '전국옥새', kind: 'seal' },
]; // weapon=부대 공격 +5% · seal=군주 보유 시 기교P 월+10 (즉시 효과) / horse·bow·sword·book은 일기토(R10)·설전(R11) 연결 예정

// === 공적·관작 (자체 수치) ===
const RANKS = [[2,'주자사'],[4,'주목'],[6,'우림중랑장'],[8,'오관중랑장'],[12,'대장군'],[14,'대사마'],[18,'공'],[20,'왕'],[24,'황제']]; // 설계안 97행 사다리 (황제 24+ — 후한 옹립 메커니즘은 보류, 황제 부재 조건만). 황건 세력은 작위 불가
const MERIT = { develop: 30, recruit: 80, facility: 100, tactic: 40, stratagem: 30, capture: 150 }; // 공적 부여량 (자체 수치)
const DEBATE_CARDS = { // R11: 설전 화술 (자체 명칭·수치). int=서적 미보유 시 필요 지력, cd=재사용 대기 합
  질타: { dmg: 12 }, 강변: { dmg: 24, cd: 2, int: 80 }, 반박: { counter: 8 }, 경청: { heal: 12, cd: 2 }, 도발: { seal: true, cd: 3, int: 85 },
};
// R12: 관계 데이터 (설계안 55행: 상성·친애·혐오·의형제·부부 — 연의 기반 자체 정의, 시나리오에 해당 무장이 있을 때만 적용)
const SWORN_GROUPS = [['유비', '관우', '장비'], ['손책', '주유']];
const SPOUSE_PAIRS = [['손책', '대교'], ['주유', '소교'], ['유비', '손상향'], ['조조', '변씨'], ['여포', '초선']];
const DEAR_PAIRS = [['조조', '순욱'], ['조조', '곽가'], ['조조', '하후돈'], ['조조', '하후연'], ['유비', '조운'], ['유비', '제갈량'], ['손권', '주유'], ['손권', '여몽'], ['동탁', '여포']];
const HATE_PAIRS = [['마초', '조조'], ['손책', '황조'], ['장비', '여포'], ['관우', '여포']];

export class Game {
  constructor(scen, officers, skills, playerForceId) {
    this.officers = officers; // by idx
    this.skills = skills;
    this.scenId = scen.id;
    this.year = scen.year; this.month = scen.month; this.dan = 1; // 1~3 (旬)
    this.turn = 1;
    this.pendingDuel = null; // R10: 진행 중 일기토 (저장 대상 아님)
    this.pendingDebate = null; // R11: 진행 중 설전 (저장 대상 아님)
    this.cities = scen.cities.map(c => ({ ...c, commerce: Math.round(c.revenue/10), farm: Math.round(c.harvest/100), hp: c.maxhp, officers: [], troops: c.troops, facilities: [] }));
    this.cityById = {}; this.cities.forEach(c => this.cityById[c.id] = c);
    this.forces = {};
    for (const f of scen.forces) this.forces[f.id] = { id: f.id, ruler: f.ruler, alive: true, ap: 60, techP: 0, techs: Object.fromEntries(TECH_BRANCHES.map(b => [b, 0])), advisor: null, legions: [], ab: { '공격': 0, '방어': 0, '계략': 0, '내정': 0 } };
    for (const o of scen.officers) {
      const rec = { idx: o.idx, status: o.status, force: o.force ?? null, city: o.city ?? null, loyal: o.loyal, found: o.status === 'free' ? false : true, items: [] };
      this.officers[o.idx].state = rec;
      if ((o.status === 'ruler' || o.status === 'taesu' || o.status === 'serving') && o.city != null && this.cityById[o.city]) this.cityById[o.city].officers.push(o.idx);
    }
    const hanCap = this.cities.find(c => c.name_ko === '낙양'); // R17: 황제 옹립 (자체 설계, 설계안 97·102행) — 184·190은 후한 황제가 낙양에 존재, 251은 부재. 소재 도시 보유 세력이 옹립한 것으로 간주
    this.emperor = (this.scenId === '184' || this.scenId === '190') && hanCap ? { city: hanCap.id, holder: hanCap.force ?? null } : null;
    this.units = []; this.nextUnitId = 1;
    this.fieldFacs = []; this.nextFacId = 1; // R26
    this.diplo = {}; // 세력 간 외교
    this.itemPool = ITEMS.map(i => i.id); // 미발견 명품: 'a_b'(a<b) → { v: 관계 0-100, allianceUntil, aidTurn }
    this.playerForce = playerForceId;
    this.delegated = false;   // 플레이어 세력 위임 여부
    this.pendingJoin = null;  // 턴 경계에서 인계할 세력
    this.logs = [];
    this.over = false;
    this.unified = false; // R14: 통일 1회 판정 (관전 계속 중 재발동 방지)
    this.chronicle = []; // R14: 연감 — 【】 주요 사건 기록
  }
  log(msg, mine=false) {
    this.logs.push({ t: `${this.year}년 ${this.month}월`, msg, mine }); if (this.logs.length > 200) this.logs.shift();
    if (msg.includes('【')) { this.chronicle = this.chronicle ?? []; this.chronicle.push({ y: this.year, m: this.month, msg }); if (this.chronicle.length > 300) this.chronicle.shift(); } // R14 연감
  }
  forceName(fid) { const f = this.forces[fid]; return f ? this.officers[f.ruler].name_ko + '군' : '적병'; }
  forceCities(fid) { return this.cities.filter(c => c.force === fid); }
  inVision(x, z) { // R14: 전쟁 안개 — 관전(위임) 중엔 전체 공개(설계안 191행), 직접 지휘 시 내 도시·부대 반경 5 (자체 수치)
    if (this.delegated || this.playerForce == null || !this.forces[this.playerForce]?.alive) return true;
    const R2 = 25;
    for (const c of this.cities) if (c.force === this.playerForce && (c.lon - x) ** 2 + (c.lat - z) ** 2 <= R2) return true;
    for (const u of this.units) if (u.force === this.playerForce && (u.x - x) ** 2 + (u.z - z) ** 2 <= R2) return true;
    return false;
  }
  cityVisible(c) { return c.force === this.playerForce || this.inVision(c.lon, c.lat); } // R14
  forceOfficers(fid) { return Object.values(this.officers).filter(o => o.state && o.state.force === fid); }
  aliveForces() { return Object.values(this.forces).filter(f => f.alive); }
  totalGold(fid) { return this.forceCities(fid).reduce((s,c) => s + c.gold, 0); }
  totalFood(fid) { return this.forceCities(fid).reduce((s,c) => s + c.food, 0); }

  // === 명령 (행동력 소비) ===
  canUse(fid, ap) { return this.forces[fid].ap >= ap; }
  // === 특기·적성 보정 (자체 수치) ===
  unitHasSkill(u, sk) { return u.officers.some(i => this.officers[i]?.skill === sk); }
  cityHasSkill(c, sk) { return c.officers.some(i => this.officers[i]?.skill === sk); }
  aptMult(u) { // 병종 적성 공격 보정: C 0.9 / B 1.0 / A 1.1 / S 1.2
    if (u.type === 'sword') return 1;
    const lead = this.officers[u.officers[0]];
    return 0.9 + APT_LV(lead?.apt?.[APT_IDX[u.type]]) * 0.1;
  }
  unitDmgMult(u, siege = false) { // 공격 특기 보정
    let m = 1;
    if (siege) { if (this.unitHasSkill(u, '파성')) m *= 1.2; return m; }
    if ((u.type === 'spear' || u.type === 'pike') && this.unitHasSkill(u, '파진')) m *= 1.15;
    if (u.type === 'bow' && this.unitHasSkill(u, '신궁')) m *= 1.15;
    if (u.type === 'cav' && this.unitHasSkill(u, '맹돌')) m *= 1.2;
    if (u.type !== 'bow' && this.unitHasSkill(u, '격전')) m *= 1.1;
    return m;
  }

  unitDefMult(u) { return (this.unitHasSkill(u, '강직') ? 0.85 : 1) * this.fieldDefMult(u); }
  fieldDefMult(u) { // R26: 진·채 (중첩 없이 가장 큰 쪽)
    let best = 1;
    for (const f of this.fieldFacs ?? []) { if (f.force !== u.force || f.left > 0) continue; const sp = FIELD_FACS[f.type]; if (!sp || (f.type !== '진' && f.type !== '채') || Math.hypot(u.x - f.x, u.z - f.z) > sp.r) continue; best = Math.min(best, f.type === '채' ? 0.85 : 0.92); }
    return best;
  }
  canBuildField(u, type) { // 야전 시설 건설 가능 여부 (불가 사유 반환, 가능하면 null)
    const sp = FIELD_FACS[type]; if (!sp) return '알 수 없는 시설';
    if (!u || u.force < 0 || SHIP_TYPES.has(u.type)) return '육군 부대만 건설할 수 있습니다';
    if (sp.art && !this.forces[u.force]?.arts?.[sp.art]) return `기교 「${sp.art}」가 필요합니다`;
    if (u.building) return '이미 건설 중입니다';
    if ((u.conf ?? 0) > 0) return '혼란 중에는 건설할 수 없습니다';
    if (isWaterAt(u.x, u.z)) return '물 위에는 지을 수 없습니다';
    if ((this.fieldFacs ?? []).filter(f => f.force === u.force).length >= FIELD_FAC_MAX) return `세력당 최대 ${FIELD_FAC_MAX}개입니다`;
    if ((this.fieldFacs ?? []).some(f => Math.hypot(f.x - u.x, f.z - u.z) < 1.0)) return '다른 시설과 너무 가깝습니다';
    if (this.units.some(v => v.force !== u.force && Math.hypot(v.x - u.x, v.z - u.z) < 1.0)) return '적 부대가 너무 가깝습니다';
    const cap = this.forceCities(u.force).sort((a, b) => b.gold - a.gold)[0];
    if (!cap || cap.gold < sp.cost) return `금이 부족합니다 (${sp.cost})`;
    return null;
  }
  buildField(uid, type) { // 부대가 제자리에서 건설 (이동하면 취소). 성공 시 true
    const u = this.units.find(x => x.id === uid); const why = this.canBuildField(u, type); if (why) { this.lastFieldWhy = why; return false; }
    const sp = FIELD_FACS[type]; const cap = this.forceCities(u.force).sort((a, b) => b.gold - a.gold)[0];
    cap.gold -= sp.cost; this.fieldFacs = this.fieldFacs ?? [];
    this.fieldFacs.push({ id: this.nextFacId = (this.nextFacId ?? 1) + 1, type, force: u.force, x: u.x, z: u.z, hp: sp.hp, left: sp.turns, uid: u.id });
    u.building = type; u.path = []; u.tx = null; u.tz = null; u.targetCity = null;
    this.log(`【야전】${josa(u.label, ['이','가'])} ${josaRo(type)} 건설을 시작했습니다 (금 ${sp.cost}·${sp.turns}턴)`, u.force === this.playerForce);
    return true;
  }
  fieldTurn() { // endTurn 말미: 건설 진행, 투석대 사격, 적 공성 소모, 지원 효과
    const list = this.fieldFacs ?? [];
    for (const f of [...list]) {
      const sp = FIELD_FACS[f.type]; const u = this.units.find(x => x.id === f.uid);
      if (f.left > 0) {
        if (!u || u.tx != null || (u.conf ?? 0) > 0) { list.splice(list.indexOf(f), 1); if (u) u.building = null; this.log(`【야전】${f.type} 건설이 중단되었습니다`, f.force === this.playerForce); continue; }
        if (--f.left <= 0) { u.building = null; this.log(`【야전】${f.type} 건설 완료`, f.force === this.playerForce); }
        continue;
      }
      if (!TRAPS[f.type]) for (const v of this.units) { // 적 육군이 시설을 공격 (병력의 2% 상당 소모)
        if (v.force === f.force || SHIP_TYPES.has(v.type) || Math.hypot(v.x - f.x, v.z - f.z) > 1.2) continue;
        f.hp -= Math.max(10, Math.round(v.troops * 0.02));
      }
      if (TRAPS[f.type]) { // R28: 함정 발동 (1회)
        const v = this.units.find(x => x.force !== f.force && x.force >= 0 && !SHIP_TYPES.has(x.type) && Math.hypot(x.x - f.x, x.z - f.z) <= sp.r);
        if (v) {
          const d = Math.max(50, Math.round(v.troops * (f.type === '낙석' ? 0.06 : 0.08))); v.troops = Math.max(1, v.troops - d);
          if (f.type === '불화살함정') v.conf = Math.max(v.conf ?? 0, 1); else v.slowT = 1;
          this.log(`【야전】${v.label}이 ${f.type}에 걸려 ${d} 피해를 입었습니다`, f.force === this.playerForce || v.force === this.playerForce);
          f.hp = 0;
        }
        if (f.hp <= 0) { list.splice(list.indexOf(f), 1); continue; }
        continue;
      }
      if (f.type === '투석대') for (const v of this.units) {
        if (v.force === f.force || Math.hypot(v.x - f.x, v.z - f.z) > sp.r) continue;
        const d = Math.max(100, Math.round(v.troops * 0.04)); v.troops = Math.max(1, v.troops - d);
        if (f._logT !== this.turn) { f._logT = this.turn; this.log(`【야전】투석대가 ${v.label}에 ${d} 피해를 입혔습니다`, f.force === this.playerForce || v.force === this.playerForce); }
      }
      if (f.type === '진' || f.type === '채') for (const v of this.units) if (v.force === f.force && Math.hypot(v.x - f.x, v.z - f.z) <= sp.r) v.qi = Math.min(100, (v.qi ?? 100) + (f.type === '채' ? 5 : 3));
      if (f.hp <= 0) { list.splice(list.indexOf(f), 1); this.log(`【야전】${f.type}이 파괴되었습니다`, f.force === this.playerForce); }
    }
  }
  // === R28: 제방·수몰 (설계: 제방을 파괴하면 인근 도시 수몰 - 수치 자체) ===
  hasLevee(c) { // 도시 반경 0.6 안에 강 타일이 있으면 제방 보유 (자체 판정)
    if (c._lev === undefined) { c._lev = false; for (let dx = -0.6; dx <= 0.6 && !c._lev; dx += 0.3) for (let dz = -0.6; dz <= 0.6; dz += 0.3) if (isRiverAt(c.lon + dx, c.lat + dz)) { c._lev = true; break; } }
    return c._lev;
  }
  canBreakLevee(u, c) {
    if (!u || !c || u.force < 0 || c.force == null || c.force === u.force || SHIP_TYPES.has(u.type) || (u.conf ?? 0) > 0) return '제방을 파괴할 수 없는 부대/도시';
    if (!this.hasLevee(c)) return '이 도시 근처에는 파괴할 제방이 없습니다';
    if (c.leveeBroken) return '이미 제방이 무너져 있습니다';
    if (this.isPeace(u.force, c.force)) return '동맹·정전 중인 세력의 제방은 파괴할 수 없습니다';
    if ((c.leveeCool ?? 0) > this.turn) return '최근 보수한 제방은 당분간 파괴할 수 없습니다';
    if (Math.hypot(u.x - c.lon, u.z - c.lat) > 2.0) return '도시에서 너무 멉니다';
    return null;
  }
  breakLevee(uid, cityId) {
    const u = this.units.find(x => x.id === uid), c = this.cityById[cityId]; const why = this.canBreakLevee(u, c); if (why) { this.lastFieldWhy = why; return false; }
    c.leveeBroken = true; c.flood = 2; c._floodOwner = c.force; const dh = Math.round(c.maxhp * 0.15), dt = Math.round(c.troops * 0.10);
    c.hp = Math.max(1, c.hp - dh); c.troops = Math.max(0, c.troops - dt);
    this.log(`【수공】${josa(u.label, ['이','가'])} ${c.name_ko}의 제방을 무너뜨렸습니다! 내구 -${dh}, 병사 -${dt} (이후 2턴 침수)`, u.force === this.playerForce || c.force === this.playerForce);
    return true;
  }
  repairLevee(cityId) { // 금 300으로 복구 (소유 세력)
    const c = this.cityById[cityId]; if (!c || c.force == null || !c.leveeBroken || c.gold < 300) return false;
    c.gold -= 300; c.leveeBroken = false; c.flood = 0; c.leveeCool = this.turn + 12; this.log(`【수공】${c.name_ko} 제방 보수 완료 (금 300)`, c.force === this.playerForce); return true;
  }
  floodTurn() { for (const c of this.cities) if ((c.flood ?? 0) > 0) { if (c._floodOwner !== undefined && c._floodOwner !== c.force) { c.flood = 0; continue; } /* 점령되면 침수 종료(새 소유자에게 이어지지 않음) */ c.flood--; const d = Math.round(c.troops * 0.03); c.troops = Math.max(0, c.troops - d); this.log(`【수공】${josa(c.name_ko, ['이','가'])} 침수 중 — 병사 ${d} 감소`, c.force === this.playerForce); } }
  fieldSlow(u) { // 토루 통행 방해 배율
    if (u.slowT > 0) { u.slowT--; return 0.5; } // R28: 낙석
    let m = 1;
    for (const f of this.fieldFacs ?? []) if ((f.type === '토루' || f.type === '석벽') && f.left <= 0 && f.force !== u.force && Math.hypot(u.x - f.x, u.z - f.z) <= FIELD_FACS[f.type].r) m = Math.min(m, f.type === '석벽' ? 0.15 : 0.4);
    return m;
  }
  aiFieldBuild() { // AI도 같은 buildField로 건설: 적이 가까운 정지 부대가 4턴마다 투석대/채/진/토루 순으로 시도
    if (this.turn % 4 !== 0) return;
    for (const u of this.units) {
      if (u.force < 0 || (u.force === this.playerForce && !this.delegated) || u.building || u.tx != null) continue;
      const nc = this.cities.find(c => c.force != null && c.force !== u.force && this.canBreakLevee(u, c) === null);
      if (nc && this.breakLevee(u.id, nc.id)) continue; // R28: AI도 같은 breakLevee
      if (!this.units.some(v => v.force !== u.force && v.force !== -1 && Math.hypot(v.x - u.x, v.z - u.z) < 4)) continue;
      for (const t of ['투석대', '채', '진', '석벽', '토루', '불화살함정', '낙석']) { if (this.buildField(u.id, t)) break; }
    }
  }
  // === 기교 (자체 수치) ===
  techLv(fid, b) { return this.forces[fid]?.techs?.[b] ?? 0; }
  unitTechAtk(u) { const b = TYPE2TECH[u.type]; return (b ? 1 + 0.05 * this.techLv(u.force, b) : 1) * ((u.type === 'spear' || u.type === 'pike') && this.forces[u.force]?.arts?.['정예창병'] ? 1.08 : 1); }
  gainTechP(fid, n) { const f = this.forces[fid]; if (f?.alive) f.techP = (f.techP ?? 0) + n; }
  riverMult(u) { if (this.forces[u.force]?.arts?.['난소행군']) return 0.8; return isFordAt(u.x, u.z) ? 0.6 : 0.35; }
  researchArt(fid, name) { // R23: 개별 기교 연구 (기교P+금, 1회)
    const f = this.forces[fid], a = ARTS[name];
    if (!f?.alive || !a || f.arts?.[name]) return false;
    const cap = this.forceCities(fid).sort((x, y) => y.gold - x.gold)[0];
    if ((f.techP ?? 0) < a.p || !cap || cap.gold < a.gold) return false;
    f.arts = f.arts ?? {}; f.techP -= a.p; cap.gold -= a.gold; f.arts[name] = true;
    this.log(`【기교】${this.forceName(fid)} 「${name}」 연구 완료 (기교P ${a.p}·금 ${a.gold} 소비)`, fid === this.playerForce);
    return true;
  }
  researchNextArt(fid) { for (const n of Object.keys(ARTS)) if (this.researchArt(fid, n)) return true; return false; } // R30: AI 개별 기교 연구
  researchTech(fid, b) { // 기교P + 금 소비, 계통당 4단계
    const f = this.forces[fid];
    if (!f?.alive || !TECH_BRANCHES.includes(b)) return false;
    const lv = this.techLv(fid, b); if (lv >= 4) return false;
    const cap = this.forceCities(fid).sort((x, y) => y.gold - x.gold)[0];
    if ((f.techP ?? 0) < TECH_P[lv] || !cap || cap.gold < TECH_GOLD[lv]) return false;
    f.techs = f.techs ?? {}; // 레거시 세이브 호환
    f.techP -= TECH_P[lv]; cap.gold -= TECH_GOLD[lv]; f.techs[b] = lv + 1;
    this.log(`【기교】${this.forceName(fid)} ${b} ${lv + 1}단계 연구 완료 (기교P ${TECH_P[lv]}·금 ${TECH_GOLD[lv]} 소비)`, fid === this.playerForce);
    return true;
  }
// === 공적·충성·관작 ===
  gainMerit(i, n) { const st = this.officers[i]?.state; if (st) st.merit = (st.merit ?? 0) + n; }
  meritGrade(i) { return Math.min(8, Math.floor((this.officers[i]?.state?.merit ?? 0) / 500)); } // 공적 500당 1등급 (자체 수치)
  salaryOf(i) { return 10 + this.meritGrade(i) * 5; } // 월 봉록: 기본 10금 + 등급당 5금 (자체 수치)
  emperorHolder() { return this.emperor ? (this.cityById[this.emperor.city]?.force ?? null) : null; } // R17: 현재 옹립 세력 = 황제 소재 도시 보유자
  forceRank(fid) { // 소유 도시 수 기준 관작 (황건 제외, 황제는 24도시 + 옹립 또는 황제 부재 — 설계안 102행)
    const f = this.forces[fid];
    if (!f?.alive || this.forceName(fid).includes('황건')) return null;
    if (f.rank === '황제') return '황제'; // R17: 한번 즉위하면 강등 없음 (자체)
    const n = this.cities.filter(c => c.force === fid).length;
    let r = null;
    for (const [need, name] of RANKS) {
      if (n < need) continue;
      if (name === '황제' && this.emperor && this.emperorHolder() !== fid) continue; // R17: 황제 존재 시나리오에서는 옹립 세력만 즉위 (설계안 102행)
      r = name;
    }
    return r;
  }
  // === 군사·군단 (설계안 96행: 군사 지력70+ 임명 / 군단: 도시 묶음을 도독에게 위임) ===
  appointAdvisor(officerIdx) { // 군사 임명: 지력 70 이상만 (설계안 명시)
    const o = this.officers[officerIdx];
    if (!o || o.int < 70 || !o.state || o.state.force == null) return false;
    const f = this.forces[o.state.force];
    f.advisor = officerIdx;
    this.log(`【군사】${this.forceName(f.id)}의 군사로 ${josa(o.name_ko, ['을','를'])} 임명했습니다`, f.id === this.playerForce);
    return true;
  }
  mindDefense(fid) { // 계략 방어: 대상 세력 군주·군사의 지력이 높을수록 계략 성공률 감소 (설계안 79행, 자체 수치)
    const f = this.forces[fid];
    if (!f?.alive) return 0;
    const rulerInt = this.officers[f.ruler]?.int ?? 0;
    const advInt = f.advisor != null ? (this.officers[f.advisor]?.int ?? 0) : 0;
    return Math.max(rulerInt, advInt) / 500; // 최대 약 -20%
  }
  _blocked(c) { return c && c.force === this.playerForce && !this.delegated && !this._legionActing && !!this.cityLegion(c.id); } // 군단 소속 도시는 수동 명령 불가
  cityLegion(cityId) { const f = this.forces[this.cityById[cityId]?.force]; return (f?.legions ?? []).find(l => l.cities.includes(cityId)) ?? null; }
  createLegion(governorIdx, cityIds, policy, target = null) { // 제2군단 이후 편성 (제1군단=군주 직할은 항상 플레이어)
    const o = this.officers[governorIdx];
    const fid = o?.state?.force;
    const f = this.forces[fid];
    if (!o || fid == null || !f?.alive) return false;
    if (!['delegate', 'attack_city', 'attack_force'].includes(policy)) return false;
    const own = new Set(this.forceCities(fid).map(c => c.id));
    const cities = [...new Set(cityIds)].filter(id => own.has(id) && !this.cityLegion(id));
    if (!cities.length) return false;
    f.legions = f.legions ?? [];
    const id = f.legions.length + 2; // 제1군단은 군주 직할
    f.legions.push({ id, name: `제${id}군단`, governor: governorIdx, cities, policy, target });
    this.log(`【군단】${this.forceName(fid)} ${`제${id}군단`} 편성 — 도독 ${o.name_ko}, 도시 ${cities.length}개, 방침: ${{ delegate: '위임', attack_city: '도시공략', attack_force: '세력공략' }[policy]}`, fid === this.playerForce);
    return true;
  }
  disbandLegion(fid, legionId) {
    const f = this.forces[fid];
    const i = (f?.legions ?? []).findIndex(l => l.id === legionId);
    if (i < 0) return false;
    const [l] = f.legions.splice(i, 1);
    this.log(`【군단】${l.name} 해산 — 도시는 제1군단(직할)으로 복귀`, fid === this.playerForce);
    return true;
  }
  // === 수색·상인·명품 (자체 수치) ===
  searchCity(cityId) { // 수색: AP 20·금 100. 미발견 재야 발견(정치·수완 보정) 또는 명품 발견
    const c = this.cityById[cityId], f = this.forces[c?.force];
    if (this._blocked(c)) return false; // 군단 소속
    const apc = Math.ceil(20 * this.apMult(c, 'personnel')); // R13 인재부
    if (!c || c.force == null || !f?.alive || f.ap < apc || c.gold < 100 || !c.officers.length) return false;
    c.gold -= 100; f.ap -= apc;
    const bestOff = [...new Set(c.officers)].sort((a, b) => this.officers[b].pol - this.officers[a].pol)[0];
    const pol = this.officers[bestOff].pol;
    const suwan = this.officers[bestOff].skill === '수완';
    const hidden = Object.values(this.officers).filter(o => o.state?.status === 'free' && o.state.city === cityId && o.state.found === false);
    if (hidden.length && Math.random() < Math.min(0.9, 0.4 + pol / 200 + (suwan ? 0.2 : 0))) {
      const t = hidden[Math.floor(Math.random() * hidden.length)];
      t.state.found = true;
      this.gainMerit(bestOff, 20);
      this.log(`【수색】${c.name_ko}에서 재야 무장 ${josa(t.name_ko, ['을','를'])} 발견했습니다! 등용할 수 있습니다`, c.force === this.playerForce);
      return true;
    }
    this.itemPool = this.itemPool ?? ITEMS.map(i => i.id);
    if (this.itemPool.length && Math.random() < 0.25 + (suwan ? 0.15 : 0)) {
      const id = this.itemPool.splice(Math.floor(Math.random() * this.itemPool.length), 1)[0];
      const item = ITEMS.find(i => i.id === id);
      const st = this.officers[bestOff].state;
      st.items = (st.items ?? []).concat(id).slice(0, 3); // 무장당 최대 3개 (자체)
      this.gainMerit(bestOff, 20);
      this.log(`【수색】${c.name_ko}에서 명품 ${josa(item.name, ['을','를'])} 발견했습니다! ${josa(this.officers[bestOff].name_ko, ['이','가'])} 소유합니다`, true);
      return true;
    }
    this.log(`${josa(c.name_ko, ['을','를'])} 수색했지만 아무것도 발견하지 못했습니다`, c.force === this.playerForce);
    return true;
  }
  tradeRate() { return 4000 + ((this.year * 12 + this.month) * 7 % 4) * 1000; } // 1000금당 병량 4000~7000, 월별 변동 (자체 수치)
  trade(cityId, dir, lots = 1) { // 상인: 금↔병량, AP 10, 1회 최대 5롯트 (자체)
    const c = this.cityById[cityId], f = this.forces[c?.force];
    if (this._blocked(c)) return false; // 군단 소속
    lots = Math.max(1, Math.min(5, lots | 0));
    if (!c || c.force == null || !f?.alive || f.ap < 10) return false;
    const rate = this.tradeRate();
    if (dir === 'buy') { // 금 → 병량
      if (c.gold < 1000 * lots) return false;
      c.gold -= 1000 * lots; c.food += rate * lots;
    } else { // 병량 → 금
      if (c.food < rate * lots) return false;
      c.food -= rate * lots; c.gold += 1000 * lots;
    }
    f.ap -= 10;
    this.log(`${c.name_ko} 상인과 거래: ${dir === 'buy' ? `금 ${1000 * lots} → 병량 ${rate * lots}` : `병량 ${rate * lots} → 금 ${1000 * lots}`} (환율 1:${rate / 1000})`, c.force === this.playerForce);
    return true;
  }
  unitItemAtk(u) { // 장병(weapon) 명품: 부대 공격 +5%/개 (자체)
    let n = 0;
    for (const i of u.officers) for (const id of (this.officers[i]?.state?.items ?? [])) if (ITEMS.find(x => x.id === id)?.kind === 'weapon') n++;
    return 1 + 0.05 * n;
  }
  // === 외교 (5단계: 친밀>호의>중립>불화>험악 — 설계안, 수치는 자체) ===
  diploKey(a, b) { return a < b ? `${a}_${b}` : `${b}_${a}`; }
  diploOf(a, b) { const k = this.diploKey(a, b); return (this.diplo ??= {})[k] ??= { v: 50, allianceUntil: 0, aidTurn: -99 }; }
  relation(a, b) { return a === b ? 100 : this.diploOf(a, b).v; }
  relStage(v) { return v >= 80 ? '친밀' : v >= 60 ? '호의' : v >= 40 ? '중립' : v >= 20 ? '불화' : '험악'; }
  isAllied(a, b) { return a !== b && (this.diploOf(a, b).allianceUntil ?? 0) >= this.turn; }
  isTruce(a, b) { return a !== b && (this.diploOf(a, b).truceUntil ?? 0) >= this.turn; }
  isPeace(a, b) { return this.isAllied(a, b) || this.isTruce(a, b); } // 동맹·정전 중 공격 금지
  changeRelation(a, b, n) { const d = this.diploOf(a, b); d.v = Math.max(0, Math.min(100, d.v + n)); return d.v; }
  envoy(fid, tid, cityId) { // 친선 사절: 금 500·AP 20, 정치 보정 + 논객 특기 우위 (자체 수치)
    const c = this.cityById[cityId], f = this.forces[c?.force], t = this.forces[tid];
    const apc = Math.ceil(20 * this.apMult(c, 'diplo')); // R13 외교부
    if (!c || c.force !== fid || !f?.alive || !t?.alive || f.ap < apc || c.gold < 500) return false;
    c.gold -= 500; f.ap -= apc;
    const pol = Math.max(50, ...c.officers.map(i => this.officers[i].pol));
    const negotiator = c.officers.some(i => this.officers[i].skill === '논객');
    const gain = Math.round((8 + pol / 10) * (negotiator ? 1.5 : 1));
    const v = this.changeRelation(fid, tid, gain);
    this.log(`【외교】${this.forceName(fid)} → ${this.forceName(tid)} 친선 사절 (관계 +${gain} → ${v} ${this.relStage(v)}${negotiator ? ', 논객' : ''})`, fid === this.playerForce || tid === this.playerForce);
    return true;
  }
  proposeAlliance(fid, tid, cityId) { // 동맹 제의: 호의(60) 이상, 금 1000·AP 30, 24턴 (자체 수치)
    const c = this.cityById[cityId], f = this.forces[c?.force], t = this.forces[tid];
    if (!c || c.force !== fid || !f?.alive || !t?.alive || f.ap < 23 || c.gold < 1000) return false;
    const d = this.diploOf(fid, tid);
    if (d.v < 60 || this.isAllied(fid, tid)) return false;
    const apc = Math.ceil(30 * this.apMult(c, 'diplo')); // R13 외교부
    if (f.ap < apc) return false;
    c.gold -= 1000; f.ap -= apc;
    const pol = Math.max(50, ...c.officers.map(i => this.officers[i].pol));
    const p = Math.min(0.9, 0.4 + (d.v - 50) / 100 + pol / 300);
    if (Math.random() < p) {
      d.allianceUntil = this.turn + 24;
      this.log(`【외교】${josa(this.forceName(fid), ['과','와'])} ${josa(this.forceName(tid), ['이','가'])} 24턴 동맹을 맺었습니다!`, true);
      return true;
    }
    this.log(`【외교】${josa(this.forceName(tid), ['이','가'])} ${this.forceName(fid)}의 동맹 제의를 거절했습니다`, fid === this.playerForce || tid === this.playerForce);
    this.tryDebate({ kind: 'alliance', fid, tid, cityId }); // R11: 결렬 시 설전 발동 가능
    return false;
  }
  requestTruce(fid, tid, cityId) { // 정전 요청: 불화 이하 대상, 금 2000·AP 30, 성공 시 관계 +30 (자체 수치)
    const c = this.cityById[cityId], f = this.forces[c?.force], t = this.forces[tid];
    if (!c || c.force !== fid || !f?.alive || !t?.alive || f.ap < 23 || c.gold < 2000) return false;
    const d = this.diploOf(fid, tid);
    if (d.v > 39) return false;
    const apc = Math.ceil(30 * this.apMult(c, 'diplo')); // R13 외교부
    if (f.ap < apc) return false;
    c.gold -= 2000; f.ap -= apc;
    const pol = Math.max(50, ...c.officers.map(i => this.officers[i].pol));
    if (Math.random() < Math.min(0.8, 0.3 + pol / 300 + d.v / 200)) {
      d.truceUntil = this.turn + 12; // 정전 12턴간 양측 공격 금지 (자체 수치)
      const v = this.changeRelation(fid, tid, 30);
      this.log(`【외교】${josa(this.forceName(fid), ['과','와'])} ${josa(this.forceName(tid), ['이','가'])} 정전했습니다 (12턴간 공격 금지, 관계 → ${v} ${this.relStage(v)})`, true);
      return true;
    }
    this.log(`【외교】${josa(this.forceName(tid), ['이','가'])} 정전 요청을 거절했습니다`, fid === this.playerForce || tid === this.playerForce);
    this.tryDebate({ kind: 'truce', fid, tid, cityId }); // R11: 결렬 시 설전 발동 가능
    return false;
  }
  demandSurrender(fid, tid, cityId) { // 항복 권고: 대상 도시 2개 이하, 금 1000·AP 30, 매력 보정 (자체 수치)
    const c = this.cityById[cityId], f = this.forces[c?.force], t = this.forces[tid];
    if (!c || c.force !== fid || !f?.alive || !t?.alive || f.ap < 23 || c.gold < 1000) return false;
    const tCities = this.cities.filter(x => x.force === tid);
    if (tCities.length > 2) return false;
    const apc = Math.ceil(30 * this.apMult(c, 'diplo')); // R13 외교부
    if (f.ap < apc) return false;
    c.gold -= 1000; f.ap -= apc;
    const chr = Math.max(50, ...c.officers.map(i => this.officers[i].chr));
    const myN = this.cities.filter(x => x.force === fid).length;
    const p = Math.min(0.5, 0.05 + (chr - 50) / 200 + (myN - tCities.length) * 0.05 + (this.cityHasSkill(c, '귀납') ? 0.1 : 0)); // R17: 귀납 특기 +0.1 (자체 수치)
    if (Math.random() < p) {
      for (const tc of tCities) { tc.force = fid; }
      for (const u of this.units) if (u.force === tid) u.force = fid; // 야전 부대도 귀속
      for (const o of Object.values(this.officers)) if (o.state?.force === tid) { o.state.force = fid; if (o.state.city != null) { const nc = this.cityById[o.state.city]; if (nc && !nc.officers.includes(o.idx)) nc.officers.push(o.idx); } }
      t.alive = false;
      this.log(`【항복】${josa(this.forceName(tid), ['이','가'])} ${this.forceName(fid)}에 항복했습니다! 도시 ${tCities.length}개와 무장이 귀속됩니다`, true);
      return true;
    }
    this.changeRelation(fid, tid, -20);
    this.log(`【외교】${josa(this.forceName(tid), ['이','가'])} 항복 권고를 거부했습니다 (관계 악화)`, fid === this.playerForce || tid === this.playerForce);
    return false;
  }
  requestAid(fid, tid, cityId) { // 원군 요청: 동맹국, 18턴 쿨(설계안), 병사 3000 지원 (자체 단순화)
    const c = this.cityById[cityId], f = this.forces[c?.force], t = this.forces[tid];
    if (!c || c.force !== fid || !f?.alive || !t?.alive || f.ap < 20 || !this.isAllied(fid, tid)) return false;
    const d = this.diploOf(fid, tid);
    if (this.turn - (d.aidTurn ?? -99) < 18) return false;
    const src = this.cities.filter(x => x.force === tid && x.troops >= 6000).sort((a, b) => b.troops - a.troops)[0];
    if (!src) return false;
    f.ap -= 20;
    src.troops -= 3000;
    const dst = this.cities.filter(x => x.force === fid).sort((a, b) => a.troops - b.troops)[0];
    dst.troops = Math.min(dst.metropolis ? 150000 : 100000, dst.troops + 3000);
    d.aidTurn = this.turn;
    this.log(`【외교】동맹국 ${josa(this.forceName(tid), ['이','가'])} 원군 3000을 ${dst.name_ko}에 보냈습니다`, true);
    return true;
  }
  breakAlliance(fid, tid) { // 동맹 파기: 관계 -40
    if (!this.isAllied(fid, tid)) return false;
    this.diploOf(fid, tid).allianceUntil = 0;
    const v = this.changeRelation(fid, tid, -40);
    this.log(`【외교】${josa(this.forceName(fid), ['이','가'])} ${josa(this.forceName(tid), ['과','와'])}의 동맹을 파기했습니다 (관계 → ${v} ${this.relStage(v)})`, true);
    return true;
  }
  checkRanks() { // 관작 자동 승진: 승진 시 전 소속 무장 충성 +5 (자체 수치)
    for (const f of Object.values(this.forces)) {
      if (!f.alive) continue;
      const r = this.forceRank(f.id);
      if (r && r !== f.rank) {
        const emp = r === '황제' && f.rank !== '황제';
        f.rank = r;
        for (const o of Object.values(this.officers)) if (o.state?.force === f.id) o.state.loyal = Math.min(100, (o.state.loyal ?? 70) + (emp ? 10 : 5)); // R14: 황제 즉위는 +10 (자체)
        this.log(emp ? `【황제】${josa(this.forceName(f.id), ['이','가'])} 황제에 올랐습니다! 소속 무장 충성 대폭 상승, 기교P 매월 +20` : `【관작】${josa(this.forceName(f.id), ['이','가'])} ${josaRo(r)} 승진했습니다! 소속 무장 충성 상승`, true);
      }
    }
  }
  // === 내정시설 ===
  facSlots(c) { return c.metropolis ? 12 : 8; } // 개발지 수 (자체 수치)
  cityFac(c, t) { return (c.facilities ?? []).filter(f => f.type === t && f.done); }
  buildFacility(cityId, type, builders) { // 비용 금 + 담당 최대 3명, 정치 합산으로 공기 단축
    const c = this.cityById[cityId], f = this.forces[c.force], spec = FACILITIES[type];
    if (this._blocked(c)) return false; // 군단 소속
    if (!spec || !f?.alive || f.ap < 20) return false;
    c.facilities = c.facilities ?? [];
    if (c.facilities.length >= this.facSlots(c)) return false;
    if (c.gold < spec.cost) return false;
    const valid = [...new Set((builders ?? []).filter(i => c.officers.includes(i)))].slice(0, 3);
    c.gold -= spec.cost; f.ap -= 20;
    c.facilities.push({ type, progress: 0, builders: valid, done: false });
    this.log(`${c.name_ko}에 ${type} 건설 시작 (금 ${spec.cost}, 담당 ${valid.length}명)`, c.force === this.playerForce);
    return true;
  }
  demolishFacility(cityId, fi) {
    const c = this.cityById[cityId];
    if (!c?.facilities?.[fi]) return false;
    const [rm] = c.facilities.splice(fi, 1);
    this.log(`${c.name_ko}의 ${josa(rm.type, ['을','를'])} 철거했습니다`, c.force === this.playerForce);
    return true;
  }
  develop(cityId, kind) { // kind: 'commerce' | 'farm', 비용 금 300, AP 30
    const c = this.cityById[cityId], f = this.forces[c.force];
    if (this._blocked(c)) return false; // 군단 소속
    if (c.gold < 300 || f.ap < 30 || c[kind] >= 100) return false;
    const bestOff = c.officers.length ? [...c.officers].sort((a, b) => this.officers[b].pol - this.officers[a].pol)[0] : null;
    const best = Math.max(50, ...c.officers.map(i => this.officers[i].pol));
    c.gold -= 300; f.ap -= 30;
    if (bestOff != null) this.gainMerit(bestOff, MERIT.develop);
    const gain = Math.round(4 + best/20);
    c[kind] = Math.min(100, c[kind] + gain);
    this.gainTechP(c.force, 25); // 커맨드 실행 기교P
    this.log(`${c.name_ko} ${kind==='commerce'?'상업':'농업'} 개발 +${gain} (담당 정치 ${best})`, c.force === this.playerForce);
    return true;
  }
  recruit(cityId) { // 금 200 + 병량 1000 → 병사, AP 30
    const c = this.cityById[cityId], f = this.forces[c.force];
    if (this._blocked(c)) return false; // 군단 소속
    const apc = Math.ceil(30 * this.apMult(c, 'military')); // R13 군사부
    if (c.gold < 200 || c.food < 1000 || f.ap < apc) return false;
    const best = Math.max(50, ...c.officers.map(i => this.officers[i].chr));
    const n = Math.round((1500 + best*30) * (this.cityHasSkill(c, '명성') ? 1.3 : 1) * (1 + 0.3 * this.cityFacLv(c, '병영'))); // R13: 병영 레벨 합산
    c.gold -= 200; c.food -= 1000; f.ap -= apc;
    const cap = c.metropolis ? 150000 : 100000;
    c.troops = Math.min(cap, c.troops + n);
    this.gainTechP(c.force, 25); // 커맨드 실행 기교P
    this.log(`${c.name_ko} 징병 +${n} (담당 매력 ${best})`, c.force === this.playerForce);
    return true;
  }
  freeOfficers(cityId) { // 그 도시에 머무는 재야 무장
    return Object.values(this.officers).filter(o => o.state?.status === 'free' && o.state.city === cityId);
  }
  recruitChance(cityId, officerIdx) { // 등용 성공률 (자체 수치): 사자 매력·상대 매력·충성·군주 매력 반영
    const c = this.cityById[cityId], t = this.officers[officerIdx];
    if (!c || c.force == null || !this.forces[c.force]?.alive || !c.officers.length) return 0;
    if (!t?.state || t.state.status !== 'free' || t.state.city !== cityId) return 0;
    if (t.state.found === false) return 0; // 미발견 재야는 수색 필요
    const envoy = Math.max(...c.officers.map(i => this.officers[i].chr));
    const ruler = this.officers[this.forces[c.force].ruler]?.chr ?? 50;
    const loyal = t.state.loyal ?? 70;
    const rel = this.relOf(officerIdx); // R12: 관계 보정 (자체 수치)
    let mod = 0;
    if (rel.dear.some(i => this.officers[i]?.state?.force === c.force)) mod += 0.1; // 친애 무장이 이 세력에 소속
    const rf = this.forces[c.force];
    if (rf && rel.hate.includes(rf.ruler)) mod -= 0.15; // 군주 혐오
    if (rel.sworn.some(i => { const f2 = this.officers[i]?.state?.force; return f2 != null && f2 !== c.force; }) || (rel.spouse != null && (this.officers[rel.spouse]?.state?.force != null) && this.officers[rel.spouse].state.force !== c.force)) mod -= 0.2; // 의형제·부부가 타 세력 소속
    return Math.max(0.1, Math.min(0.9, 0.45 + (envoy - t.chr)/200 + (ruler - 50)/500 - loyal/400 + (this.cityHasSkill(c, '등용') ? 0.1 : 0) + (this.cityHasSkill(c, '이간') ? 0.1 : 0) + mod)); // R17: 이간 특기 +0.1 (자체 수치)
  }
  recruitOfficer(cityId, officerIdx) { // 재야 무장 등용: 금 100, AP 20 (자체 규칙)
    const c = this.cityById[cityId], f = this.forces[c.force];
    if (this._blocked(c)) return false; // 군단 소속
    const apc = Math.ceil(20 * this.apMult(c, 'personnel')); // R13 인재부
    if (c.gold < 100 || f.ap < apc) return false;
    const p = this.recruitChance(cityId, officerIdx);
    if (p <= 0) return false;
    const t = this.officers[officerIdx];
    const envoy = Math.max(...c.officers.map(i => this.officers[i].chr));
    c.gold -= 100; f.ap -= apc;
    if (Math.random() < p) {
      const envoyIdx = c.officers.length ? [...c.officers].sort((a, b) => this.officers[b].chr - this.officers[a].chr)[0] : null;
      if (envoyIdx != null) this.gainMerit(envoyIdx, MERIT.recruit);
      t.state.status = 'serving'; t.state.force = c.force;
      if (!c.officers.includes(officerIdx)) c.officers.push(officerIdx);
      this.log(`【등용】${josa(t.name_ko, ['이','가'])} 【${this.forceName(c.force)}】에 등용되었습니다 (${c.name_ko}, 사자 매력 ${envoy})`, true);
      return true;
    }
    this.log(`${c.name_ko}의 ${t.name_ko} 등용에 실패했습니다`, c.force === this.playerForce);
    this.tryDebate({ kind: 'recruit', fid: c.force, tid: c.force, cityId, officerIdx }); // R11: 실패 시 설전 발동 가능
    return false;
  }
  moveOfficers(fromCity, toCity, idxs) {
    const a = this.cityById[fromCity], b = this.cityById[toCity], f = this.forces[a.force];
    const apc = Math.ceil(20 * this.apMult(a, 'personnel')); // R13 인재부
    if (f.ap < apc || this._blocked(a)) return false; // 군단 소속 도시는 수동 이동 불가
    f.ap -= apc;
    a.officers = a.officers.filter(i => !idxs.includes(i));
    for (const i of new Set(idxs)) { if (!b.officers.includes(i)) b.officers.push(i); this.officers[i].state.city = toCity; }
    this.log(`${a.name_ko} → ${b.name_ko} 무장 ${idxs.length}명 이동`, a.force === this.playerForce);
    return true;
  }
  produceSiege(cityId, kind) { // 공방에서 병기 생산, AP 10 (자체 비용, 특색 병기 도시 25% 할인)
    const c = this.cityById[cityId], f = this.forces[c.force];
    if (this._blocked(c)) return false; // 군단 소속
    const spec = SIEGE_BUILD[kind];
    if (!spec || !this.cityFac(c, '공방').length) return false;
    const cost = Math.round(spec.gold * ((c.specialty ?? []).includes('병기') ? 0.75 : 1));
    const apc = Math.ceil(10 * this.apMult(c, 'military')); // R13 군사부
    if (f.ap < apc || c.gold < cost) return false;
    c.gold -= cost; f.ap -= apc;
    c[spec.store] = (c[spec.store] ?? 0) + 1;
    this.log(`${c.name_ko}에서 ${spec.name} 생산 (금 ${cost})`, c.force === this.playerForce);
    return true;
  }
  produceShip(cityId, kind) { // 조선소에서 선박 건조, AP 10 (자체 비용, 특색 선박 도시 25% 할인)
    const c = this.cityById[cityId], f = this.forces[c.force];
    if (this._blocked(c)) return false; // 군단 소속
    const spec = SHIP_BUILD[kind];
    if (!spec || !this.cityFac(c, '조선소').length) return false;
    const cost = Math.round(spec.gold * ((c.specialty ?? []).includes('선박') ? 0.75 : 1));
    const apc = Math.ceil(10 * this.apMult(c, 'military')); // R13 군사부
    if (f.ap < apc || c.gold < cost) return false;
    c.gold -= cost; f.ap -= apc;
    c[spec.store] = (c[spec.store] ?? 0) + 1;
    this.log(`${c.name_ko}에서 ${spec.name} 건조 (금 ${cost})`, c.force === this.playerForce);
    return true;
  }
  dispatch(cityId, officerIdxs, troops, type) { // 부대 출진, AP 40
    officerIdxs = [...new Set(officerIdxs)];
    const c = this.cityById[cityId], f = this.forces[c.force];
    if (this._blocked(c)) return false; // 군단 소속
    const apc = Math.ceil(40 * this.apMult(c, 'military')); // R13 군사부
    if (f.ap < apc || c.troops < troops || officerIdxs.length === 0) return false;
    if (officerIdxs.some(i => (this.officers[i]?.state?.injuredUntil ?? 0) > this.turn)) return false; // R10: 부상 무장 출진 불가
    const ut = UNIT_TYPES[type];
    for (const [k, per] of Object.entries(ut.cost)) { // 병기·선박은 부대당 1대 (perUnit), 병장은 병사당 1개
      const need = ut.perUnit ? per : per * troops;
      if ((c[k] ?? 0) < need) return false;
    }
    for (const [k, per] of Object.entries(ut.cost)) c[k] -= ut.perUnit ? per : per * troops;
    c.troops -= troops; f.ap -= apc;
    c.officers = c.officers.filter(i => !officerIdxs.includes(i));
    for (const i of officerIdxs) this.officers[i].state.city = null;
    const unit = { id: this.nextUnitId++, force: c.force, officers: officerIdxs, troops, type,
      x: c.lon, z: c.lat, path: [], tx: null, tz: null, targetCity: null, label: '', qi: 100, conf: 0 };
    unit.label = `${this.officers[officerIdxs[0]].name_ko} ${Math.round(troops/1000)}k`;
    this.units.push(unit);
    this.log(`${c.name_ko}에서 ${this.officers[officerIdxs[0]].name_ko}의 ${ut.name} ${troops} 출진`, c.force === this.playerForce);
    return unit;
  }
  findPath(u, tx, tz) { // R17: A* 경로 탐색 (자체 구현) — 육군: 바다 불가·강은 비용 3배 도하(여울 특정 타일·난소행군 기교 미구현에 따른 자체 단순화), 수군: 수로만. 0.15° 그리드
    const ship = SHIP_TYPES.has(u.type);
    const st = 0.15, lon0 = 100, lat0 = 20, W = 226, H = 146;
    const ci = x => Math.round((x - lon0) / st), cj = z => Math.round((z - lat0) / st);
    const pass = (i, j) => ship ? isWaterAt(lon0 + i * st, lat0 + j * st) : !isSeaAt(lon0 + i * st, lat0 + j * st);
    const art = !!this.forces[u.force]?.arts?.['난소행군'];
    const stepCost = (i, j) => { if (ship) return 1; const x = lon0 + i * st, z = lat0 + j * st; if (!isRiverAt(x, z)) return 1; return art ? 1.25 : (isFordAt(x, z) ? 1.7 : 2.9); }; // R23: 여울 우선 도하, 난소행군 시 완화
    const snap = (i, j) => { // 가장 가까운 통과 가능 셀 (반경 8)
      if (i >= 0 && i <= W && j >= 0 && j <= H && pass(i, j)) return [i, j];
      for (let r = 1; r <= 8; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const ni = i + di, nj = j + dj;
        if (ni >= 0 && ni <= W && nj >= 0 && nj <= H && pass(ni, nj)) return [ni, nj];
      }
      return null;
    };
    const sc = snap(ci(u.x), cj(u.z)), tc = snap(ci(tx), cj(tz));
    if (!sc || !tc) return null;
    const Hcap = 90000;
    const g = new Map(), came = new Map();
    const heap = [[0, sc[0], sc[1]]];
    const push = (f, i, j) => { heap.push([f, i, j]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2*k+1, r = 2*k+2; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    const kk = (i, j) => i * 1000 + j;
    g.set(kk(sc[0], sc[1]), 0);
    let pops = 0, found = false;
    while (heap.length && pops++ < Hcap) {
      const [, i, j] = pop();
      if (i === tc[0] && j === tc[1]) { found = true; break; }
      const gi = g.get(kk(i, j));
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || ni > W || nj < 0 || nj > H || !pass(ni, nj)) continue;
        const ng = gi + stepCost(ni, nj) * (di && dj ? 1.4 : 1);
        const k2 = kk(ni, nj);
        if (ng < (g.get(k2) ?? 1e18)) {
          g.set(k2, ng); came.set(k2, [i, j]);
          push(ng + Math.hypot(tc[0] - ni, tc[1] - nj), ni, nj);
        }
      }
    }
    if (!found) return null;
    const cells = [];
    let cur = tc;
    while (cur) { cells.push(cur); cur = came.get(kk(cur[0], cur[1])); }
    cells.reverse();
    const pts = [];
    for (let k = 4; k < cells.length; k += 5) pts.push([lon0 + cells[k][0] * st, lat0 + cells[k][1] * st]);
    pts.push([tx, tz]);
    return pts;
  }

  orderUnit(unitId, targetCityId) {
    const u = this.units.find(u => u.id === unitId);
    const c = this.cityById[targetCityId];
    if (!u || !c) return;
    if (c.force != null && c.force !== u.force && this.isPeace(u.force, c.force)) { this.log(`${josa(this.forceName(c.force), ['은','는'])} 동맹·정전 중이라 공격할 수 없습니다`, u.force === this.playerForce); return; }
    const path = this.findPath(u, c.lon, c.lat);
    if (!path) { // R17b: 도달 불가 노선은 명령 거부 — 직선 폴백의 바다 정지·지형 관통 재발 방지. AI는 반환값으로 회복 처리
      this.log(`${josa(u.label, ['은','는'])} ${josaRo(c.name_ko)} 통하는 노선이 없어 출진할 수 없습니다`, u.force === this.playerForce);
      return false;
    }
    u.targetCity = targetCityId; u.tx = c.lon; u.tz = c.lat;
    u.path = path;
    return true;
  }

  // === 턴 진행 ===
  endTurn(aiThink) {
    if (this.over) return; // R14: 게임 종료 후 턴 진행 불가
    if (this.pendingDuel || this.pendingDebate) return; // R10/R11: 일기토·설전 결판 전 턴 진행 불가
    // 전 부대 기력 회복
    for (const u of this.units) { // R13: 훈련장 주둔 부대 +5
      const home = this.cities.find(c => c.force != null && c.force === u.force && c.lon === u.x && c.lat === u.z);
      u.qi = Math.min(100, (u.qi ?? 100) + 10 + (home && this.cityFac(home, '훈련장').length ? 5 : 0) + (this.unitHasSkill(u, '훈련') ? 5 : 0)); // R17: 훈련 특기 +5 (자체 수치)
    }
    // 부대 이동·전투
    for (const u of [...this.units]) { if (u.force === -1) this.banditAct(u); else this.stepUnit(u); }
    // 도시 공성 처리는 stepUnit 내부
    // 야전: 접촉한 적 부대끼리 교전
    this.resolveFieldBattles();
    this.aiFieldBuild(); this.fieldTurn(); this.floodTurn(); // R26: 야전 시설
    // 수입: 매 3순(한 달)
    if (this.dan === 3) {
      for (const c of this.cities) {
        if (c.force == null || !this.forces[c.force]?.alive) continue;
        const mk = this.cityFacLv(c, '시장') * (this.cityFac(c, '조폐').length ? 1.5 : 1); // R13: 레벨 합산
        const fm = this.cityFacLv(c, '농장') * (this.cityFac(c, '곡창').length ? 1.5 : 1);
        c.gold += Math.round((50 + c.commerce * 8 * (c.metropolis ? 1.5 : 1)) * (this.cityHasSkill(c, '통상') ? 1.3 : 1) * (1 + 0.25 * mk) * (this.cityFac(c, '회계청').length ? 1.1 : 1)); // R13 회계청
        c.food += Math.round((300 + c.farm * 80) * (this.cityHasSkill(c, '부농') ? 1.3 : 1) * (1 + 0.25 * fm) * (this.cityFac(c, '곡물창고').length ? 1.1 : 1)); // R13 곡물창고
        c.hp = Math.min(c.maxhp, c.hp + 200);
        // 병장 자동 생산: 대장간·마구간 (특색 도시는 대량)
        if (this.cityFac(c, '대장간').length) {
          const sp = c.specialty ?? [];
          if (sp.includes('창')) c.spears += 400; else if (sp.includes('극')) c.pikes += 400; else if (sp.includes('노')) c.bows += 400;
          else { c.spears += 100; c.pikes += 100; c.bows += 100; }
        }
        if (this.cityFac(c, '마구간').length) c.horses += (c.specialty ?? []).includes('군마') ? 400 : 100;
        // 봉록: 소속 무장에게 도시 금으로 월급 지급, 못 주면 충성 하락 (설계안: 봉록을 못 주면 충성 하락)
        for (const i of [...new Set(c.officers)]) {
          const st = this.officers[i]?.state;
          if (!st || st.force == null) continue;
          const sal = this.salaryOf(i);
          if (c.gold >= sal) { c.gold -= sal; st.loyal = Math.min(100, (st.loyal ?? 70) + 1); }
          else {
            st.loyal = Math.max(0, (st.loyal ?? 70) - 4);
            this.log(`${c.name_ko}의 ${this.officers[i].name_ko}에게 봉록 ${sal}금을 주지 못했습니다 (충성 하락)`, c.force === this.playerForce);
          }
        }
        // R9: 재해·치안 (설계안 100-101행, 자체 수치)
        c.security = Math.max(0, Math.min(100, (c.security ?? 80) + (this.cityHasSkill(c, '치안') ? 0 : -1) + (this.cityFac(c, '감찰소').length ? 2 : 0))); // 치안 특기 주둔 시 감소 없음 · R13 감찰소 +2
        if (this.cityFac(c, '의관').length) for (const i of c.officers) { const st = this.officers[i]?.state; if (st && (st.injuredUntil ?? 0) > this.turn) st.injuredUntil -= 1; } // R13 의관: 부상 회복 2배
        if (c.disaster) { // 역병 지속: 병사·금·병량 감소
          c.troops = Math.max(0, Math.round(c.troops * 0.95));
          c.gold = Math.max(0, Math.round(c.gold * 0.9));
          c.food = Math.max(0, Math.round(c.food * 0.9));
          if (c.disaster.until <= this.turn) { this.log(`【재해】${c.name_ko}의 ${josa(c.disaster.type, ['이','가'])} 지나갔습니다`, c.force === this.playerForce); c.disaster = null; }
        } else if (Math.random() < 0.02) { // 역병 발생 (월 2%, 자체 수치)
          c.disaster = { type: '역병', until: this.turn + 6 };
          this.log(`【재해】${c.name_ko}에 역병이 돌고 있습니다! (2개월간 병사·금·병량 감소)`, true);
        }
        if ((c.security ?? 80) < 80 && !this.units.some(u => u.force === -1 && u.targetCity === c.id) && Math.random() < 0.25) this.spawnBandits(c); // 적(賊) 출현 (월 25%, 자체 수치)
      }
      // 옥새: 소유 세력 기교P 월 +10 (자체 수치)
      for (const f of Object.values(this.forces)) {
        if (!f.alive) continue;
        if (Object.values(this.officers).some(o => o.state?.force === f.id && (o.state.items ?? []).includes('yuxi'))) {
          f.techP = (f.techP ?? 0) + 10;
        }
      }
      // 외교: 동맹 만료 확인 + 관계는 매달 중립(50)으로 1씩 회귀 (자체 수치)
      for (const [k, d] of Object.entries(this.diplo ?? {})) {
        const [a, b] = k.split('_').map(Number);
        if ((d.allianceUntil ?? 0) > 0 && d.allianceUntil < this.turn) {
          d.allianceUntil = 0;
          this.log(`【외교】${josa(this.forceName(a), ['과','와'])} ${this.forceName(b)}의 동맹이 만료되었습니다`, true);
        }
        if ((d.truceUntil ?? 0) > 0 && d.truceUntil < this.turn) {
          d.truceUntil = 0;
          this.log(`【외교】${josa(this.forceName(a), ['과','와'])} ${this.forceName(b)}의 정전이 끝났습니다`, true);
        }
        if (d.v > 50) d.v--; else if (d.v < 50) d.v++;
      }
      // 충성 25 이하 무장은 월 15% 확률로 하야 (자체 수치)
      for (const c of this.cities) {
        for (const i of [...c.officers]) {
          const st = this.officers[i]?.state;
          if (!st || (st.status !== 'serving' && st.status !== 'taesu')) continue;
          if ((st.loyal ?? 70) <= 25 && Math.random() < 0.15) {
            st.status = 'free'; st.force = null; st.city = null; st.found = false;
            c.officers = c.officers.filter(x => x !== i);
            this.log(`【하야】${josa(this.officers[i].name_ko, ['이','가'])} 충성이 낮아 【${this.forceName(c.force)}】${josa(this.forceName(c.force), ['을','를']).slice(-1)} 떠났습니다`, true);
          }
        }
      }
    // R12: 상성 — 군주와 궁합 차 100+ 월 충성 -1, 25 이하 +1 (자체 수치)
    for (const f of Object.values(this.forces)) {
      if (!f.alive) continue;
      const ra = this.affOf(f.ruler);
      for (const o of Object.values(this.officers)) {
        const st = o.state;
        if (!st || st.force !== f.id || (st.status !== 'serving' && st.status !== 'taesu')) continue;
        const diff = Math.abs(this.affOf(o.idx) - ra);
        if (diff >= 100) st.loyal = Math.max(0, (st.loyal ?? 70) - 1);
        else if (diff <= 25) st.loyal = Math.min(100, (st.loyal ?? 70) + 1);
      }
    }
    // R12: AI 결연 — 플레이어와 같은 비용·규칙 (기교P 800 이상 여유 시 월 평가, 자체)
    for (const f of Object.values(this.forces)) {
      if (!f.alive || (f.techP ?? 0) < 800) continue;
      for (const c of this.forceCities(f.id)) {
        const cand = c.officers.filter(i => (this.officers[i]?.state?.merit ?? 0) >= 500 && this.relOf(i).sworn.length === 0);
        if (cand.length >= 2) { this.swearBrotherhood(c.id, cand.slice(0, 3)); break; }
      }
    }
    if (this.emperor) { // R17: 옹립 세력 교체 로그 (월 평가 1회, 세력 루프 밖)
      const h = this.emperorHolder();
      if (h !== this.emperor.holder) { this.emperor.holder = h; if (h != null) this.log(`【옹립】${josa(this.forceName(h), ['이','가'])} 후한 황제를 옹립했습니다! 기교P 매월 +10`, true); }
    }
    // R13: 서재 기교P + AI 능력연구·흡수합병 — 플레이어와 같은 비용·규칙 (월 평가)
    for (const f of Object.values(this.forces)) {
      if (!f.alive) continue;
      const sj = Math.min(3, this.forceFacLv(f.id, '서재'));
      if (sj) this.gainTechP(f.id, sj * 10);
      if (f.rank === '황제') this.gainTechP(f.id, 20); // R14: 황제 기교P 월 +20 (자체 수치)
      if (this.emperor && this.emperorHolder() === f.id) this.gainTechP(f.id, 10); // R17: 옹립 세력 기교P 월 +10 (설계안 97행, 자체 수치)
      f.ab = f.ab ?? { '공격': 0, '방어': 0, '계략': 0, '내정': 0 };
      const abTodo = Object.keys(AB_BRANCHES).filter(b => (f.ab[b] ?? 0) < 3 && (f.techP ?? 0) >= AB_P[f.ab[b] ?? 0] + 300).sort((a, b) => AB_P[f.ab[a] ?? 0] - AB_P[f.ab[b] ?? 0]);
      if (abTodo.length && f.id !== this.playerForce) this.researchAbility(f.id, abTodo[0]); // AI만 자동, 플레이어는 수동
      if (f.id === this.playerForce) continue; // 플레이어 합병은 수동
      for (const c of this.forceCities(f.id)) {
        if (c.gold < 400) continue;
        const byType = {};
        (c.facilities ?? []).forEach((x, i) => { if (x.done && (x.level ?? 1) < 3) (byType[x.type] = byType[x.type] ?? []).push(i); });
        const pair = Object.values(byType).find(v => v.length >= 2);
        if (pair) { this.absorbFacility(c.id, pair[0], pair[1]); break; }
      }
    }
    }
    // 신규 등장 무장
    for (const o of Object.values(this.officers)) {
      if (o.state && o.state.status === 'not_yet' && this.year >= o.avail) {
        o.state.status = 'free';
        if (o.state.city != null && this.cityById[o.state.city]) this.log(`${josa(o.name_ko, ['이','가'])} ${this.cityById[o.state.city].name_ko}에 등장했습니다 (재야)`);
      }
    }
    // 세력 AP 회복·AI
    for (const f of Object.values(this.forces)) {
      if (!f.alive) continue;
      f.ap = Math.min(255, f.ap + 30 + Math.min(3, this.forceFacLv(f.id, '부절대')) * 10); // R13: 부절대 (합산 최대 +30)
      if (f.id !== this.playerForce || this.delegated) aiThink(this, f.id);
      else for (const l of f.legions ?? []) { this._legionActing = true; aiThink(this, f.id, l); this._legionActing = false; } // 플레이어 군단은 도독이 운영
    }
    // 멸망 판정
    for (const f of Object.values(this.forces)) {
      if (!f.alive) continue;
      const hasCity = this.cities.some(c => c.force === f.id);
      const hasUnit = this.units.some(u => u.force === f.id);
      if (!hasCity && !hasUnit) {
        f.alive = false;
        this.log(`【${this.forceName(f.id)}】${josa(this.forceName(f.id), ['이','가']).slice(-1)} 멸망했습니다!`, true);
        for (const o of this.forceOfficers(f.id)) { o.state.force = null; o.state.status = 'free'; o.state.found = false; }
      }
    }
    // R14: 천하 통일 판정 — 모든 도시를 한 세력이 제압 (설계안 102행 매뉴얼 문구)
    if (!this.over && !this.unified) {
      const owners = new Set(this.cities.map(c => c.force).filter(x => x != null));
      if (owners.size === 1) {
        const w = [...owners][0];
        this.over = true;
        this.unified = true; // 관전 계속(over 해제) 후 재발동 방지
        this.log(`【통일】${josa(this.forceName(w), ['이','가'])} 모든 도시를 제압해 천하를 통일했습니다! (${this.year}년 ${this.month}월, ${this.turn}턴)`, true);
      }
    }
    // 시계
    // 시설 공사 진행: 담당 정치 합산 250 이상이면 2배 속도 (자체 수치)
    for (const c of this.cities) {
      for (const fc of (c.facilities ?? [])) {
        if (fc.done) continue;
        fc.builders = (fc.builders ?? []).filter(i => c.officers.includes(i)); // 도시를 떠난 담당은 해제
        const polSum = fc.builders.reduce((s, i) => s + (this.officers[i]?.pol ?? 0), 0);
        fc.progress += polSum >= 250 ? 2 : 1;
        if (fc.progress >= FACILITIES[fc.type].turns) {
          fc.done = true;
          for (const b of fc.builders) this.gainMerit(b, MERIT.facility);
          this.log(`${c.name_ko}에 ${fc.type} 완성!`, c.force === this.playerForce);
        }
      }
    }
    this.checkRanks();
    this.dan++;
    if (this.dan > 3) { this.dan = 1; this.month++; if (this.month > 12) { this.month = 1; this.year++; } }
    this.turn++;
    // 세력 전환 인계 (턴 경계)
    if (this.pendingJoin != null && this.forces[this.pendingJoin]?.alive) {
      this.playerForce = this.pendingJoin; this.delegated = false; this.pendingJoin = null;
      this.log(`【${this.forceName(this.playerForce)}】에 참가하여 지휘를 시작합니다.`, true);
    }
    this.autosave();
  }
  stepUnit(u) {
    if ((u.burn ?? 0) > 0) { // R32: 계속 타는 불 (소화로 끌 수 있음)
      u.burn--; const lost = Math.max(1, Math.round(u.troops * 0.04)); u.troops = Math.max(0, u.troops - lost);
      this.log(`${josa(u.label, ['이','가'])} 불에 타 병력 -${lost}`, u.force === this.playerForce);
      if (u.troops <= 0) { this.units = this.units.filter(x => x !== u); this.log(`${u.label} 부대가 전멸했습니다`, false); return; }
    }
    if ((u.conf ?? 0) > 0) { // 혼란: 이동·공격 불가
      u.conf--;
      this.log(`${josa(u.label, ['이','가'])} 혼란에 빠져 움직이지 못합니다`, u.force === this.playerForce);
      return;
    }
    if (u.tx == null) return;
    // 요격: 인접한 적 부대가 있으면 진격 정지 (아군 도시로의 퇴각은 허용)
    const engaged = this.units.some(v => v !== u && v.force !== u.force && Math.hypot(v.x-u.x, v.z-u.z) < 2.2);
    if (engaged) {
      const tgt = u.targetCity != null ? this.cityById[u.targetCity] : null;
      if (!tgt || tgt.force !== u.force) return;
    }
    const ut = UNIT_TYPES[u.type];
    const spdMult = this.unitHasSkill(u, '질풍') ? 1.25 : (this.unitHasSkill(u, '신행') ? 1.15 : 1); // R17: 신행 = 이동 +15% (자체 재정의 — 야간·날씨 시스템 부재, 질풍 우선)
    let speed = 0.55 * ut.move * spdMult;
    while (u.path?.length && Math.hypot(u.path[0][0] - u.x, u.path[0][1] - u.z) < 0.35) { if (u.path.length > 1) { u.x = u.path[0][0]; u.z = u.path[0][1]; } u.path.shift(); } // R17: 경유지 통과 (연속 근접 경유지 모두 소비, 마지막 경유지=목표는 위치 스냅 없이 제거 → d=0 NaN 방지)
    const aimX = u.path?.length ? u.path[0][0] : u.tx, aimZ = u.path?.length ? u.path[0][1] : u.tz;
    const dx = aimX - u.x, dz = aimZ - u.z;
    const d = Math.hypot(dx, dz);
    if ((u.path?.length || d > 1.2) && d > 1e-6) {
      if (!SHIP_TYPES.has(u.type)) speed *= this.fieldSlow(u); // R26: 토루
      if (!SHIP_TYPES.has(u.type) && isRiverAt(u.x, u.z)) speed *= this.riverMult(u); // R17/R23: 육군 강 도하 감속 - 깊은 강 0.35·여울 0.6·난소행군 0.8 (자체 수치)
      const nx = u.x + dx/d*speed, nz = u.z + dz/d*speed;
      if (SHIP_TYPES.has(u.type) && !isWaterAt(nx, nz)) { // 수군: 강·바다에서만 기동
        if (!u._landWarn) { u._landWarn = true; this.log(`${josa(u.label, ['이','가'])} 수로를 벗어나 더 이상 나아갈 수 없습니다`, u.force === this.playerForce); }
        u.path = []; return;
      }
      if (!SHIP_TYPES.has(u.type) && isSeaAt(nx, nz)) { // R17: 육군은 바다 진입 불가 (강은 도하 가능, 설계안 64행)
        if (!u._waterWarn) { u._waterWarn = true; this.log(`${josa(u.label, ['은','는'])} 바다를 건널 수 없어 진격을 멈췄습니다`, u.force === this.playerForce); }
        u.path = []; return;
      }
      u._waterWarn = false;
      u._landWarn = false;
      u.x = nx; u.z = nz; return;
    }
    // 도착: 도시 처리
    const c = this.cityById[u.targetCity];
    if (!c) { u.tx = null; return; }
    if (c.force != null && c.force !== u.force && this.isPeace(u.force, c.force)) { // 동맹·정전 도시 공격 불가
      u.tx = null; u.targetCity = null;
      return;
    }
    if (c.force === u.force) { // 아군 도시 합류
      const cap = c.metropolis ? 150000 : 100000;
      c.troops = Math.min(cap, c.troops + u.troops);
      for (const i of u.officers) { if (!c.officers.includes(i)) c.officers.push(i); this.officers[i].state.city = c.id; }
      this.units = this.units.filter(x => x !== u);
      return;
    }
    // 공성: 도시 내구/병사 공격
    if (SIEGE_TYPES.has(u.type) && (u.qi ?? 100) <= 0) { // 병기: 기력 0이면 공격 불가 (설계안)
      this.log(`${u.label}의 병기가 기력 부족으로 공격하지 못합니다`, u.force === this.playerForce);
      return;
    }
    const lead = this.officers[u.officers[0]];
    let dmg = Math.round(u.troops * 0.12 * ut.atk * (0.7 + lead.war/150) * this.aptMult(u) * this.unitDmgMult(u, true) * this.unitItemAtk(u) * this.unitTechAtk(u) * this.unitRelMult(u) * (1 + 0.1 * this.techLv(u.force, '발명'))); // R12: 의형제·부부 같은 부대 공격 상승
    let loss = Math.round(c.troops * 0.06 / ut.def + 150);
    // 전법: 병종 적성 B 이상 + 기력 소모, 무력이 높을수록 발동 잘됨
    const tac = TACTICS[u.type]; // 검병은 전법 없음(설계 58행)
    const aptLv = u.type === 'sword' ? 1 : APT_LV(lead.apt?.[APT_IDX[u.type]]);
    if (tac && (!RULES.cityTacticSiegeOnly || SIEGE_TYPES.has(u.type)) && (u._tacTurn ?? -1) !== this.turn && aptLv >= (tac.minApt ?? 1) && u.qi >= tac.qi && Math.random() < Math.min(0.55, 0.15 + lead.war/250)) {
      u.qi -= tac.qi;
      this.gainMerit(u.officers[0], MERIT.tactic);
      dmg = Math.round(dmg * tac.mult);
      if (tac.guard) loss = Math.round(loss * tac.guard);
      this.log(`【전법】${lead.name_ko}의 ${tac.name}! ${c.name_ko}에 큰 피해`, u.force === this.playerForce);
    }
    // 계략(공격측): 화계 — 부대 내 최고 지력 무장
    const caster = u.officers.map(i => this.officers[i]).sort((a, b) => b.int - a.int)[0];
    if (caster && (u._stratTurn ?? -1) !== this.turn && caster.int >= STRATS.fire.minInt && u.qi >= STRATS.fire.qi && Math.random() < Math.min(0.5, 0.1 + caster.int/300 + (this.unitHasSkill(u, '풍계') ? 0.15 : 0)) * (1 - this.mindDefense(c.force))) {
      u.qi -= STRATS.fire.qi;
      this.gainMerit(caster.idx, MERIT.stratagem);
      const burn = Math.round(c.troops * 0.08 * (1 + 0.15 * this.techLv(u.force, '화공')));
      c.troops = Math.max(0, c.troops - burn);
      c.hp = Math.max(0, c.hp - Math.round(burn * 0.5));
      this.log(`【계략】${caster.name_ko}의 화계! ${c.name_ko} 수비병 -${burn}`, u.force === this.playerForce);
    }
    // 계략(수비측): 혼란 — 수비 도시 최고 지력 무장, 쿨다운 적용
    if (c.officers.length && (c.lastStrat ?? 0) + STRATS.confuse.cooldown <= this.turn) {
      const def = c.officers.map(i => this.officers[i]).sort((a, b) => b.int - a.int)[0];
      const p = Math.max(0.05, Math.min(0.45, 0.15 + (def.int - lead.int)/250));
      if (def.int >= STRATS.confuse.minInt && !this.unitHasSkill(u, '위장') && Math.random() < p * (1 - this.mindDefense(u.force))) {
        c.lastStrat = this.turn; u.conf = STRATS.confuse.turns;
        this.log(`【계략】${def.name_ko}의 혼란! ${josa(u.label, ['이','가'])} ${STRATS.confuse.turns}턴간 움직이지 못합니다`, c.force === this.playerForce);
      }
    }
    if (ut.siege) dmg = Math.round(dmg * ut.siege); // 병기: 대도시 피해 배율 (자체 수치)
    if (ut.burn) { const ex = Math.round(c.troops * 0.03); c.troops = Math.max(0, c.troops - ex); c.hp = Math.max(0, c.hp - Math.round(ex*0.5)); this.log(`${u.label}의 목수가 화염을 뿜어 추가 피해 -${ex}`, u.force === this.playerForce); }
    if (this.cityHasSkill(c, '수성')) dmg = Math.round(dmg * 0.85); // 수성: 주둔 도시 방어 보정
    if (c.force != null) dmg = Math.round(dmg * (1 - 0.05 * this.techLv(c.force, '방위'))); // 방위 기교: 도시 방어
    c.troops = Math.max(0, c.troops - dmg);
    c.hp = Math.max(0, c.hp - Math.round(dmg*0.5));
    u.troops = Math.max(0, u.troops - loss);
    this.gainTechP(u.force, Math.min(50, Math.floor(dmg / 100))); // 전투 기교P
    this.log(`${josa(u.label, ['이','가'])} ${josa(c.name_ko, ['을','를'])} 공격 (적병 -${dmg}, 아군 -${loss})`, u.force === this.playerForce);
    if (u.troops <= 0) { this.units = this.units.filter(x => x !== u); this.log(`${u.label} 부대가 전멸했습니다`, false); return; }
    if (c.troops <= 0 || c.hp <= 0) {
      const old = c.force;
      c.force = u.force; c.district = null;
      c.hp = Math.round(c.maxhp * 0.4);
      this.gainTechP(u.force, 200); // 도시 함락 기교P
      for (const i of u.officers) this.gainMerit(i, MERIT.capture);
      this.log(`【${c.name_ko}】함락! ${old != null ? this.forceName(old) : '공백지'} → ${this.forceName(u.force)}`, true);
      // 수비 무장 일부 포로/퇴각은 후속 구현 — 일단 공격측 도시에 그대로 둠
      u.tx = null; u.targetCity = null;
    }
  }
  // === 야전: 접촉한 적 부대 쌍 교전 ===
  resolveFieldBattles() {
    const us = [...this.units];
    for (let i = 0; i < us.length; i++) for (let j = i+1; j < us.length; j++) {
      const a = us[i], b = us[j];
      if (!this.units.includes(a) || !this.units.includes(b)) continue;
      if (a.force === b.force) continue;
      if (this.isPeace(a.force, b.force)) continue;
      if (Math.hypot(a.x-b.x, a.z-b.z) >= 2.2) continue;
      this.fieldBattle(a, b);
    }
  }
  fieldBattle(a, b) {
    const strike = (att, def) => { // 공격측 1회 타격분 산출 (전법·계략 포함), 피해는 나중에 동시 적용
      if ((att.conf ?? 0) > 0) return 0; // 혼란은 stepUnit에서 감소 처리됨
      if (SIEGE_TYPES.has(att.type) && (att.qi ?? 100) <= 0) return 0; // 병기: 기력 0 공격 불가
      const utA = UNIT_TYPES[att.type], utD = UNIT_TYPES[def.type];
      const lead = this.officers[att.officers[0]] ?? { war: 60, int: 30, apt: null, name_ko: '적병 두목', idx: -1 };
      let dmg = Math.round(att.troops * 0.05 * utA.atk * (0.7 + lead.war/150) / utD.def * this.aptMult(att) * this.unitDmgMult(att) * this.unitItemAtk(att) * this.unitDefMult(def) * this.unitTechAtk(att) * this.unitRelMult(att) / this.unitRelMult(def) * (1 - 0.03 * this.techLv(def.force, '연병'))); // R12: 의형제·부부 공·방 상승
      if (isWaterAt(att.x, att.z)) { dmg = Math.round(dmg * (utA.ship ? 1.3 : 0.7) * (this.unitHasSkill(att, '수완') ? 1.15 : 1)); } // 수전: 수군 우세, 육군 페널티, 수완 특기 +15% (자체 수치)
      // 전법 (공성과 같은 규칙)
      const tac = TACTICS[att.type];
      const aptLv = att.type === 'sword' ? 1 : APT_LV(lead.apt?.[APT_IDX[att.type]]);
      if (!tac && att.type !== 'sword' && (att._tacTurn ?? -1) < this.turn && Math.random() < Math.min(0.55, 0.15 + lead.war/250)) { // R39: 창·극·기병은 설계의 추가 전법(적성·기력·턴 1회 조건 동일)을 자동 전투에서도 같은 선택 규칙(pickTactic)으로 사용
        const opt = this.pickTactic(att, def);
        if (opt) {
          att.qi -= opt.qi; att._tacTurn = this.turn; dmg = Math.round(dmg * opt.mult);
          this.gainMerit(att.officers[0], MERIT.tactic);
          if (att.type === 'cav') att._cavTactic = true;
          const note = opt.eff ? this._tacExtra(att, def, opt, dmg) : '';
          this.log(`【전법】${lead.name_ko}의 ${opt.name}! 야전에서 ${def.label}에 큰 피해${note}`, att.force === this.playerForce);
        }
      }
      if (tac && att.type !== 'sword' && (att._tacTurn ?? -1) !== this.turn && aptLv >= (tac.minApt ?? 1) && (att.qi ?? 100) >= tac.qi && Math.random() < Math.min(0.55, 0.15 + lead.war/250)) {
        att.qi -= tac.qi; dmg = Math.round(dmg * tac.mult);
        if (tac.guard) att._guard = true;
        if (att.type === 'cav') att._cavTactic = true; // R10: 기병 전법 시 일기토 발동률 상승 (설계안 110행)
        this.log(`【전법】${lead.name_ko}의 ${tac.name}! 야전에서 ${def.label}에 큰 피해`, att.force === this.playerForce);
      }
      // 계략: 혼란
      const caster = att.officers.map(i => this.officers[i]).sort((x, y) => y.int - x.int)[0];
      if (caster && (att._stratTurn ?? -1) !== this.turn && caster.int >= STRATS.confuse.minInt && !this.unitHasSkill(def, '위장') && (att.qi ?? 100) >= 25 && Math.random() < Math.min(0.35, 0.08 + caster.int/400) * (1 - this.mindDefense(def.force))) {
        att.qi -= 25; att._stratTurn = this.turn; def.conf = Math.max(def.conf ?? 0, STRATS.confuse.turns);
        this.log(`【계략】${caster.name_ko}의 혼란! ${josa(def.label, ['이','가'])} ${STRATS.confuse.turns}턴간 움직이지 못합니다`, att.force === this.playerForce);
      }
      // 계략: 화계
      if (caster && (att._stratTurn ?? -1) !== this.turn && caster.int >= STRATS.fire.minInt && !this.unitHasSkill(def, '위장') && (att.qi ?? 100) >= STRATS.fire.qi && Math.random() < Math.min(0.5, 0.1 + caster.int/300 + (this.unitHasSkill(att, '풍계') ? 0.15 : 0)) * (1 - this.mindDefense(def.force))) {
        att.qi -= STRATS.fire.qi; att._stratTurn = this.turn; // 한 부대 턴당 계략 1회(직접·자동 공통)
        const burn = Math.round(def.troops * 0.06 * (1 + 0.15 * this.techLv(att.force, '화공')));
        def.troops = Math.max(0, def.troops - burn); def.burn = 3;
        this.log(`【계략】${caster.name_ko}의 화계! ${def.label} 병력 -${burn} (불이 번져 3턴간 계속 탑니다)`, att.force === this.playerForce);
      }
      return dmg;
    };
    a._guard = false; b._guard = false;
    let da = strike(a, b), db = strike(b, a);
    if (a._guard) db = Math.round(db * (TACTICS[a.type]?.guard ?? 1)); // 철벽: 받는 피해 감소
    if (b._guard) da = Math.round(da * (TACTICS[b.type]?.guard ?? 1));
    a.troops = Math.max(0, a.troops - db);
    b.troops = Math.max(0, b.troops - da);
    this.gainTechP(a.force, Math.min(40, Math.floor(db / 100))); this.gainTechP(b.force, Math.min(40, Math.floor(da / 100))); // 전투 기교P
    this.log(`【야전】${a.label} ↔ ${b.label} 교전 (${a.label} -${db} / ${b.label} -${da})`, a.force === this.playerForce || b.force === this.playerForce);
    // R10: 일기토 발동 — 기병 전법 시 15%, 일반 야전 8% (자체 확률). 양측 무장 보유·적병 제외
    if (!this.pendingDuel && a.troops > 0 && b.troops > 0 && a.officers.length && b.officers.length && a.force !== -1 && b.force !== -1) {
      const cavTac = a._cavTactic || b._cavTactic;
      a._cavTactic = false; b._cavTactic = false;
      if (Math.random() < (cavTac ? 0.15 : 0.08)) {
        const d = this.startDuel(a, b);
        this.log(`【일기토】${this.officers[d.a.offs[0]].name_ko} vs ${this.officers[d.b.offs[0]].name_ko} — 일기토 시작!`, true);
        if ((a.force !== this.playerForce && b.force !== this.playerForce) || this.delegated) this.duelAuto(d); // AI끼리·위임 시 같은 규칙으로 자동 진행
      }
    }
    for (const u of [a, b]) {
      if (u.troops <= 0) {
        this.units = this.units.filter(x => x !== u);
        this.log(`${u.label} 부대가 전멸했습니다`, false);
      } else if (u.troops < (this.unitHasSkill(u, '완강') ? 600 : 1200)) { // 퇴각: 가장 가까운 아군 도시로 (완강 특기는 기준 절반)
        const home = this.forceCities(u.force).sort((pp, qq) => Math.hypot(pp.lon-u.x, pp.lat-u.z) - Math.hypot(qq.lon-u.x, qq.lat-u.z))[0];
        if (home) {
          const rp = this.findPath(u, home.lon, home.lat);
          if (rp) { u.targetCity = home.id; u.tx = home.lon; u.tz = home.lat; u.path = rp; } // R17b: 퇴각도 경로 탐색, 실패 시 제자리 대기(직선 폴백 금지)
          this.log(`${josa(u.label, ['이','가'])} ${josa(home.name_ko, ['으로','로'])} 퇴각합니다`, u.force === this.playerForce);
        }
      }
    }
  }

  // === R15: 전법·계략 직접 발동 — 자동 발동과 같은 비용·수치, 플레이어가 부대 패널에서 대상을 직접 선택 (설계안 본편 조작) ===
  pickTactic(u, eu) { // 추가 전법 선택 규칙 (AI와 자동 전투 공통): 혼란형 우선, 주변 적 2부대 이상이면 광역·관통형, 아니면 기력이 가장 큰 것
    const info = this.tacticInfo(u); if (!info) return null;
    const ex = info.opts.filter(o => o.id !== 'base'); if (!ex.length) return null;
    const near = this.units.filter(x => x !== eu && x.force !== u.force && !this.isPeace(u.force, x.force) && Math.hypot(x.x - eu.x, x.z - eu.z) < 1.6).length;
    return ex.find(o => o.eff === 'conf' && (eu.conf ?? 0) <= 0) || (near >= 1 ? ex.find(o => ['whirl', 'volley', 'side', 'pierce'].includes(o.eff)) : null) || ex.slice().sort((a, b) => b.qi - a.qi)[0];
  }
  tacticInfo(u) { // 직접 전법 가능 여부 (자동 발동의 자격·기력 조건과 동일)
    const tac = u && u.type !== 'sword' ? TACTICS[u.type] : null; const hasEx = u && (TACTICS_EX[u.type]||[]).length > 0; // R36: 검병은 전법 없음 (설계 58행)
    if (!u || (!tac && !hasEx) || (u.conf ?? 0) > 0 || (u._tacTurn ?? -1) === this.turn) return null; // 턴 1회 제한 (자동 발동의 교전당 1회 판정과 같은 행동 경제)
    const lead = this.officers[u.officers[0]] ?? { war: 60, int: 30, apt: null, name_ko: '적병 두목', idx: -1 };
    const aptLv = u.type === 'sword' ? 1 : APT_LV(lead.apt?.[APT_IDX[u.type]]);
    const opts = [];
    if (tac && aptLv >= (tac.minApt ?? 1) && (u.qi ?? 100) >= tac.qi) opts.push({ id: 'base', ...tac });
    for (const x of (TACTICS_EX[u.type] || [])) if (aptLv >= x.minApt && (u.qi ?? 100) >= x.qi) opts.push(x);
    if (!opts.length) return null;
    return { tac: opts.find(o => o.id === 'base') ?? opts[0], lead, opts };
  }
  _tacPushDir(u, d) { const dx = d.x - u.x, dz = d.z - u.z, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; }
  _tacStandable(d, x, z) { return SHIP_TYPES.has(d.type) ? isWaterAt(x, z) : !isSeaAt(x, z); }
  _tacMove(d, dx, dz, dist) { // 격퇴/끌어당김: 0.4 단위로 나아가며 지형·타 부대에 막히면 그 앞에서 정지. 이동 거리 반환
    let moved = 0;
    for (let k = 0; k < Math.ceil(dist / 0.4); k++) {
      const nx = d.x + dx * 0.4, nz = d.z + dz * 0.4;
      if (!Number.isFinite(nx + nz) || !this._tacStandable(d, nx, nz)) break;
      if (this.units.some(v => v !== d && Math.hypot(v.x - nx, v.z - nz) < 0.35)) break;
      d.x = nx; d.z = nz; moved += 0.4;
    }
    if (moved > 0 && d.tx != null && d.tz != null) { const np = this.findPath(d, d.tx, d.tz); if (np) d.path = np; else { d.path = []; d.tx = null; d.tz = null; d.targetCity = null; } } // 재탐색 실패 시 명령 취소(정지 부대 방지, AI가 다음 턴 재명령)
    return moved;
  }
  _tacExtra(u, d, tac, dmg) { // 추가 효과 적용 - 주 대상 피해 후. 부수 피해는 주 피해의 비율(자체)
    const foes = () => this.units.filter(v => v !== d && v.force !== u.force && !this.isPeace(u.force, v.force));
    const hurt = (v, r) => { const a = Math.round(dmg * r); v.troops = Math.max(0, v.troops - a); return a; };
    let note = '';
    if (tac.eff === 'conf') { d.conf = Math.max(d.conf ?? 0, 2); note = ' 혼란 2턴'; }
    else if (tac.eff === 'push') { const [ux, uz] = this._tacPushDir(u, d); const m = this._tacMove(d, ux, uz, tac.n * 0.9); note = m > 0 ? ' ' + (Math.round(m / 0.9 * 10) / 10) + '칸 격퇴' : ' (밀리지 않음)'; }
    else if (tac.eff === 'pull') { const [ux, uz] = this._tacPushDir(u, d); const gap = Math.hypot(d.x - u.x, d.z - u.z); const m = this._tacMove(d, -ux, -uz, Math.max(0, Math.min(0.9, gap - 0.7))); note = m > 0 ? ' 끌어당김' : ' (끌려오지 않음)'; }
    else if (tac.eff === 'whirl') { let n = 0; for (const v of foes()) if (Math.hypot(v.x - u.x, v.z - u.z) < 2.2) { hurt(v, 0.7); n++; } note = ' 주변 ' + n + '부대 동시 타격'; }
    else if (tac.eff === 'volley') { let n = 0; for (const v of foes()) if (Math.hypot(v.x - d.x, v.z - d.z) < 1.5) { hurt(v, 0.6); n++; } note = ' 주변 ' + n + '부대 난사'; }
    else if (tac.eff === 'side' || tac.eff === 'pierce') {
      const [ux, uz] = this._tacPushDir(u, d); let n = 0;
      const dd = Math.hypot(d.x - u.x, d.z - u.z);
      for (const v of foes()) {
        const rx = v.x - u.x, rz = v.z - u.z, r = Math.hypot(rx, rz); if (r > 2.2 || r < 1e-6) continue;
        const cos = (rx * ux + rz * uz) / r;
        if (tac.eff === 'side' ? cos > 0.5 : (cos > 0.93 && r > dd)) { hurt(v, 0.7); n++; }
      }
      note = tac.eff === 'side' ? ' 전방 ' + n + '부대 동시 타격' : ' ' + n + '부대 관통';
    }
    const dead = this.units.filter(v => v.troops <= 0 && v !== d);
    for (const v of dead) this.log(v.label + ' 부대가 전멸했습니다', false);
    this.units = this.units.filter(v => v.troops > 0 || v === d);
    return note;
  }
  fireTactic(uid, target, tid = null) { // 직접 전법: 확정 발동(기력 소모), 피해 산식은 자동 발동과 동일. target: {type:'unit'|'city', id}
    const u = this.units.find(x => x.id === uid);
    const info = this.tacticInfo(u);
    if (!info) return false;
    const lead = info.lead;
    const tac = tid ? info.opts.find(o => o.id === tid) : info.opts.find(o => o.id === 'base');
    if (!tac || (tac.id !== 'base' && target.type !== 'unit')) return false; // 추가 전법은 부대 대상만
    const inRange = (x, z) => Math.hypot(x - u.x, z - u.z) < 2.2;
    if (target.type === 'unit') {
      const d = this.units.find(x => x.id === target.id);
      if (!d || d.force === u.force || this.isPeace(u.force, d.force) || !inRange(d.x, d.z)) return false;
      const utA = UNIT_TYPES[u.type], utD = UNIT_TYPES[d.type];
      let dmg = Math.round(u.troops * 0.05 * utA.atk * (0.7 + lead.war/150) / utD.def * this.aptMult(u) * this.unitDmgMult(u) * this.unitItemAtk(u) * this.unitDefMult(d) * this.unitTechAtk(u) * this.unitRelMult(u) / this.unitRelMult(d) * (1 - 0.03 * this.techLv(d.force, '연병'))); // 야전 산식과 동일
      if (isWaterAt(u.x, u.z)) dmg = Math.round(dmg * (utA.ship ? 1.3 : 0.7) * (this.unitHasSkill(u, '수완') ? 1.15 : 1));
      dmg = Math.round(dmg * tac.mult);
      u.qi -= tac.qi; u._tacTurn = this.turn;
      this.gainMerit(u.officers[0], MERIT.tactic);
      d.troops = Math.max(0, d.troops - dmg);
      this.gainTechP(u.force, Math.min(40, Math.floor(dmg / 100)));
      const note = tac.eff ? this._tacExtra(u, d, tac, dmg) : '';
      this.log(`【전법】${lead.name_ko}의 ${tac.name}! 야전에서 ${d.label}에 큰 피해 (-${dmg})${note}`, u.force === this.playerForce);
      if (d.troops <= 0) { this.units = this.units.filter(x => x !== d); this.log(`${d.label} 부대가 전멸했습니다`, false); }
      this.autosave();
      return true;
    }
    if (target.type === 'city') {
      const c = this.cityById[target.id];
      if ((RULES.cityTacticSiegeOnly && !SIEGE_TYPES.has(u.type)) || !c || c.force === u.force || (c.force != null && this.isPeace(u.force, c.force)) || !inRange(c.lon, c.lat)) return false;
      const ut = UNIT_TYPES[u.type];
      let dmg = Math.round(u.troops * 0.12 * ut.atk * (0.7 + lead.war/150) * this.aptMult(u) * this.unitDmgMult(u, true) * this.unitItemAtk(u) * this.unitTechAtk(u) * this.unitRelMult(u) * (1 + 0.1 * this.techLv(u.force, '발명'))); // 공성 산식과 동일
      dmg = Math.round(dmg * tac.mult);
      if (ut.siege) dmg = Math.round(dmg * ut.siege);
      if (ut.burn) { const ex = Math.round(c.troops * 0.03); c.troops = Math.max(0, c.troops - ex); c.hp = Math.max(0, c.hp - Math.round(ex * 0.5)); }
      if (this.cityHasSkill(c, '수성')) dmg = Math.round(dmg * 0.85);
      if (c.force != null) dmg = Math.round(dmg * (1 - 0.05 * this.techLv(c.force, '방위')));
      u.qi -= tac.qi; u._tacTurn = this.turn;
      this.gainMerit(u.officers[0], MERIT.tactic);
      c.troops = Math.max(0, c.troops - dmg);
      c.hp = Math.max(0, c.hp - Math.round(dmg * 0.5));
      this.gainTechP(u.force, Math.min(50, Math.floor(dmg / 100)));
      this.log(`【전법】${lead.name_ko}의 ${tac.name}! ${c.name_ko}에 큰 피해 (-${dmg})`, u.force === this.playerForce);
      if (c.troops <= 0 || c.hp <= 0) {
        c.force = u.force; c.district = null;
        c.hp = Math.round(c.maxhp * 0.4);
        this.gainTechP(u.force, 200);
        for (const i of u.officers) this.gainMerit(i, MERIT.capture);
        u.tx = null; u.targetCity = null;
        this.log(`【${c.name_ko}】함락! → ${this.forceName(u.force)}`, true);
      }
      this.autosave();
      return true;
    }
    return false;
  }
  forestAt(x, z) { return !!this.forestFn?.(x, z); } // 숲 판정: 렌더가 쓰는 셀과 동일(map3d.forestAtLL 연결, 저장 없음)
  canAmbush(u) { const t = UNIT_TYPES[u.type]; return !!t && u.type !== 'cav' && !t.siege && !SHIP_TYPES.has(u.type) && this.forestAt(u.x, u.z); }
  ambushTarget(u) { return this.units.find(d => d.force !== u.force && !this.isPeace(u.force, d.force) && Math.hypot(d.x - u.x, d.z - u.z) < 1.2) ?? null; }
  fireStrat(uid, kind, target) { // 직접 계략: 성공률·비용·효과는 자동 발동과 동일, 부대당 턴 1회 시도
    const u = this.units.find(x => x.id === uid);
    if (!u || (u.conf ?? 0) > 0 || (u._stratTurn ?? -1) === this.turn) return false;
    const caster = u.officers.map(i => this.officers[i]).sort((a, b) => b.int - a.int)[0];
    if (!caster) return false;
    const inRange = (x, z) => Math.hypot(x - u.x, z - u.z) < 2.2;
    const enemyUnit = () => { const d = this.units.find(x => x.id === target.id); return (d && d.force !== u.force && !this.isPeace(u.force, d.force) && !this.unitHasSkill(d, '위장') && inRange(d.x, d.z)) ? d : null; };
    if (kind === 'fire') {
      if (caster.int < STRATS.fire.minInt || (u.qi ?? 100) < STRATS.fire.qi) return false;
      const p = Math.min(0.5, 0.1 + caster.int/300 + (this.unitHasSkill(u, '풍계') ? 0.15 : 0));
      if (target.type === 'unit') {
        const d = enemyUnit();
        if (!d) return false;
        u._stratTurn = this.turn;
        if (Math.random() >= p * (1 - this.mindDefense(d.force))) { this.log(`【계략】${caster.name_ko}의 화계가 ${d.label}에 실패했습니다`, u.force === this.playerForce); this.autosave(); return true; }
        u.qi -= STRATS.fire.qi;
        this.gainMerit(caster.idx, MERIT.stratagem);
        const burn = Math.round(d.troops * 0.06 * (1 + 0.15 * this.techLv(u.force, '화공')));
        d.troops = Math.max(0, d.troops - burn);
        this.log(`【계략】${caster.name_ko}의 화계! ${d.label} 병력 -${burn} (불이 번져 3턴간 계속 탑니다)`, u.force === this.playerForce);
        d.burn = 3;
        if (d.troops <= 0) { this.units = this.units.filter(x => x !== d); this.log(`${d.label} 부대가 전멸했습니다`, false); }
        this.autosave();
        return true;
      }
      if (target.type === 'city') {
        const c = this.cityById[target.id];
        if (!c || c.force == null || c.force === u.force || this.isPeace(u.force, c.force) || !inRange(c.lon, c.lat)) return false;
        u._stratTurn = this.turn;
        if (Math.random() >= p * (1 - this.mindDefense(c.force))) { this.log(`【계략】${caster.name_ko}의 화계가 ${c.name_ko}에 실패했습니다`, u.force === this.playerForce); this.autosave(); return true; }
        u.qi -= STRATS.fire.qi;
        this.gainMerit(caster.idx, MERIT.stratagem);
        const burn = Math.round(c.troops * 0.08 * (1 + 0.15 * this.techLv(u.force, '화공')));
        c.troops = Math.max(0, c.troops - burn);
        c.hp = Math.max(0, c.hp - Math.round(burn * 0.5));
        this.log(`【계략】${caster.name_ko}의 화계! ${c.name_ko} 수비병 -${burn}`, u.force === this.playerForce);
        this.autosave();
        return true;
      }
      return false;
    }
    if (kind === 'ambush') {
      const d = this.ambushTarget(u);
      if (!d || !this.canAmbush(u) || caster.int < STRATS.ambush.minInt || (u.qi ?? 100) < STRATS.ambush.qi) return false;
      u._stratTurn = this.turn;
      if (Math.random() >= Math.min(0.7, 0.3 + caster.int / 250) * (1 - this.mindDefense(d.force))) { this.log(`【계략】${caster.name_ko}의 복병이 ${d.label}에 간파당했습니다`, u.force === this.playerForce); this.autosave(); return true; }
      u.qi -= STRATS.ambush.qi; // 화계와 동일: 실패 시 기력 소모 없음, 성공 시 소모
      this.gainMerit(caster.idx, MERIT.stratagem);
      const hit = Math.round(d.troops * 0.07); d.troops = Math.max(0, d.troops - hit); d.qi = Math.max(0, (d.qi ?? 100) - 20);
      this.log(`【계략】${caster.name_ko}의 복병! ${d.label} 병력 -${hit}, 기력 -20`, u.force === this.playerForce);
      if (d.troops <= 0) { this.units = this.units.filter(x => x !== d); this.log(`${d.label} 부대가 전멸했습니다`, false); }
      this.autosave();
      return true;
    }
    if (kind === 'douse') {
      const d = this.units.find(x => x.id === target.id);
      if (!d || d.force !== u.force || (d.burn ?? 0) <= 0 || !inRange(d.x, d.z) || caster.int < STRATS.douse.minInt || (u.qi ?? 100) < STRATS.douse.qi) return false;
      u._stratTurn = this.turn; u.qi -= STRATS.douse.qi; d.burn = 0;
      this.log(`【계략】${caster.name_ko}의 소화! ${d.label}의 불을 껐습니다`, u.force === this.playerForce);
      this.autosave();
      return true;
    }
    if (kind === 'confuse') {
      if (caster.int < STRATS.confuse.minInt || (u.qi ?? 100) < 25 || target.type !== 'unit') return false;
      const d = enemyUnit();
      if (!d) return false;
      u._stratTurn = this.turn;
      if (Math.random() >= Math.min(0.35, 0.08 + caster.int/400) * (1 - this.mindDefense(d.force))) { this.log(`【계략】${caster.name_ko}의 혼란이 ${d.label}에 실패했습니다`, u.force === this.playerForce); this.autosave(); return true; }
      u.qi -= 25;
      this.gainMerit(caster.idx, MERIT.stratagem);
      d.conf = Math.max(d.conf ?? 0, STRATS.confuse.turns);
      this.log(`【계략】${caster.name_ko}의 혼란! ${josa(d.label, ['이','가'])} ${STRATS.confuse.turns}턴간 움직이지 못합니다`, u.force === this.playerForce);
      this.autosave();
      return true;
    }
    if (kind === 'rumor') {
      if (caster.int < STRATS.rumor.minInt || (u.qi ?? 100) < STRATS.rumor.qi || target.type !== 'unit') return false;
      const d = enemyUnit();
      if (!d) return false;
      u._stratTurn = this.turn;
      if (Math.random() >= Math.min(0.4, 0.1 + caster.int/350) * (1 - this.mindDefense(d.force))) { this.log(`【계략】${caster.name_ko}의 위보가 ${d.label}에 통하지 않았습니다`, u.force === this.playerForce); this.autosave(); return true; }
      u.qi -= STRATS.rumor.qi;
      this.gainMerit(caster.idx, MERIT.stratagem);
      const home = this.forceCities(d.force).sort((pp, qq) => Math.hypot(pp.lon-d.x, pp.lat-d.z) - Math.hypot(qq.lon-d.x, qq.lat-d.z))[0];
      const rp = home ? this.findPath(d, home.lon, home.lat) : null;
      if (rp) { d.targetCity = home.id; d.tx = home.lon; d.tz = home.lat; d.path = rp; d.engaged = null; this.log(`【계략】${caster.name_ko}의 위보! ${josa(d.label, ['이','가'])} 거짓 보고에 속아 ${josaRo(home.name_ko)} 퇴각합니다`, u.force === this.playerForce); }
      else this.log(`【계략】${caster.name_ko}의 위보가 ${d.label}에 통하지 않았습니다 (퇴각로 없음)`, u.force === this.playerForce);
      this.autosave();
      return true;
    }
    if (kind === 'calm') {
      if (caster.int < STRATS.calm.minInt || (u.qi ?? 100) < STRATS.calm.qi || target.type !== 'unit') return false;
      const d = this.units.find(x => x.id === target.id);
      if (!d || d.force !== u.force || !inRange(d.x, d.z)) return false;
      u._stratTurn = this.turn;
      u.qi -= STRATS.calm.qi;
      this.gainMerit(caster.idx, MERIT.stratagem);
      d.conf = 0; d.qi = Math.min(100, (d.qi ?? 100) + 20);
      this.log(`【계략】${caster.name_ko}의 진정! ${josa(d.label, ['이','가'])} 안정을 되찾았습니다`, u.force === this.playerForce);
      this.autosave();
      return true;
    }
    return false;
  }
  // === R15 끝 ===
  patrol(cityId) { // R9: 치안 순찰 — 치안 +10 (금 100·AP 20, 자체 수치)
    const c = this.cityById[cityId];
    if (!c || c.force == null || this._blocked(c)) return false;
    const f = this.forces[c.force];
    if ((f.ap ?? 0) < 20 || c.gold < 100 || (c.security ?? 80) >= 100) return false;
    f.ap -= 20; c.gold -= 100;
    c.security = Math.min(100, (c.security ?? 80) + 10);
    this.log(`【치안】${c.name_ko}에서 순찰을 실시했습니다 (치안 ${c.security})`, c.force === this.playerForce);
    return true;
  }
  spawnBandits(c) { // R9: 치안 80 미만 도시 주변에 적(賊) 출현 (설계안 101행, 자체 수치)
    let cell = null;
    for (let r = 2; r <= 5 && !cell; r++)
      for (let dx = -r; dx <= r && !cell; dx++) for (let dz = -r; dz <= r && !cell; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = c.lon + dx, z = c.lat + dz;
        if (isWaterAt(x, z)) continue;
        if (this.cities.some(o => Math.hypot(o.lon - x, o.lat - z) < 1.5)) continue;
        if (this.units.some(u => Math.hypot(u.x - x, u.z - z) < 1)) continue;
        cell = { x, z };
      }
    if (!cell) return;
    const u = { id: this.nextUnitId++, force: -1, officers: [], troops: 3000, type: 'spear',
      x: cell.x, z: cell.z, path: [], tx: null, tz: null, targetCity: c.id, label: '적병 3k', qi: 100, conf: 0, until: this.turn + 18 };
    this.units.push(u);
    this.log(`【적】${c.name_ko} 주변에 적의 근거지가 출현했습니다! (치안 ${c.security ?? 80} — 순찰로 치안을 높이세요)`, true);
  }
  banditAct(u) { // R9: 적(賊) 행동 — 목표 도시로 이동, 도착 시 완성 시설 파괴·약탈 후 소멸, 6개월 후 자연 소멸
    if ((u.until ?? Infinity) <= this.turn || u.troops <= 0) { this.units = this.units.filter(x => x !== u); return; }
    const c = this.cityById[u.targetCity];
    if (!c || c.force == null) { this.units = this.units.filter(x => x !== u); return; }
    const d = Math.hypot(c.lon - u.x, c.lat - u.z);
    if (d < 1.6) { // 도착: 완성 시설 1개 파괴, 없으면 금 약탈
      const done = (c.facilities ?? []).filter(f => f.done);
      if (done.length) {
        const f = done[Math.floor(Math.random() * done.length)];
        c.facilities = c.facilities.filter(x => x !== f);
        this.log(`【적】${c.name_ko}의 ${josa(f.type, ['이','가'])} 적에게 파괴되었습니다!`, true);
      } else {
        const loot = Math.min(c.gold, 500);
        c.gold -= loot;
        this.log(`【적】적병이 ${josa(c.name_ko, ['을','를'])} 약탈했습니다 (금 -${loot})`, true);
      }
      c.security = Math.max(0, (c.security ?? 80) - 5);
      this.units = this.units.filter(x => x !== u);
      return;
    }
    const step = 0.55 * UNIT_TYPES[u.type].move;
    const nx = u.x + (c.lon - u.x) / d * step, nz = u.z + (c.lat - u.z) / d * step;
    if (isWaterAt(nx, nz)) return; // 육군 — 수로는 건너지 못함
    u.x = nx; u.z = nz;
  }
  // === R10: 일기토 (설계안 109-113행, 수치·확률은 자체) ===
  effWar(o) { return Math.max(1, (o?.war ?? 50) - ((o?.state?.injuredUntil ?? 0) > this.turn ? 20 : 0)); } // 부상 중 무력 -20
  // === R12: 관계 (정적: 이름 기반 자체 정의 / 동적: 결연은 state.sworn에 저장) ===
  buildRelations() {
    const byName = {};
    for (const o of Object.values(this.officers)) (byName[o.name_ko] ??= []).push(o.idx);
    const rels = {};
    const ensure = i => rels[i] ??= { sworn: [], spouse: null, dear: [], hate: [] };
    for (const g of SWORN_GROUPS) { const ids = g.flatMap(n => byName[n] ?? []); for (const a of ids) for (const b of ids) if (a !== b) ensure(a).sworn.push(b); }
    const pair = (list, fn) => { for (const [x, y] of list) for (const xi of byName[x] ?? []) for (const yi of byName[y] ?? []) if (xi !== yi) fn(xi, yi); };
    pair(SPOUSE_PAIRS, (a, b) => { ensure(a).spouse = b; ensure(b).spouse = a; });
    pair(DEAR_PAIRS, (a, b) => { ensure(a).dear.push(b); ensure(b).dear.push(a); });
    pair(HATE_PAIRS, (a, b) => { ensure(a).hate.push(b); ensure(b).hate.push(a); });
    return rels;
  }
  relOf(idx) {
    this._rels ??= this.buildRelations();
    const base = this._rels[idx] ?? { sworn: [], spouse: null, dear: [], hate: [] };
    const dyn = this.officers[idx]?.state?.sworn ?? []; // 결연으로 생긴 관계 (저장 대상)
    return { ...base, sworn: [...new Set([...base.sworn, ...dyn])] };
  }
  isBonded(a, b) { const r = this.relOf(a); return r.sworn.includes(b) || r.spouse === b; }
  affOf(idx) { let s = 0; for (const ch of (this.officers[idx]?.name_ko ?? '')) s += ch.charCodeAt(0); return s % 150; } // 상성 0~149 (자체 배정)
  unitRelMult(u) { // 의형제·부부가 같은 부대: 공격·방어 +10% (설계안: 같은 부대 능력 상승, 자체 수치)
    const os = u.officers;
    for (let i = 0; i < os.length; i++) for (let j = i + 1; j < os.length; j++) if (this.isBonded(os[i], os[j])) return 1.1;
    return 1;
  }
  // === R13: PK 3요소 ===
  cityFacLv(c, t) { return this.cityFac(c, t).reduce((s, x) => s + (x.level ?? 1), 0); } // 흡수합병 레벨 합산
  forceFacLv(fid, t) { return this.cities.filter(c => c.force === fid).reduce((s, c) => s + this.cityFacLv(c, t), 0); }
  apMult(c, cat) { // R13: 군사부·인재부·외교부 — 해당 커맨드 행동력 25% 절감 (자체)
    const fac = { military: '군사부', personnel: '인재부', diplo: '외교부' }[cat];
    return (fac && this.cityFac(c, fac).length ? 0.75 : 1) * (cat === 'military' && c?.force != null && this.forces[c.force]?.arts?.['군제개혁'] ? 0.85 : 1);
  }
  absorbFacility(cityId, fi1, fi2) { // R13 흡수합병: 같은 완성 시설 2개를 합쳐 Lv+1 (최대 3), 금 200·AP 10 (자체 수치)
    const c = this.cityById[cityId], f = this.forces[c?.force];
    if (!c || this._blocked(c) || c.gold < 200 || f.ap < 10) return false;
    const a = c.facilities?.[fi1], b = c.facilities?.[fi2];
    if (!a || !b || fi1 === fi2 || a.type !== b.type || !a.done || !b.done) return false;
    if ((a.level ?? 1) >= 3) return false;
    a.level = (a.level ?? 1) + 1;
    c.facilities.splice(fi2, 1);
    c.gold -= 200; f.ap -= 10;
    this.log(`【합병】${c.name_ko}의 ${josa(a.type, ['을','를'])} 흡수합병해 Lv${josaRo(a.level)} 강화했습니다 (금 200·AP 10, 개발지 1개 회수)`, c.force === this.playerForce);
    this.autosave();
    return true;
  }
  researchAbility(fid, branch) { // R13 능력연구: 기교P 소비 → 소속 무장 전원 해당 능력 +2 (상한 100), 3단계 완료 시 특기 습득 (자체 수치)
    const f = this.forces[fid]; if (!f?.alive) return false;
    f.ab = f.ab ?? { '공격': 0, '방어': 0, '계략': 0, '내정': 0 };
    const stat = AB_BRANCHES[branch], lv = f.ab[branch] ?? 0;
    if (!stat || lv >= 3 || (f.techP ?? 0) < AB_P[lv]) return false;
    f.techP -= AB_P[lv]; f.ab[branch] = lv + 1;
    const statNm = { war: '무력', ldr: '통솔', int: '지력', pol: '정치' }[stat];
    for (const o of this.forceOfficers(fid)) {
      o[stat] = Math.min(100, (o[stat] ?? 50) + 2);
      if (o.state) { o.state.bonus = o.state.bonus ?? {}; o.state.bonus[stat] = (o.state.bonus[stat] ?? 0) + 2; } // 저장 영속용
    }
    this.log(`【연구】${this.forceName(fid)} 능력연구 「${branch}」 ${lv + 1}단계 완료 (기교P ${AB_P[lv]} 소비, 소속 무장 전원 ${statNm} +2)`, fid === this.playerForce);
    if (lv + 1 === 3) {
      const sk = AB_SKILL[branch];
      const cand = this.forceOfficers(fid).filter(o => o && !o.skill && !o.state?.grantSkill).sort((a, b) => (b.state?.merit ?? 0) - (a.state?.merit ?? 0))[0];
      if (cand) {
        cand.skill = sk; if (cand.state) cand.state.grantSkill = sk; // 저장 영속용
        this.log(`【연구】${josa(cand.name_ko, ['이','가'])} 연구 성과로 특기 「${sk}」${josa(sk, ['을','를']).slice(-1)} 습득했습니다!`, fid === this.playerForce);
      }
    }
    this.autosave();
    return true;
  }
  swearBrotherhood(cityId, idxs) { // 의형제 결연: 같은 도시·세력 무장 2~3명, 각 공적 500+, 세력 기교P 500 (설계안 55행 비용) · 충성 +10 (자체)
    idxs = [...new Set(idxs)];
    const c = this.cityById[cityId], f = this.forces[c?.force];
    if (!c || !f?.alive || this._blocked(c)) return false;
    if (idxs.length < 2 || idxs.length > 3 || idxs.some(i => !c.officers.includes(i))) return false;
    if (idxs.some(i => (this.officers[i]?.state?.merit ?? 0) < 500)) return false;
    if ((f.techP ?? 0) < 500) return false;
    f.techP -= 500;
    for (const i of idxs) {
      const st = this.officers[i].state ??= {};
      st.sworn = [...new Set([...(st.sworn ?? []), ...idxs.filter(x => x !== i)])];
      st.loyal = Math.min(100, (st.loyal ?? 70) + 10);
    }
    this.log(`【결연】${josa(idxs.map(i => this.officers[i].name_ko).join('·'), ['이','가'])} ${c.name_ko}에서 의형제를 맺었습니다! (기교P -500, 충성 +10)`, c.force === this.playerForce);
    this.autosave(); // 커맨드 직후 영속 (턴 종료 전 리로드 소실 방지)
    return true;
  }
  unitHasItemKind(u, kind) {
    for (const i of u.officers) for (const id of (this.officers[i]?.state?.items ?? [])) if (ITEMS.find(x => x.id === id)?.kind === kind) return true;
    return false;
  }
  startDuel(a, b) {
    const mk = (u) => ({ u, offs: [...u.officers], cur: 0, hp: 100, hpMap: {}, spirit: 0, stance: 'attack', streak: 0, lastStance: null });
    this.pendingDuel = { a: mk(a), b: mk(b), bout: 0, log: [], done: false };
    return this.pendingDuel;
  }
  duelOfficer(d, k) { const s = d[k]; return this.officers[s.offs[s.cur]]; }
  duelPolicy(d, k) { // AI 방침 (플레이어 위임 시에도 동일 적용)
    const s = d[k], ok = k === 'a' ? 'b' : 'a', opp = d[ok];
    const myWar = this.effWar(this.duelOfficer(d, k)), opWar = this.effWar(this.duelOfficer(d, ok));
    if (s.spirit >= 300) return { stance: s.stance, cmd: '무쌍' };
    if (s.spirit >= 200 && opp.hp < 45) return { stance: s.stance, cmd: '급소' };
    if (s.spirit >= 100 && opp.hp < 60) return { stance: s.stance, cmd: '필살기' };
    if (s.hp <= 25 && myWar < opWar - 10 && Math.random() < 0.4) return { stance: 'defense', cmd: this.unitHasItemKind(s.u, 'bow') ? '위퇴각' : '퇴각' };
    return { stance: s.spirit < 100 ? 'spirit' : (myWar >= opWar ? 'attack' : 'defense'), cmd: null };
  }
  duelTick(d, selA, selB) { // 1합 진행. sel = { stance: attack|defense|spirit|burst, cmd: 필살 커맨드|null }
    if (!d || d.done) return d;
    d.bout++;
    // 교체 출전: 현재 무장 위기(체력 30 이하) + 더 강한 무장이 남아 있으면 50% (설계안 교체 단순화, 자체 수치)
    for (const k of ['a', 'b']) {
      const s = d[k];
      if (s.hp <= 30 && s.cur < s.offs.length - 1) {
        const cur = this.officers[s.offs[s.cur]], nxt = this.officers[s.offs[s.cur + 1]];
        const assistP = this.isBonded(s.offs[s.cur], s.offs[s.cur + 1]) ? 0.75 : 0.5; // R12: 의형제·부부는 교체 참전 확률 상승 (설계안 113행, 자체 수치)
        if (this.effWar(nxt) > this.effWar(cur) + 5 && Math.random() < assistP) {
          s.hpMap[s.offs[s.cur]] = s.hp; s.cur++;
          s.hp = s.hpMap[s.offs[s.cur]] ?? 100; s.spirit = Math.round(s.spirit / 2);
          d.log.push(`${josa(nxt.name_ko, ['이','가'])} 교체 출전!`);
        }
      }
    }
    // 퇴각·위퇴각: 즉시 결판 시도
    for (const [k, sel, ok] of [['a', selA, 'b'], ['b', selB, 'a']]) {
      if (sel.cmd !== '퇴각' && sel.cmd !== '위퇴각') continue;
      const s = d[k], opp = d[ok];
      if (sel.cmd === '위퇴각' && !this.unitHasItemKind(s.u, 'bow')) continue; // 활 명품 필요 (설계안)
      let chance = 0.7 + (this.unitHasItemKind(s.u, 'horse') ? 0.2 : 0) - (this.unitHasItemKind(opp.u, 'horse') ? 0.2 : 0); // 명마: 도주 성공↑·적 도주 저지 (설계안)
      if (sel.cmd === '위퇴각') chance = 1;
      if (Math.random() < chance) {
        if (sel.cmd === '위퇴각') {
          const cnt = Math.round(8 + this.effWar(this.duelOfficer(d, k)) / 10);
          opp.hp -= cnt; d.log.push(`${this.duelOfficer(d, k).name_ko}의 위퇴각! 돌아서며 ${cnt} 대미지`);
        }
        d.fled = k; return this.finishDuel(d, 'flee');
      }
      s.spirit = Math.max(0, s.spirit - 30); d.log.push(`${this.duelOfficer(d, k).name_ko}의 도주 실패!`);
    }
    // 투지 상승 + 타격 산출 (동시)
    const side = (k, sel, ok) => {
      const s = d[k], opp = d[ok];
      const o = this.duelOfficer(d, k), oo = this.duelOfficer(d, ok);
      s.streak = s.lastStance === sel.stance ? s.streak + 1 : 1; s.lastStance = sel.stance; s.stance = sel.stance;
      const swordMul = this.unitHasItemKind(s.u, 'sword') ? 1.25 : 1; // 검 명품: 투지 상승률 +25% (설계안)
      s.spirit = Math.min(300, s.spirit + Math.round((sel.stance === 'spirit' ? 14 : 8) * swordMul));
      let mult = 1, note = null, vital = false;
      if (sel.cmd === '필살기' && s.spirit >= 100) { s.spirit -= 100; mult = 2.5; note = '필살기'; }
      else if (sel.cmd === '급소' && s.spirit >= 200) { s.spirit -= 200; mult = 3; note = '급소'; vital = true; }
      else if (sel.cmd === '무쌍' && s.spirit >= 300) { s.spirit = 0; mult = 4.5; note = '무쌍'; opp.spirit = 0; }
      else if (sel.cmd === '암기' && !s._hiddenUsed && this.unitHasItemKind(s.u, 'weapon')) { s._hiddenUsed = true; mult = 1.5; note = '암기'; opp.spirit = Math.max(0, opp.spirit - 50); }
      let dmg = Math.max(2, Math.round(4 + (this.effWar(o) - this.effWar(oo)) / 8));
      if (sel.stance === 'attack') dmg = Math.round(dmg * 1.3);
      else if (sel.stance === 'defense') dmg = Math.round(dmg * 0.65);
      else if (sel.stance === 'burst') {
        dmg = Math.round(dmg * 0.55);
        if (Math.random() < 0.15 + s.streak * 0.03) { dmg *= 3; note = note ? note + '·크리티컬' : '크리티컬'; } // 같은 방침 유지 시 크리티컬률 상승 (설계안)
      } else if (s.streak >= 3 && Math.random() < 0.1) { dmg *= 2; note = note ? note + '·크리티컬' : '크리티컬'; }
      dmg = Math.round(dmg * mult);
      if (opp.stance === 'defense') dmg = Math.round(dmg * 0.6);
      return { dmg, note, vital, name: o.name_ko };
    };
    const rA = side('a', selA, 'b'), rB = side('b', selB, 'a');
    d.b.hp -= rA.dmg; d.a.hp -= rB.dmg;
    if (rB.dmg > 0) d.a.spirit = Math.min(300, d.a.spirit + 6); // 피격 시 투지 상승 (설계안)
    if (rA.dmg > 0) d.b.spirit = Math.min(300, d.b.spirit + 6);
    if (rA.vital && d.b.hp > 0) { const vo = this.duelOfficer(d, 'b'); vo.state.injuredUntil = this.turn + 6; d.log.push(`${josa(vo.name_ko, ['이','가'])} 급소를 맞아 부상! (6턴간 무력 -20·출진 불가)`); }
    if (rB.vital && d.a.hp > 0) { const vo = this.duelOfficer(d, 'a'); vo.state.injuredUntil = this.turn + 6; d.log.push(`${josa(vo.name_ko, ['이','가'])} 급소를 맞아 부상! (6턴간 무력 -20·출진 불가)`); }
    if (rA.note) d.log.push(`${rA.name}의 ${rA.note}! ${rA.dmg} 대미지`);
    if (rB.note) d.log.push(`${rB.name}의 ${rB.note}! ${rB.dmg} 대미지`);
    if (!rA.note && !rB.note) d.log.push(`${d.bout}합: 공방 ${rA.dmg} / ${rB.dmg}`);
    if (d.a.hp <= 0 && d.b.hp <= 0) return this.finishDuel(d, 'draw');
    if (d.b.hp <= 0) return this.finishDuel(d, 'a');
    if (d.a.hp <= 0) return this.finishDuel(d, 'b');
    if (d.bout >= 50) return this.finishDuel(d, 'draw'); // 50합 무승부 (설계안)
    return d;
  }
  finishDuel(d, result) {
    d.done = true;
    if (result === 'a' || result === 'b') {
      const w = d[result], l = d[result === 'a' ? 'b' : 'a'];
      l.u.troops = Math.round(l.u.troops * 0.7);
      this.gainMerit(w.offs[w.cur], 40); this.gainTechP(w.u.force, 30);
      this.log(`【일기토】${josa(this.officers[w.offs[w.cur]].name_ko, ['이','가'])} ${this.officers[l.offs[l.cur]].name_ko}를 격파! ${l.u.label} 병력 -30%`, true);
    } else if (result === 'flee') {
      const f = d[d.fled];
      const home = this.forceCities(f.u.force).sort((p, q) => Math.hypot(p.lon - f.u.x, p.lat - f.u.z) - Math.hypot(q.lon - f.u.x, q.lat - f.u.z))[0];
      if (home) { const rp = this.findPath(f.u, home.lon, home.lat); if (rp) { f.u.targetCity = home.id; f.u.tx = home.lon; f.u.tz = home.lat; f.u.path = rp; } } // R17b
      this.log(`【일기토】${josa(this.officers[f.offs[f.cur]].name_ko, ['이','가'])} 물러났습니다`, f.u.force === this.playerForce);
    } else {
      this.log(`【일기토】${d.bout}합 무승부로 끝났습니다`, true);
    }
    this.pendingDuel = null;
    return d;
  }
  duelAuto(d) { let guard = 0; while (d && !d.done && guard++ < 200) this.duelTick(d, this.duelPolicy(d, 'a'), this.duelPolicy(d, 'b')); }
  // === R11: 설전 — 화술 카드 논전 (설계안 114행: 외교·등용 협상에서 발생, 논객 특기 강함 / 서적=모든 화술, 규칙·수치 자체) ===
  hasItemKindOff(idx, kind) { return (this.officers[idx]?.state?.items ?? []).some(id => ITEMS.find(x => x.id === id)?.kind === kind); }
  debateCards(idx) { // 사용 가능 화술: 서적 보유 시 전부 해금, 아니면 지력 요구 충족분 (자체 규칙)
    const o = this.officers[idx], book = this.hasItemKindOff(idx, 'book');
    const out = {};
    for (const [k, v] of Object.entries(DEBATE_CARDS)) if (book || (v.int ?? 0) <= (o?.int ?? 0)) out[k] = v;
    return out;
  }
  debateCardList() { return DEBATE_CARDS; }
  debateCardUsable(d, k, card) { const s = d[k]; return !!card && !s.seal && !!this.debateCards(s.o)[card] && (s.cds[card] ?? 0) <= 0; }
  startDebate(aIdx, bIdx, ctx) { return { a: { o: aIdx, hp: 100, cds: {}, seal: false }, b: { o: bIdx, hp: 100, cds: {}, seal: false }, bout: 0, log: [], done: false, winner: null, ctx }; }
  debatePolicy(d, k) { // AI 화술 선택 (플레이어 위임 시에도 동일 규칙)
    const s = d[k], o = d[k === 'a' ? 'b' : 'a'];
    const usable = c => this.debateCardUsable(d, k, c);
    if (s.hp <= 25 && usable('경청')) return '경청';
    if (usable('도발') && Math.random() < 0.3) return '도발';
    if (o.hp >= 40 && usable('반박') && Math.random() < 0.35) return '반박';
    if (usable('강변')) return '강변';
    return '질타';
  }
  debateTick(d, cardA, cardB) { // 1합 진행: 양측 화술 동시 공개
    if (d.done) return d;
    d.bout++;
    const name = s => this.officers[s.o].name_ko;
    const mult = s => (0.8 + (this.officers[s.o]?.int ?? 50) / 200) * (this.officers[s.o]?.skill === '논객' ? 1.25 : 1); // 지력 보정 + 논객 특기 +25% (자체)
    const okCard = (k, c) => { const s = d[k]; return c && this.debateCards(s.o)[c] && (s.cds[c] ?? 0) <= 0; };
    if (!okCard('a', cardA)) cardA = null;
    if (!okCard('b', cardB)) cardB = null;
    if (d.a.seal) { if (cardA) d.log.push(`${josa(name(d.a), ['은','는'])} 도발에 말려 화술을 쓰지 못했습니다`); cardA = null; d.a.seal = false; }
    if (d.b.seal) { if (cardB) d.log.push(`${josa(name(d.b), ['은','는'])} 도발에 말려 화술을 쓰지 못했습니다`); cardB = null; d.b.seal = false; }
    const defA = cardA ? DEBATE_CARDS[cardA] : null, defB = cardB ? DEBATE_CARDS[cardB] : null;
    let dmgA = 0, dmgB = 0; // dmgA: a가 b에게 주는 피해
    if (defA?.dmg) { if (cardB === '반박') { dmgB += Math.round(DEBATE_CARDS.반박.counter * mult(d.b)); d.log.push(`${name(d.b)}의 반박! ${name(d.a)}의 ${josa(cardA, ['을','를'])} 되돌림`); } else dmgA += Math.round(defA.dmg * mult(d.a)); }
    if (defB?.dmg) { if (cardA === '반박') { dmgA += Math.round(DEBATE_CARDS.반박.counter * mult(d.a)); d.log.push(`${name(d.a)}의 반박! ${name(d.b)}의 ${josa(cardB, ['을','를'])} 되돌림`); } else dmgB += Math.round(defB.dmg * mult(d.b)); }
    if (defA?.heal) { d.a.hp = Math.min(100, d.a.hp + defA.heal); d.log.push(`${name(d.a)}의 경청 (논리 +${defA.heal})`); }
    if (defB?.heal) { d.b.hp = Math.min(100, d.b.hp + defB.heal); d.log.push(`${name(d.b)}의 경청 (논리 +${defB.heal})`); }
    if (defA?.seal) { d.b.seal = true; d.log.push(`${name(d.a)}의 도발! ${name(d.b)}의 다음 화술 봉인`); }
    if (defB?.seal) { d.a.seal = true; d.log.push(`${name(d.b)}의 도발! ${name(d.a)}의 다음 화술 봉인`); }
    d.b.hp -= dmgA; d.a.hp -= dmgB;
    if (dmgA) d.log.push(`${name(d.a)}의 ${cardA} → ${dmgA} 피해`);
    if (dmgB) d.log.push(`${name(d.b)}의 ${cardB} → ${dmgB} 피해`);
    for (const [s, c] of [[d.a, cardA], [d.b, cardB]]) { for (const k of Object.keys(s.cds)) s.cds[k]--; if (c && DEBATE_CARDS[c]?.cd) s.cds[c] = DEBATE_CARDS[c].cd; }
    d.log.push(`${d.bout}합: ${name(d.a)} ${Math.max(0, d.a.hp)} / ${name(d.b)} ${Math.max(0, d.b.hp)}`);
    if (d.a.hp <= 0 || d.b.hp <= 0 || d.bout >= 15) this.finishDebate(d);
    return d;
  }
  finishDebate(d) { // 승패 적용: 제의측(a) 승리 시 협상 재심 성공, 패배 시 결렬·관계 -5, 15합 무승부 가능 (자체)
    d.done = true;
    const an = this.officers[d.a.o].name_ko, bn = this.officers[d.b.o].name_ko;
    let w = null;
    if (d.a.hp > 0 && d.b.hp <= 0) w = 'a';
    else if (d.b.hp > 0 && d.a.hp <= 0) w = 'b';
    else if (d.a.hp > 0 && d.b.hp > 0 && d.a.hp !== d.b.hp) w = d.a.hp > d.b.hp ? 'a' : 'b';
    d.winner = w;
    const ctx = d.ctx ?? {};
    if (w === 'a') {
      if (ctx.kind === 'alliance') { const dd = this.diploOf(ctx.fid, ctx.tid); dd.allianceUntil = this.turn + 24; this.log(`【설전】${josa(an, ['이','가'])} ${josa(bn, ['을','를'])} 논파! ${josa(this.forceName(ctx.fid), ['과','와'])} ${josa(this.forceName(ctx.tid), ['이','가'])} 24턴 동맹을 맺었습니다!`, true); }
      else if (ctx.kind === 'truce') { const dd = this.diploOf(ctx.fid, ctx.tid); dd.truceUntil = this.turn + 12; const v = this.changeRelation(ctx.fid, ctx.tid, 30); this.log(`【설전】${josa(an, ['이','가'])} ${josa(bn, ['을','를'])} 논파! 정전 성립 (12턴간 공격 금지, 관계 → ${v})`, true); }
      else if (ctx.kind === 'recruit') { const c = this.cityById[ctx.cityId], t = this.officers[ctx.officerIdx]; if (c && t?.state && t.state.force == null) { t.state.status = 'serving'; t.state.force = c.force; if (!c.officers.includes(t.idx)) c.officers.push(t.idx); this.gainMerit(d.a.o, MERIT.recruit); this.log(`【설전】${an}의 설파 끝에 ${josa(t.name_ko, ['이','가'])} 【${this.forceName(c.force)}】에 등용되었습니다! (${c.name_ko})`, true); } }
    } else if (w === 'b') {
      if (ctx.kind === 'alliance' || ctx.kind === 'truce') { const v = this.changeRelation(ctx.fid, ctx.tid, -5); this.log(`【설전】${josa(bn, ['이','가'])} ${josa(an, ['을','를'])} 논파 — 협상 결렬 (관계 → ${v} ${this.relStage(v)})`, ctx.fid === this.playerForce || ctx.tid === this.playerForce); }
      else this.log(`【설전】${josa(bn, ['이','가'])} ${josa(an, ['을','를'])} 논파 — 등용 결렬`, ctx.fid === this.playerForce);
    } else this.log(`【설전】${an} vs ${bn} — ${d.bout}합 무승부`, ctx.fid === this.playerForce || ctx.tid === this.playerForce);
    this.pendingDebate = null;
    return d;
  }
  debateAuto(d) { let guard = 0; while (d && !d.done && guard++ < 100) this.debateTick(d, this.debatePolicy(d, 'a'), this.debatePolicy(d, 'b')); }
  tryDebate(ctx) { // 협상 결렬 시 30% 설전 발동 (자체 확률). 제의측 지력 최고 무장 vs 상대측 지력 최고 무장 (등용은 사자 vs 대상 무장)
    const c = this.cityById[ctx.cityId];
    let aIdx = null, bIdx = null;
    if (ctx.kind === 'recruit') {
      aIdx = (c?.officers ?? []).slice().sort((x, y) => (this.officers[y]?.int ?? 0) - (this.officers[x]?.int ?? 0))[0] ?? null;
      bIdx = ctx.officerIdx;
    } else {
      aIdx = (c?.officers ?? []).slice().sort((x, y) => (this.officers[y]?.int ?? 0) - (this.officers[x]?.int ?? 0))[0] ?? null;
      bIdx = Object.values(this.officers).filter(o => o.state?.force === ctx.tid).sort((x, y) => y.int - x.int)[0]?.idx ?? null;
    }
    if (aIdx == null || bIdx == null) return false;
    if (Math.random() >= 0.3) return false;
    const d = this.startDebate(aIdx, bIdx, ctx);
    this.log(`【설전】${this.officers[aIdx].name_ko} vs ${this.officers[bIdx].name_ko} — 설전 시작!`, ctx.fid === this.playerForce || ctx.tid === this.playerForce);
    if ((ctx.fid !== this.playerForce && ctx.tid !== this.playerForce) || this.delegated) this.debateAuto(d); // AI끼리·위임 시 같은 규칙으로 자동 진행
    else this.pendingDebate = d;
    return true;
  }
  autosave() {
    try {
      const data = {
        scenId: this.scenId, year: this.year, month: this.month, dan: this.dan, turn: this.turn, emperor: this.emperor, // R17: 옹립 상태 영속 (구 세이브는 생성자 기본값으로 복원)
        cities: this.cities, forces: this.forces, units: this.units, nextUnitId: this.nextUnitId, fieldFacs: this.fieldFacs, nextFacId: this.nextFacId,
        playerForce: this.playerForce, delegated: this.delegated, deadAck: this.deadAck, logs: this.logs.slice(-60), diplo: this.diplo, itemPool: this.itemPool, chronicle: this.chronicle, over: this.over, unified: this.unified, // R14
        officerStates: Object.fromEntries(Object.entries(this.officers).filter(([,o]) => o.state).map(([i,o]) => [i, o.state])),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) { /* 용량 초과 등 무시 */ }
  }
}
export function josaRo(name) { const code = String(name).charCodeAt(String(name).length-1); const jong = (code >= 0xAC00 && code <= 0xD7A3) ? (code-0xAC00)%28 : 0; return name + (jong && jong !== 8 ? '으로' : '로'); } // (으)로: 받침 없음·ㄹ받침은 '로'
export function josa(name, pair) { // [을,를] 형태
  const code = name.charCodeAt(name.length-1);
  const jong = (code >= 0xAC00 && code <= 0xD7A3) ? (code-0xAC00)%28 : 0;
  return name + (jong ? pair[0] : pair[1]);  }
