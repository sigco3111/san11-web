// 진입점: 화면 전환·UI·지도 연결
import { Map3D, toWorld } from './map3d.js';
import { Game, SAVE_KEY, forceColor, UNIT_TYPES, josa, TECH_BRANCHES, TECH_P, TECH_GOLD, TECH_DESC, FACILITIES, ITEMS, SIEGE_BUILD, SHIP_BUILD, AB_BRANCHES, AB_P, AB_SKILL } from './game.js';
import { aiThink } from './ai.js';

const $ = id => document.getElementById(id);
let DATA = null, game = null, map = null, selectedUnit = null, autoTimer = null, pendingFire = null; // R15: 직접 전법·계략 대기

async function loadData() {
  const [officers, skills, portraits, s184, s190, s251] = await Promise.all(
    ['data/officers670.json','data/skills.json','data/portraits.json','data/scenario-184.json','data/scenario-190.json','data/scenario-251.json']
      .map(u => fetch(u).then(r => r.json())));
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
  game.log(`${DATA.officers[game.forces[fid].ruler].name_ko}(으)로 ${scenId}년 시나리오를 시작합니다.`, true);
  const cap = game.forceCities(fid)[0];
  if (cap) map.focusCity(cap);
  refreshAll();
}
function enterGame() {
  show('screen-game');
  if (!map) {
    map = new Map3D($('map-canvas'));
    window.__map = map;
    map.onPick = onPick;
    (function loop() { map.render(); requestAnimationFrame(loop); })();
  }
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
function refreshLog() {
  const el = $('logbox');
  el.innerHTML = game.logs.slice(-30).map(l => `<div class="${l.mine?'me':''}">[${l.t}] ${l.msg}</div>`).join('');
  el.scrollTop = el.scrollHeight;
}

// === 턴·자동 진행 ===
function doTurn() {
  if (!game || game.over) return;
  game.endTurn(aiThink);
  refreshAll();
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

function checkGameOver() {
  const owners = new Set(game.cities.map(c => c.force).filter(x => x != null)); // R14: 통일은 모든 도시 제압 기준 (설계안 102행)
  if (owners.size === 1) {
    if (!game._endShown) {
      game._endShown = true;
      endModal(`【${game.forceName([...owners][0])}】이(가) 모든 도시를 제압해 천하를 통일했습니다! (${game.year}년 ${game.month}월, ${game.turn}턴)`, true);
    }
    return;
  }
  if (game.over) return;
  const f = game.forces[game.playerForce];
  if (f && !f.alive && !game.deadAck) {
    const others = game.aliveForces();
    if (others.length === 0) { endModal('천하가 정리되었습니다.'); return; }
    modal(`【${game.forceName(f.id)}】이(가) 멸망했습니다.`, [
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
function onPick(nx, ny) {
  if (!game || game.over) return;
  const hit = map.pick(nx, ny);
  if (pendingFire) { // R15: 직접 전법·계략 대상 선택
    const pf = pendingFire; pendingFire = null;
    let ok = false;
    if (hit && hit.type === 'unit') ok = pf.kind === 'tactic' ? game.fireTactic(pf.uid, { type: 'unit', id: hit.id }) : game.fireStrat(pf.uid, pf.kind, { type: 'unit', id: hit.id });
    else if (hit && hit.type === 'city') ok = pf.kind === 'tactic' ? game.fireTactic(pf.uid, { type: 'city', id: hit.id }) : game.fireStrat(pf.uid, pf.kind, { type: 'city', id: hit.id });
    selectedUnit = null;
    if (ok) { refreshAll(); if (game.units.find(x => x.id === pf.uid)) { selectedUnit = pf.uid; showUnitPanel(pf.uid); } else $('panel').classList.add('hidden'); }
    else { game.log('대상이 유효하지 않습니다 (인접한 적 부대·도시만 가능)', true); refreshLog(); showUnitPanel(pf.uid); }
    return;
  }
  if (!hit) { $('panel').classList.add('hidden'); selectedUnit = null; return; }
  if (hit.type === 'unit') {
    const u = game.units.find(x => x.id === hit.id);
    if (u && !game.delegated && u.force !== game.playerForce && !game.inVision(u.x, u.z)) return; // R14: 시야 밖 부대는 선택 불가
    selectedUnit = hit.id; showUnitPanel(hit.id); return;
  }
  const c = game.cityById[hit.id];
  if (selectedUnit != null && game.units.find(u => u.id === selectedUnit && u.force === game.playerForce) && !game.delegated) {
    game.orderUnit(selectedUnit, hit.id);
    game.log(`${game.units.find(u=>u.id===selectedUnit).label} → ${josa(c.name_ko, ['으로','로'])} 이동 명령`, true);
    selectedUnit = null; $('panel').classList.add('hidden'); refreshLog();
    return;
  }
  selectedUnit = null;
  showCityPanel(c);
}
function showAdvisor(c) { // 군사 임명: 지력 70 이상만 (설계안 명시)
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
function showLegions(c) { // 군단 편성: 도시 묶음을 도독에게 위임 (제2군단~, 제1군단은 군주 직할)
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
function showTrade(c) { // 상인: 월별 환율, 금↔병량 (자체 수치)
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
function showDiplomacy(c) {
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
function showTech() {
  const f = game.forces[game.playerForce];
  const p = $('panel'); p.classList.remove('hidden');
  let html = `<h3>기교 연구 <small>(기교P ${f?.techP ?? 0})</small></h3>`;
  for (const b of TECH_BRANCHES) {
    const lv = game.techLv(game.playerForce, b);
    const done = lv >= 4;
    html += `<div class="officer"><div><div class="nm">${b} ${'●'.repeat(lv)}${'○'.repeat(4 - lv)}</div><div class="st">${TECH_DESC[b]}</div></div>${done ? '<span class="st">최고 단계</span>' : `<button class="cmd cmd-techr" data-b="${b}">연구 (P${TECH_P[lv]}·금${TECH_GOLD[lv]})</button>`}</div>`;
  }
  html += `<h3 style="margin-top:10px">능력연구 <small>(PK — 소속 무장 전원 능력 +2/단계, 3단계 완료 시 특기 습득)</small></h3>`; // R13
  const AB_NM = { '공격': '무력', '방어': '통솔', '계략': '지력', '내정': '정치' };
  for (const b of Object.keys(AB_BRANCHES)) {
    const lv = f?.ab?.[b] ?? 0; const maxed = lv >= 3;
    html += `<div class="officer"><div><div class="nm">${b}(${AB_NM[b]}) ${'●'.repeat(lv)}${'○'.repeat(3 - lv)}</div><div class="st">${maxed ? '최고 단계' : `기교P ${AB_P[lv]} · 전원 ${AB_NM[b]} +2${lv === 2 ? ' · 완료 시 특기 「' + AB_SKILL[b] + '」' : ''}`}</div></div>${maxed ? '<span class="st">최고 단계</span>' : `<button class="cmd cmd-abr" data-b="${b}">연구</button>`}</div>`;
  }
  html += `<button class="cmd" id="cmd-tech-back">← 도시 패널로</button>`;
  p.innerHTML = html;
  p.querySelectorAll('.cmd-abr').forEach(btn => btn.onclick = () => { // R13
    if (game.researchAbility(game.playerForce, btn.dataset.b)) { refreshAll(); showTech(); }
  });
  p.querySelectorAll('.cmd-techr').forEach(btn => btn.onclick = () => {
    game.researchTech(game.playerForce, btn.dataset.b);
    refreshAll(); showTech();
  });
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
  lastCityId = c.id;
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
  html += c.officers.map(officerRow).join('') || '<p>무장 없음</p>';
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
    $('cmd-diplo').onclick = () => showDiplomacy(c);
    $('cmd-search').onclick = () => { game.searchCity(c.id); refreshAll(); showCityPanel(c); };
    $('cmd-trade').onclick = () => showTrade(c);
    $('cmd-advisor').onclick = () => showAdvisor(c);
    $('cmd-legion').onclick = () => showLegions(c);
    p.querySelectorAll('.cmd-rec').forEach(b => b.onclick = () => { game.recruitOfficer(c.id, Number(b.dataset.i)); refreshAll(); showCityPanel(c); if (game.pendingDebate) showDebate(); }); // R11: 등용 실패 시 설전 발동
  }
  const join = $('cmd-join');
  if (join) join.onclick = () => {
    game.pendingJoin = c.force;
    game.log(`${game.forceName(c.force)}에 참가 요청 — 이번 턴이 끝나면 인계됩니다.`, true);
    $('panel').classList.add('hidden'); refreshLog();
  };
}
function showDispatch(c) {
  const p = $('panel');
  const cap = Math.min(c.troops, 20000);
  p.innerHTML = `<h3>${c.name_ko} 출진 편성</h3>
    <p>병사: <input id="dsp-troops" type="number" value="${Math.min(5000, cap)}" min="500" max="${cap}" step="500" style="width:90px"></p>
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
  $('dsp-go').onclick = () => {
    const troops = Math.min(cap, Number($('dsp-troops').value));
    const type = $('dsp-type').value;
    const offs = [...document.querySelectorAll('.dsp-off:checked')].map(x => Number(x.value)).slice(0,3);
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
  const u = game.units.find(x => x.id === uid); if (!u) return;
  const p = $('panel'); p.classList.remove('hidden');
  const mine = u.force === game.playerForce && !game.delegated;
  p.innerHTML = `<h3>${u.label} (${UNIT_TYPES[u.type].name})</h3>
    <p>소속: ${game.forceName(u.force)} · 병력 ${u.troops.toLocaleString()}<br>
    부장: ${u.officers.map(i => DATA.officers[i].name_ko).join(', ')}<br>기력 ${u.qi ?? 100} / 100${(u.conf ?? 0) > 0 ? ` · <span style='color:#e66'>혼란 ${u.conf}턴</span>` : ''}</p>
    ${mine ? '<p style="color:#ffd700">목표 도시를 클릭하면 이동 명령을 내립니다.</p>' : ''}
    ${mine && game.tacticInfo?.(u) ? `<p><button class="cmd" id="up-tac">전법 ${game.tacticInfo(u).tac.name} (기력 ${game.tacticInfo(u).tac.qi})</button></p>` : ''}
    ${mine && (u.conf ?? 0) <= 0 && (u._stratTurn ?? -1) !== game.turn && u.officers.some(i => (DATA.officers[i]?.int ?? 0) >= 75) && (u.qi ?? 100) >= 30 ? '<p><button class="cmd" id="up-fire">계략 화계 (기력 30)</button></p>' : ''}
    ${mine && (u.conf ?? 0) <= 0 && (u._stratTurn ?? -1) !== game.turn && u.officers.some(i => (DATA.officers[i]?.int ?? 0) >= 80) && (u.qi ?? 100) >= 25 ? '<p><button class="cmd" id="up-conf">계략 혼란 (기력 25)</button></p>' : ''}
    <p><button class="cmd" id="up-close">닫기</button></p>`;
  $('up-close').onclick = () => { $('panel').classList.add('hidden'); selectedUnit = null; pendingFire = null; };
  const armFire = (kind, label) => { // R15: 대상 선택 모드 진입
    pendingFire = { uid: u.id, kind };
    p.innerHTML = `<h3>${u.label} — ${label}</h3><p style="color:#ffd700">인접한 적 부대나 도시를 클릭하면 발동합니다.</p><p><button class="cmd" id="up-cancel">취소</button></p>`;
    $('up-cancel').onclick = () => { pendingFire = null; showUnitPanel(u.id); };
  };
  if ($('up-tac')) $('up-tac').onclick = () => armFire('tactic', `전법 ${game.tacticInfo(u).tac.name}`);
  if ($('up-fire')) $('up-fire').onclick = () => armFire('fire', '계략 화계');
  if ($('up-conf')) $('up-conf').onclick = () => armFire('confuse', '계략 혼란');
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
      Object.assign(g, { year: d.year, month: d.month, dan: d.dan, turn: d.turn, cities: d.cities, forces: d.forces, units: d.units, nextUnitId: d.nextUnitId, playerForce: d.playerForce, delegated: d.delegated, logs: d.logs, deadAck: d.deadAck, chronicle: d.chronicle ?? [], over: d.over ?? false, unified: d.unified ?? d.over ?? false }); // R14: over로 저장된 통일 세이브 호환
      g.cityById = {}; g.cities.forEach(c => g.cityById[c.id] = c);
      for (const c of g.cities) c.officers = [...new Set(c.officers ?? [])]; // 레거시 세이브 중복 무장 정리
      g.diplo = d.diplo ?? {};
      g.itemPool = d.itemPool ?? Object.values(ITEMS).map(i => i.id).filter(id => !Object.values(g.officers).some(o => (o.state.items ?? []).includes(id)));
      for (const o of Object.values(g.officers)) { o.state.items = o.state.items ?? []; if (o.state.status === 'free' && o.state.found === undefined) o.state.found = true; } // 기존 세이브의 재야는 발견 상태 유지
      for (const f of Object.values(g.forces)) { f.advisor = f.advisor ?? null; f.legions = f.legions ?? []; } // 군사·군단 필드 호환 // 외교 상태 복원 (레거시 세이브는 공백)
      for (const [i, st] of Object.entries(d.officerStates)) if (DATA.officers[i]) {
        DATA.officers[i].state = st;
        if (st.bonus) for (const [k, v] of Object.entries(st.bonus)) DATA.officers[i][k] = Math.min(100, (DATA.officers[i][k] ?? 50) + v); // R13 능력연구 복원
        if (st.grantSkill) DATA.officers[i].skill = st.grantSkill; // R13 연구 특기 복원
      }
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
  $('btn-menu').onclick = () => modal('메뉴', [
    ['연감', () => showChronicle()], // R14
    ['저장하고 타이틀로', () => { game?.autosave(); location.reload(); }],
    ['타이틀로 (저장은 자동)', () => location.reload()],
    ['계속', () => {}],
  ]);
}
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => document.documentElement.style.setProperty('--hud-h', ($('hud-top').offsetHeight + 6) + 'px')).observe($('hud-top')); // R14: HUD 높이 변동(줄바꿈·자동진행 바·폰트) 추적
boot();
