// 진입점: 화면 전환·UI·지도 연결
import { Map3D, toWorld } from './map3d.js?v=r181';
import { Game, SAVE_KEY, RULES, forceColor, UNIT_TYPES, ARTS, OFFICES, restoreOfficer, FIELD_FACS, TRAPS, SHIP_TYPES, TAC_SHIP_OK, josa, josaRo, TECH_BRANCHES, TECH_P, TECH_GOLD, TECH_DESC, FACILITIES, ITEMS, SIEGE_BUILD, SHIP_BUILD, ARMS_BUILD, AB_BRANCHES, AB_P, AB_SKILL, AB_PICK } from './game.js?v=r181';
import { aiThink } from './ai.js?v=r181';

const $ = id => document.getElementById(id);
let DATA = null, game = null, map = null, selectedUnit = null, autoTimer = null, pendingFire = null; // R15: 직접 전법·계략 대기

const BUILD_ID = 'r181'; // 빌드 ID (index.html의 meta[name=build]와 같아야 함 - 오래된 캐시된 index와 새 스크립트의 혼합 감지)
function checkBuildSkew() {
  const idx = document.querySelector('meta[name="build"]')?.content;
  if (idx === BUILD_ID) { sessionStorage.removeItem('cheonha-xi-web.skew'); return; } // 일치하면 재시도 표식 해제
  const tried = sessionStorage.getItem('cheonha-xi-web.skew');
  if (!tried) { sessionStorage.setItem('cheonha-xi-web.skew', '1'); location.replace(location.pathname + '?fresh=' + Date.now()); return; } // 1회만 자동 새로고침
  const b = document.createElement('div'); b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99;background:#7a2b2b;color:#fff;padding:8px;text-align:center;font-size:14px';
  b.textContent = '게임 파일 버전이 서로 맞지 않습니다. 브라우저 캐시를 지우고 새로고침해 주세요.'; document.body.appendChild(b);
}
checkBuildSkew();
async function loadData() {
  const [officers, skills, portraits, s184, s190, s251] = await Promise.all(
    ['data/officers670.json','data/skills.json','data/portraits.json','data/scenario-184.json','data/scenario-190.json','data/scenario-251.json']
      .map(u => fetch(u + '?v=r181').then(r => r.json())));
  const byIdx = {};
  for (const o of officers) byIdx[o.idx] = o;
  DATA = { officers: byIdx, skills, portraits, scenarios: { '184': s184, '190': s190, '251': s251 } };
}
function portraitCss(idx) {  // 아틀라스 배경 스타일 (sheet 8x8 타일)
  const m = DATA.portraits.map[String(idx)];
  if (!m) return `background-image:url('portraits/placeholder.svg');background-size:cover;`;
  const [sh, c, r] = m, n = DATA.portraits.cols - 1;
  return `background-image:url('portraits-atlas/sheet-${sh}.jpg');background-size:${DATA.portraits.cols*100}% ${DATA.portraits.cols*100}%;background-position:${c/n*100}% ${r/n*100}%;`;
}
function skillKo(k) { return k || '없음'; }  // 특기는 자체 한글 명칭, 설명은 data/skills.json

// === 화면 전환 ===
function show(id) {
  for (const s of ['screen-title','screen-scenario','screen-ruler','screen-game']) $(s).classList.add('hidden');
  $(id).classList.remove('hidden');
}
function buildScenarioScreen() {
  const el = $('scenario-list'); el.innerHTML = '';
  const meta = {
    '184': ['황건의 난', '184년 — 태평도의 봉기, 한실의 몰락이 시작된다'],
    '190': ['반동탁연합', '190년 — 동탁의 폭정에 맞서 제후들이 연합하다'],
    '251': ['영웅집결', '251년 — 시대의 영웅들이 한자리에 모인 가상 시나리오'],
  };
  for (const [id, [name, desc]] of Object.entries(meta)) {
    const s = DATA.scenarios[id];
    const card = document.createElement('div'); card.className = 'card';
    card.innerHTML = `<h3>${name}</h3><p>${desc}</p><p class="stat">세력 ${s.forces.length} · 등장 무장 ${s.officers.filter(o=>['ruler','taesu','serving'].includes(o.status)).length} · 재야 ${s.officers.filter(o=>o.status==='free').length}</p>`;
    card.onclick = () => { buildRulerScreen(id); show('screen-ruler'); };
    el.appendChild(card);
  }
}
function buildRulerScreen(scenId) {
  const s = DATA.scenarios[scenId];
  $('ruler-title').textContent = `군주 선택 — ${scenId}년`;
  const el = $('ruler-list'); el.innerHTML = '';
  const sorted = [...s.forces].sort((a,b) => b.cities.length - a.cities.length || b.officers.length - a.officers.length);
  for (const f of sorted) {
    const r = DATA.officers[f.ruler];
    const card = document.createElement('div'); card.className = 'card';
    const cities = f.cities.map(c => s.cities[c].name_ko).join('·');
    card.innerHTML = `<h3>${r.name_ko}</h3><p>통솔${r.ldr} 무력${r.war} 지력${r.int} 정치${r.pol} 매력${r.chr} · 특기 ${skillKo(r.skill)}</p><p class="stat">도시 ${f.cities.length} (${cities}) · 무장 ${f.officers.length}명</p>`;
    card.onclick = () => startGame(scenId, f.id);
    el.appendChild(card);
  }
}

// === 게임 시작 ===
function startGame(scenId, fid) {
  game = new Game(DATA.scenarios[scenId], DATA.officers, DATA.skills, fid);
  window.__game = game; // 테스트 훅
  enterGame();
  game.log(`${josaRo(DATA.officers[game.forces[fid].ruler].name_ko)} ${scenId}년 시나리오를 시작합니다.`, true);
  const cap = game.forceCities(fid)[0];
  if (cap) map.focusCity(cap);
  refreshAll();
}
function enterGame() {
  game.onSaveStatus = refreshSaveNotice;
  show('screen-game');
  if (!map) {
    map = new Map3D($('map-canvas'));
    window.__map = map;
    game.renderedWaterFn = (lon, lat) => { const [x, z] = toWorld(lon, lat); return map.levels ? map.levelAtWorld(x, z) === 0 : true; }; // R64: 수군 출진 위치·연안 판정을 렌더러 지형과 일치시키는 주입 훅
    map.cityColorOf = f => forceColor(f); // R116: 성 기치 천 세력색
    map.onPick = onPick;
    (function loop() { map.render(); requestAnimationFrame(loop); })();
  }
  game.forestFn = (lon, lat) => map.forestAtLL(lon, lat);
  game.mountainFn = (lon, lat) => map.mountainAtLL(lon, lat); // 간도(산악 샛길)
  map.syncScenario(game.cities);
  map.cityGroup.clear(); map.cityMeshes = {};
  map.unitGroup.clear(); map.unitMeshes = {};
  for (const c of game.cities) map.addCity(c, c.force != null ? forceColor(c.force) : '#777777');
}
function refreshAll() {
  for (const c of game.cities) map.setCityColor(c.id, c.force != null ? forceColor(c.force) : '#777777');
  for (const u of game.units) {
    if (!(game.delegated || u.force === game.playerForce || game.inVision(u.x, u.z))) { // R14: 시야 밖 적 부대 비표시
      if (map.unitMeshes[u.id]) map.removeUnit(u.id);
      continue;
    }
    if (!map.unitMeshes[u.id]) map.addUnit(worldUnit(u), forceColor(u.force));
    else map.updateUnit(worldUnit(u), forceColor(u.force));
  }
  for (const id of Object.keys(map.unitMeshes)) if (!game.units.find(u => u.id == id)) map.removeUnit(id);
  map.syncFieldFacs?.((game.fieldFacs ?? []).filter(f => game.delegated || f.force === game.playerForce || (!TRAPS.hasOwnProperty(f.type) && game.inVision(f.x, f.z))).map(f => { const [x, z] = toWorld(f.x, f.z); return { id: f.id, type: f.type, x, z, color: forceColor(f.force), done: f.left <= 0 }; })); // R26: 야전 시설
  map.syncCityFacs?.(game.cities.filter(c => game.cityVisible(c)).map(c => { const [x, z] = toWorld(c.lon, c.lat); return { cityId: c.id, x, z, facs: (c.facilities ?? []).map(f => ({ type: f.type, done: !!f.done, level: f.level ?? 1 })) }; })); // R135: 도시 내정 시설 지도 표시 (시야 기준은 도시 상세와 동일)
  map.setSeason?.(game.month); // R16: 사계절 표현
  refreshHud(); refreshLog();
  game.autosave(); // R13 회귀 방지: UI에서 실행한 모든 커맨드는 실행 직후 영속 (턴 종료 전 리로드 소실 방지)
}
function refreshSaveNotice() {
 let el=$('save-notice');if(!el){el=document.createElement('div');el.id='save-notice';el.setAttribute('role','status');el.style.cssText='position:fixed;bottom:10px;left:10px;right:10px;z-index:1100;background:#4b211c;color:#fff;padding:12px;border:1px solid #f99;border-radius:6px;font-size:14px';document.body.append(el)}
 el.replaceChildren();el.hidden=!game?.saveFailed;if(el.hidden)return;
 const text=document.createElement('span');text.textContent='저장하지 못했습니다. 현재 진행은 이 화면에만 있습니다. 새로고침하거나 닫지 마세요. ';const b=document.createElement('button');b.textContent='저장 다시 시도';b.onclick=()=>{game.autosave();refreshSaveNotice()};el.append(text,b);
}
function saveAndTitle() {if(game?.autosave()){location.reload();return}refreshSaveNotice();modal('저장하지 못해 타이틀로 이동하지 않았습니다. 이 화면을 유지하고 저장을 다시 시도하세요.',[['계속',()=>{}]])}
function worldUnit(u) { const [x, z] = toWorld(u.x, u.z); return { id: u.id, x, z, label: u.label, type: u.type }; } // R16: 병종별 모델용 type
function refreshOpenPanel() { // R130: 일기토·설전·수신 외교 결정 후 열린 패널 정체 방지 (관계 수치 미갱신 관측 결함 수정) — 턴 종료 후속(R108)과 같은 기준으로 현재 보기만 다시 그림
  const p = $('panel');
  if (p.classList.contains('hidden')) return;
  if (p.dataset.view === 'unit') {
    if (selectedUnit != null && game.units.find(x => x.id === selectedUnit)) showUnitPanel(selectedUnit);
    else { p.classList.add('hidden'); selectedUnit = null; }
    return;
  }
  if (p.dataset.view === 'dispatch') { p.refreshDispatch?.(); return; }
  if (p.dataset.view === 'move') { p.refreshMove?.(); return; }
  if (p.dataset.view === 'trade') { p.refreshTrade?.(); return; }
  if (p.dataset.view === 'tech') { showTech(); return; } // R156: 연구는 입력폼 없음, 자원·가능상태와 스크롤 갱신
  const c = lastCityId != null ? game.cityById[lastCityId] : null;
  if (!c) return;
  const st = p.scrollTop;
  if (p.dataset.view === 'advisor') showAdvisor(c);
  else if (p.dataset.view === 'diplo') showDiplomacy(c);
  else if (p.dataset.view === 'city') showCityPanel(c);
  else if (p.dataset.view === 'facilities') showFacilities(c);
  else if (p.dataset.view === 'arms') showArms(c);
  else return; // 출진 등 입력 중 하위 화면은 덮지 않음 (R108과 동일 기준)
  p.scrollTop = st;
}
function refreshHud() {
  document.documentElement.style.setProperty('--hud-h', ($('hud-top').offsetHeight + 6) + 'px'); // R14: 패널 상단을 실제 HUD 높이 아래로
  const f = game.forces[game.playerForce];
  $('hud-date').textContent = `${game.year}년 ${game.month}월 ${['상','중','하'][game.dan-1]}순 (${game.turn}턴)`;
  const rank = game.playerForce != null && f?.alive ? game.forceRank(game.playerForce) : null;
  $('hud-force').textContent = game.playerForce != null && f?.alive ? `【${game.forceName(game.playerForce)}】${rank ? ' ' + rank : ''}${game.delegated ? ' (위임 중)' : ''}` : '관전 중';
  $('hud-ap').textContent = f?.alive ? `행동력 ${f.ap} · 기교P ${f.techP ?? 0}` : '';
  $('hud-gold').textContent = f?.alive ? `금 ${game.totalGold(game.playerForce)}` : '';
  $('hud-food').textContent = f?.alive ? `병량 ${game.totalFood(game.playerForce)}` : '';
  $('btn-endturn').disabled = game.delegated || game.over;
  $('btn-delegate').textContent = game.delegated ? '직접 지휘' : '위임';
  $('hud-speed').classList.toggle('hidden', !game.delegated);
}
// === R19: 자체 합성 음향 (WebAudio, 외부 에셋 없음 - CC-BY 해당 없음). 기본 음소거, 토글, 설정 저장 ===
const SND_KEY = 'cheonha-xi-web.sound.v1';
let sndOn = false; try { sndOn = localStorage.getItem(SND_KEY) === '1'; } catch (e) {}
let actx = null, musicTimer = null, sndLogN = 0, musicStep = 0;
function sndCtx() { if (!actx) { const C = window.AudioContext || window.webkitAudioContext; if (C) actx = new C(); } if (actx && actx.state === 'suspended') actx.resume(); return actx; }
function tone(f, t0, dur, type = 'sine', vol = 0.06) {
  const c = sndCtx(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, c.currentTime + t0);
  g.gain.setValueAtTime(0.0001, c.currentTime + t0);
  g.gain.exponentialRampToValueAtTime(vol, c.currentTime + t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t0 + dur);
  o.connect(g); g.connect(c.destination); o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + dur + 0.05);
}
function sfx(kind) {
  if (!sndOn) return;
  if (kind === 'hit') { tone(160, 0, 0.18, 'sawtooth', 0.07); tone(90, 0.03, 0.2, 'square', 0.05); }
  else if (kind === 'strat') { tone(660, 0, 0.12, 'triangle'); tone(880, 0.1, 0.18, 'triangle'); }
  else if (kind === 'duel') { tone(220, 0, 0.1, 'square', 0.06); tone(330, 0.12, 0.1, 'square', 0.06); tone(440, 0.24, 0.2, 'square', 0.06); }
  else if (kind === 'city') { [392, 494, 587, 784].forEach((f, i) => tone(f, i * 0.12, 0.25, 'triangle', 0.07)); }
  else if (kind === 'turn') { tone(330, 0, 0.1, 'sine', 0.04); }
}
function musicTick() { // 오음계(궁상각치우) 느린 선율 - 자체 작곡 (결정적 패턴)
  if (!sndOn) return;
  const scale = [262, 294, 330, 392, 440, 524], pat = [0, 2, 3, 2, 4, 3, 1, 2, 0, 3, 5, 3, 2, 1, 0, 1];
  tone(scale[pat[musicStep % pat.length]] / 2, 0, 1.6, 'sine', 0.025); musicStep++;
}
function applySound() {
  const b = document.getElementById('btn-sound'); if (b) { b.textContent = sndOn ? '음향 켬' : '음향 끔'; b.setAttribute('aria-pressed', sndOn ? 'true' : 'false'); }
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  if (sndOn) { sndCtx(); musicTimer = setInterval(musicTick, 1800); }
}
document.addEventListener('pointerdown', () => { if (sndOn) sndCtx(); }, { passive: true }); // 자동재생 정책: 저장된 '켬'은 첫 사용자 입력 시 AudioContext 재개
function toggleSound() { sndOn = !sndOn; try { localStorage.setItem(SND_KEY, sndOn ? '1' : '0'); } catch (e) {} applySound(); if (sndOn) sfx('strat'); }
function sndScanLogs() { // 새 로그 종류별 효과음 (켜져 있을 때만)
  if (!game) return;
  const L = game.logs; if (L.length < sndLogN) sndLogN = 0;
  const fresh = L.slice(sndLogN); sndLogN = L.length;
  if (!sndOn || !fresh.length) return;
  const m = fresh.map(l => l.msg).join('\n');
  if (/함락/.test(m)) sfx('city'); else if (/일기토|설전/.test(m)) sfx('duel'); else if (/【전법】/.test(m)) sfx('hit'); else if (/【계략】/.test(m)) sfx('strat');
}
function refreshLog() {
  sndScanLogs();
  const el = $('logbox');
  el.innerHTML = game.logs.slice(-30).map(l => `<div class="${l.mine?'me':''}">[${l.t}] ${l.msg}</div>`).join('');
  el.scrollTop = el.scrollHeight;
}

// === 턴·자동 진행 ===
function doTurn() {
  if (!game || game.over) return;
  if ((game.pendingDiplo ?? []).length) { game.log('보류 중인 외교 제안을 먼저 결정해 주세요', true); refreshLog(); showDiploIn(); return; } // R123: 보류 중 턴 진행 불가 — 결정 모달 재표시
  game.endTurn(aiThink);
  refreshAll();
  if (selectedUnit != null && !$('panel').classList.contains('hidden')) { // 턴 처리 후 열려 있는 부대 패널 갱신 (건설 완료·병력·기력 반영)
    if (game.units.find(x => x.id === selectedUnit)) showUnitPanel(selectedUnit); else { $('panel').classList.add('hidden'); selectedUnit = null; }
  } else if ($('panel').dataset.view === 'city' && lastCityId != null && !$('panel').classList.contains('hidden')) { // R108: 열려 있는 도시 패널(기본 화면)도 턴 반영 — 병력·로스터 정체 방지. 스크롤 위치는 유지하고, 출진·기교 등 하위 화면의 입력 중인 상태는 덮지 않음
    const c = game.cityById[lastCityId];
    if (c) { const p = $('panel'), st = p.scrollTop; showCityPanel(c); p.scrollTop = st; }
    else { $('panel').classList.add('hidden'); lastCityId = null; }
  }
  if ($('panel').dataset.view === 'facilities' && !$('panel').classList.contains('hidden')) {
    const c = game.cityById[Number($('panel').dataset.city)];
    if (c && c.force === game.playerForce) { const st = $('panel').scrollTop; showFacilities(c); $('panel').scrollTop = st; }
    else $('panel').classList.add('hidden');
  }
  if ($('panel').dataset.view === 'advisor' && lastCityId != null && !$('panel').classList.contains('hidden')) {
    const c = game.cityById[lastCityId];
    if (c?.force === game.playerForce) showAdvisor(c); else $('panel').classList.add('hidden');
  }
  if ($('panel').dataset.view === 'dispatch' && !$('panel').classList.contains('hidden')) $('panel').refreshDispatch?.();
  if ($('panel').dataset.view === 'move' && !$('panel').classList.contains('hidden')) $('panel').refreshMove?.();
  if ($('panel').dataset.view === 'trade' && !$('panel').classList.contains('hidden')) $('panel').refreshTrade?.();
  if ($('panel').dataset.view === 'diplo' && !$('panel').classList.contains('hidden')) {
    const c=game.cityById[lastCityId];
    if(c?.force===game.playerForce){const st=$('panel').scrollTop;showDiplomacy(c);$('panel').scrollTop=st;}else $('panel').classList.add('hidden');
  }
  if ($('panel').dataset.view === 'arms' && !$('panel').classList.contains('hidden')) { const c=game.cityById[lastCityId]; if(c?.force===game.playerForce)showArms(c);else $('panel').classList.add('hidden'); }
  if ($('panel').dataset.view === 'tech' && !$('panel').classList.contains('hidden')) showTech(); // R156: 턴 후 연구비·기교P·가능상태 갱신, showTech가 스크롤 보존
  checkGameOver();
  if (game.pendingDuel) showDuel(); // R10: 일기토 모달
  if (game.pendingDebate) showDebate(); // R11: 설전 모달
  if ((game.pendingDiplo ?? []).length) showDiploIn(); // R123: 턴 처리 중 도착한 수신 외교 제안
}

// === R123: 수신 외교 제안 결정 모달 (보류 큐 FIFO — 한 턴 복수 제의도 순서대로 명시 결정) ===
function showDiploIn() {
  const it = (game.pendingDiplo ?? [])[0]; if (!it) return;
  const fn = game.forceName(it.fid);
  const desc = {
    alliance: `<b>${fn}</b>의 <b>동맹 제의</b>가 도착했습니다.<br>수락하면 24턴간 서로 공격할 수 없습니다.`,
    truce: `<b>${fn}</b>의 <b>정전 요청</b>이 도착했습니다.<br>수락하면 12턴간 공격이 금지되고 관계가 개선됩니다.`,
    surrender: `<b>${fn}</b>의 <b>항복 권고</b>가 도착했습니다.<br><span style="color:#e07070">수락하면 우리 세력 전체(도시·부대·무장)가 ${fn}에 흡수되어 플레이 세력을 잃습니다.</span>`,
    aid: `<b>${fn}</b>의 <b>원군 요청</b>이 도착했습니다.<br>수락하면 ${game.cityById[it.srcId]?.name_ko ?? '우리 도시'}의 병력 <b>3000</b>을 지원합니다.`,
    envoy: `<b>${fn}</b>의 <b>친선 사절</b>이 도착했습니다.<br>받으면 관계가 +${it.gain} 개선됩니다.`,
  }[it.kind] ?? `<b>${fn}</b>의 외교 제안이 도착했습니다.`;
  const q = (game.pendingDiplo ?? []).length;
  modal(`${desc}${q > 1 ? `<br><span class="st">외교 제안 ${q}건 대기 중 — 도착 순서대로 결정합니다.</span>` : ''}`, [
    ['수락', () => { game.resolveDiplo(it.id, true); afterDiplo(); }],
    ['거절', () => { game.resolveDiplo(it.id, false); afterDiplo(); }],
  ]);
}
function afterDiplo() { // 결정 후속: 로그·HUD 갱신 → 거절에 상대가 설전 도전하면 설전 모달 → 남은 제안 이어서
  refreshLog(); refreshHud(); refreshOpenPanel();
  if (game.pendingDebate) { showDebate(); return; }
  if ((game.pendingDiplo ?? []).length) { showDiploIn(); return; }
  refreshAll(); checkGameOver(); // 항복 수락 등으로 세력이 사라졌다면 필수 선택을 즉시 표시
}
// === R10: 일기토 모달 (클릭당 1합 — 실시간은 모달 특성상 수동 진행으로 단순화) ===
function showDuel() {
  const d = game.pendingDuel; if (!d) return;
  const m = $('modal'); m.classList.remove('hidden');
  const pk = d.a.u.force === game.playerForce ? 'a' : 'b', ek = pk === 'a' ? 'b' : 'a';
  const STANCES = [['attack', '공격 중시'], ['defense', '방어 중시'], ['spirit', '투지 중시'], ['burst', '일발 중시']];
  const CMDS = [['필살기', 100], ['급소', 200], ['무쌍', 300], ['암기', 0], ['퇴각', 0], ['위퇴각', 0]];
  const render = () => {
    const P = d[pk], E = d[ek];
    const po = game.duelOfficer(d, pk), eo = game.duelOfficer(d, ek);
    const bar = (v, max, color) => `<span style="display:inline-block;width:120px;height:10px;background:#333;vertical-align:middle"><span style="display:block;width:${Math.max(0, Math.min(100, v / max * 100))}%;height:100%;background:${color}"></span></span>`;
    const cmdBtn = ([name, need]) => {
      let ok = P.spirit >= need;
      if (name === '암기') ok = ok && !P._hiddenUsed && game.unitHasItemKind(P.u, 'weapon');
      if (name === '위퇴각') ok = ok && game.unitHasItemKind(P.u, 'bow');
      return `<button class="cmd duel-cmd" data-c="${name}" ${ok ? '' : 'disabled'}>${name}${need ? ` (투지${need})` : ''}</button>`;
    };
    m.innerHTML = `<div class="box" style="min-width:420px">
      <h3 style="color:#f66;text-align:center">일기토 (${d.bout}합)</h3>
      <p style="text-align:center;margin:4px 0"><span class="pimg" style="${portraitCss(po.idx)};display:inline-block;width:64px;height:64px;border:2px solid #d44;border-radius:4px;vertical-align:middle"></span> <b style="font-size:20px;color:#f66;vertical-align:middle"> VS </b> <span class="pimg" style="${portraitCss(eo.idx)};display:inline-block;width:64px;height:64px;border:2px solid #47d;border-radius:4px;vertical-align:middle"></span><br><b>${po.name_ko}</b> vs <b>${eo.name_ko}</b></p>
      <p>${po.name_ko} 체력 ${bar(P.hp, 100, '#d44')} ${Math.max(0, P.hp)} · 투지 ${bar(P.spirit, 300, '#4a7fd4')} ${P.spirit}<br>
      ${eo.name_ko} 체력 ${bar(E.hp, 100, '#d44')} ${Math.max(0, E.hp)} · 투지 ${bar(E.spirit, 300, '#4a7fd4')} ${E.spirit}</p>
      <p style="font-size:12px;color:#cbB;min-height:54px">${d.log.slice(-3).join('<br>')}</p>
      <p>방침: ${STANCES.map(([s, n]) => `<button class="cmd duel-stance" data-s="${s}" ${P.stance === s ? 'style="border-color:#ffd700"' : ''}>${n}</button>`).join(' ')}</p>
      <p>필살: ${CMDS.map(cmdBtn).join(' ')}</p>
      <p><button class="cmd" id="duel-go">합 진행</button> <button class="cmd" id="duel-auto">위임 (자동)</button></p></div>`;
    let selStance = P.stance, selCmd = null;
    m.querySelectorAll('.duel-stance').forEach(b => b.onclick = () => { selStance = b.dataset.s; m.querySelectorAll('.duel-stance').forEach(x => x.style.borderColor = ''); b.style.borderColor = '#ffd700'; });
    const playerTick = sel => game.duelTick(d, pk === 'a' ? sel : game.duelPolicy(d, 'a'), pk === 'a' ? game.duelPolicy(d, 'b') : sel); // 플레이어 선택은 플레이어 측(pk)에 배정
    m.querySelectorAll('.duel-cmd').forEach(b => b.onclick = () => { selCmd = b.dataset.c; playerTick({ stance: selStance, cmd: selCmd }); after(); });
    $('duel-go').onclick = () => { playerTick({ stance: selStance, cmd: null }); after(); };
    $('duel-auto').onclick = () => { game.duelAuto(d); after(); };
  };
  const after = () => {
    if (game.pendingDuel) render();
    else { m.classList.add('hidden'); refreshAll(); refreshOpenPanel(); checkGameOver(); }
  };
  render();
}
function showSwear(c) { // R12: 의형제 결연 모달
  const m = $('modal'); m.classList.remove('hidden');
  const eligible = c.officers.filter(i => (DATA.officers[i]?.state?.merit ?? 0) >= 500);
  const techP = game.forces[c.force]?.techP ?? 0;
  const render = sel => {
    m.innerHTML = `<div class="box" style="min-width:380px">
      <h3 style="color:#fd7">의형제 결연 — ${c.name_ko}</h3>
      <p style="font-size:12px">공적 500 이상 무장 2~3명 선택 · 세력 기교P 500 소비 (보유 ${techP}) · 결연 무장 충성 +10 · 같은 부대 공·방 +10%, 일기토 교체 지원 상승</p>
      ${eligible.length ? eligible.map(i => { const o = DATA.officers[i]; return `<p><label><input type="checkbox" class="swear-pick" data-i="${i}" ${sel.has(i) ? 'checked' : ''}> ${o.name_ko} (공적 ${o.state?.merit ?? 0}${game.relOf(i).sworn.length ? ' · 이미 결연: ' + game.relOf(i).sworn.map(x => DATA.officers[x]?.name_ko).join('·') : ''})</label></p>`; }).join('') : '<p>조건을 갖춘 무장이 없습니다 (공적 500 필요)</p>'}
      <p><button class="cmd" id="swear-ok" ${sel.size >= 2 && sel.size <= 3 && techP >= 500 ? '' : 'disabled'}>결연 맺기</button> <button class="cmd" id="swear-cancel">취소</button></p></div>`;
    m.querySelectorAll('.swear-pick').forEach(cb => cb.onchange = () => { const i = Number(cb.dataset.i); cb.checked ? sel.add(i) : sel.delete(i); render(sel); });
    $('swear-ok').onclick = () => { if (game.swearBrotherhood(c.id, [...sel])) { m.classList.add('hidden'); refreshAll(); showCityPanel(c); } };
    $('swear-cancel').onclick = () => { m.classList.add('hidden'); };
  };
  render(new Set());
}
function showDebate() { // R11: 설전 모달
  const d = game.pendingDebate; if (!d) return;
  const m = $('modal'); m.classList.remove('hidden');
  const pk = d.ctx?.fid === game.playerForce ? 'a' : (d.ctx?.tid === game.playerForce ? 'b' : 'a'), ek = pk === 'a' ? 'b' : 'a'; // 제의측/대상측 세력으로 플레이어 측 판정
  const render = () => {
    const P = d[pk], E = d[ek];
    const po = game.officers[P.o], eo = game.officers[E.o];
    const bar = (v, max, color) => `<span style="display:inline-block;width:120px;height:10px;background:#333;vertical-align:middle"><span style="display:block;width:${Math.max(0, Math.min(100, v / max * 100))}%;height:100%;background:${color}"></span></span>`;
    const ctxName = { alliance: '동맹 제의', truce: '정전 요청', recruit: '등용' }[d.ctx?.kind] ?? '협상';
    const cardBtn = c => {
      const owned = !!game.debateCards(P.o)[c];
      const ok = game.debateCardUsable(d, pk, c);
      const cd = (P.cds[c] ?? 0) > 0 ? ` (쿨 ${P.cds[c]})` : '';
      return `<button class="cmd debate-card" data-c="${c}" ${ok ? '' : 'disabled'}>${c}${cd}${owned ? '' : ' 🔒'}</button>`;
    };
    m.innerHTML = `<div class="box" style="min-width:420px">
      <h3 style="color:#6cf;text-align:center">설전 (${d.bout}합) <span style="font-size:12px;color:#aaa">${ctxName}</span></h3>
      <p style="text-align:center;margin:4px 0"><span class="pimg" style="${portraitCss(P.o)};display:inline-block;width:64px;height:64px;border:2px solid #47d;border-radius:4px;vertical-align:middle"></span> <b style="font-size:20px;color:#6cf;vertical-align:middle"> VS </b> <span class="pimg" style="${portraitCss(E.o)};display:inline-block;width:64px;height:64px;border:2px solid #d44;border-radius:4px;vertical-align:middle"></span><br><b>${po.name_ko}</b> vs <b>${eo.name_ko}</b></p>
      <p>${po.name_ko} 논리 ${bar(P.hp, 100, '#d44')} ${Math.max(0, P.hp)}${P.seal ? ' · 봉인' : ''}<br>
      ${eo.name_ko} 논리 ${bar(E.hp, 100, '#d44')} ${Math.max(0, E.hp)}${E.seal ? ' · 봉인' : ''}</p>
      <p style="font-size:12px;color:#cbb;min-height:54px">${d.log.slice(-3).join('<br>')}</p>
      <p>화술: ${Object.keys(game.debateCardList()).map(cardBtn).join(' ')}</p>
      <p style="font-size:11px;color:#999">반박=상대 공격 무효+반격 · 경청=논리 회복 · 도발=다음 화술 봉인 · 🔒는 지력 부족(서적 보유 시 해금)</p>
      <p><button class="cmd" id="debate-auto">위임 (자동)</button></p></div>`;
    m.querySelectorAll('.debate-card').forEach(b => b.onclick = () => { const sel = b.dataset.c; game.debateTick(d, pk === 'a' ? sel : game.debatePolicy(d, 'a'), pk === 'a' ? game.debatePolicy(d, 'b') : sel); after(); }); // 플레이어 카드는 플레이어 측(pk)에 배정
    $('debate-auto').onclick = () => { game.debateAuto(d); after(); };
  };
  const after = () => {
    if (game.pendingDebate) render();
    else { m.classList.add('hidden'); refreshAll(); refreshOpenPanel(); checkGameOver(); }
  };
  render();
}
function autoAwaitingDecision(game) {
  const f = game.forces[game.playerForce];
  return !!(game.pendingDuel || game.pendingDebate || (game.pendingDiplo ?? []).length || (f && !f.alive && !game.deadAck));
}
function setAuto(on) {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  if (on) {
    const speed = Number($('sel-speed').value);
    autoTimer = setInterval(() => {
      if (!game.delegated || game.over) { setAuto(false); return; }
      if (autoAwaitingDecision(game)) return; // 필수결정 동안 턴만 대기. 모달 재생성·위임 강제해제 없음
      doTurn();
    }, Math.max(120, 1400 / speed));
  }
}
function showReview() { // R132: 월 결산 — 지난달 보유량 증감 + 그달 주요 기록 (수입·지출 총계가 아닌 총보유량 비교 — 점령·소속 변경 포함. 예상 수지는 세력 현황 참조)
  const rvw = game.monthlyReview; const m = $('modal'); m.classList.remove('hidden');
  if (!rvw) { m.innerHTML = `<div class="box"><h3>월 결산</h3><p>아직 결산된 월이 없습니다. 첫 월이 지나면 결산이 표시됩니다.</p><button id="rv-close" style="margin-top:8px">닫기</button></div>`; $('rv-close').onclick = () => m.classList.add('hidden'); return; }
  const rows = [['금', 'gold'], ['병량', 'food'], ['병사(주둔)', 'troops'], ['병사(출진)', 'field'], ['도시', 'cities'], ['부대', 'units'], ['무장', 'officers']];
  const tr = ([label, k]) => { const a = rvw.from?.[k], b = rvw.to[k]; if (a == null) return `<tr><td>${label}</td><td colspan="3" style="text-align:right;color:#998">${b.toLocaleString()}</td></tr>`; const d = b - a; const cl = d > 0 ? '#8f8' : d < 0 ? '#f88' : '#998'; return `<tr><td>${label}</td><td style="text-align:right">${a.toLocaleString()}</td><td style="text-align:right">${b.toLocaleString()}</td><td style="text-align:right;color:${cl}">${d > 0 ? '+' : ''}${d.toLocaleString()}</td></tr>`; };
  const recs = (game.chronicle ?? []).filter(c => c.y === rvw.y && c.m === rvw.m).slice(-8).reverse();
  m.innerHTML = `<div class="box" style="max-height:72vh;max-width:560px;display:flex;flex-direction:column"><h3>${rvw.y}년 ${rvw.m}월 결산</h3>
    <p style="font-size:11px;color:#aa9;margin:2px 0">보유량 증감 — 월초 대비 월말 총보유량 비교입니다. 점령·소속 변경도 포함되며 수입·지출 총계가 아닙니다 (예상 수지는 세력 현황 참조).</p>
    <div style="overflow:auto;flex:1;min-height:0"><table style="width:100%;font-size:13px;border-collapse:collapse"><tr style="color:#998"><td>항목</td><td style="text-align:right">월초</td><td style="text-align:right">월말</td><td style="text-align:right">증감</td></tr>${rows.map(tr).join('')}</table>
    ${rvw.from ? '' : '<p style="font-size:12px;color:#fc8;margin:6px 0">집계 기준 없음 — 새 게임·세력 전환·구 세이브 이후 첫 결산은 월초 기준이 없어 증감을 계산하지 않습니다.</p>'}
    ${recs.length ? `<h4 style="margin:8px 0 2px">세계 주요 기록(최근 8건)</h4><div style="font-size:12px;color:#cbb">${recs.map(r => `<p style="margin:2px 0">${r.msg}</p>`).join('')}</div>` : ''}</div>
    <button id="rv-close" style="flex:none;margin-top:8px">닫기</button></div>`;
  $('rv-close').onclick = () => m.classList.add('hidden');
}
function showChronicle() { // R14: 연감 — 【】 주요 사건 기록 (설계안 265행)
  const m = $('modal'); m.classList.remove('hidden');
  const ch = (game.chronicle ?? []).slice().reverse();
  const body = ch.length ? ch.map(e => `<p class="st">[${e.y}년 ${e.m}월] ${e.msg}</p>`).join('') : '<p>기록된 사건이 없습니다.</p>';
  m.innerHTML = `<div class="box" style="max-height:72vh;max-width:560px;display:flex;flex-direction:column"><h3>연감</h3><div style="overflow:auto;flex:1;min-height:0">${body}</div><button id="chr-close" style="flex:none;margin-top:8px">닫기</button></div>`; // R14: 기록이 길어도 닫기 버튼 고정 노출
  m.querySelector('#chr-close').onclick = () => m.classList.add('hidden');
}

function showDashboard() { // R97→R99: 세력 현황 대시보드 — 카드형 핵심 지표 + 섹션 구분 (수지는 정산 산식 재사용 예상치로 표기, 실측 정산 결과가 아님)
  const m = $('modal'); m.classList.remove('hidden');
  const fmt = n => Math.round(n).toLocaleString();
  const sec = (title, inner, alert = false) => `<div style="margin:8px 0 2px;border:1px solid #4a4132;border-radius:6px;padding:6px 8px"><div style="color:${alert ? '#e66' : '#d4af37'};font-weight:bold;margin-bottom:3px">${title}</div>${inner}</div>`;
  const none = t => `<p style="margin:2px 0;color:#aa9">${t}</p>`;
  const render = (tab) => {
    let body = '';
    if (tab === 'my') {
      const ov = game.forceOverview(game.playerForce), s = ov.summary;
      const card = (label, val) => `<div style="flex:1;min-width:84px;background:#2a251d;border:1px solid #4a4132;border-radius:6px;padding:6px 4px;text-align:center"><div style="font-size:11px;color:#aa9">${label}</div><div style="font-size:14px;color:#e8dfc8;font-weight:bold">${val}</div></div>`;
      body += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin:4px 0">` +
        card('도시', s.cities) + card('무장', s.officers) + card('주둔 병력', fmt(s.garrison)) + card('포로', s.captives ?? 0) + // R111: 억류 포로 수 (매뉴얼 捕虜)
        card('출진', `${s.fieldUnits}부대·${fmt(s.fieldTroops)}명`) + card('금', fmt(s.gold)) + card('군량', fmt(s.food)) + `</div>`; // R120/R121: 출진 카드 단위 명확화 (R120은 행말 주석이 금·군량 카드까지 삼키는 결함 — R121에서 복구) / R131b: '병력' 중복 라벨 제거·카드 값 14px — 모바일 99px 카드 경계 붙음 (11/1 실측)
      body += `<p style="margin:2px 0;color:#aa9;font-size:12px">기교P ${fmt(s.techP)} · 습득 기교 ${s.arts}종</p>`;
      const net = s.goldIn - s.sal; // R99: 수입·지출·순수지를 분리 표기 — +금/봉록 나열이 순수지인지 모호하다는 지적 반영
      body += sec('월 예상 수지 (정산 산식 기준 예상치)',
        `<p style="margin:2px 0">금 수입 ${fmt(s.goldIn)} − 봉록 지출 ${fmt(s.sal)} = <b style="color:${net >= 0 ? '#8d6' : '#e66'}">순수지 ${net >= 0 ? '+' : ''}${fmt(net)}</b></p>` +
        `<p style="margin:2px 0;color:#aa9;font-size:12px">군량 수입은 1·4·7·10월에만 입고(분기), 소비는 매월. 실제 정산과 같은 산식으로 계산한 예상치이며, 산출 시점 사이의 AI·전투 변동은 반영되지 않음.</p>`);
      const warns = [];
      for (const r of ov.cities) {
        if (r.foodLackMonth != null) warns.push(`⚠ ${r.name}: ${r.foodLackMonth}개월 후 병량 부족 예상`);
        if (r.goldLackMonth != null) warns.push(`⚠ ${r.name}: ${r.goldLackMonth}개월 후 금 부족 예상`);
      }
      body += sec('부족 경고', warns.length ? warns.map(w => `<p style="margin:2px 0;color:#e66">${w}</p>`).join('') : none('부족 경고 없음 — 현재 추세를 12개월 시뮬레이션한 기준'), warns.length > 0);
      body += sec('위협 (공격받는 도시)', ov.threats.length ? ov.threats.map(t => `<p style="margin:2px 0;color:#e66">⚠ ${t.forceName} 「${t.label}」 ${fmt(t.troops)} → ${t.city} (거리 ${t.dist})</p>`).join('') : none('공격받는 도시 없음 — 접근 중인 적 부대가 확인되지 않음'), ov.threats.length > 0);
      const orders = ov.units.map(u => {
        const st = u.building ? `${u.building} 건설 중` : u.dest ? `→ ${u.dest} 이동 중 (남은 경로 ${u.pathLen})` : '대기 중 — 부여된 목표 없음';
        return `<p style="margin:2px 0">${u.label} ${UNIT_TYPES[u.type]?.name ?? u.type} ${fmt(u.troops)} (${u.officers.join('·')}) — ${st}</p>`;
      });
      body += sec('진행 명령 (출진 부대)', orders.length ? orders.join('') : none('진행 중인 명령 없음 — 출진 부대가 없음'));
      const arts = Object.keys(game.forces[game.playerForce]?.arts ?? {});
      const research = `<p style="margin:2px 0">진행 중인 연구 없음 — 이 게임의 연구는 기교P 소모 즉시 습득 방식 · 습득 기교 ${arts.length}종${arts.length ? `: ${arts.slice(0, 10).join(', ')}${arts.length > 10 ? ' 외' : ''}` : ''}</p>`;
      const blds = [];
      for (const r of ov.cities) for (const b of r.building) blds.push(`${r.name}: ${b.type} ${b.progress}/${b.turns ?? '?'}`);
      for (const f of ov.fieldBuilding) blds.push(`야전: ${f.type} (남은 ${f.left}턴)`);
      body += sec('연구 / 건설', research + (blds.length ? blds.map(b => `<p style="margin:2px 0">${b}</p>`).join('') : none('건설 중인 시설 없음')));
      if (ov.cities.length) { // R125: 도시 목록을 표 형식으로 — 모바일에서도 도시명/병력·무장/금·군량/수지를 열 단위로 비교 가능하게 (기존 한 줄 문장은 밀도 높고 정렬 안 됨)
        const cth = 'style="padding:2px 6px;text-align:right;white-space:nowrap"', cthl = 'style="padding:2px 6px;text-align:left;white-space:nowrap"';
        const sgn = n => `<td style="padding:2px 6px;text-align:right;white-space:nowrap;color:${n >= 0 ? '#8d6' : '#e66'}">${n >= 0 ? '+' : ''}${fmt(n)}</td>`;
        body += sec('도시', `<table style="width:100%;border-collapse:collapse;font-size:12px"><tr style="color:#d4af37"><th ${cthl}>도시</th><th ${cth}>병력</th><th ${cth}>무장</th><th ${cth}>금</th><th ${cth}>군량</th><th ${cth}>금 수지</th><th ${cth}>군량 수지</th></tr>` +
          ov.cities.map(r => `<tr style="border-top:1px solid #4a4132"><td ${cthl}><b>${r.name}</b></td><td ${cth}>${fmt(r.troops)}</td><td ${cth}>${r.officers}</td><td ${cth}>${fmt(r.gold)}</td><td ${cth}>${fmt(r.food)}</td>${sgn(r.goldIn - r.sal)}${sgn(r.foodIn - r.foodNeed)}</tr>`).join('') + `</table>` +
          `<p style="margin:2px 0;color:#aa9;font-size:11px">수지 = 월 예상 수입 − 지출 (군량 수입은 1·4·7·10월 분기 입고 기준 예상치)</p>`);
      } else body += sec('도시', none('보유 도시 없음'));
    } else {
      const rows = game.forceComparison();
      const th = 'style="padding:3px 8px;text-align:right;white-space:nowrap"', thl = 'style="padding:3px 8px;text-align:left;white-space:nowrap"';
      body += `<table style="width:100%;min-width:520px;border-collapse:collapse;font-size:13px"><tr style="color:#d4af37"><th ${thl}>세력</th><th ${th}>도시</th><th ${th}>무장</th><th ${th}>병력</th><th ${th}>금</th><th ${th}>군량</th></tr>` +
        rows.map(r => `<tr style="border-top:1px solid #4a4132;${r.id === game.playerForce ? 'color:#d4af37;' : ''}"><td ${thl}>${r.name}</td><td ${th}>${r.cities}</td><td ${th}>${r.officers}</td><td ${th}>${fmt(r.troops)}</td><td ${th}>${fmt(r.gold)}</td><td ${th}>${fmt(r.food)}</td></tr>`).join('') + `</table>`;
    }
    m.innerHTML = `<div class="box" style="max-height:78vh;max-width:640px;display:flex;flex-direction:column;text-align:left"><h3 style="text-align:center">세력 현황</h3><div style="display:flex;gap:8px;justify-content:center"><button id="dash-my"${tab === 'my' ? ' disabled' : ''}>내 세력</button><button id="dash-cmp"${tab !== 'my' ? ' disabled' : ''}>세력 비교</button></div><div style="overflow:auto;flex:1;min-height:0">${body}</div><button id="dash-close" style="flex:none">닫기</button></div>`;
    m.querySelector('#dash-close').onclick = () => m.classList.add('hidden');
    m.querySelector('#dash-my').onclick = () => render('my');
    m.querySelector('#dash-cmp').onclick = () => render('cmp');
  };
  render('my');
}

function checkGameOver() {
  const owners = new Set(game.cities.map(c => c.force).filter(x => x != null)); // R14: 통일은 모든 도시 제압 기준 (설계안 102행)
  if (owners.size === 1) {
    if (!game._endShown) {
      game._endShown = true;
      endModal(`【${game.forceName([...owners][0])}】${josa(game.forceName([...owners][0]), ['이','가']).slice(-1)} 모든 도시를 제압해 천하를 통일했습니다! (${game.year}년 ${game.month}월, ${game.turn}턴)`, true);
    }
    return;
  }
  if (game.over) return;
  const f = game.forces[game.playerForce];
  if (f && !f.alive && !game.deadAck) {
    const others = game.aliveForces();
    if (others.length === 0) { endModal('천하가 정리되었습니다.'); return; }
    modal(`【${game.forceName(f.id)}】${josa(game.forceName(f.id), ['이','가']).slice(-1)} 멸망했습니다.`, [
      ['다른 세력으로 계속', () => { // R14: 관전과 구분 — 계속할 세력을 직접 선택 (설계안 190행)
        modal('계속할 세력 선택', game.aliveForces().map(of => [game.forceName(of.id), () => { game.playerForce = of.id; game.deadAck = true; game.delegated = false; setAuto(false); refreshAll(); }]).concat([['취소', () => checkGameOver()]]));
      }],
      ['관전만 계속', () => { game.deadAck = true; game.delegated = true; refreshHud(); setAuto(true); }],
      ['게임 종료', () => endModal('게임을 종료했습니다. 타이틀로 돌아갑니다.')],
    ]);
  }
}
function endModal(text, spectator=false) { // R14: 통일 후 관전 계속 가능
  game.over = true; setAuto(false);
  const btns = spectator ? [['관전 계속', () => { game.over = false; game.delegated = true; refreshAll(); setAuto(true); }]] : [];
  btns.push(['타이틀로', () => { localStorage.removeItem(SAVE_KEY); location.reload(); }]);
  modal(text, btns);
}
function modal(text, buttons) {
  const m = $('modal'); m.classList.remove('hidden');
  m.innerHTML = `<div class="box"><p>${text}</p>${buttons.map((b,i) => `<button data-i="${i}">${b[0]}</button>`).join('')}</div>`;
  m.querySelectorAll('button').forEach(btn => btn.onclick = () => { m.classList.add('hidden'); buttons[Number(btn.dataset.i)][1](); });
}

// === 선택·패널 ===
function targetHint(pf) { // 발동 실패 안내: 전법·계략별 실제 대상 조건
  if (pf.kind === 'tactic') return pf.tid && pf.tid !== 'base' ? '이 전법은 사거리 안의 적 부대에만 쓸 수 있습니다 (도시 대상 불가)' : '대상이 유효하지 않습니다 (사거리 안의 적 부대·도시 가능, 시설은 노병·병기·수군 전법만 가능)'; // R73
  if (pf.kind === 'fire') return '화계는 사거리 안의 적 부대·도시·시설에 쓸 수 있습니다'; // R76: 시설 대상 추가 (매뉴얼 火計 対象 施設)
  if (pf.kind === 'calm') return '진정은 사거리 안의 아군 부대에만 쓸 수 있습니다';
  return '이 계략은 사거리 안의 적 부대에만 쓸 수 있습니다 (도시 대상 불가)';
}
function tacticFailWhy(pf, hit) { // R74: 발동 실패 사유를 대상 종류별로 구체 안내 (선박 전용·선박 불가 구분)
  if (pf.kind === 'tactic' && hit && hit.type === 'unit') {
    const u = game.units.find(x => x.id === pf.uid), d = game.units.find(x => x.id === hit.id);
    if (u && u.type === 'ram') return '파쇄는 거점·시설에만 사용할 수 있습니다 (부대 대상 불가)'; // R75: 매뉴얼 대상표 破砕 対象 建物・罠
    if (u && d && pf.tid === 'ram' && !SHIP_TYPES.has(d.type)) return '격돌은 적 선박에만 사용할 수 있습니다'; // 매뉴얼 대상표: 激突 対象 船 (비선박 조준 시)
    if (u && d && SHIP_TYPES.has(d.type) && !TAC_SHIP_OK.has(u.type)) return '이 전법은 육상 부대·병기에만 사용할 수 있습니다 (선박 대상 불가)'; // 매뉴얼 대상표: 창·극·기병 部隊・兵器, 목수 방사 部隊・兵器・建物・罠
  }
  if (pf.kind === 'tactic' && hit && hit.type === 'city') return '도시는 기본 공격으로 공략합니다. 전법은 부대를 대상으로 하며, 병기 부대만 도시에 쓸 수 있습니다.';
  return targetHint(pf);
}
function onPick(nx, ny) {
  if (!game || game.over) return;
  const cmdMode = pendingFire == null && selectedUnit != null && !game.delegated && !!game.units.find(u => u.id === selectedUnit && u.force === game.playerForce); // R72c: 명령 모드 = 플레이어가 명령 가능한 아군 부대 선택 중일 때만 (적 부대 조회 중에는 목표 우선 아님)
  const hit = map.pick(nx, ny, cmdMode); // R72b: 명령 모드에서는 도시·시설 목표를 부대 재선택보다 우선 (전법·계략 조준 중에는 부대 우선 유지)
  if (pendingFire) { // R15: 직접 전법·계략 대상 선택
    const pf = pendingFire; pendingFire = null;
    let ok = false;
    if (hit && hit.type === 'unit') ok = pf.kind === 'tactic' ? game.fireTactic(pf.uid, { type: 'unit', id: hit.id }, pf.tid) : game.fireStrat(pf.uid, pf.kind, { type: 'unit', id: hit.id });
    else if (hit && hit.type === 'city') ok = pf.kind === 'tactic' ? game.fireTactic(pf.uid, { type: 'city', id: hit.id }, pf.tid) : game.fireStrat(pf.uid, pf.kind, { type: 'city', id: hit.id });
    else if (hit && hit.type === 'fac') ok = pf.kind === 'tactic' ? game.fireTactic(pf.uid, { type: 'fac', id: hit.id }, pf.tid) : pf.kind === 'fire' ? game.fireStrat(pf.uid, 'fire', { type: 'fac', id: hit.id }) : false; // R73: 시설 대상 전법 // R76: 화계 시설 대상
    selectedUnit = null;
    if (ok) { refreshAll(); if (game.units.find(x => x.id === pf.uid)) { selectedUnit = pf.uid; showUnitPanel(pf.uid); } else $('panel').classList.add('hidden'); }
    else { game.log(tacticFailWhy(pf, hit), true); refreshLog(); showUnitPanel(pf.uid); } // R74: 대상 종류별 구체 사유
    return;
  }
  if (!hit) { $('panel').classList.add('hidden'); selectedUnit = null; return; }
  if (hit.type === 'unit') {
    const u = game.units.find(x => x.id === hit.id);
    if (u && !game.delegated && u.force !== game.playerForce && !game.inVision(u.x, u.z)) return; // R14: 시야 밖 부대는 선택 불가
    selectedUnit = hit.id; showUnitPanel(hit.id); return;
  }
  if (hit.type === 'fac') { // R71: 야전 시설 직접 지목 공격 — 부대 선택 상태에서 적 시설 클릭
    const f = (game.fieldFacs ?? []).find(f => f.id === hit.id);
    if (f && selectedUnit != null && game.units.find(u => u.id === selectedUnit && u.force === game.playerForce) && !game.delegated && f.force !== game.playerForce) {
      if (game.orderFacAttack(selectedUnit, hit.id)) { game.log(`${game.units.find(u=>u.id===selectedUnit).label} → ${f.type} 공격 명령`, true); game.autosave(); } // R72d: 명령 직후 영속 — 리로드 시 명령 소실 방지
    }
    selectedUnit = null; $('panel').classList.add('hidden'); refreshLog();
    return;
  }
  const c = game.cityById[hit.id];
  if (selectedUnit != null && game.units.find(u => u.id === selectedUnit && u.force === game.playerForce) && !game.delegated) {
    const ordered = game.orderUnit(selectedUnit, hit.id);
    if (ordered) { game.log(`${game.units.find(u=>u.id===selectedUnit).label} → ${josa(c.name_ko, ['으로','로'])} 이동 명령`, true); game.autosave(); } // R70: 거부된 명령(노선 없음·동맹 등)에는 성공 로그를 남기지 않음 — orderUnit이 사유를 로그 / R72d: 명령 직후 영속
    selectedUnit = null; $('panel').classList.add('hidden'); refreshLog();
    return;
  }
  selectedUnit = null;
  showCityPanel(c);
}
function showAdvisor(c) { const reopening = $('panel').dataset.view !== 'advisor', oldScroll = $('panel').scrollTop; $('panel').dataset.view='advisor'; // 군사 임명: 지력 70 이상만 (설계안 명시)
  const p = $('panel');
  const f = game.forces[c.force];
  const serving = Object.values(DATA.officers).filter(o => o.state?.force === c.force && ['ruler', 'taesu', 'serving'].includes(o.state.status)).sort((a, b) => b.int - a.int);
  let html = `<h3>${game.forceName(c.force)} 군사</h3>`;
  const advisor = game.activeAdvisor(c.force);
  html += advisor ? `<p>현재 군사: <b>${advisor.name_ko}</b> (지력 ${advisor.int})</p>` : '<p>현재 군사: 없음</p>';
  if (!advisor && f.advisor != null) html += '<p class=st>이전 임명 무장은 포로·이적 등으로 현재 재직하지 않습니다.</p>';
  html += '<p style="font-size:12px;color:#998">군사는 지력 70 이상만 임명 가능. 적국의 군주·군사 지력이 높을수록 아군 계략 성공률이 낮아집니다.</p>';
  for (const o of serving) {
    const ok = o.int >= 70;
    html += `<div class="officer"><div><div class="nm">${o.name_ko} <span class="st">지력 ${o.int}${advisor?.idx === o.idx ? ' · 현 군사' : ''}</span></div></div>${ok && advisor?.idx !== o.idx ? `<button class="cmd cmd-adv" data-i="${o.idx}">임명</button>` : ''}</div>`;
  }
  html += `<button class="cmd" id="adv-back">← 도시 패널로</button>`;
  p.innerHTML = html; p.scrollTop = reopening ? 0 : oldScroll;
  p.querySelectorAll('.cmd-adv').forEach(b => b.onclick = () => { game.appointAdvisor(Number(b.dataset.i)); refreshAll(); showAdvisor(c); });
  $('adv-back').onclick = () => showCityPanel(c);
}
function showLegions(c) { $('panel').dataset.view='legion'; // 군단 편성: 도시 묶음을 도독에게 위임 (제2군단~, 제1군단은 군주 직할)
  const p = $('panel');
  const f = game.forces[c.force];
  const own = game.forceCities(c.force);
  const serving = Object.values(DATA.officers).filter(o => o.state?.force === c.force);
  const render = () => {
    const free = own.filter(x => !game.cityLegion(x.id)); // R143: 편성/해산 직후 최신 직할 도시만 표시
    let html = `<h3>${game.forceName(c.force)} 군단</h3><p style="font-size:12px;color:#998">제1군단(군주 직할)은 항상 직접 조작. 제2군단부터 도독에게 위임 — 소속 도시는 수동 명령이 불가합니다.</p>`;
    for (const l of f.legions ?? []) {
      html += `<div class="officer"><div><div class="nm">${l.name} <span class="st">도독 ${DATA.officers[l.governor]?.name_ko ?? '-'} · 방침 ${{ delegate: '위임', attack_city: '도시공략', attack_force: '세력공략' }[l.policy]}${l.target != null ? ' → ' + (l.policy === 'attack_city' ? game.cityById[l.target]?.name_ko : game.forceName(l.target)) : ''}</span></div><div class="st">${l.cities.map(id => game.cityById[id]?.name_ko).join('·')}</div></div><button class="cmd cmd-disband" data-i="${l.id}">해산</button></div>`;
    }
    if (free.length && serving.length) {
      html += `<h3 style="margin-top:10px">새 군단 편성</h3>
        <p>도독: <select id="leg-gov">${serving.map(o => `<option value="${o.idx}">${o.name_ko} (통${o.ldr}/지${o.int})</option>`).join('')}</select></p>
        <p>도시: ${free.map(x => `<label><input type="checkbox" class="leg-city" value="${x.id}"> ${x.name_ko}</label> `).join('')}</p>
        <p>방침: <select id="leg-pol"><option value="delegate">위임 (전권)</option><option value="attack_city">도시공략</option><option value="attack_force">세력공략</option></select>
        목표: <select id="leg-target"></select></p>
        <p><button class="cmd" id="leg-create">편성</button></p>`;
    }
    html += `<button class="cmd" id="leg-back">← 도시 패널로</button>`;
    p.innerHTML = html;
    const fillTargets = () => {
      const pol = $('leg-pol')?.value;
      const t = $('leg-target');
      if (!t) return;
      if (pol === 'attack_city') t.innerHTML = game.cities.filter(x => x.force !== c.force).map(x => `<option value="${x.id}">${x.name_ko} (${x.force != null ? game.forceName(x.force) : '공백'})</option>`).join('');
      else if (pol === 'attack_force') t.innerHTML = Object.values(game.forces).filter(x => x.alive && x.id !== c.force).map(x => `<option value="${x.id}">${game.forceName(x.id)}</option>`).join('');
      else t.innerHTML = '<option value="">-</option>';
    };
    $('leg-pol') && ($('leg-pol').onchange = fillTargets) && fillTargets();
    $('leg-create') && ($('leg-create').onclick = () => {
      const cities = [...p.querySelectorAll('.leg-city:checked')].map(x => Number(x.value));
      const t = $('leg-target').value;
      if (game.createLegion(Number($('leg-gov').value), cities, $('leg-pol').value, t === '' ? null : Number(t))) { refreshAll(); render(); }
    });
    p.querySelectorAll('.cmd-disband').forEach(b => b.onclick = () => { game.disbandLegion(c.force, Number(b.dataset.i)); refreshAll(); render(); });
    $('leg-back').onclick = () => showCityPanel(c);
  };
  render();
}
function tradeUiWhy(game, c, dir, lots) {
  if (!c || c.force !== game.playerForce || game.delegated) return '현재 직접 지휘하는 도시가 아닙니다';
  if (!game.forces[c.force]?.alive) return '세력 정보 없음';
  if (game._blocked(c)) return '군단 소속 도시입니다';
  if (game.forces[c.force].ap < 10) return '행동력 10 필요';
  if (dir === 'buy' && c.gold < 1000 * lots) return '금 ' + (1000 * lots).toLocaleString() + ' 필요';
  if (dir === 'sell' && c.food < game.tradeRate() * lots) return '병량 ' + (game.tradeRate() * lots).toLocaleString() + ' 필요';
  return '';
}
function showTrade(c) { $('panel').dataset.view='trade';
  const p = $('panel');
  p.innerHTML = `<h3>${c.name_ko} 상인</h3>
    <p id="trd-rate"></p><p id="trd-stock"></p>
    <p>거래량 (롯트): <select id="trd-lots">${[1,2,3,4,5].map(n => `<option value="${n}">${n}</option>`).join('')}</select></p>
    <p><button class="cmd" id="trd-buy">병량 매입 (금→병량)</button> <span id="trd-buy-why" class="fac-why"></span></p>
    <p><button class="cmd" id="trd-sell">병량 매각 (병량→금)</button> <span id="trd-sell-why" class="fac-why"></span></p>
    <p id="trd-total" class="st"></p><button class="cmd" id="trd-back">← 도시 패널로</button>`;
  const refreshTrade = () => {
    const rate = game.tradeRate(), lots = Number($('trd-lots').value), f = game.forces[c.force];
    $('trd-rate').textContent = '이번 달 환율: 금 1000 ↔ 병량 ' + rate.toLocaleString() + ' (매월 변동)';
    $('trd-stock').textContent = '보유: 금 ' + c.gold.toLocaleString() + ' · 병량 ' + c.food.toLocaleString() + ' · 행동력 ' + (f?.ap ?? 0);
    $('trd-total').textContent = lots + '롯트: 금 ' + (1000 * lots).toLocaleString() + ' ↔ 병량 ' + (rate * lots).toLocaleString() + ' · 행동력 10';
    for (const dir of ['buy','sell']) { const why = tradeUiWhy(game,c,dir,lots); $('trd-'+dir).disabled = !!why; $('trd-'+dir).title = why; $('trd-'+dir+'-why').textContent = why; }
  };
  p.refreshTrade = refreshTrade; refreshTrade();
  $('trd-lots').onchange = refreshTrade;
  for (const dir of ['buy','sell']) $('trd-'+dir).onclick = () => { refreshTrade(); if ($('trd-'+dir).disabled) return; if (!game.trade(c.id,dir,Number($('trd-lots').value)) && game.lastTradeWhy) game.log(game.lastTradeWhy,true); refreshAll(); refreshTrade(); };
  $('trd-back').onclick = () => showCityPanel(c);
}
// R149 preview: 원기획 수동 병장생산, 월자동생산은 그대로
function showArms(c) {
  const p=$('panel'),reopening=p.dataset.view!=='arms'||p.dataset.city!==String(c.id),st=p.scrollTop; p.dataset.view='arms';p.dataset.city=String(c.id); p.classList.remove('hidden');
  let html=`<div class="fac-status"><h3>${c.name_ko} 병장 생산</h3><p class="st">도시 금 ${c.gold.toLocaleString()} · 행동력 ${game.forces[c.force]?.ap ?? 0}</p></div><p class="st">완성 대장간 1개당 매턴 창·극·노 중 1회, 마구간은 군마 1회. 생산량 500 × 시설 레벨. 월 자동생산은 별도입니다. AI는 준비금·월예산 범위에서만 추가 생산합니다.</p>`;
  for (const [key,spec] of Object.entries(ARMS_BUILD)) {
    const a=game.armsInfo(c,key);
    html+=`<div class="officer"><div><div class="nm">${spec.name} · 보유 ${(c[key]??0).toLocaleString()}</div><div class="st">${spec.facility} 남은 ${a.remaining??0}/${a.capacity??0}회 · 생산 ${a.chosen?a.amount:'-'} · 금${a.gold??200} · AP${a.ap??10}</div>${a.why?`<small class="fac-why">${a.why}</small>`:''}</div><button class="cmd arms-go" data-k="${key}"${a.why?' disabled title="'+a.why+'"':''}>생산</button></div>`;
  }
  html+='<p class="st">같은 대장간의 남은 횟수는 창·극·노가 함께 사용합니다. 낮은 레벨 시설부터 사용하며, 당턴 사용한 시설을 합병해도 생산 횟수는 회복되지 않습니다.</p><button class="cmd" id="arms-back">← 도시 패널로</button>';
  p.innerHTML=html;p.scrollTop=reopening?0:st;
  p.querySelectorAll('.arms-go').forEach(b=>b.onclick=()=>{if(!game.armsInfo(c,b.dataset.k).why)game.produceArms(c.id,b.dataset.k);refreshAll();showArms(c)});
  $('arms-back').onclick=()=>showCityPanel(c);
}
function diplomacyUiInfo(g,c,tid,action) {
  const f=g.forces[c?.force],t=g.forces[tid];
  const gold={envoy:500,ally:1000,truce:2000,surrender:1000,aid:0,break:0}[action]??0;
  const base={envoy:20,ally:30,truce:30,surrender:30,aid:20,break:0}[action]??0;
  const ap=action==='aid'||action==='break'?base:Math.ceil(base*g.apMult(c,'diplo'));
  let why='';
  if(!c||c.force!==g.playerForce||!f?.alive||!t?.alive||tid===c.force)why='외교 대상이 유효하지 않습니다';
  else if(action==='break'&&!g.isAllied(c.force,tid))why='동맹 중이 아닙니다';
  else if(action==='ally'&&(g.relation(c.force,tid)<60||g.isAllied(c.force,tid)))why='호의 이상·동맹 아닌 세력이 필요합니다';
  else if(action==='truce'&&g.relation(c.force,tid)>39)why='불화 이하 관계가 필요합니다';
  else if(action==='surrender'&&g.forceCities(tid).length>2)why='상대 도시 2개 이하가 필요합니다';
  else if(action==='aid'&&!g.isAllied(c.force,tid))why='동맹 중이 아닙니다';
  else {
    const d=g.diploOf(c.force,tid),kind=action==='ally'?'alliance':action==='truce'?'truce':null;
    const left=kind?12-(g.turn-(d.failCd?.[kind]??-99)):action==='aid'?18-(g.turn-(d.aidTurn??-99)):0;
    if(left>0)why='재요청까지 '+left+'턴';
    else if(action==='aid'&&!g.forceCities(tid).some(x=>x.troops>=6000))why='지원 가능한 상대 도시 병력 6000 이상이 없습니다';
    else if(f.ap<ap)why='행동력 '+ap+' 필요';
    else if(c.gold<gold)why='도시 금 '+gold+' 필요';
  }
  return {ap,gold,why};
}
function showDiplomacy(c) {
  const p = $('panel'), reopening=p.dataset.view!=='diplo'||p.dataset.city!==String(c.id);
  p.dataset.view='diplo'; p.dataset.city=String(c.id); p.classList.remove('hidden');
  const myF = game.forces[c.force];
  const others = Object.values(game.forces).filter(f => f.alive && f.id !== c.force);
  let html = `<div class="fac-status"><p class="st">도시 금 ${c.gold.toLocaleString()} · 행동력 ${myF?.ap??0}</p></div><h3>${c.name_ko} 외교 <small>(사절: 이 도시에서 파견)</small></h3>`;
  if (!others.length) html += '<p>다른 생존 세력이 없습니다.</p>';
  for (const t of others) {
    const v = game.relation(c.force, t.id);
    const stage = game.relStage(v);
    const allied = game.isAllied(c.force, t.id);
    const truce = game.isTruce(c.force, t.id);
    const d = game.diploOf(c.force, t.id);
    const tCities = game.cities.filter(x => x.force === t.id).length;
    const aidCool = game.turn - (d.aidTurn ?? -99);
    html += `<div class="officer"><div><div class="nm">${game.forceName(t.id)} <span class="st">${v} ${stage}${allied ? ` · 동맹(${d.allianceUntil - game.turn}턴 남음)` : ''}${truce ? ` · 정전(${d.truceUntil - game.turn}턴)` : ''}</span></div>`;
    html += `<div class="st">`;
    const actionButton=(action,label)=>{const x=diplomacyUiInfo(game,c,t.id,action);return `<p><button class="cmd dip-act" data-a="${action}" data-t="${t.id}"${x.why?' disabled title="'+x.why+'"':''}>${label}${x.gold?'(금'+x.gold+')':''} · AP${x.ap}</button>${x.why?'<small class="fac-why">'+x.why+'</small>':''}</p>`;};
    html += actionButton('envoy','친선사절');
    if(!allied&&v>=60)html+=actionButton('ally','동맹 제의');
    if(v<=39)html+=actionButton('truce','정전 요청');
    if(tCities<=2)html+=actionButton('surrender','항복 권고');
    if(allied){html+=actionButton('aid','원군 요청');html+=actionButton('break','동맹 파기');}
    html += `</div></div></div>`;
  }
  html += `<p class="st">관계: 80+ 친밀 · 60+ 호의 · 40+ 중립 · 20+ 불화 · 미만 험악 — 매달 중립으로 서서히 회귀. 동맹국은 서로 공격하지 않습니다. 협상 결렬·등용 실패 시 30% 확률로 설전이 벌어지며, 승리하면 협상이 재심됩니다. 논객 특기는 성공률과 설전 공격력(+25%)을 보정합니다.</p>`;
  html += `<button class="cmd" id="cmd-diplo-back">← 도시 패널로</button>`;
  p.innerHTML = html;
  p.querySelectorAll('.dip-act').forEach(btn => btn.onclick = () => {
    const tid = Number(btn.dataset.t);
    if(diplomacyUiInfo(game,c,tid,btn.dataset.a).why){showDiplomacy(c);return;}
    const act = { envoy: 'envoy', ally: 'proposeAlliance', truce: 'requestTruce', surrender: 'demandSurrender', aid: 'requestAid', break: 'breakAlliance' }[btn.dataset.a];
    const r = act === 'breakAlliance' ? game.breakAlliance(c.force, tid) : game[act](c.force, tid, c.id);
    refreshAll(); showDiplomacy(c);
    if (game.pendingDebate) showDebate(); // R11: 협상 결렬 시 설전 발동
  });
  $('cmd-diplo-back').onclick = () => showCityPanel(c);
  if(reopening)p.scrollTop=0;
}
function showFacilities(c) {
  const p = $('panel'); p.classList.remove('hidden');
  const reopening = p.dataset.view !== 'facilities' || p.dataset.city !== String(c.id);
  p.dataset.view = 'facilities'; p.dataset.city = String(c.id);
  const facReason = (cost, ap, needSlot = false) => !game.forces[c.force]?.alive ? '세력 정보 없음' : game._blocked(c) ? '군단 위임 중' : needSlot && (c.facilities?.length ?? 0) >= game.facSlots(c) ? '개발지 부족' : (game.forces[c.force]?.ap ?? 0) < ap ? '행동력 ' + ap + ' 필요' : c.gold < cost ? '도시 금 ' + cost + ' 필요' : '';
  const btnState = why => why ? ' disabled title="' + why + '"' : '';
  c.facilities = c.facilities ?? [];
  const slots = game.facSlots(c);
  let html = `<div class="fac-status"><h3>${c.name_ko} 시설 <small>(개발지 ${c.facilities.length}/${slots})</small></h3><p class="st">도시 금 ${c.gold.toLocaleString()} · 행동력 ${game.forces[c.force]?.ap ?? 0}</p></div>`;
  if (c.facilities.length) {
    html += c.facilities.map((f, i) => {
      const spec = FACILITIES[f.type];
      const body = f.done
        ? `${f.type}${(f.level ?? 1) > 1 ? ' Lv' + f.level : ''} — ${spec.desc}`
        : `${f.type} 공사 중 ${f.progress}/${spec.turns} (담당 ${f.builders.map(b => DATA.officers[b]?.name_ko).join('·') || '없음'})`;
      return `<div class="officer"><div><div class="st">${body}</div></div><button class="cmd cmd-demol" data-i="${i}">철거</button></div>`;
    }).join('');
  } else html += '<p>건설된 시설이 없습니다.</p>';
  const mergeable = {}; // R13: 흡수합병
  c.facilities.forEach((f, i) => { if (f.done && (f.level ?? 1) < 3) (mergeable[f.type] = mergeable[f.type] ?? []).push(i); });
  const mergePairs = Object.entries(mergeable).filter(([, v]) => v.length >= 2);
  if (mergePairs.length) {
    html += '<h3 style="margin-top:10px">흡수합병 <small>(같은 시설 2개 → Lv+1 · 금 200·AP 10 · 개발지 1개 회수, 최대 Lv3)</small></h3>';
    for (const [t, v] of mergePairs) { const why = facReason(200, 10); html += `<div class="officer"><div><div class="nm">${t} × ${v.length}</div><div class="st">${FACILITIES[t].desc}</div></div><button class="cmd cmd-merge" data-t="${t}"${btnState(why)}>합병</button>${why ? `<small class="fac-why">${why}</small>` : ''}</div>`; }
  }
  const availableBuilders = [...new Set(c.officers)];
  const polTop = availableBuilders.slice().sort((a, b) => (game.officers[b]?.pol ?? 0) - (game.officers[a]?.pol ?? 0)).slice(0, 3);
  const previous = reopening ? polTop : JSON.parse(p.dataset.builders ?? JSON.stringify(polTop));
  let selectedBuilders = previous.filter(i => availableBuilders.includes(i)).slice(0, 3);
  const keepBuilders = () => { p.dataset.builders = JSON.stringify(selectedBuilders); };
  keepBuilders();
  html += '<h3 style="margin-top:10px">건설 담당 <small>(최대 3명)</small></h3>';
  html += availableBuilders.map(i => `<label style="display:block"><input type="checkbox" class="fac-builder" value="${i}"${selectedBuilders.includes(i) ? ' checked' : ''}> ${game.officers[i].name_ko} (정치 ${game.officers[i].pol})</label>`).join('') || '<p class="st">주둔 무장 없음</p>';
  html += '<p id="fac-builder-status" class="st" role="status"></p><h3 style="margin-top:10px">건설</h3>';
  for (const [t, spec] of Object.entries(FACILITIES)) {
    const why = facReason(spec.cost, 20, true);
    html += `<div class="officer"><div><div class="nm">${t} <span class="st">금${spec.cost} · 공기 ${spec.turns}턴</span></div><div class="st">${spec.desc}</div></div><button class="cmd cmd-build" data-t="${t}"${btnState(why)}>건설</button>${why ? `<small class="fac-why">${why}</small>` : ''}</div>`;
  }
  html += `<p class="st">첫 진입 시 정치 상위 3명 선택. 선택한 담당은 새 건설에만 적용됩니다. 정치 합산 250 이상이면 턴당 공기 2, 미만이면 1 진행합니다.</p>`;
  html += `<button class="cmd" id="cmd-fac-back">← 도시 패널로</button>`;
  p.innerHTML = html;
  if (reopening) p.scrollTop = 0;
  const refreshBuilders = () => {
    const polSum = selectedBuilders.reduce((sum, i) => sum + (game.officers[i]?.pol ?? 0), 0);
    $('fac-builder-status').textContent = '선택 ' + selectedBuilders.length + '/3명 · 정치 합산 ' + polSum + ' · 턴당 공기 ' + (polSum >= 250 ? 2 : 1) + (selectedBuilders.length ? '' : ' (담당 없음)');
    p.querySelectorAll('.fac-builder').forEach(cb => { cb.disabled = selectedBuilders.length >= 3 && !cb.checked; });
    keepBuilders();
  };
  p.querySelectorAll('.fac-builder').forEach(cb => cb.onchange = () => {
    selectedBuilders = [...p.querySelectorAll('.fac-builder:checked')].map(x => Number(x.value)).slice(0, 3);
    refreshBuilders();
  });
  refreshBuilders();
  p.querySelectorAll('.cmd-build').forEach(btn => btn.onclick = () => {
    if (game.buildFacility(c.id, btn.dataset.t, selectedBuilders)) { refreshAll(); showFacilities(c); }
  });
  p.querySelectorAll('.cmd-demol').forEach(btn => btn.onclick = () => {
    if (game.demolishFacility(c.id, Number(btn.dataset.i))) { refreshAll(); showFacilities(c); }
  });
  p.querySelectorAll('.cmd-merge').forEach(btn => btn.onclick = () => { // R13
    const idxs = []; c.facilities.forEach((f, i) => { if (f.done && f.type === btn.dataset.t && (f.level ?? 1) < 3) idxs.push(i); });
    idxs.sort((a, b) => (c.facilities[a].level ?? 1) - (c.facilities[b].level ?? 1));
    if (idxs.length >= 2 && game.absorbFacility(c.id, idxs[0], idxs[1])) { refreshAll(); showFacilities(c); }
  });
  $('cmd-fac-back').onclick = () => showCityPanel(c);
}
function showTech() {
  const reopening = $('panel').dataset.view !== 'tech';
  const oldScroll = $('panel').scrollTop;
  $('panel').dataset.view='tech';
  const f = game.forces[game.playerForce];
  const p = $('panel'); p.classList.remove('hidden');
  const cap = game.forceCities(game.playerForce).sort((a,b) => b.gold-a.gold)[0]; // 엔진과 같은 최고금 도시가 연구비 부담
  const researchWhy = (points, gold = 0) => !f?.alive ? '세력 정보 없음' : (f.techP ?? 0) < points ? '기교P ' + points + ' 필요' : gold > 0 && !cap ? '연구비를 낼 도시 없음' : gold > 0 && cap.gold < gold ? cap.name_ko + ' 금 ' + gold + ' 필요' : '';
  const researchBtnState = why => why ? ' disabled title="' + why + '"' : '';
  const researchReason = why => why ? `<small class="fac-why">${why}</small>` : '';
  let html = `<div class="fac-status"><h3>기교 연구 <small>(기교P ${f?.techP ?? 0}${game.forceHasSkill(game.playerForce, '지도') ? ' · 특기 「지도」: 연구 금 반액' : ''})</small></h3><p class="st">연구비 부담: ${cap ? cap.name_ko + ' · 금 ' + cap.gold.toLocaleString() : '도시 없음'}</p></div>`;
  for (const b of TECH_BRANCHES) {
    const lv = game.techLv(game.playerForce, b);
    const done = lv >= 4;
    const why = done ? '' : researchWhy(TECH_P[lv], game.researchGold(game.playerForce, TECH_GOLD[lv]));
    html += `<div class="officer"><div><div class="nm">${b} ${'●'.repeat(lv)}${'○'.repeat(4 - lv)}</div><div class="st">${TECH_DESC[b]}</div></div>${done ? '<span class="st">최고 단계</span>' : `<button class="cmd cmd-techr" data-b="${b}"${researchBtnState(why)}>연구 (P${TECH_P[lv]}·금${game.researchGold(game.playerForce, TECH_GOLD[lv])})</button>`}${researchReason(why)}</div>`;
  }
  html += `<h3 style="margin-top:10px">능력연구 <small>(PK — 소속 무장 전원 능력 +2/단계, 3단계 완료 시 특기 습득)</small></h3>`; // R13
  const AB_NM = { '공격': '무력', '방어': '통솔', '계략': '지력', '내정': '정치' };
  for (const b of Object.keys(AB_BRANCHES)) {
    const lv = f?.ab?.[b] ?? 0; const maxed = lv >= 3;
    const why = maxed ? '' : researchWhy(AB_P[lv]);
    html += `<div class="officer"><div><div class="nm">${b}(${AB_NM[b]}) ${'●'.repeat(lv)}${'○'.repeat(3 - lv)}</div><div class="st">${maxed ? '최고 단계' : `기교P ${AB_P[lv]} · 전원 ${AB_NM[b]} +2${lv === 2 ? ' · 완료 시 특기 「' + AB_SKILL[b] + '」' + ((AB_PICK[b]?.length ?? 0) > 1 ? ' (또는 ' + AB_PICK[b].slice(1).join('·') + ' 중 선택)' : '') : ''}`}</div></div>${maxed ? '<span class="st">최고 단계</span>' : `<button class="cmd cmd-abr" data-b="${b}"${researchBtnState(why)}>연구</button>`}${researchReason(why)}</div>`;
  }
  html += `<h3 style="margin-top:10px">개별 기교 <small>(이 게임 자체 규칙: 비용과 효과는 직접 정한 값)</small></h3>`; // R23
  for (const [nm, a] of Object.entries(ARTS)) {
    const has = !!f?.arts?.[nm];
    const why = has ? '' : researchWhy(a.p, game.researchGold(game.playerForce, a.gold));
    html += `<div class="officer"><div><div class="nm">${nm} ${has ? '●' : '○'}</div><div class="st">${a.desc}${has ? '' : ` · 기교P ${a.p} · 금 ${game.researchGold(game.playerForce, a.gold)}`}</div></div>${has ? '<span class="st">연구 완료</span>' : `<button class="cmd cmd-artr" data-a="${nm}"${researchBtnState(why)}>연구</button>`}${researchReason(why)}</div>`;
  }
  html += `<button class="cmd" id="cmd-tech-back">← 도시 패널로</button>`;
  p.innerHTML = html;
  p.scrollTop = reopening ? 0 : oldScroll;
  p.querySelectorAll('.cmd-abr').forEach(btn => btn.onclick = () => { // R13
    const b = btn.dataset.b, lvNow = game.forces[game.playerForce]?.ab?.[b] ?? 0;
    const picks = (AB_PICK[b]?.length ?? 0) > 1 ? AB_PICK[b] : null; // R110: 전 계통 선택
    const free = picks && lvNow === 2 ? game.forceOfficers(game.playerForce).filter(o => o && !o.skill && !o.state?.grantSkill) : [];
    if (free.length) { // 마지막 단계: 습득할 특기 선택 (무특기 무장이 있을 때만)
      const statNm = { '공격': '무력', '방어': '통솔', '계략': '지력', '내정': '정치' }[b];
      modal(`능력연구 「${b}」 3단계를 완료합니다. 무특기 무장이 습득할 특기를 고르세요.<br><small>${picks.map(sk => `${sk}: ${DATA.skills[sk] ?? ''}`).join(' · ')} — 기본 외 특기는 ${statNm} 최고 무장이 습득</small>`, [...picks.map(sk => [sk, () => { if (game.researchAbility(game.playerForce, b, sk)) { refreshAll(); showTech(); } }]), ['취소', () => {}]]);
      return;
    }
    if (game.researchAbility(game.playerForce, b)) { refreshAll(); showTech(); }
  });
  p.querySelectorAll('.cmd-techr').forEach(btn => btn.onclick = () => {
    game.researchTech(game.playerForce, btn.dataset.b);
    refreshAll(); showTech();
  });
  p.querySelectorAll('.cmd-artr').forEach(btn => btn.onclick = () => { if (game.researchArt(game.playerForce, btn.dataset.a)) { refreshAll(); showTech(); } });
  $('cmd-tech-back').onclick = () => { const c = lastCityId != null && game.cityById[lastCityId]; if (c) showCityPanel(c); else p.classList.add('hidden'); };
}
function relLine(idx) { // R12: 관계 표시
  const r = game.relOf(idx);
  const nm = i => DATA.officers[i]?.name_ko ?? '?';
  const parts = [];
  if (r.sworn.length) parts.push('의형제: ' + r.sworn.map(nm).join('·'));
  if (r.spouse != null) parts.push('배우자: ' + nm(r.spouse));
  if (r.dear.length) parts.push('친애: ' + r.dear.map(nm).join('·'));
  if (r.hate.length) parts.push('혐오: ' + r.hate.map(nm).join('·'));
  parts.push('상성 ' + game.affOf(idx));
  return ' · ' + parts.join(' · ');
}
function officerRow(idx) {
  const o = DATA.officers[idx];
  return `<div class="officer"><span class="pimg" style="${portraitCss(idx)}"></span><div><div class="nm">${o.name_ko} <span class="st">${o.name_zh}</span></div><div class="st">통${o.ldr} 무${o.war} 지${o.int} 정${o.pol} 매${o.chr} · ${o.skill ? o.skill + ' — ' + (DATA.skills[o.skill] || '') : '특기 없음'} · 충성 ${o.state?.loyal ?? '-'} · 공적 ${o.state?.merit ?? 0}${(o.state?.injuredUntil ?? 0) > game.turn ? ' · <span style="color:#f66">부상</span>' : ''}${(o.state?.items ?? []).length ? ' · 명품: ' + o.state.items.map(id => ITEMS.find(i => i.id === id)?.name ?? id).join('·') : ''}</div><div class="st" style="color:#b9a">${relLine(idx)}</div></div></div>`;
}
let lastCityId = null;
// R151: 기존 내정 명령 조건의 안내만. 금/AP/효과 산식은 엔진 그대로.
// R152: 공방/조선소 기존 생산 조건만 안내. 기교·턴당 횟수 제한 신설 없음.
function rewardUiWhy(game, c, i) {
  const o = game.officers[i], st = o?.state, f = game.forces[c?.force];
  if (!c || c.force !== game.playerForce || game.delegated) return '현재 직접 지휘하는 도시가 아닙니다';
  if (!f?.alive) return '세력 정보 없음';
  if (game._blocked(c)) return '군단 소속 도시입니다';
  if (!st || !c.officers.includes(i) || st.force !== c.force || st.city !== c.id || !['ruler','taesu','serving'].includes(st.status)) return '현재 주둔 소속 무장이 아닙니다';
  if (game.units.some(u => u.officers.includes(i))) return '종군 중인 무장입니다';
  if ((st.loyal ?? 70) >= 100) return '충성 100입니다';
  if (st._rewardTurn === game.turn) return '이번 턴에 이미 포상했습니다';
  if (c.gold < 100) return '금 100 필요';
  if (f.ap < 5) return '행동력 5 필요';
  return '';
}
function personnelUiInfo(game, c, kind, idx) {
  const ap = Math.ceil(20 * game.apMult(c, 'personnel'));
  let why = '';
  const f = game.forces[c.force];
  if (game._blocked(c)) why = '군단 소속 도시입니다';
  else if (!f?.alive || !c.officers.length) why = '명령할 주둔 무장이 없습니다';
  else if (c.gold < 100) why = '금 100 필요';
  else if (f.ap < ap) why = '행동력 ' + ap + ' 필요';
  else if (kind === 'officer' && game.recruitChance(c.id, idx) <= 0) why = '등용할 수 없는 무장입니다';
  return { ap, why };
}
function personnelUiButton(game, c, kind, idx, label) {
  const info = personnelUiInfo(game,c,kind,idx);
  const attrs = kind === 'search' ? 'id="cmd-search"' : 'class="cmd cmd-rec" data-i="'+idx+'"';
  return `<span style="display:inline-flex;flex-direction:column;vertical-align:top;max-width:100%"><button ${kind === 'search' ? 'class="cmd" ' : ''}${attrs} ${info.why ? 'disabled' : ''}>${label}·AP${info.ap})</button>${info.why ? `<small class="fac-why" role="status">${info.why}</small>` : ''}</span>`;
}
function equipmentUiInfo(game, c, family, key) {
  const ship = family === 'ship', spec = (ship ? SHIP_BUILD : SIEGE_BUILD)[key];
  if (!c || c.force == null || !game.forces[c.force] || !spec) return { why: '도시/종류 없음' };
  const gold = Math.round(spec.gold * ((c.specialty ?? []).includes(ship ? '선박' : '병기') ? 0.75 : 1));
  const ap = Math.ceil(10 * game.apMult(c, 'military'));
  const why = game._blocked(c) ? '군단 소속 도시입니다' : !game.cityFac(c, ship ? '조선소' : '공방').length ? '완성 시설 필요' : game.forces[c.force].ap < ap ? `행동력 ${ap} 필요` : c.gold < gold ? `금 ${gold} 필요` : '';
  return { gold, ap, why };
}
function domesticUiWhy(game, c, kind) {
  if (!c || c.force == null || !game.forces[c.force]) return '도시/세력 없음';
  if (game._blocked(c)) return '군단 소속 도시입니다';
  const f = game.forces[c.force];
  if (kind === 'commerce' || kind === 'farm') {
    if (c[kind] >= 100) return (kind === 'commerce' ? '상업' : '농업') + ' 상한 100';
    if (f.ap < 30) return '행동력 30 필요';
    if (c.gold < 300) return '금 300 필요';
  } else if (kind === 'recruit') {
    const ap = Math.ceil(30 * game.apMult(c, 'military'));
    if (f.ap < ap) return `행동력 ${ap} 필요`;
    if (c.gold < 200) return '금 200 필요';
    if (c.food < 1000) return '병량 1000 필요';
  } else if (kind === 'patrol') {
    if ((c.security ?? 80) >= 100) return '치안 상한 100';
    if ((f.ap ?? 0) < 20) return '행동력 20 필요';
    if (c.gold < 100) return '금 100 필요';
  } else return '명령 없음';
  return '';
}
function domesticUiButton(game, c, id, kind, label) {
  const why = domesticUiWhy(game, c, kind);
  return `<span style="display:inline-flex;flex-direction:column;vertical-align:top;max-width:100%"><button class="cmd" id="${id}"${why ? ` disabled title="${why}"` : ''}>${label}</button>${why ? `<small class="fac-why">${why}</small>` : ''}</span>`;
}
function showCityPanel(c) {
  lastCityId = c.id; $('panel').dataset.view = 'city';
  if (c.force !== game.playerForce && !game.delegated && !game.inVision(c.lon, c.lat)) { // R14: 시야 밖 적 도시 — 상세 정보 비공개
    const p = $('panel'); p.classList.remove('hidden');
    const owner = c.force != null && game.forces[c.force]?.alive ? game.forceName(c.force) : '공백지';
    p.innerHTML = `<h3>${c.name_ko} (${c.name_zh ?? ''})</h3>
      <p class="st">소속: ${owner}</p>
      <p class="st">시야 밖입니다 — 내 도시·부대가 접근해야 상세 정보를 확인할 수 있습니다.</p>`;
    return;
  }
  const p = $('panel'); p.classList.remove('hidden');
  const legion = game.cityLegion(c.id);
  const mine = c.force === game.playerForce && !game.delegated && !legion;
  const owner = c.force != null && game.forces[c.force]?.alive ? game.forceName(c.force) : '공백지';
  const legionTag = legion ? ` · <span style="color:#7cf">${legion.name} 소속 (도독 ${DATA.officers[legion.governor]?.name_ko ?? '-'} · 방침 ${{ delegate: '위임', attack_city: '도시공략', attack_force: '세력공략' }[legion.policy]})</span>` : '';
  const _to = c.taesu != null ? game.officers[c.taesu] : null; /* R124: 태수 표시 유효성 — 소속·재직 도시·재직 상태가 현재와 맞지 않는 구 태수(함락·무장 이동·출진·포박·도주·멸망 후 잔존)는 '미지정' 표시. 정식 배정/계승 규칙은 시나리오 초기 데이터뿐이라 표시 최소 수정만 (자동 임명 같은 새 규칙 아님) */
  const _taesuName = (_to?.state && _to.state.force === c.force && _to.state.city === c.id && ['ruler','taesu','serving'].includes(_to.state.status)) ? _to.name_ko : '미지정';
  let html = `<h3>${c.name_ko} <small>(${c.name_zh})</small></h3>
    <p>소속: ${owner}${legionTag} · 태수: ${_taesuName}<br>
    병사 ${c.troops.toLocaleString()} · 내구 ${c.hp}/${c.maxhp}<br>
    금 ${c.gold.toLocaleString()} · 병량 ${c.food.toLocaleString()}<br>
    상업 ${c.commerce} · 농업 ${c.farm}${c.metropolis ? ' · 대도시' : ''}${c.specialty.length ? ' · 특색: '+c.specialty.join(',') : ''} · 치안 ${c.security ?? 80}${c.disaster ? ` <span style="color:#f66">재해: ${c.disaster.type}</span>` : ''}<br>
    병장: 창${c.spears} 극${c.pikes} 노${c.bows} 군마${c.horses} · 병기: 충거${c.rams ?? 0} 정란${c.towers ?? 0} 목수${c.beasts ?? 0} 투석${c.catapults ?? 0} · 선박: 주가${c.junks ?? 0} 누선${c.lous ?? 0} 투함${c.dous ?? 0}</p>`;
  if (mine) {
    for (const family of ['siege', 'ship']) {
      const ship = family === 'ship', specs = ship ? SHIP_BUILD : SIEGE_BUILD;
      if (!game.cityFac(c, ship ? '조선소' : '공방').length) continue;
      html += `<p style="font-size:12px">${ship ? '선박 건조 (조선소)' : '병기 생산 (공방)'}: ` + Object.entries(specs).map(([k, spec]) => {
        const a = equipmentUiInfo(game, c, family, k);
        return `<span style="display:inline-flex;flex-direction:column;vertical-align:top;max-width:100%"><button class="cmd cmd-${family}" data-k="${k}"${a.why ? ` disabled title="${a.why}"` : ''}>${spec.name} (금${a.gold}·AP${a.ap})</button>${a.why ? `<small class="fac-why">${a.why}</small>` : ''}</span>`;
      }).join(' ') + '</p>';
    }
  }
  if (game.delegated && c.force != null && c.force !== game.playerForce && game.forces[c.force]?.alive) {
    html += `<button class="cmd" id="cmd-join">이 세력으로 참가 (${game.forceName(c.force)})</button>`;
  }
  if (mine) {
    html += `<div>
      ${domesticUiButton(game,c,'cmd-dev-c','commerce','상업 개발 (금300·AP30)')}
      ${domesticUiButton(game,c,'cmd-dev-f','farm','농업 개발 (금300·AP30)')}
      ${domesticUiButton(game,c,'cmd-recruit','recruit',`징병 (금200·병량1000·AP${Math.ceil(30*game.apMult(c,'military'))})`)}
      <button class="cmd" id="cmd-dispatch">출진</button>
      <button class="cmd" id="cmd-move">무장 이동</button>
      <button class="cmd" id="cmd-tech">기교 연구</button>
      <button class="cmd" id="cmd-fac">시설 건설</button>
      <button class="cmd" id="cmd-arms">병장 생산</button>
      ${(c.burn ?? 0) > 0 ? '<span style="color:#ff9a4a;display:block;margin:4px 0">불이 붙었습니다 (' + c.burn + '턴, 턴당 수비병 -3%) — 성 주변 아군 부대가 소화할 수 있습니다</span>' : ''}
      ${c.leveeBroken ? '<button class="cmd" id="cmd-levee">제방 보수 (금300)</button>' : ''}
      ${personnelUiButton(game,c,'search',null,'수색 (금100')}
      ${domesticUiButton(game,c,'cmd-patrol','patrol','치안 순찰 (금100·AP20)')}
      <button class="cmd" id="cmd-trade">상인</button>
      <button class="cmd" id="cmd-diplo">외교</button>
      <button class="cmd" id="cmd-advisor">군사</button>
    </div>`;
  }
  if (c.force === game.playerForce && !game.delegated) html += `<button class="cmd" id="cmd-legion">군단 관리</button>`; // R144: 전 도시를 위임해도 해산·직할 복귀 경로 유지
  if (mine) html += `<p style="margin-top:8px"><button class="cmd" id="cmd-swear">의형제 결연 (공적 500+ 무장 2~3명 · 기교P 500)</button></p>`;
  html += `<h3 style="margin-top:10px">주둔 무장 (${c.officers.length})</h3>`;
  if (c.officers.length) for (const i of c.officers) { // 褒賞: 주둔 무장별 포상 버튼 (매뉴얼 P.39 — 금100·AP5, 충성 100·종군·당턴 포상済 제외는 rewardOfficers가 판정)
    html += officerRow(i);
    if (mine && (game.officers[i]?.state?.loyal ?? 70) < 100) { const why = rewardUiWhy(game,c,i); html += `<button class="cmd cmd-rwd" data-i="${i}"${why ? ` disabled title="${why}"` : ''}>포상 (금100·AP5·충성+3)</button>${why ? `<small class="fac-why">${why}</small>` : ''}`; }
    if (mine) { // 官職: 무장별 관직 임명·해임 (매뉴얼 P.37 — 비용·AP 없음, 공적 비례·작위 연동 상한은 appointOffice가 최종 판정). 같은 관직 중복 임명 허용(자체 판단 — 매뉴얼 제한 미기재)
      const curOf = game.officeOf(i), maxOf = Math.min(game.officeGate(c.force), game.meritGrade(i));
      const opts = [`<option value="0"${curOf === 0 ? ' selected' : ''}>무관직</option>`];
      for (let r = 1; r <= 8; r++) opts.push(`<option value="${r}"${curOf === r ? ' selected' : ''}${r > maxOf ? ' disabled' : ''}>${OFFICES[r].name} (지휘+${OFFICES[r].cmd}·봉록+${OFFICES[r].sal})</option>`);
      html += `<select class="cmd cmd-office" data-i="${i}" title="관직 (공적 ${game.officers[i]?.state?.merit ?? 0}·세력 작위 상한 ${game.officeGate(c.force)}단계)">${opts.join('')}</select>`;
    }
  } else html += '<p>무장 없음</p>';
  const free = Object.values(DATA.officers).filter(o => o.state?.status === 'free' && o.state.city === c.id && o.state.found !== false);
  const hiddenFree = Object.values(DATA.officers).some(o => o.state?.status === 'free' && o.state.city === c.id && o.state.found === false);
  if (mine && hiddenFree) html += `<p style="font-size:12px;color:#aa6">이 도시에 미발견 재야 무장이 있는 것 같습니다 — 수색으로 찾아보세요.</p>`;
  if (free.length) {
    html += `<h3 style="margin-top:10px">재야 무장 (${free.length})</h3>`;
    for (const o of free) {
      html += officerRow(o.idx);
      if (mine && game.recruitChance(c.id, o.idx) > 0) html += personnelUiButton(game,c,'officer',o.idx,`등용 (금100·성공률 ${Math.round(game.recruitChance(c.id, o.idx)*100)}%`);
    }
  }
  const caps = game.captiveOfficers ? game.captiveOfficers(c.id) : []; // R111: 억류 포로 (매뉴얼 捕虜 — 등용·해방 가능)
  if (caps.length) {
    html += `<h3 style="margin-top:10px">포로 (${caps.length})</h3><p style="font-size:12px;color:#aa6">억류 중인 적 무장 — 매 턴 충성이 내려가며(부절대 보유 시 더 빠름), 등용하거나 석방할 수 있습니다.</p>`;
    for (const o of caps) {
      html += officerRow(o.idx) + `<span style="font-size:12px;color:#c96">충성 ${o.state?.loyal ?? '?'} · 원 소속 ${game.forceName(o.state?.force)}</span>`;
      if (mine) {
        if (game.recruitChance(c.id, o.idx) > 0) html += personnelUiButton(game,c,'officer',o.idx,`등용 (금100·성공률 ${Math.round(game.recruitChance(c.id, o.idx)*100)}%`);
        html += `<button class="cmd cmd-rel" data-i="${o.idx}">석방 (기교P +50)</button>`;
      }
    }
  }
  p.innerHTML = html;
  p.scrollTop = 0; // 패널 상단 고정 (이전 스크롤 잔류로 도시명이 가려지는 문제 방지)
  if (mine) {
    const sw = $('cmd-swear');
    if (sw) sw.onclick = () => showSwear(c);
    $('cmd-dev-c').onclick = () => { if (!domesticUiWhy(game,c,'commerce')) game.develop(c.id, 'commerce'); refreshAll(); showCityPanel(c); };
    $('cmd-dev-f').onclick = () => { if (!domesticUiWhy(game,c,'farm')) game.develop(c.id, 'farm'); refreshAll(); showCityPanel(c); };
    $('cmd-recruit').onclick = () => { if (!domesticUiWhy(game,c,'recruit')) game.recruit(c.id); refreshAll(); showCityPanel(c); };
    $('cmd-patrol').onclick = () => { if (!domesticUiWhy(game,c,'patrol')) game.patrol(c.id); refreshAll(); showCityPanel(c); };
    p.querySelectorAll('.cmd-siege').forEach(b => b.onclick = () => { if (!equipmentUiInfo(game,c,'siege',b.dataset.k).why) game.produceSiege(c.id, b.dataset.k); refreshAll(); showCityPanel(c); });
    p.querySelectorAll('.cmd-ship').forEach(b => b.onclick = () => { if (!equipmentUiInfo(game,c,'ship',b.dataset.k).why) game.produceShip(c.id, b.dataset.k); refreshAll(); showCityPanel(c); });
    $('cmd-dispatch').onclick = () => showDispatch(c);
    $('cmd-move').onclick = () => showMove(c);
    $('cmd-tech').onclick = () => showTech();
    $('cmd-fac').onclick = () => showFacilities(c);
    $('cmd-arms').onclick = () => showArms(c);
    if ($('cmd-levee')) $('cmd-levee').onclick = () => { game.repairLevee(c.id); refreshAll(); showCityPanel(c); }; // R28
    $('cmd-diplo').onclick = () => showDiplomacy(c);
    $('cmd-search').onclick = () => { if (!personnelUiInfo(game,c,'search').why) game.searchCity(c.id); refreshAll(); showCityPanel(c); };
    $('cmd-trade').onclick = () => showTrade(c);
    $('cmd-advisor').onclick = () => showAdvisor(c);
    p.querySelectorAll('.cmd-rwd').forEach(b => b.onclick = () => { if (rewardUiWhy(game,c,Number(b.dataset.i))) return; const ok = game.rewardOfficers(c.id, [Number(b.dataset.i)]); refreshAll(); showCityPanel(c); if (!ok) game.log(game.lastRewardWhy ?? '포상할 수 없습니다', true); }); // 褒賞
    p.querySelectorAll('.cmd-office').forEach(sel => sel.onchange = () => { const ok = game.appointOffice(c.id, Number(sel.dataset.i), Number(sel.value)); refreshAll(); showCityPanel(c); if (!ok) { game.log(game.lastOfficeWhy ?? '임명할 수 없습니다', true); refreshLog(); } }); // 官職
    p.querySelectorAll('.cmd-rec').forEach(b => b.onclick = () => { if (personnelUiInfo(game,c,'officer',Number(b.dataset.i)).why) return; const ok = game.recruitOfficer(c.id, Number(b.dataset.i)); refreshAll(); showCityPanel(c); if (!ok && game.lastRecruitWhy) { game.log(game.lastRecruitWhy, true); game.lastRecruitWhy = null; refreshLog(); } if (game.pendingDebate) showDebate(); }); // R11: 등용 실패 시 설전 발동 / R111: 비용 부족 사유 안내
    p.querySelectorAll('.cmd-rel').forEach(b => b.onclick = () => { const ok = game.releaseCaptive(c.id, Number(b.dataset.i)); refreshAll(); showCityPanel(c); if (!ok && game.lastReleaseWhy) { game.log(game.lastReleaseWhy, true); game.lastReleaseWhy = null; refreshLog(); } }); // R111: 포로 석방 + 비용 부족 사유 안내
  }
  const legManage = $('cmd-legion');
  if (legManage) legManage.onclick = () => showLegions(c); // 수동 내정 명령 차단과 관리 진입은 분리
  const join = $('cmd-join');
  if (join) join.onclick = () => {
    game.pendingJoin = c.force;
    game.log(`${game.forceName(c.force)}에 참가 요청 — 이번 턴이 끝나면 인계됩니다.`, true);
    game.autosave(); // R128: 결정 즉시 영속 (R122 패턴) — 턴 경계 전 reload 시 요청 소실 방지
    $('panel').classList.add('hidden'); refreshLog();
  };
}
// R146: 출진 편성의 기존 엔진 조건을 클릭 전에 안내 (비용·효과 규칙은 그대로)
function dispatchUiWhy(game, c, troops, type, offs) {
  if (!c || c.force !== game.playerForce) return '현재 소유한 도시가 아닙니다';
  if (offs.some(i => !c.officers.includes(i) || game.officers[i]?.state?.force !== c.force)) return '주둔 무장이 바뀌었습니다. 다시 선택하세요';
  if (!offs.length) return '무장을 선택하세요';
  if (offs.length > game.dispatchCap(c.force)) return '무장 ' + game.dispatchCap(c.force) + '명까지 편성 가능';
  if (offs.some(i => (game.officers[i]?.state?.injuredUntil ?? 0) > game.turn)) return '부상 무장은 출진할 수 없습니다';
  if (!Number.isFinite(troops) || troops < 500 || !Number.isInteger(troops)) return '병사는 500명 이상의 정수로 입력하세요';
  const cap = Math.min(c.troops, game.unitTroopCap(c.force) + (OFFICES[game.officeOf(offs[0])]?.cmd ?? 0));
  if (troops > cap) return '병력 상한 ' + cap.toLocaleString() + '명';
  if (game._blocked(c)) return '군단 소속 도시입니다';
  const ap = Math.ceil(40 * game.apMult(c, 'military'));
  if (game.forces[c.force].ap < ap) return '행동력 ' + ap + ' 필요';
  const ut = UNIT_TYPES[type];
  if (!ut) return '병종을 선택하세요';
  for (const [key, per] of Object.entries(ut.cost)) {
    const need = ut.perUnit ? per : per * troops;
    if ((c[key] ?? 0) < need) return ut.name + ' 병장 부족 (보유 ' + (c[key] ?? 0).toLocaleString() + ' / 필요 ' + need.toLocaleString() + ')';
  }
  if (SHIP_TYPES.has(type) && !game.nearestWater(c.lon, c.lat)) return '인접 수로가 없어 선박을 띄울 수 없습니다';
  return '';
}
function showDispatch(c) { $('panel').dataset.view='dispatch';
  const p = $('panel');
  let capBase = game.unitTroopCap(c.force); // 기본 상한 (군제개혁 +3000 포함)
  const leadOf = () => Number(document.querySelector('.dsp-off:checked')?.value ?? -1); // 주장 = DOM 순 첫 번째 선택 무장 (dispatch officerIdxs[0]과 동일 규칙)
  const capTotal = () => capBase + (leadOf() >= 0 ? (OFFICES[game.officeOf(leadOf())]?.cmd ?? 0) : 0); // R84: 관직 지휘 가산 명시 합산 (자체 규칙)
  const cap = Math.min(c.troops, capTotal());
  p.innerHTML = `<h3>${c.name_ko} 출진 편성</h3>
    <p>병사: <input id="dsp-troops" type="number" value="${Math.min(5000, cap)}" min="500" max="${cap}" step="500" style="width:90px"> <span id="dsp-cap" style="font-size:12px;color:#998"></span></p>
    <p>병종: <select id="dsp-type">${Object.entries(UNIT_TYPES).map(([k,v]) => {
      const need = Object.entries(v.cost)[0];
      const have = need ? (c[need[0]] ?? 0) : 1;
      const stock = need ? ` (보유 ${have})` : '';
      return `<option value="${k}" ${have < 1 ? 'disabled' : ''}>${v.name}${stock}</option>`;
    }).join('')}</select></p>
    <p>부장 (최대 3):</p>
    ${c.officers.map(i => `<label style="display:block"><input type="checkbox" class="dsp-off" value="${i}"> ${DATA.officers[i].name_ko} (무${DATA.officers[i].war}/통${DATA.officers[i].ldr})</label>`).join('')}
    <p id="dsp-why" role="status" style="color:#d9a18a;font-size:12px"></p><p><button class="cmd" id="dsp-go">출진</button> <button class="cmd" id="dsp-back">취소</button></p>
    <p style="font-size:12px;color:#998">출진 후 부대를 선택하고 목표 도시를 클릭하면 이동합니다.</p>`;
  $('dsp-back').onclick = () => showCityPanel(c);
  const selectedOffs = () => [...document.querySelectorAll('.dsp-off:checked')].map(x => Number(x.value));
  const refreshDispatch = () => {
    const why = dispatchUiWhy(game, c, Number($('dsp-troops').value), $('dsp-type').value, selectedOffs());
    $('dsp-go').disabled = !!why; $('dsp-go').title = why; $('dsp-why').textContent = why;
  };
  const refreshCap = (clamp = true) => { // R84: 주장 선택 변경 시 관직 가산 포함 상한 재계산·표기
    const t = Math.min(c.troops, capTotal()), ofc = leadOf() >= 0 ? (OFFICES[game.officeOf(leadOf())]?.cmd ?? 0) : 0;
    const inp = $('dsp-troops'); inp.max = t; if (clamp && Number(inp.value) > t) inp.value = t;
    $('dsp-cap').textContent = `상한 ${t.toLocaleString()} = 기본 ${capBase.toLocaleString()}(군제 포함) + 주장 관직 +${ofc.toLocaleString()}`;
  };
  document.querySelectorAll('.dsp-off').forEach(cb => cb.onchange = () => { const lim = game.dispatchCap(c.force); if (document.querySelectorAll('.dsp-off:checked').length > lim) { cb.checked = false; game.log(`한 부대에는 무장 ${lim}명까지 편성할 수 있습니다.`, true); refreshLog(); } refreshCap(); refreshDispatch(); }); // 3명 제한: 체크 단계에서 거부·안내
  p.refreshDispatch = () => { // R161: 입력은 유지하고 턴 후 AP·주둔·병장·상한만 다시 확인
    if (p.dataset.view !== 'dispatch') return;
    capBase = game.unitTroopCap(c.force);
    refreshCap(false);
    for (const opt of $('dsp-type').options) {
      const ut = UNIT_TYPES[opt.value], key = Object.keys(ut.cost)[0], have = key ? (c[key] ?? 0) : 1;
      opt.textContent = ut.name + (key ? ` (보유 ${have})` : ''); opt.disabled = have < 1;
    }
    refreshDispatch();
  };
  refreshCap(); refreshDispatch();
  $('dsp-troops').oninput = refreshDispatch; $('dsp-type').onchange = refreshDispatch;
  $('dsp-go').onclick = () => {
    refreshDispatch(); if ($('dsp-go').disabled) return;
    const troops = Math.min(Math.min(c.troops, capTotal()), Number($('dsp-troops').value));
    const type = $('dsp-type').value;
    const offs = [...document.querySelectorAll('.dsp-off:checked')].map(x => Number(x.value)).slice(0, game.dispatchCap(c.force));
    if (!offs.length) { game.log('부장을 선택하세요.', true); refreshLog(); return; }
    const u = game.dispatch(c.id, offs, troops, type);
    if (!u) { game.log('출진할 수 없습니다 (행동력·병장·병력 부족).', true); refreshLog(); return; }
    map.addUnit(worldUnit(u), forceColor(u.force));
    game.autosave(); // R122: R13 정책 정합 — 출진도 실행 직후 영속 (턴 종료 전 리로드 소실 방지)
    refreshHud(); refreshLog(); showCityPanel(c);
  };
}
// R148: 무장 이동의 기존 비용/권한 조건을 클릭 전에 안내
function moveUiWhy(game, c, to, offs) {
  if (!c || c.force !== game.playerForce || game.delegated) return '현재 직접 지휘하는 도시가 아닙니다';
  if (!offs.length) return '이동할 무장을 선택하세요';
  if (!to || to.id === c.id || to.force !== c.force) return '이동할 아군 도시가 없습니다';
  if (game._blocked(c)) return '군단 소속 도시입니다';
  const ap = Math.ceil(20 * game.apMult(c, 'personnel'));
  if (game.forces[c.force].ap < ap) return '행동력 ' + ap + ' 필요';
  if (offs.some(i => !c.officers.includes(i) || game.officers[i]?.state?.force !== c.force || game.officers[i]?.state?.city !== c.id || !['ruler','taesu','serving'].includes(game.officers[i]?.state?.status))) return '주둔 무장이 바뀌었습니다. 다시 선택하세요';
  return '';
}
function showMove(c) {
  const p = $('panel'); p.dataset.view = 'move'; p.scrollTop = 0;
  const mine = game.forceCities(game.playerForce).filter(x => x.id !== c.id);
  p.innerHTML = `<h3>${c.name_ko} → 무장 이동</h3>
    <p id="mv-status" class="st">행동력 ${game.forces[c.force].ap} · 이동 비용 ${Math.ceil(20 * game.apMult(c, 'personnel'))}</p>
    ${c.officers.map(i => `<label style="display:block"><input type="checkbox" class="mv-off" value="${i}"> ${DATA.officers[i].name_ko}</label>`).join('')}
    <p>목적지: <select id="mv-to">${mine.map(x => `<option value="${x.id}">${x.name_ko}</option>`).join('')}</select></p>
    <p id="mv-why" role="status" style="color:#d9a18a;font-size:12px"></p>
    <p><button class="cmd" id="mv-go">이동</button> <button class="cmd" id="mv-back">취소</button></p>`;
  $('mv-back').onclick = () => showCityPanel(c);
  const selected = () => [...p.querySelectorAll('.mv-off:checked')].map(x => Number(x.value));
  const refreshMove = () => {
    $('mv-status').textContent = '행동력 ' + game.forces[c.force].ap + ' · 이동 비용 ' + Math.ceil(20 * game.apMult(c, 'personnel'));
    const why = moveUiWhy(game, c, game.cityById[Number($('mv-to').value)], selected());
    $('mv-go').disabled = !!why; $('mv-go').title = why; $('mv-why').textContent = why;
  };
  p.querySelectorAll('.mv-off').forEach(cb => cb.onchange = refreshMove);
  $('mv-to').onchange = refreshMove;
  p.refreshMove = refreshMove;
  refreshMove();
  $('mv-go').onclick = () => {
    refreshMove(); if ($('mv-go').disabled) return;
    if (!game.moveOfficers(c.id, Number($('mv-to').value), selected())) {
      refreshMove(); $('mv-why').textContent ||= '이동할 수 없습니다'; return;
    }
    game.autosave(); // R122: 무장 이동도 실행 직후 영속 (R13 정책 정합)
    refreshHud(); refreshLog(); showCityPanel(c);
  };
}
function showUnitPanel(uid) {
  $('panel').dataset.view = 'unit';
  const u = game.units.find(x => x.id === uid); if (!u) return;
  const p = $('panel'); p.classList.remove('hidden');
  // R112: 시설 소화 (매뉴얼 消火) — 템플릿 내 up-douse-f 행 참조
  const mine = u.force === game.playerForce && !game.delegated;
  p.innerHTML = `<h3>${u.label} (${UNIT_TYPES[u.type].name})</h3>
    <p>소속: ${game.forceName(u.force)} · 병력 ${u.troops.toLocaleString()}<br>
    부장: ${u.officers.map(i => DATA.officers[i].name_ko).join(', ')}<br>기력 ${u.qi ?? 100} / 100${(u.conf ?? 0) > 0 ? ` · <span style='color:#e66'>혼란 ${u.conf}턴</span>` : ''}${u.food != null ? ` · 병량 ${Math.round(u.food)}${(() => { const eat = u.troops * RULES.garrisonFood / 3; const days = eat > 0 ? Math.round(u.food / eat) * 10 : 999; return days <= 30 ? ` <span style='color:#e66'>(${days}일분!)</span>` : ` (${days}일분)`; })()}` : ''}</p>
    ${mine ? '<p style="color:#ffd700">목표 도시를 클릭하면 이동 명령을 내립니다.</p>' : ''}
    ${mine && game.tacticInfo?.(u) ? `<p>${game.tacticInfo(u).opts.map(o => o.block ? `<button class="cmd up-tac" data-tid="${o.id}" disabled style="opacity:.5">전법 ${o.name} (기력 ${o.qi}) — ${o.block}</button>` : `<button class="cmd up-tac" data-tid="${o.id}">전법 ${o.name} (기력 ${o.qi})</button>`).join(' ')}</p>` : ''}
    ${mine && game.canAmbush(u) && game.ambushTarget(u) && (u._stratTurn ?? -1) !== game.turn && (u.qi ?? 100) >= 10 && u.officers.some(i => (DATA.officers[i]?.int ?? 0) >= 60) ? '<p><button class="cmd" id="up-ambush">계략 복병 (기력 10, 숲에서 인접 적 기습)</button></p>' : ''}
    ${mine && (u.burn ?? 0) > 0 && (u._stratTurn ?? -1) !== game.turn && (u.qi ?? 100) >= 10 && u.officers.some(i => (DATA.officers[i]?.int ?? 0) >= 60) ? '<p style="color:#ff9a4a">불이 붙었습니다 (' + u.burn + '턴, 턴당 병력 -4%) <button class="cmd" id="up-douse">계략 소화 (기력 10)</button></p>' : ''}
    ${mine && (u._stratTurn ?? -1) !== game.turn && (u.qi ?? 100) >= 10 && u.officers.some(i => (DATA.officers[i]?.int ?? 0) >= 60) ? (() => { const bc = game.cities.find(c => c.force === u.force && (c.burn ?? 0) > 0 && Math.hypot(c.lon - u.x, c.lat - u.z) < 2.2); return bc ? `<p style="color:#ff9a4a">${bc.name_ko}에 불이 붙었습니다 <button class="cmd" id="up-douse-c" data-c="${bc.id}">계략 소화 — ${bc.name_ko} (기력 10)</button></p>` : ''; })() : ''}
    ${mine && (u._stratTurn ?? -1) !== game.turn && (u.qi ?? 100) >= 10 && u.officers.some(i => (DATA.officers[i]?.int ?? 0) >= 60) ? (() => { const bf = (game.fieldFacs ?? []).find(f => (f.burn ?? 0) > 0 && Math.hypot(f.x - u.x, f.z - u.z) < 2.2); return bf ? `<p style="color:#ff9a4a">${bf.type}에 불이 붙었습니다 <button class="cmd" id="up-douse-f" data-f="${bf.id}">계략 소화 — ${bf.type} (기력 10)</button></p>` : ''; })() : ''}
    ${mine && (u.conf ?? 0) <= 0 && (u._stratTurn ?? -1) !== game.turn && u.officers.some(i => (DATA.officers[i]?.int ?? 0) >= 75) && (u.qi ?? 100) >= 10 ? '<p><button class="cmd" id="up-fire">계략 화계 (기력 10)</button></p>' : ''}
    ${mine && (u.conf ?? 0) <= 0 && (u._stratTurn ?? -1) !== game.turn && u.officers.some(i => (DATA.officers[i]?.int ?? 0) >= 80) && (u.qi ?? 100) >= 15 ? '<p><button class="cmd" id="up-conf">계략 교란 (기력 15)</button></p>' : ''}
    ${mine && (u.conf ?? 0) <= 0 && (u._stratTurn ?? -1) !== game.turn && u.officers.some(i => (DATA.officers[i]?.int ?? 0) >= 80) && (u.qi ?? 100) >= 15 ? '<button class="cmd" id="up-rumor">계략 위보 (기력 15)</button> <button class="cmd" id="up-calm">계략 진정 (기력 10)</button>' : ''}
    ${mine && (u.conf ?? 0) <= 0 && (u._stratTurn ?? -1) !== game.turn && (u.qi ?? 100) >= 50 ? ['요술', '낙뢰'].filter(sk => u.officers.some(i => game.officers[i]?.skill === sk)).map(sk => `<p><button class="cmd" id="up-${sk === '요술' ? 'sorcery' : 'thunder'}">계략 ${sk} (기력 50, 광역)</button></p>`).join('') : ''}
    ${mine && !SHIP_TYPES.has(u.type) ? `<p>${u.building ? `<span style="color:#ffd700">${u.building} 건설 중 (이동 명령을 내리면 취소)</span>` : Object.entries(FIELD_FACS).map(([k, v]) => `<button class="cmd up-ff" data-k="${k}" title="${v.desc}">${k} 건설 (금 ${v.cost}·${v.turns}턴)</button>`).join(' ')}</p>` : ''}
    ${mine ? (() => { if (u.repairing != null) { const rf = (game.fieldFacs ?? []).find(f => f.id === u.repairing); if (rf) return `<p><span style="color:#ffd700">${rf.type} 보수 중 (내구 ${rf.hp}/${FIELD_FACS[rf.type].hp}, 이동 명령을 내리면 중단)</span></p>`; } const reps = (game.fieldFacs ?? []).filter(f => game.canRepairFac(u, f) === null); return reps.length ? `<p>${reps.map(f => `<button class="cmd up-rep" data-f="${f.id}">${f.type} 보수 (내구 ${f.hp}/${FIELD_FACS[f.type].hp}·금 불요)</button>`).join(' ')}</p>` : ''; })() : ''}
    ${mine ? (() => { const nc = game.cities.find(c => game.canBreakLevee(u, c) === null); return nc ? `<p><button class="cmd" id="up-levee" data-c="${nc.id}">제방 파괴 — ${nc.name_ko} (내구 -15%·병사 -10%·2턴 침수)</button></p>` : ''; })() : ''}
    <p><button class="cmd" id="up-close">닫기</button></p>`;
  $('up-close').onclick = () => { $('panel').classList.add('hidden'); selectedUnit = null; pendingFire = null; };
  const armFire = (kind, label, tid = null) => { // R15: 대상 선택 모드 진입
    pendingFire = { uid: u.id, kind, tid };
    p.innerHTML = `<h3>${u.label} — ${label}</h3><p style="color:#ffd700">인접한 적 부대나 도시를 클릭하면 발동합니다.</p><p><button class="cmd" id="up-cancel">취소</button></p>`;
    $('up-cancel').onclick = () => { pendingFire = null; showUnitPanel(u.id); };
  };
  document.querySelectorAll('#panel .up-tac').forEach(b => { b.onclick = () => { const o = game.tacticInfo(u).opts.find(x => x.id === b.dataset.tid); armFire('tactic', `전법 ${o.name}`, o.id); }; });
  document.querySelectorAll('#panel .up-ff').forEach(b => { b.onclick = () => { // R26
    const ok = game.buildField(u.id, b.dataset.k);
    refreshAll(); showUnitPanel(u.id);
    if (!ok) { const w = document.createElement('p'); w.style.color = '#e66'; w.textContent = game.lastFieldWhy ?? '건설할 수 없습니다'; $('panel').insertBefore(w, $('up-close').parentElement); }
  }; });
  document.querySelectorAll('#panel .up-rep').forEach(b => { b.onclick = () => { const ok = game.repairFac(u.id, Number(b.dataset.f)); refreshAll(); showUnitPanel(u.id); if (!ok) { const w = document.createElement('p'); w.style.color = '#e66'; w.textContent = game.lastRepairWhy ?? '보수할 수 없습니다'; $('panel').insertBefore(w, $('up-close').parentElement); } }; });
  if ($('up-levee')) $('up-levee').onclick = () => { game.breakLevee(u.id, Number($('up-levee').dataset.c)); refreshAll(); showUnitPanel(u.id); }; // R28
  if ($('up-ambush')) $('up-ambush').onclick = () => { game.fireStrat(u.id, 'ambush', {}); refreshAll(); showUnitPanel(u.id); };
  if ($('up-douse')) $('up-douse').onclick = () => { game.fireStrat(u.id, 'douse', { type: 'unit', id: u.id }); refreshAll(); showUnitPanel(u.id); };
  if ($('up-douse-c')) $('up-douse-c').onclick = () => { game.fireStrat(u.id, 'douse', { type: 'city', id: Number($('up-douse-c').dataset.c) }); refreshAll(); showUnitPanel(u.id); };
  if ($('up-douse-f')) $('up-douse-f').onclick = () => { game.fireStrat(u.id, 'douse', { type: 'fac', id: Number($('up-douse-f').dataset.f) }); refreshAll(); showUnitPanel(u.id); }; // R112: 시설 소화
  if ($('up-fire')) $('up-fire').onclick = () => armFire('fire', '계략 화계');
  if ($('up-conf')) $('up-conf').onclick = () => armFire('confuse', '계략 교란');
  if ($('up-rumor')) $('up-rumor').onclick = () => armFire('rumor', '계략 위보');
  if ($('up-sorcery')) $('up-sorcery').onclick = () => armFire('sorcery', '계략 요술');
  if ($('up-thunder')) $('up-thunder').onclick = () => armFire('thunder', '계략 낙뢰');
  if ($('up-calm')) $('up-calm').onclick = () => armFire('calm', '계략 진정');
}

// === 부트 ===
async function boot() {
  await loadData();
  $('btn-new').onclick = () => { buildScenarioScreen(); show('screen-scenario'); };
  document.querySelectorAll('.back').forEach(b => b.onclick = () => show('screen-title'));
  if (localStorage.getItem(SAVE_KEY)) {
    $('btn-continue').disabled = false;
    $('btn-continue').onclick = () => {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY));
      const g = new Game(DATA.scenarios[d.scenId], DATA.officers, DATA.skills, d.playerForce);
      window.__game = g; // 테스트 훅
      Object.assign(g, { year: d.year, month: d.month, dan: d.dan, turn: d.turn, emperor: d.emperor !== undefined ? d.emperor : g.emperor, cities: d.cities, forces: d.forces, units: d.units, nextUnitId: d.nextUnitId, fieldFacs: d.fieldFacs ?? [], nextFacId: d.nextFacId ?? 1, playerForce: d.playerForce, delegated: d.delegated, logs: d.logs, deadAck: d.deadAck, chronicle: d.chronicle ?? [], pendingDiplo: d.pendingDiplo ?? [], /* R123: 구 저장은 빈 큐 (호환) */ pendingJoin: d.pendingJoin ?? null, /* R128: 구 저장은 null (호환). 무효 요청은 아래에서 정리 */ monthlyReview: d.monthlyReview ?? null, /* R132: 구 저장은 null (호환) — 첫 결산은 기준 없음으로 표시 */ over: d.over ?? false, unified: d.unified ?? d.over ?? false, econGraceUntil: d.econGraceUntil ?? null, econV: d.econV ?? 1 }); g._reviewBase = d.reviewBase ?? null; // R132 // R14: over로 저장된 통일 세이브 호환 / 병량 유예 복원 / econV 없는 구 저장은 구 경제 규칙 보존
      g.cityById = {}; g.cities.forEach(c => g.cityById[c.id] = c);
      for (const c of g.cities) { c.officers = [...new Set(c.officers ?? [])]; c.captives = c.captives ?? []; } // 레거시 세이브 중복 무장 정리 / R111: 억류 명단 필드 호환 (정합은 _reconcileOfficerRosters)
      g.diplo = d.diplo ?? {};
      g.itemPool = d.itemPool ?? Object.values(ITEMS).map(i => i.id).filter(id => !Object.values(g.officers).some(o => (o.state.items ?? []).includes(id)));
      // 강제 마이그레이션 없음: 구 저장은 econV 1 규칙 그대로 진행 (향후 전환 선택 UI는 별도)
      for (const o of Object.values(g.officers)) { o.state.items = o.state.items ?? []; if (o.state.status === 'free' && o.state.found === undefined) o.state.found = true; } // 기존 세이브의 재야는 발견 상태 유지
      for (const f of Object.values(g.forces)) { f.advisor = f.advisor ?? null; f.legions = f.legions ?? []; } // 군사·군단 필드 호환 // 외교 상태 복원 (레거시 세이브는 공백)
      for (const [i, st] of Object.entries(d.officerStates)) if (DATA.officers[i]) restoreOfficer(DATA.officers[i], st); // R84: 복원 공통화 (R13 연구 + 관직 능력 가산 재적용)
      if (g.pendingJoin != null && (!g.forces[g.pendingJoin]?.alive || g.pendingJoin === g.playerForce)) { g.log(`참가 요청한 ${josa('【' + g.forceName(g.pendingJoin) + '】군', ['이','가'])} 멸망하여 참가 요청이 취소되었습니다. 다른 세력을 선택해 주세요.`, true); g.pendingJoin = null; } // R128: 로드 시 무효 참가 요청 정리 — 중복 인계 없음 (인계는 턴 경계 1회)
      g._reconcileOfficerRosters(); // R96: 구 저장의 로스터 누락·타 세력 로스터 잔류 무장 복귀 (멱등)
      game = g; enterGame(); refreshAll(); checkGameOver(); // R14: 저장 시점이 종료 상태면 모달 재표시
      if ((game.pendingDiplo ?? []).length) showDiploIn(); // R123: 저장 시점의 보류 제안은 효과 재적용 없이 결정 모달만 복원
      if (game.delegated) setAuto(true);
    };
  }
  $('btn-endturn').onclick = () => { if (!game.delegated) doTurn(); };
  $('btn-delegate').onclick = () => {
    game.delegated = !game.delegated;
    game.log(game.delegated ? '세력 운영을 AI에 위임합니다. 언제든 직접 지휘로 돌아오거나 다른 세력에 참가할 수 있습니다.' : '직접 지휘로 복귀합니다.', true);
    refreshAll(); refreshOpenPanel();
    setAuto(game.delegated);
  };
  $('btn-stop-auto').onclick = () => { game.delegated = false; setAuto(false); refreshAll(); refreshOpenPanel(); };
  $('sel-speed').onchange = () => { if (game?.delegated) setAuto(true); };
  $('btn-rot-l').onclick = () => map && map.rotate90(1);
  $('btn-rot-r').onclick = () => map && map.rotate90(-1);
  if ($('panel-x')) $('panel-x').onclick = () => { $('panel').classList.add('hidden'); selectedUnit = null; pendingFire = null; };
  if ($('btn-sound')) { $('btn-sound').onclick = toggleSound; applySound(); }
  if ($('btn-dash')) $('btn-dash').onclick = () => showDashboard(); // R97
  $('btn-menu').onclick = () => modal('메뉴', [
    ['세력 현황', () => showDashboard()], // R97
    ['연감', () => showChronicle()], // R14
    ['월 결산', () => showReview()], // R132
    ['저장하고 타이틀로', saveAndTitle],
    ['타이틀로 (저장은 자동)', saveAndTitle],
    ['계속', () => {}],
  ]);
}
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => document.documentElement.style.setProperty('--hud-h', ($('hud-top').offsetHeight + 6) + 'px')).observe($('hud-top')); // R14: HUD 높이 변동(줄바꿈·자동진행 바·폰트) 추적
boot();
