// 진입점: 화면 전환·UI·지도 연결
import { Map3D, toWorld } from './map3d.js';
import { Game, SAVE_KEY, forceColor, UNIT_TYPES, josa, TECH_BRANCHES, TECH_P, TECH_GOLD, TECH_DESC, FACILITIES, ITEMS, SIEGE_BUILD, SHIP_BUILD } from './game.js';
import { aiThink } from './ai.js';

const $ = id => document.getElementById(id);
let DATA = null, game = null, map = null, selectedUnit = null, autoTimer = null;

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
    if (!map.unitMeshes[u.id]) map.addUnit(worldUnit(u), forceColor(u.force));
    else map.updateUnit(worldUnit(u), forceColor(u.force));
  }
  for (const id of Object.keys(map.unitMeshes)) if (!game.units.find(u => u.id == id)) map.removeUnit(id);
  refreshHud(); refreshLog();
}
function worldUnit(u) { const [x, z] = toWorld(u.x, u.z); return { id: u.id, x, z, label: u.label }; }
function refreshHud() {
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
function checkGameOver() {
  if (game.over) return;
  const f = game.forces[game.playerForce];
  if (f && !f.alive && !game.deadAck) {
    const others = game.aliveForces();
    if (others.length === 0) { endModal('천하가 정리되었습니다.'); return; }
    modal(`【${game.forceName(f.id)}】이(가) 멸망했습니다.`, [
      ['다른 세력으로 계속', () => { game.deadAck = true; game.delegated = true; refreshHud(); setAuto(true); }],
      ['관전만 계속', () => { game.deadAck = true; game.delegated = true; refreshHud(); setAuto(true); }],
      ['게임 종료', () => endModal('게임을 종료했습니다. 타이틀로 돌아갑니다.')],
    ]);
  }
  const alive = game.aliveForces();
  if (alive.length === 1) {
    const w = alive[0];
    endModal(`【${game.forceName(w.id)}】이(가) 천하를 통일했습니다! (${game.year}년 ${game.month}월)`);
  }
}
function endModal(text) {
  game.over = true; setAuto(false);
  modal(text, [['타이틀로', () => { localStorage.removeItem(SAVE_KEY); location.reload(); }]]);
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
  if (!hit) { $('panel').classList.add('hidden'); selectedUnit = null; return; }
  if (hit.type === 'unit') { selectedUnit = hit.id; showUnitPanel(hit.id); return; }
  const c = game.cityById[hit.id];
  if (selectedUnit != null && game.units.find(u => u.id === selectedUnit && u.force === game.playerForce) && !game.delegated) {
    game.orderUnit(selectedUnit, hit.id);
    game.log(`${game.units.find(u=>u.id===selectedUnit).label} → ${c.name_ko}(으)로 이동 명령`, true);
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
  html += `<p class="st">관계: 80+ 친밀 · 60+ 호의 · 40+ 중립 · 20+ 불화 · 미만 험악 — 매달 중립으로 서서히 회귀. 동맹국은 서로 공격하지 않습니다. 설전(협상 연출)은 R11에서 구현되며 지금은 특기 논객이 성공률을 보정합니다.</p>`;
  html += `<button class="cmd" id="cmd-diplo-back">← 도시 패널로</button>`;
  p.innerHTML = html;
  p.querySelectorAll('.dip-act').forEach(btn => btn.onclick = () => {
    const tid = Number(btn.dataset.t);
    const act = { envoy: 'envoy', ally: 'proposeAlliance', truce: 'requestTruce', surrender: 'demandSurrender', aid: 'requestAid', break: 'breakAlliance' }[btn.dataset.a];
    const r = act === 'breakAlliance' ? game.breakAlliance(c.force, tid) : game[act](c.force, tid, c.id);
    refreshAll(); showDiplomacy(c);
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
        ? `${f.type} — ${spec.desc}`
        : `${f.type} 공사 중 ${f.progress}/${spec.turns} (담당 ${f.builders.map(b => DATA.officers[b]?.name_ko).join('·') || '없음'})`;
      return `<div class="officer"><div><div class="st">${body}</div></div><button class="cmd cmd-demol" data-i="${i}">철거</button></div>`;
    }).join('');
  } else html += '<p>건설된 시설이 없습니다.</p>';
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
  html += `<button class="cmd" id="cmd-tech-back">← 도시 패널로</button>`;
  p.innerHTML = html;
  p.querySelectorAll('.cmd-techr').forEach(btn => btn.onclick = () => {
    game.researchTech(game.playerForce, btn.dataset.b);
    refreshAll(); showTech();
  });
  $('cmd-tech-back').onclick = () => { const c = lastCityId != null && game.cityById[lastCityId]; if (c) showCityPanel(c); else p.classList.add('hidden'); };
}
function officerRow(idx) {
  const o = DATA.officers[idx];
  return `<div class="officer"><span class="pimg" style="${portraitCss(idx)}"></span><div><div class="nm">${o.name_ko} <span class="st">${o.name_zh}</span></div><div class="st">통${o.ldr} 무${o.war} 지${o.int} 정${o.pol} 매${o.chr} · ${o.skill ? o.skill + ' — ' + (DATA.skills[o.skill] || '') : '특기 없음'} · 충성 ${o.state?.loyal ?? '-'} · 공적 ${o.state?.merit ?? 0}${(o.state?.items ?? []).length ? ' · 명품: ' + o.state.items.map(id => ITEMS.find(i => i.id === id)?.name ?? id).join('·') : ''}</div></div></div>`;
}
let lastCityId = null;
function showCityPanel(c) {
  lastCityId = c.id;
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
  if (mine) {
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
    p.querySelectorAll('.cmd-rec').forEach(b => b.onclick = () => { game.recruitOfficer(c.id, Number(b.dataset.i)); refreshAll(); showCityPanel(c); });
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
    <p><button class="cmd" id="up-close">닫기</button></p>`;
  $('up-close').onclick = () => { $('panel').classList.add('hidden'); selectedUnit = null; };
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
      Object.assign(g, { year: d.year, month: d.month, dan: d.dan, turn: d.turn, cities: d.cities, forces: d.forces, units: d.units, nextUnitId: d.nextUnitId, playerForce: d.playerForce, delegated: d.delegated, logs: d.logs, deadAck: d.deadAck });
      g.cityById = {}; g.cities.forEach(c => g.cityById[c.id] = c);
      for (const c of g.cities) c.officers = [...new Set(c.officers ?? [])]; // 레거시 세이브 중복 무장 정리
      g.diplo = d.diplo ?? {};
      g.itemPool = d.itemPool ?? Object.values(ITEMS).map(i => i.id).filter(id => !Object.values(g.officers).some(o => (o.state.items ?? []).includes(id)));
      for (const o of Object.values(g.officers)) { o.state.items = o.state.items ?? []; if (o.state.status === 'free' && o.state.found === undefined) o.state.found = true; } // 기존 세이브의 재야는 발견 상태 유지
      for (const f of Object.values(g.forces)) { f.advisor = f.advisor ?? null; f.legions = f.legions ?? []; } // 군사·군단 필드 호환 // 외교 상태 복원 (레거시 세이브는 공백)
      for (const [i, st] of Object.entries(d.officerStates)) if (DATA.officers[i]) DATA.officers[i].state = st;
      game = g; enterGame(); refreshAll();
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
    ['저장하고 타이틀로', () => { game?.autosave(); location.reload(); }],
    ['타이틀로 (저장은 자동)', () => location.reload()],
    ['계속', () => {}],
  ]);
}
boot();
