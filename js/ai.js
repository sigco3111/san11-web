import { SHIP_TYPES, TRAPS } from './game.js?v=r86';
// 세력 AI — 위임 시 플레이어 세력도 이 AI가 운영 (위임·샌드박스의 실질 주체)
export function aiThink(game, fid, legion = null) { // legion 지정 시 그 군단 소속 도시만 운영 (도독 위임)
  const f = game.forces[fid];
  if (!f || !f.alive) return;
  let cities = game.forceCities(fid);
  if (legion) cities = cities.filter(c => legion.cities.includes(c.id));
  // R9: 치안 순찰 — 치안 80 미만 도시, 플레이어와 동일 비용 (금100·AP20)
  for (const c of cities) if ((c.security ?? 80) < 80) game.patrol(c.id);
  if (cities.length === 0) return;
  // 0.5) 관직 임명 (매뉴얼 P.37 — 비용·AP 없음): 무관직·승진 가능 무장에 공적·작위 게이트 안 최고 등급 부여. 판정은 appointOffice에 위임 (플레이어와 동일 규칙, 금·AP 소모 없음)
  for (const c of cities) for (const i of c.officers) {
    const cur = game.officeOf(i);
    const maxR = Math.min(game.officeGate(fid), game.meritGrade(i));
    if (maxR > cur) game.appointOffice(c.id, i, maxR);
  }

  // 1) 내정: 여유 금이 있으면 개발 (군사 행동력 40 예약: 전선 도시가 있을 때 내정이 AP를 다 쓰지 않도록)
  // 예약은 '실제 출진 기회'가 있을 때만: 적(비동맹·비휴전) 도시가 12 이내이고 병력이 출진 임계(1.5배/6000)를 넘는 도시가 있어야 함. 없으면 0 → 내정 영구 정지 없음.
  let apReserve = 0;
  if (globalThis.__AP_RESERVE !== false) {
    for (const c of cities) {
      if (!c.officers.length) continue;
      for (const e of game.cities) {
        if (e.force === fid || (e.force != null && (game.isAllied(fid, e.force) || game.isPeace(fid, e.force)))) continue;
        if (Math.hypot(e.lon - c.lon, e.lat - c.lat) < 12 && c.troops > Math.max(e.troops * 1.5, 6000)) { apReserve = 40; break; }
      }
      if (!apReserve && ((c.dous ?? 0) + (c.lous ?? 0) + (c.junks ?? 0)) > 0 && game.cityFac(c, '조선소').length && c.troops >= 9000) {
        for (const e of game.cities) { // R64: 수군 출진 기회(선박 재고 + 연안 적 도시 12 이내 + 병력 여유)도 AP 40 예약
          if (e.force === fid || (e.force != null && (game.isAllied(fid, e.force) || game.isPeace(fid, e.force)))) continue;
          if (Math.hypot(e.lon - c.lon, e.lat - c.lat) < 12 && game.nearestWater(e.lon, e.lat)) { apReserve = 40; break; }
        }
      }
      if (apReserve) break;
    }
  }
  for (const c of cities) {
    if (f.ap < 30 + apReserve) break;
    if (c.gold > 1200) {
      game.develop(c.id, c.commerce <= c.farm ? 'commerce' : 'farm');
    }
  }
  // 1.5) 수색: 미발견 재야가 있는 도시, 같은 비용(AP20·금100) — 40% 확률
  for (const c of cities) {
    if (f.ap < 20 + apReserve || c.gold < 100 || !c.officers.length) continue;
    const hasHidden = Object.values(game.officers).some(o => o.state?.status === 'free' && o.state.city === c.id && o.state.found === false);
    if (hasHidden && Math.random() < 0.4) game.searchCity(c.id);
  }
  // 1.6) 상인: 같은 환율·비용(AP10) — 병량 부족 시 매입, 금 부족 시 매각
  {
    const rate = game.tradeRate();
    const needFood = cities.filter(c => (game.econV === 2 ? c.food < Math.max(3000, Math.round(c.troops * 0.8)) : c.food < 3000) && c.gold >= 3000).sort((x, y) => x.food - y.food)[0]; // econV 2: 2개월분 미만이면 매입 / 1: 구 문턱
    if (needFood && f.ap >= 10) game.trade(needFood.id, 'buy', 2);
    const richFood = cities.filter(c => (game.econV === 2 ? c.food > Math.max(50000, Math.round(c.troops * 2.4)) : c.food > 50000) && c.gold < 500 && c.food >= rate).sort((x, y) => y.food - x.food)[0]; // econV 2: 6개월분 초과 시에만 매각 / 1: 구 문턱
    if (richFood && f.ap >= 10) game.trade(richFood.id, 'sell', 2);
  }
  // 2) 징병: 병력이 적은 도시
  for (const c of cities) {
    if (f.ap < 30 + apReserve) break;
    const avgNbr = cities.reduce((s,x) => s + x.troops, 0) / cities.length;
    if (c.troops < Math.min(avgNbr, 12000) && c.gold > 500 && c.food > 3000) game.recruit(c.id);
  }
  // 2.6) 야전 시설: 위협받는 도시 근처의 대기 부대가 함정·진/채 건설 (설계 군사시설·함정 항목 — AI도 같은 규칙·비용 사용)
  {
    const isEnemy = (of) => of !== fid && of >= 0 && !(game.isAllied(fid, of) || game.isPeace(fid, of));
    outer:
    for (const c of cities) {
      const foes = game.units.filter(v => isEnemy(v.force) && !SHIP_TYPES.has(v.type) && Math.hypot(v.x - c.lon, v.z - c.lat) < 6);
      if (!foes.length) continue;
      const myFacs = (game.fieldFacs ?? []).filter(x => x.force === fid && Math.hypot(x.x - c.lon, x.z - c.lat) < 3);
      const hasSupport = myFacs.some(x => x.type === '진' || x.type === '채' || x.type === '성채');
      const idle = game.units.find(u => u.force === fid && !SHIP_TYPES.has(u.type) && !u.building && u.tx == null && u.troops >= 1500 && Math.hypot(u.x - c.lon, u.z - c.lat) < 3.5);
      if (!idle) continue;
      // 적이 가까우면 함정부터 (도시 골드로 비용 지불 — 플레이어와 동일 규칙)
      const near = foes.some(v => Math.hypot(v.x - idle.x, v.z - idle.z) < 3);
      const trapNear = myFacs.some(x => (x.type === '낙석' || x.type === '불화살함정') && foes.some(v => Math.hypot(v.x - x.x, v.z - x.z) < 2.5));
      const type = near && !trapNear ? (c.gold >= 120 ? '불화살함정' : '낙석') : (!hasSupport ? (c.gold >= 350 ? '채' : '진') : null);
      if (!type) continue;
      if (game.buildField(idle.id, type)) break outer;
    }
  }
  // 2.7) 외교: 친선 사절·동맹 제의·정전 요청을 같은 조건·비용으로 사용
  if (!legion) {
    const from = cities.filter(c => c.gold >= 500 && c.officers.length).sort((x, y) => y.gold - x.gold)[0];
    if (from) {
      // 험악 이웃에 친선 사절 (30% 확률)
      if (f.ap >= 20 && Math.random() < 0.3) {
        const worst = Object.values(game.forces).filter(t => t.alive && t.id !== fid)
          .map(t => ({ t, v: game.relation(fid, t.id) })).filter(x => x.v < 40).sort((x, y) => x.v - y.v)[0];
        if (worst) game.envoy(fid, worst.t.id, from.id);
      }
      // 호의 이상 세력에 동맹 제의 (20% 확률, 이미 동맹이면 패스)
      if (f.ap >= 30 && from.gold >= 1000 && Math.random() < 0.2) {
        const cand = Object.values(game.forces).filter(t => t.alive && t.id !== fid && !game.isAllied(fid, t.id) && game.relation(fid, t.id) >= 60)
          .sort((x, y) => game.relation(fid, y.id) - game.relation(fid, x.id))[0];
        if (cand) game.proposeAlliance(fid, cand.id, from.id);
      }
      // 불화 이하 + 수세(도시 2개 이하 또는 위협 도시)면 정전 요청 (50% 확률)
      if (f.ap >= 30 && from.gold >= 2000 && Math.random() < 0.5) {
        const threatened = cities.some(c => game.units.some(u => u.force !== fid && u.targetCity === c.id));
        if (cities.length <= 2 || threatened) {
          const foe = Object.values(game.forces).filter(t => t.alive && t.id !== fid && !game.isPeace(fid, t.id) && game.relation(fid, t.id) <= 39)
            .sort((x, y) => game.relation(fid, x.id) - game.relation(fid, y.id))[0];
          if (foe) game.requestTruce(fid, foe.id, from.id);
        }
      }
    }
  }
  // 2.6) 시설 건설: 개발지가 남고 금이 넉넉하면 시장·농장 우선, 이후 병영
  for (const c of cities) {
    if (f.ap < 20) break;
    c.facilities = c.facilities ?? [];
    if (c.facilities.length >= game.facSlots(c) || c.gold < 900) continue;
    const have = t => c.facilities.some(x => x.type === t);
    const pick = !have('시장') ? '시장' : !have('농장') ? '농장' : !have('병영') && c.gold > 2000 ? '병영' : !have('대장간') && c.gold > 3000 ? '대장간' : !have('공방') && c.gold > 4500 ? '공방' : !have('조선소') && c.gold > 4500 ? '조선소' : null;
    if (pick) {
      const builders = [...new Set(c.officers)].sort((x, y) => (game.officers[y]?.pol ?? 0) - (game.officers[x]?.pol ?? 0)).slice(0, 3);
      game.buildFacility(c.id, pick, builders);
    }
  }
  // 2.4) 병기·선박 생산: 플레이어와 같은 비용·규칙 (금이 아주 넉넉할 때만)
  for (const c of cities) {
    if (f.ap < 20 || c.gold < 6000) continue;
    if (game.cityFac(c, '공방').length && (c.rams ?? 0) + (c.towers ?? 0) + (c.beasts ?? 0) + (c.catapults ?? 0) < 4)
      game.produceSiege(c.id, (c.catapults ?? 0) <= (c.rams ?? 0) ? 'catapult' : 'ram');
    if (game.cityFac(c, '조선소').length && (c.junks ?? 0) + (c.lous ?? 0) + (c.dous ?? 0) < 3)
      game.produceShip(c.id, (c.dous ?? 0) <= (c.lous ?? 0) ? 'dou' : 'lou');
  }
  // 2.5) 인재 등용: 도시의 재야 무장을 같은 규칙으로 영입
  for (const c of cities) {
    if (f.ap < 20 + apReserve || c.gold < 300 || !c.officers.length) continue;
    const free = game.freeOfficers(c.id);
    if (!free.length) continue;
    const target = free.sort((a, b) => game.recruitChance(c.id, b.idx) - game.recruitChance(c.id, a.idx))[0];
    if (game.recruitChance(c.id, target.idx) >= 0.3) game.recruitOfficer(c.id, target.idx);
  }
  // 2.7) 기교 연구: 플레이어와 같은 비용·효과 규칙. 주력 병종 계통 우선, 없으면 방어 계통
  if (!legion) {
    const cnt = { spear: 0, pike: 0, bow: 0, cav: 0 };
    for (const u of game.units) if (u.force === fid && cnt[u.type] != null) cnt[u.type]++;
    const mainType = Object.entries(cnt).sort((x, y) => y[1] - x[1])[0][0];
    const pref = { spear: '창병', pike: '극병', bow: '노병', cav: '기병' }[mainType];
    if (game.turn % 3 === 0 && game.researchNextArt(fid)) { /* R23: AI도 같은 비용으로 개별 기교 연구 */ }
    else for (const b of [pref, '연병', '방위', '화공', '발명', '창병', '극병', '노병', '기병']) {
      if (game.researchTech(fid, b)) break;
    }
  }
  // 3) 군사: 전방 도시(적과 인접) 병력이 충분하면 공격, 아니면 집결
  let enemyCities = game.cities.filter(c => c.force !== fid && (c.force == null || !game.isAllied(fid, c.force))); // 동맹국 공격 회피
  if (legion?.policy === 'attack_city' && legion.target != null) {
    const t = game.cityById[legion.target];
    enemyCities = t && t.force !== fid ? [t] : [];
  } else if (legion?.policy === 'attack_force' && legion.target != null) {
    enemyCities = enemyCities.filter(c => c.force === legion.target);
  }
  for (const c of cities) {
    if (f.ap < 40) break;
    if (c.officers.length === 0) continue;
    // 가장 가까운 적 도시
    let best = null, bd = 1e9;
    for (const e of enemyCities) {
      const d = Math.hypot(e.lon - c.lon, e.lat - c.lat);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) continue;
    const threatened = game.units.some(u => u.force !== fid && u.targetCity === c.id);
    const threshold = Math.max(best.troops * 1.5, 6000);
    if ((c.troops > threshold && bd < 12) || (threatened && c.troops > 4000)) {
      // 출진
      const n = Math.min(c.troops - 3000, Math.round(best.troops * 1.6) + 3000);
      if (n >= 3000) {
        const offs = [...c.officers].sort((a,b) => game.officers[b].war - game.officers[a].war);
        const pick = offs.slice(0, Math.min(2, offs.length - 1 || 1));
        if (pick.length > 0) {
          let type = 'sword';
          if (c.spears >= n) type = 'spear'; else if (c.horses >= n) type = 'cav'; else if (c.pikes >= n) type = 'pike'; else if (c.bows >= n) type = 'bow';
          else if ((c.catapults ?? 0) > 0) type = 'catapult'; else if ((c.rams ?? 0) > 0) type = 'ram'; else if ((c.beasts ?? 0) > 0) type = 'beast'; else if ((c.towers ?? 0) > 0) type = 'tower'; // 병기: 공성 특화
          const u = game.dispatch(c.id, pick, n, type);
          if (u && !game.orderUnit(u.id, best.id)) game.orderUnit(u.id, c.id); // R17b: 출진 직후 목표 불가 시 원도시 대기
        }
      }
    }
    // R64: 수군 출진 — 육군 공세와 독립: 선박 재고·조선소·출진지 수로 인접·연안 적 도시 12 이내·병력 여유(9000) 시 (최소 완결 흐름, 자체 규칙)
    const shipType = (c.dous ?? 0) > 0 ? 'dou' : (c.lous ?? 0) > 0 ? 'lou' : (c.junks ?? 0) > 0 ? 'junk' : null;
    if (shipType && f.ap >= 40 && game.cityFac(c, '조선소').length && game.nearestWater(c.lon, c.lat) && c.troops >= 9000) {
      let bn = null, bnd = 12;
      for (const e of enemyCities) { const d = Math.hypot(e.lon - c.lon, e.lat - c.lat); if (d < bnd && game.nearestWater(e.lon, e.lat)) { bnd = d; bn = e; } }
      const n2 = Math.min(c.troops - 3000, 5000);
      if (bn && n2 >= 3000) {
        const offs2 = [...c.officers].sort((a, b) => game.officers[b].war - game.officers[a].war);
        const pick2 = offs2.slice(0, Math.min(2, offs2.length - 1 || 1));
        if (pick2.length > 0) {
          const u2 = game.dispatch(c.id, pick2, n2, shipType);
          if (u2 && !game.orderUnit(u2.id, bn.id)) game.orderUnit(u2.id, c.id);
        }
      }
    }
  }
  // R38 시험: 장기 공성 교착 완화 - 같은 도시를 10턴 이상 포위하고도 병력 우세가 없으면 가까운 아군 도시로 철수 (RULES.aiSiegeRelief)
  if (globalThis.__AI_SIEGE_RELIEF !== false) for (const u of game.units) {
    if (u.force !== fid || u.targetCity == null) continue;
    const tc = game.cityById[u.targetCity];
    if (!tc || tc.force === u.force || Math.hypot(tc.lon - u.x, tc.lat - u.z) > (SHIP_TYPES.has(u.type) ? 1.7 : 1.2)) { u._siegeAge = 0; continue; } // R64: 수군은 수상 공성 사거리(1.6)에서 포위
    u._siegeAge = (u._siegeAge ?? 0) + 1;
    if (u._siegeAge >= 10 && u.troops < tc.troops * 1.0) {
      const home = cities.slice().sort((a, b) => Math.hypot(a.lon - u.x, a.lat - u.z) - Math.hypot(b.lon - u.x, b.lat - u.z))[0];
      if (home && game.orderUnit(u.id, home.id)) u._siegeAge = 0;
    }
  }
  // 4) 목표 없는 야전 부대 재지정: 인접 적 도시가 약하면 공격, 아니면 귀환
  for (const u of game.units) {
    if (u.force !== fid || u.targetCity != null || u.building) continue; // R63: 건설 중 부대는 재지정 금지 — 재지정(tx 설정) 시 fieldTurn이 건설을 중단시킴
    if (u.targetFac != null) continue; // R77: 시설 공격 명령 진행 중이면 유지 (매 턴 재지정으로 명령이 흔들리지 않게)
    if (u.repairing != null) continue; // 보수 진행 중이면 유지 (완료·중단까지 재지정 금지)
    if (u.troops >= 1500) { // R77: AI 명령형 시설 공격 (매뉴얼: 군사시설은 공격 대상) — 목표 없는 부대가 6칸 안 적 완공 시설(함정 제외)을 명령형으로 공격. 기존에는 자동 소모(2%)만으로 시설을 깎아 플레이어 시설선을 전략적으로 무시하는 갭
      let bf = null, bfd = 6;
      for (const f2 of (game.fieldFacs ?? [])) {
        if (f2.left > 0 || TRAPS.hasOwnProperty(f2.type) || f2.force == null || f2.force === fid || game.isPeace(fid, f2.force)) continue;
        const d = Math.hypot(f2.x - u.x, f2.z - u.z); if (d < bfd) { bfd = d; bf = f2; }
      }
      if (bf && game.orderFacAttack(u.id, bf.id)) continue;
    }
    const foes = game.cities.filter(c => c.force !== fid && (c.force == null || (game.forces[c.force]?.alive && !game.isAllied(fid, c.force))));
    let best = null, bd = 1e9;
    for (const e of foes) { const d = Math.hypot(e.lon - u.x, e.lat - u.z); if (d < bd) { bd = d; best = e; } }
    const homes = cities.slice().sort((a,b) => Math.hypot(a.lon-u.x,a.lat-u.z) - Math.hypot(b.lon-u.x,b.lat-u.z));
    if (best && bd < 10 && u.troops > Math.max(best.troops * 1.2, 4000)) { if (!game.orderUnit(u.id, best.id) && homes.length) game.orderUnit(u.id, homes[0].id); } // R17b: 노선 없음 시 귀환 회복
    else { // 귀환 전에 인접 아군 손상 시설이 있으면 보수 (補修, 매뉴얼 P.41: 금 불요·인접 시설만)
      const rf = (game.fieldFacs ?? []).find(f => game.canRepairFac(u, f) === null);
      if (!(rf && game.repairFac(u.id, rf.id)) && homes.length) game.orderUnit(u.id, homes[0].id); // 보수 대상 없으면 귀환·합류
    }
  }
  // 5) R15: AI도 같은 규칙으로 전법·계략 직접 발동 — 인접 적 부대·도시에 턴 1회, 비용·자격은 fireTactic/fireStrat과 동일
  for (const u of [...game.units]) {
    if (u.force !== fid || !game.units.includes(u)) continue;
    const inR = (x, z) => Math.hypot(x - u.x, z - u.z) < 2.2;
    const eu = game.units.filter(x => x.force !== u.force && !game.isPeace(u.force, x.force) && inR(x.x, x.z)).sort((a, b) => (game.unitHasSkill(b, '미끼') ? 1 : 0) - (game.unitHasSkill(a, '미끼') ? 1 : 0))[0]; // R17: 미끼 특기 부대 우선 타겟팅 (모든 AI 세력 공통 경로)
    const ec = game.cities.find(c => c.force != null && c.force !== u.force && !game.isPeace(u.force, c.force) && inR(c.lon, c.lat));
    if (game.tacticInfo(u)) { // 전법: 부대 우선, 없으면 도시
      if (eu) { // R18: 추가 전법 선택 - 혼란 미부여 대상엔 혼란형, 주변 적 2부대 이상이면 광역·관통형, 아니면 가장 높은 단계
        const info = game.tacticInfo(u); const pick = typeof game.pickTactic === 'function' ? game.pickTactic(u, eu) : legacyPick(game, u, eu, info); // 자동 전투와 같은 선택 규칙 (구버전 game.js와 섞여 로드돼도 AI 턴이 중단되지 않게 하는 호환 경로)
        game.fireTactic(u.id, { type: 'unit', id: eu.id }, pick ? pick.id : (info.opts.some(o => o.id === 'base') ? 'base' : null));
      }
      else if (ec) { game.fireTactic(u.id, { type: 'city', id: ec.id }); }
      else { // R77: 인접 적 부대·도시가 없으면 시설 전법 (가능 병종 게이트는 fireTactic과 동일 — 투석·정란·수군·노병 등)
        const facReach = SHIP_TYPES.has(u.type) ? 1.6 : (u.type === 'catapult' ? 3.0 : 2.2); // R78: 탐색 거리를 병종 유효거리와 일치 (fireTactic 시설 분기와 동일 규칙 — 투석기 3칸 목표 누락·수군 2.2 무효 조준 방지)
        const ef = (game.fieldFacs ?? []).find(f => f.left <= 0 && !TRAPS.hasOwnProperty(f.type) && f.force != null && f.force !== u.force && !game.isPeace(u.force, f.force) && Math.hypot(f.x - u.x, f.z - u.z) < facReach);
        if (ef) game.fireTactic(u.id, { type: 'fac', id: ef.id });
      }
    }
    if (!game.units.includes(u) || (u._stratTurn ?? -1) === game.turn) continue;
    const caster = u.officers.map(i => game.officers[i]).sort((a, b) => b.int - a.int)[0];
    if (!caster) continue;
    if (caster.int >= 60 && (u.qi ?? 100) >= 10 && game.canAmbush(u) && game.ambushTarget(u) && game.fireStrat(u.id, 'ambush', {})) continue; // R33 복병
    const burnCity = game.cities.find(c => c.force === u.force && (c.burn ?? 0) > 0 && inR(c.lon, c.lat));
    if (burnCity && caster.int >= 60 && (u.qi ?? 100) >= 10 && game.fireStrat(u.id, 'douse', { type: 'city', id: burnCity.id })) continue; // 도시 지속불 소화
    const burning = game.units.find(x => x.force === u.force && (x.burn ?? 0) > 0 && inR(x.x, x.z));
    if (burning && caster.int >= 60 && (u.qi ?? 100) >= 10 && game.fireStrat(u.id, 'douse', { type: 'unit', id: burning.id })) continue; // R32 소화
    const tgt = game.units.find(x => x.force !== u.force && !game.isPeace(u.force, x.force) && !game.unitHasSkill(x, '위장') && inR(x.x, x.z));
    if ((u.qi ?? 100) >= 50 && tgt && ((u.id + game.turn) % 2 === 0) && (u.officers.some(i => game.officers[i]?.skill === '요술') ? game.fireStrat(u.id, 'sorcery', { type: 'unit', id: tgt.id }) : u.officers.some(i => game.officers[i]?.skill === '낙뢰') && game.fireStrat(u.id, 'thunder', { type: 'unit', id: tgt.id }))) continue; // 요술/낙뢰: 특기 보유 부대만
    const ally = game.units.find(x => x !== u && x.force === u.force && (x.conf ?? 0) > 0 && inR(x.x, x.z));
    if (ally && caster.int >= 70 && (u.qi ?? 100) >= 10) game.fireStrat(u.id, 'calm', { type: 'unit', id: ally.id }); // R18 진정: 혼란 아군 우선
    else if (tgt && caster.int >= 80 && (u.qi ?? 100) >= 15 && tgt.troops > u.troops * 1.3 && (tgt.conf ?? 0) <= 0 && (u.id + game.turn) % 2 === 0) game.fireStrat(u.id, 'rumor', { type: 'unit', id: tgt.id }); // R18 위보: 열세 시
    else if (tgt && caster.int >= 80 && (u.qi ?? 100) >= 15 && (tgt.conf ?? 0) <= 0) game.fireStrat(u.id, 'confuse', { type: 'unit', id: tgt.id }); // 혼란 우선
    else if (tgt && caster.int >= 75 && (u.qi ?? 100) >= 10) game.fireStrat(u.id, 'fire', { type: 'unit', id: tgt.id });
    else if (!tgt && ec && caster.int >= 75 && (u.qi ?? 100) >= 10) game.fireStrat(u.id, 'fire', { type: 'city', id: ec.id });
    else if (!tgt && !ec && caster.int >= 75 && (u.qi ?? 100) >= 10) { // R77: AI도 화계로 시설을 태움 (매뉴얼 火計 対象 施設)
      const ef = (game.fieldFacs ?? []).find(f => f.left <= 0 && !TRAPS.hasOwnProperty(f.type) && f.force != null && f.force !== u.force && !game.isPeace(u.force, f.force) && inR(f.x, f.z));
      if (ef) game.fireStrat(u.id, 'fire', { type: 'fac', id: ef.id });
    }
  }
}

// 구버전 game.js(pickTactic 없음)와 함께 로드된 경우의 같은 선택 규칙
function legacyPick(game, u, eu, info) {
  const ex = info.opts.filter(o => o.id !== 'base'); if (!ex.length) return null;
  const near = game.units.filter(x => x !== eu && x.force !== u.force && !game.isPeace(u.force, x.force) && Math.hypot(x.x - eu.x, x.z - eu.z) < 1.6).length;
  return ex.find(o => o.eff === 'conf' && (eu.conf ?? 0) <= 0) || (near >= 1 ? ex.find(o => ['whirl', 'volley', 'side', 'pierce'].includes(o.eff)) : null) || ex.slice().sort((x, y) => y.qi - x.qi)[0];
}
