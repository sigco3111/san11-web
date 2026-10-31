// 진입점: 화면 전환·UI·지도 연결
import { Map3D, toWorld } from './map3d.js?v=r120';
import { Game, SAVE_KEY, RULES, forceColor, UNIT_TYPES, ARTS, OFFICES, restoreOfficer, FIELD_FACS, TRAPS, SHIP_TYPES, TAC_SHIP_OK, josa, josaRo, TECH_BRANCHES, TECH_P, TECH_GOLD, TECH_DESC, FACILITIES, ITEMS, SIEGE_BUILD, SHIP_BUILD, AB_BRANCHES, AB_P, AB_SKILL, AB_PICK } from './game.js?v=r120';
import { aiThink } from './ai.js?v=r120';

const $ = id => document.getElementById(id);
let DATA = null, game = null, map = null, selectedUnit = null, autoTimer = null, pendingFire = null; // R15: 직접 전법·계략 대기

const BUILD_ID = 'r120'; // 빌드 ID (index.html의 meta[name=build]와 같아야 함 - 오래된 캐시된 index와 새 스크립트의 혼합 감지)
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
      .map(u => fetch(u + '?v=r120').then(r => r.json())));
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
  map.setSeason?.(game.month); // R16: 사계절 표현
  refreshHud(); refreshLog();
  game.autosave(); // R13 회귀 방지: UI에서 실행한 모든 커맨드는 실행 직후 영속 (턴 종료 전 리로드 소실 방지)
}
function worldUnit(u) { const [x, z] = toWorld(u.x, u.z); return { id: u.id, x, z, label: u.label, type: u.type }; } // R16: 병종별 모델용 type
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
  game.endTurn(aiThink);
  refreshAll();
  if (selectedUnit != null && !$('panel').classList.contains('hidden')) { // 턴 처리 후 열려 있는 부대 패널 갱신 (건설 완료·병력·기력 반영)
    if (game.units.find(x => x.id === selectedUnit)) showUnitPanel(selectedUnit); else { $('panel').classList.add('hidden'); selectedUnit = null; }
  } else if ($('panel').dataset.view === 'city' && lastCityId != null && !$('panel').classList.contains('hidden')) { // R108: 열려 있는 도시 패널(기본 화면)도 턴 반영 — 병력·로스터 정체 방지. 스크롤 위치는 유지하고, 출진·기교 등 하위 화면의 입력 중인 상태는 덮지 않음
    const c = game.cityById[lastCityId];
    if (c) { const p = $('panel'), st = p.scrollTop; showCityPanel(c); p.scrollTop = st; }
    else { $('panel').classList.add('hidden'); lastCityId = null; }
  }
  checkGameOver();
  if (game.pendingDuel) showDuel(); // R10: 일기토 모달
  if (game.pendingDebate) showDebate(); // R11: 설전 모달
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
    else { m.classList.add('hidden'); refreshAll(); checkGameOver(); }
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
    else { m.classList.add('hidden'); refreshAll(); checkGameOver(); }
  };
  render();
}
function setAuto(on) {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  if (on) {
    const speed = Number($('sel-speed').value);
    autoTimer = setInterval(() => {
      if (!game.delegated || game.over) { setAuto(false); return; }
      doTurn();
      if (game.delegated && game.pendingStop) { game.pendingStop = false; game.delegated = false; setAuto(false); refreshHud(); }
    }, Math.max(120, 1400 / speed));
  }
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
      const card = (label, val) => `<div style="flex:1;min-width:84px;background:#2a251d;border:1px solid #4a4132;border-radius:6px;padding:6px 4px;text-align:center"><div style="font-size:11px;color:#aa9">${label}</div><div style="font-size:16px;color:#e8dfc8;font-weight:bold">${val}</div></div>`;
      body += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin:4px 0">` +
        card('도시', s.cities) + card('무장', s.officers) + card('주둔 병력', fmt(s.garrison)) + card('포로', s.captives ?? 0) + // R111: 억류 포로 수 (매뉴얼 捕虜)
        card('출진', `${s.fieldUnits}부대·병력 ${fmt(s.fieldTroops)}명`) // R120: 뒤 숫자 단위 모호 지적 반영 + card('금', fmt(s.gold)) + card('군량', fmt(s.food)) + `</div>`;
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
      body += sec('도시', ov.cities.length ? ov.cities.map(r => `<p style="margin:2px 0"><b>${r.name}</b> — 금 ${fmt(r.gold)} · 군량 ${fmt(r.food)} · 병 ${fmt(r.troops)} · 무장 ${r.officers} <span style="color:#aa9">(금 수입 ${fmt(r.goldIn)} − 봉록 ${fmt(r.sal)} · 군량 수입 ${fmt(r.foodIn)} − 소비 ${fmt(r.foodNeed)})</span></p>`).join('') : none('보유 도시 없음'));
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
function showAdvisor(c) { $('panel').dataset.view='advisor'; // 군사 임명: 지력 70 이상만 (설계안 명시)
  const p = $('panel');
  const f = game.forces[c.force];
  const serving = Object.values(DATA.officers).filter(o => o.state?.force === c.force).sort((a, b) => b.int - a.int);
  let html = `<h3>${game.forceName(c.force)} 군사</h3>`;
  html += f.advisor != null ? `<p>현재 군사: <b>${DATA.officers[f.advisor].name_ko}</b> (지력 ${DATA.officers[f.advisor].int})</p>` : '<p>현재 군사: 없음</p>';
  html += '<p style="font-size:12px;color:#998">군사는 지력 70 이상만 임명 가능. 적국의 군주·군사 지력이 높을수록 아군 계략 성공률이 낮아집니다.</p>';
  for (const o of serving) {
    const ok = o.int >= 70;
    html += `<div class="officer"><div><div class="nm">${o.name_ko} <span class="st">지력 ${o.int}${f.advisor === o.idx ? ' · 현 군사' : ''}</span></div></div>${ok && f.advisor !== o.idx ? `<button class="cmd cmd-adv" data-i="${o.idx}">임명</button>` : ''}</div>`;
  }
  html += `<button class="cmd" id="adv-back">← 도시 패널로</button>`;
  p.innerHTML = html;
  p.querySelectorAll('.cmd-adv').forEach(b => b.onclick = () => { game.appointAdvisor(Number(b.dataset.i)); refreshAll(); showAdvisor(c); });
  $('adv-back').onclick = () => showCityPanel(c);
}
function showLegions(c) { $('panel').dataset.view='legion'; // 군단 편성: 도시 묶음을 도독에게 위임 (제2군단~, 제1군단은 군주 직할)
  const p = $('panel');
  const f = game.forces[c.force];
  const own = game.forceCities(c.force);
  const serving = Object.values(DATA.officers).filter(o => o.state?.force === c.force);
  const free = own.filter(x => !game.cityLegion(x.id));
  const render = () => {
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
function showTrade(c) { $('panel').dataset.view='trade'; // 상인: 월별 환율, 금↔병량 (자체 수치)
  const p = $('panel');
  const rate = game.tradeRate();
  const myF = game.forces[c.force];
  const render = () => {
    p.innerHTML = `<h3>${c.name_ko} 상인</h3>
      <p>이번 달 환율: 금 1000 ↔ 병량 ${rate.toLocaleString()} (매월 변동)</p>
      <p>보유: 금 ${c.gold.toLocaleString()} · 병량 ${c.food.toLocaleString()} · 행동력 ${myF.ap}</p>
      <p>거래량 (롯트): <select id="trd-lots">${[1,2,3,4,5].map(n => `<option value="${n}">${n}</option>`).join('')}</select></p>
      <p><button class="cmd" id="trd-buy" ${myF.ap < 10 || c.gold < 1000 ? 'disabled' : ''}>병량 매입 (금→병량)</button>
      <button class="cmd" id="trd-sell" ${myF.ap < 10 || c.food < rate ? 'disabled' : ''}>병량 매각 (병량→금)</button>
      <button class="cmd" id="trd-back">← 도시 패널로</button></p>`;
    $('trd-buy').onclick = () => { game.trade(c.id, 'buy', Number($('trd-lots').value)); refreshAll(); render(); };
    $('trd-sell').onclick = () => { game.trade(c.id, 'sell', Number($('trd-lots').value)); refreshAll(); render(); };
    $('trd-back').onclick = () => showCityPanel(c);
  };
  render();
}
function showDiplomacy(c) { $('panel').dataset.view='diplo';
  const p = $('panel'); p.classList.remove('hidden');
  const myF = game.forces[c.force];
  const others = Object.values(game.forces).filter(f => f.alive && f.id !== c.force);
  let html = `<h3>${c.name_ko} 외교 <small>(사절: 이 도시에서 파견)</small></h3>`;
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
    html += `<button class="cmd dip-act" data-a="envoy" data-t="${t.id}" ${myF.ap < 20 || c.gold < 500 ? 'disabled' : ''}>친선사절(금500)</button> `;
    if (!allied && v >= 60) html += `<button class="cmd dip-act" data-a="ally" data-t="${t.id}" ${myF.ap < 30 || c.gold < 1000 ? 'disabled' : ''}>동맹 제의(금1000)</button> `;
    if (v <= 39) html += `<button class="cmd dip-act" data-a="truce" data-t="${t.id}" ${myF.ap < 30 || c.gold < 2000 ? 'disabled' : ''}>정전 요청(금2000)</button> `;
    if (tCities <= 2) html += `<button class="cmd dip-act" data-a="surrender" data-t="${t.id}" ${myF.ap < 30 || c.gold < 1000 ? 'disabled' : ''}>항복 권고(금1000)</button> `;
    if (allied) {
      html += `<button class="cmd dip-act" data-a="aid" data-t="${t.id}" ${aidCool < 18 ? 'disabled' : ''}>원군 요청${aidCool < 18 ? `(${18 - aidCool}턴)` : ''}</button> `;
      html += `<button class="cmd dip-act" data-a="break" data-t="${t.id}">동맹 파기</button> `;
    }
    html += `</div></div></div>`;
  }
  html += `<p class="st">관계: 80+ 친밀 · 60+ 호의 · 40+ 중립 · 20+ 불화 · 미만 험악 — 매달 중립으로 서서히 회귀. 동맹국은 서로 공격하지 않습니다. 협상 결렬·등용 실패 시 30% 확률로 설전이 벌어지며, 승리하면 협상이 재심됩니다. 논객 특기는 성공률과 설전 공격력(+25%)을 보정합니다.</p>`;
  html += `<button class="cmd" id="cmd-diplo-back">← 도시 패널로</button>`;
  p.innerHTML = html;
  p.querySelectorAll('.dip-act').forEach(btn => btn.onclick = () => {
    const tid = Number(btn.dataset.t);
    const act = { envoy: 'envoy', ally: 'proposeAlliance', truce: 'requestTruce', surrender: 'demandSurrender', aid: 'requestAid', break: 'breakAlliance' }[btn.dataset.a];
    const r = act === 'breakAlliance' ? game.breakAlliance(c.force, tid) : game[act](c.force, tid, c.id);
    refreshAll(); showDiplomacy(c);
    if (game.pendingDebate) showDebate(); // R11: 협상 결렬 시 설전 발동
  });
  $('cmd-diplo-back').onclick = () => showCityPanel(c);
}
function showFacilities(c) {
  const p = $('panel'); p.classList.remove('hidden');
  c.facilities = c.facilities ?? [];
  const slots = game.facSlots(c);
  let html = `<h3>${c.name_ko} 시설 <small>(개발지 ${c.facilities.length}/${slots})</small></h3>`;
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
    for (const [t, v] of mergePairs) html += `<div class="officer"><div><div class="nm">${t} × ${v.length}</div><div class="st">${FACILITIES[t].desc}</div></div><button class="cmd cmd-merge" data-t="${t}">합병</button></div>`;
  }
  html += '<h3 style="margin-top:10px">건설</h3>';
  const polTop = [...new Set(c.officers)].sort((a, b) => (DATA.officers[b]?.pol ?? 0) - (DATA.officers[a]?.pol ?? 0)).slice(0, 3);
  for (const [t, spec] of Object.entries(FACILITIES)) {
    html += `<div class="officer"><div><div class="nm">${t} <span class="st">금${spec.cost} · 공기 ${spec.turns}턴</span></div><div class="st">${spec.desc}</div></div><button class="cmd cmd-build" data-t="${t}">건설</button></div>`;
  }
  html += `<p class="st">담당 무장 자동 배정 (정치 상위 3명: ${polTop.map(i => DATA.officers[i]?.name_ko).join('·') || '없음'}) · 정치 합산 250 이상이면 공기 2배</p>`;
  html += `<button class="cmd" id="cmd-fac-back">← 도시 패널로</button>`;
  p.innerHTML = html;
  p.querySelectorAll('.cmd-build').forEach(btn => btn.onclick = () => {
    if (game.buildFacility(c.id, btn.dataset.t, polTop)) { refreshAll(); showFacilities(c); }
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
function showTech() { $('panel').dataset.view='tech';
  const f = game.forces[game.playerForce];
  const p = $('panel'); p.classList.remove('hidden');
  let html = `<h3>기교 연구 <small>(기교P ${f?.techP ?? 0}${game.forceHasSkill(game.playerForce, '지도') ? ' · 특기 「지도」: 연구 금 반액' : ''})</small></h3>`;
  for (const b of TECH_BRANCHES) {
    const lv = game.techLv(game.playerForce, b);
    const done = lv >= 4;
    html += `<div class="officer"><div><div class="nm">${b} ${'●'.repeat(lv)}${'○'.repeat(4 - lv)}</div><div class="st">${TECH_DESC[b]}</div></div>${done ? '<span class="st">최고 단계</span>' : `<button class="cmd cmd-techr" data-b="${b}">연구 (P${TECH_P[lv]}·금${game.researchGold(game.playerForce, TECH_GOLD[lv])})</button>`}</div>`;
  }
  html += `<h3 style="margin-top:10px">능력연구 <small>(PK — 소속 무장 전원 능력 +2/단계, 3단계 완료 시 특기 습득)</small></h3>`; // R13
  const AB_NM = { '공격': '무력', '방어': '통솔', '계략': '지력', '내정': '정치' };
  for (const b of Object.keys(AB_BRANCHES)) {
    const lv = f?.ab?.[b] ?? 0; const maxed = lv >= 3;
    html += `<div class="officer"><div><div class="nm">${b}(${AB_NM[b]}) ${'●'.repeat(lv)}${'○'.repeat(3 - lv)}</div><div class="st">${maxed ? '최고 단계' : `기교P ${AB_P[lv]} · 전원 ${AB_NM[b]} +2${lv === 2 ? ' · 완료 시 특기 「' + AB_SKILL[b] + '」' + ((AB_PICK[b]?.length ?? 0) > 1 ? ' (또는 ' + AB_PICK[b].slice(1).join('·') + ' 중 선택)' : '') : ''}`}</div></div>${maxed ? '<span class="st">최고 단계</span>' : `<button class="cmd cmd-abr" data-b="${b}">연구</button>`}</div>`;
  }
  html += `<h3 style="margin-top:10px">개별 기교 <small>(이 게임 자체 규칙: 비용과 효과는 직접 정한 값)</small></h3>`; // R23
  for (const [nm, a] of Object.entries(ARTS)) {
    const has = !!f?.arts?.[nm];
    html += `<div class="officer"><div><div class="nm">${nm} ${has ? '●' : '○'}</div><div class="st">${a.desc}${has ? '' : ` · 기교P ${a.p} · 금 ${game.researchGold(game.playerForce, a.gold)}`}</div></div>${has ? '<span class="st">연구 완료</span>' : `<button class="cmd cmd-artr" data-a="${nm}">연구</button>`}</div>`;
  }
  html += `<button class="cmd" id="cmd-tech-back">← 도시 패널로</button>`;
  p.innerHTML = html;
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
  let html = `<h3>${c.name_ko} <small>(${c.name_zh})</small></h3>
    <p>소속: ${owner}${legionTag} · 태수: ${c.taesu != null ? DATA.officers[c.taesu].name_ko : '-'}<br>
    병사 ${c.troops.toLocaleString()} · 내구 ${c.hp}/${c.maxhp}<br>
    금 ${c.gold.toLocaleString()} · 병량 ${c.food.toLocaleString()}<br>
    상업 ${c.commerce} · 농업 ${c.farm}${c.metropolis ? ' · 대도시' : ''}${c.specialty.length ? ' · 특색: '+c.specialty.join(',') : ''} · 치안 ${c.security ?? 80}${c.disaster ? ` <span style="color:#f66">재해: ${c.disaster.type}</span>` : ''}<br>
    병장: 창${c.spears} 극${c.pikes} 노${c.bows} 군마${c.horses} · 병기: 충거${c.rams ?? 0} 정란${c.towers ?? 0} 목수${c.beasts ?? 0} 투석${c.catapults ?? 0} · 선박: 주가${c.junks ?? 0} 누선${c.lous ?? 0} 투함${c.dous ?? 0}</p>`;
  if (mine) {
    if (game.cityFac(c, '공방').length) {
      html += `<p style="font-size:12px">병기 생산 (공방): ` + Object.entries(SIEGE_BUILD).map(([k, s]) => {
        const cost = Math.round(s.gold * ((c.specialty ?? []).includes('병기') ? 0.75 : 1));
        return `<button class="cmd cmd-siege" data-k="${k}">${s.name} (금${cost})</button>`;
      }).join(' ') + '</p>';
    }
    if (game.cityFac(c, '조선소').length) {
      html += `<p style="font-size:12px">선박 건조 (조선소): ` + Object.entries(SHIP_BUILD).map(([k, s]) => {
        const cost = Math.round(s.gold * ((c.specialty ?? []).includes('선박') ? 0.75 : 1));
        return `<button class="cmd cmd-ship" data-k="${k}">${s.name} (금${cost})</button>`;
      }).join(' ') + '</p>';
    }
  }
  if (game.delegated && c.force != null && c.force !== game.playerForce && game.forces[c.force]?.alive) {
    html += `<button class="cmd" id="cmd-join">이 세력으로 참가 (${game.forceName(c.force)})</button>`;
  }
  if (mine) {
    html += `<div>
      <button class="cmd" id="cmd-dev-c">상업 개발 (금300)</button>
      <button class="cmd" id="cmd-dev-f">농업 개발 (금300)</button>
      <button class="cmd" id="cmd-recruit">징병 (금200·병량1000)</button>
      <button class="cmd" id="cmd-dispatch">출진</button>
      <button class="cmd" id="cmd-move">무장 이동</button>
      <button class="cmd" id="cmd-tech">기교 연구</button>
      <button class="cmd" id="cmd-fac">시설 건설</button>
      ${(c.burn ?? 0) > 0 ? '<span style="color:#ff9a4a;display:block;margin:4px 0">불이 붙었습니다 (' + c.burn + '턴, 턴당 수비병 -3%) — 성 주변 아군 부대가 소화할 수 있습니다</span>' : ''}
      ${c.leveeBroken ? '<button class="cmd" id="cmd-levee">제방 보수 (금300)</button>' : ''}
      <button class="cmd" id="cmd-search">수색 (금100)</button>
      <button class="cmd" id="cmd-patrol">치안 순찰 (금100·AP20)</button>
      <button class="cmd" id="cmd-trade">상인</button>
      <button class="cmd" id="cmd-diplo">외교</button>
      <button class="cmd" id="cmd-advisor">군사</button>
      <button class="cmd" id="cmd-legion">군단</button>
    </div>`;
  }
  if (mine) html += `<p style="margin-top:8px"><button class="cmd" id="cmd-swear">의형제 결연 (공적 500+ 무장 2~3명 · 기교P 500)</button></p>`;
  html += `<h3 style="margin-top:10px">주둔 무장 (${c.officers.length})</h3>`;
  if (c.officers.length) for (const i of c.officers) { // 褒賞: 주둔 무장별 포상 버튼 (매뉴얼 P.39 — 금100·AP5, 충성 100·종군·당턴 포상済 제외는 rewardOfficers가 판정)
    html += officerRow(i);
    if (mine && (game.officers[i]?.state?.loyal ?? 70) < 100) html += `<button class="cmd cmd-rwd" data-i="${i}">포상 (금100·AP5·충성+3)</button>`;
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
      if (mine && game.recruitChance(c.id, o.idx) > 0) html += `<button class="cmd cmd-rec" data-i="${o.idx}">등용 (금100·성공률 ${Math.round(game.recruitChance(c.id, o.idx)*100)}%)</button>`;
    }
  }
  const caps = game.captiveOfficers ? game.captiveOfficers(c.id) : []; // R111: 억류 포로 (매뉴얼 捕虜 — 등용·해방 가능)
  if (caps.length) {
    html += `<h3 style="margin-top:10px">포로 (${caps.length})</h3><p style="font-size:12px;color:#aa6">억류 중인 적 무장 — 매 턴 충성이 내려가며(부절대 보유 시 더 빠름), 등용하거나 석방할 수 있습니다.</p>`;
    for (const o of caps) {
      html += officerRow(o.idx) + `<span style="font-size:12px;color:#c96">충성 ${o.state?.loyal ?? '?'} · 원 소속 ${game.forceName(o.state?.force)}</span>`;
      if (mine) {
        if (game.recruitChance(c.id, o.idx) > 0) html += `<button class="cmd cmd-rec" data-i="${o.idx}">등용 (금100·성공률 ${Math.round(game.recruitChance(c.id, o.idx)*100)}%)</button>`;
        html += `<button class="cmd cmd-rel" data-i="${o.idx}">석방 (기교P +50)</button>`;
      }
    }
  }
  p.innerHTML = html;
  p.scrollTop = 0; // 패널 상단 고정 (이전 스크롤 잔류로 도시명이 가려지는 문제 방지)
  if (mine) {
    const sw = $('cmd-swear');
    if (sw) sw.onclick = () => showSwear(c);
    $('cmd-dev-c').onclick = () => { game.develop(c.id, 'commerce'); refreshAll(); showCityPanel(c); };
    $('cmd-dev-f').onclick = () => { game.develop(c.id, 'farm'); refreshAll(); showCityPanel(c); };
    $('cmd-recruit').onclick = () => { game.recruit(c.id); refreshAll(); showCityPanel(c); };
    $('cmd-patrol').onclick = () => { game.patrol(c.id); refreshAll(); showCityPanel(c); };
    p.querySelectorAll('.cmd-siege').forEach(b => b.onclick = () => { game.produceSiege(c.id, b.dataset.k); refreshAll(); showCityPanel(c); });
    p.querySelectorAll('.cmd-ship').forEach(b => b.onclick = () => { game.produceShip(c.id, b.dataset.k); refreshAll(); showCityPanel(c); });
    $('cmd-dispatch').onclick = () => showDispatch(c);
    $('cmd-move').onclick = () => showMove(c);
    $('cmd-tech').onclick = () => showTech();
    $('cmd-fac').onclick = () => showFacilities(c);
    if ($('cmd-levee')) $('cmd-levee').onclick = () => { game.repairLevee(c.id); refreshAll(); showCityPanel(c); }; // R28
    $('cmd-diplo').onclick = () => showDiplomacy(c);
    $('cmd-search').onclick = () => { game.searchCity(c.id); refreshAll(); showCityPanel(c); };
    $('cmd-trade').onclick = () => showTrade(c);
    $('cmd-advisor').onclick = () => showAdvisor(c);
    $('cmd-legion').onclick = () => showLegions(c);
    p.querySelectorAll('.cmd-rwd').forEach(b => b.onclick = () => { const ok = game.rewardOfficers(c.id, [Number(b.dataset.i)]); refreshAll(); showCityPanel(c); if (!ok) game.log(game.lastRewardWhy ?? '포상할 수 없습니다', true); }); // 褒賞
    p.querySelectorAll('.cmd-office').forEach(sel => sel.onchange = () => { const ok = game.appointOffice(c.id, Number(sel.dataset.i), Number(sel.value)); refreshAll(); showCityPanel(c); if (!ok) { game.log(game.lastOfficeWhy ?? '임명할 수 없습니다', true); refreshLog(); } }); // 官職
    p.querySelectorAll('.cmd-rec').forEach(b => b.onclick = () => { const ok = game.recruitOfficer(c.id, Number(b.dataset.i)); refreshAll(); showCityPanel(c); if (!ok && game.lastRecruitWhy) { game.log(game.lastRecruitWhy, true); game.lastRecruitWhy = null; refreshLog(); } if (game.pendingDebate) showDebate(); }); // R11: 등용 실패 시 설전 발동 / R111: 비용 부족 사유 안내
    p.querySelectorAll('.cmd-rel').forEach(b => b.onclick = () => { const ok = game.releaseCaptive(c.id, Number(b.dataset.i)); refreshAll(); showCityPanel(c); if (!ok && game.lastReleaseWhy) { game.log(game.lastReleaseWhy, true); game.lastReleaseWhy = null; refreshLog(); } }); // R111: 포로 석방 + 비용 부족 사유 안내
  }
  const join = $('cmd-join');
  if (join) join.onclick = () => {
    game.pendingJoin = c.force;
    game.log(`${game.forceName(c.force)}에 참가 요청 — 이번 턴이 끝나면 인계됩니다.`, true);
    $('panel').classList.add('hidden'); refreshLog();
  };
}
function showDispatch(c) { $('panel').dataset.view='dispatch';
  const p = $('panel');
  const capBase = game.unitTroopCap(c.force); // 기본 상한 (군제개혁 +3000 포함)
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
    <p><button class="cmd" id="dsp-go">출진</button> <button class="cmd" id="dsp-back">취소</button></p>
    <p style="font-size:12px;color:#998">출진 후 부대를 선택하고 목표 도시를 클릭하면 이동합니다.</p>`;
  $('dsp-back').onclick = () => showCityPanel(c);
  const refreshCap = () => { // R84: 주장 선택 변경 시 관직 가산 포함 상한 재계산·표기
    const t = Math.min(c.troops, capTotal()), ofc = leadOf() >= 0 ? (OFFICES[game.officeOf(leadOf())]?.cmd ?? 0) : 0;
    const inp = $('dsp-troops'); inp.max = t; if (Number(inp.value) > t) inp.value = t;
    $('dsp-cap').textContent = `상한 ${t.toLocaleString()} = 기본 ${capBase.toLocaleString()}(군제 포함) + 주장 관직 +${ofc.toLocaleString()}`;
  };
  document.querySelectorAll('.dsp-off').forEach(cb => cb.onchange = () => { const lim = game.dispatchCap(c.force); if (document.querySelectorAll('.dsp-off:checked').length > lim) { cb.checked = false; alert(`한 부대에는 무장 ${lim}명까지 편성할 수 있습니다.`); } refreshCap(); }); // 3명 제한: 체크 단계에서 거부·안내
  refreshCap();
  $('dsp-go').onclick = () => {
    const troops = Math.min(Math.min(c.troops, capTotal()), Number($('dsp-troops').value));
    const type = $('dsp-type').value;
    const offs = [...document.querySelectorAll('.dsp-off:checked')].map(x => Number(x.value)).slice(0, game.dispatchCap(c.force));
    if (!offs.length) { alert('부장을 선택하세요.'); return; }
    const u = game.dispatch(c.id, offs, troops, type);
    if (!u) { alert('출진할 수 없습니다 (행동력·병장·병력 부족).'); return; }
    map.addUnit(worldUnit(u), forceColor(u.force));
    refreshHud(); refreshLog(); showCityPanel(c);
  };
}
function showMove(c) {
  const p = $('panel');
  const mine = game.forceCities(game.playerForce).filter(x => x.id !== c.id);
  p.innerHTML = `<h3>${c.name_ko} → 무장 이동</h3>
    ${c.officers.map(i => `<label style="display:block"><input type="checkbox" class="mv-off" value="${i}"> ${DATA.officers[i].name_ko}</label>`).join('')}
    <p>목적지: <select id="mv-to">${mine.map(x => `<option value="${x.id}">${x.name_ko}</option>`).join('')}</select></p>
    <p><button class="cmd" id="mv-go">이동</button> <button class="cmd" id="mv-back">취소</button></p>`;
  $('mv-back').onclick = () => showCityPanel(c);
  $('mv-go').onclick = () => {
    const offs = [...document.querySelectorAll('.mv-off:checked')].map(x => Number(x.value));
    const to = Number($('mv-to').value);
    if (!offs.length || !to) return;
    game.moveOfficers(c.id, to, offs);
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
    ${mine && game.tacticInfo?.(u) ? `<p>${game.tacticInfo(u).opts.map(o => `<button class="cmd up-tac" data-tid="${o.id}">전법 ${o.name} (기력 ${o.qi})</button>`).join(' ')}</p>` : ''}
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
      Object.assign(g, { year: d.year, month: d.month, dan: d.dan, turn: d.turn, cities: d.cities, forces: d.forces, units: d.units, nextUnitId: d.nextUnitId, fieldFacs: d.fieldFacs ?? [], nextFacId: d.nextFacId ?? 1, playerForce: d.playerForce, delegated: d.delegated, logs: d.logs, deadAck: d.deadAck, chronicle: d.chronicle ?? [], over: d.over ?? false, unified: d.unified ?? d.over ?? false, econGraceUntil: d.econGraceUntil ?? null, econV: d.econV ?? 1 }); // R14: over로 저장된 통일 세이브 호환 / 병량 유예 복원 / econV 없는 구 저장은 구 경제 규칙 보존
      g.cityById = {}; g.cities.forEach(c => g.cityById[c.id] = c);
      for (const c of g.cities) { c.officers = [...new Set(c.officers ?? [])]; c.captives = c.captives ?? []; } // 레거시 세이브 중복 무장 정리 / R111: 억류 명단 필드 호환 (정합은 _reconcileOfficerRosters)
      g.diplo = d.diplo ?? {};
      g.itemPool = d.itemPool ?? Object.values(ITEMS).map(i => i.id).filter(id => !Object.values(g.officers).some(o => (o.state.items ?? []).includes(id)));
      // 강제 마이그레이션 없음: 구 저장은 econV 1 규칙 그대로 진행 (향후 전환 선택 UI는 별도)
      for (const o of Object.values(g.officers)) { o.state.items = o.state.items ?? []; if (o.state.status === 'free' && o.state.found === undefined) o.state.found = true; } // 기존 세이브의 재야는 발견 상태 유지
      for (const f of Object.values(g.forces)) { f.advisor = f.advisor ?? null; f.legions = f.legions ?? []; } // 군사·군단 필드 호환 // 외교 상태 복원 (레거시 세이브는 공백)
      for (const [i, st] of Object.entries(d.officerStates)) if (DATA.officers[i]) restoreOfficer(DATA.officers[i], st); // R84: 복원 공통화 (R13 연구 + 관직 능력 가산 재적용)
      g._reconcileOfficerRosters(); // R96: 구 저장의 로스터 누락·타 세력 로스터 잔류 무장 복귀 (멱등)
      game = g; enterGame(); refreshAll(); checkGameOver(); // R14: 저장 시점이 종료 상태면 모달 재표시
      if (game.delegated) setAuto(true);
    };
  }
  $('btn-endturn').onclick = () => { if (!game.delegated) doTurn(); };
  $('btn-delegate').onclick = () => {
    game.delegated = !game.delegated;
    game.log(game.delegated ? '세력 운영을 AI에 위임합니다. 언제든 직접 지휘로 돌아오거나 다른 세력에 참가할 수 있습니다.' : '직접 지휘로 복귀합니다.', true);
    refreshHud(); refreshLog();
    setAuto(game.delegated);
  };
  $('btn-stop-auto').onclick = () => { game.delegated = false; setAuto(false); refreshHud(); refreshLog(); };
  $('sel-speed').onchange = () => { if (game?.delegated) setAuto(true); };
  $('btn-rot-l').onclick = () => map && map.rotate90(1);
  $('btn-rot-r').onclick = () => map && map.rotate90(-1);
  if ($('panel-x')) $('panel-x').onclick = () => { $('panel').classList.add('hidden'); selectedUnit = null; pendingFire = null; };
  if ($('btn-sound')) { $('btn-sound').onclick = toggleSound; applySound(); }
  if ($('btn-dash')) $('btn-dash').onclick = () => showDashboard(); // R97
  $('btn-menu').onclick = () => modal('메뉴', [
    ['세력 현황', () => showDashboard()], // R97
    ['연감', () => showChronicle()], // R14
    ['저장하고 타이틀로', () => { game?.autosave(); location.reload(); }],
    ['타이틀로 (저장은 자동)', () => location.reload()],
    ['계속', () => {}],
  ]);
}
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => document.documentElement.style.setProperty('--hud-h', ($('hud-top').offsetHeight + 6) + 'px')).observe($('hud-top')); // R14: HUD 높이 변동(줄바꿈·자동진행 바·폰트) 추적
boot();
