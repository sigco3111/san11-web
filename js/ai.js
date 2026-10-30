// 세력 AI — 위임 시 플레이어 세력도 이 AI가 운영 (위임·샌드박스의 실질 주체)
export function aiThink(game, fid, legion = null) { // legion 지정 시 그 군단 소속 도시만 운영 (도독 위임)
  const f = game.forces[fid];
  if (!f || !f.alive) return;
  let cities = game.forceCities(fid);
  if (legion) cities = cities.filter(c => legion.cities.includes(c.id));
  // R9: 치안 순찰 — 치안 80 미만 도시, 플레이어와 동일 비용 (금100·AP20)
  for (const c of cities) if ((c.security ?? 80) < 80) game.patrol(c.id);
  if (cities.length === 0) return;
  // 1) 내정: 여유 금이 있으면 개발
  for (const c of cities) {
    if (f.ap < 30) break;
    if (c.gold > 1200) {
      game.develop(c.id, c.commerce <= c.farm ? 'commerce' : 'farm');
    }
  }
  // 1.5) 수색: 미발견 재야가 있는 도시, 같은 비용(AP20·금100) — 40% 확률
  for (const c of cities) {
    if (f.ap < 20 || c.gold < 100 || !c.officers.length) continue;
    const hasHidden = Object.values(game.officers).some(o => o.state?.status === 'free' && o.state.city === c.id && o.state.found === false);
    if (hasHidden && Math.random() < 0.4) game.searchCity(c.id);
  }
  // 1.6) 상인: 같은 환율·비용(AP10) — 병량 부족 시 매입, 금 부족 시 매각
  {
    const rate = game.tradeRate();
    const needFood = cities.filter(c => c.food < 3000 && c.gold >= 3000).sort((x, y) => x.food - y.food)[0];
    if (needFood && f.ap >= 10) game.trade(needFood.id, 'buy', 2);
    const richFood = cities.filter(c => c.food > 50000 && c.gold < 500 && c.food >= rate).sort((x, y) => y.food - x.food)[0];
    if (richFood && f.ap >= 10) game.trade(richFood.id, 'sell', 2);
  }
  // 2) 징병: 병력이 적은 도시
  for (const c of cities) {
    if (f.ap < 30) break;
    const avgNbr = cities.reduce((s,x) => s + x.troops, 0) / cities.length;
    if (c.troops < Math.min(avgNbr, 12000) && c.gold > 500 && c.food > 3000) game.recruit(c.id);
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
    if (f.ap < 20 || c.gold < 300 || !c.officers.length) continue;
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
    for (const b of [pref, '연병', '방위', '화공', '발명', '창병', '극병', '노병', '기병']) {
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
  }
  // 4) 목표 없는 야전 부대 재지정: 인접 적 도시가 약하면 공격, 아니면 귀환
  for (const u of game.units) {
    if (u.force !== fid || u.targetCity != null) continue;
    const foes = game.cities.filter(c => c.force !== fid && (c.force == null || (game.forces[c.force]?.alive && !game.isAllied(fid, c.force))));
    let best = null, bd = 1e9;
    for (const e of foes) { const d = Math.hypot(e.lon - u.x, e.lat - u.z); if (d < bd) { bd = d; best = e; } }
    const homes = cities.slice().sort((a,b) => Math.hypot(a.lon-u.x,a.lat-u.z) - Math.hypot(b.lon-u.x,b.lat-u.z));
    if (best && bd < 10 && u.troops > Math.max(best.troops * 1.2, 4000)) { if (!game.orderUnit(u.id, best.id) && homes.length) game.orderUnit(u.id, homes[0].id); } // R17b: 노선 없음 시 귀환 회복
    else if (homes.length) game.orderUnit(u.id, homes[0].id);  // 귀환·합류
  }
  // 5) R15: AI도 같은 규칙으로 전법·계략 직접 발동 — 인접 적 부대·도시에 턴 1회, 비용·자격은 fireTactic/fireStrat과 동일
  for (const u of [...game.units]) {
    if (u.force !== fid || !game.units.includes(u)) continue;
    const inR = (x, z) => Math.hypot(x - u.x, z - u.z) < 2.2;
    const eu = game.units.filter(x => x.force !== u.force && !game.isPeace(u.force, x.force) && inR(x.x, x.z)).sort((a, b) => (game.unitHasSkill(b, '미끼') ? 1 : 0) - (game.unitHasSkill(a, '미끼') ? 1 : 0))[0]; // R17: 미끼 특기 부대 우선 타겟팅 (모든 AI 세력 공통 경로)
    const ec = game.cities.find(c => c.force != null && c.force !== u.force && !game.isPeace(u.force, c.force) && inR(c.lon, c.lat));
    if (game.tacticInfo(u)) { // 전법: 부대 우선, 없으면 도시
      if (eu) { game.fireTactic(u.id, { type: 'unit', id: eu.id }); }
      else if (ec) { game.fireTactic(u.id, { type: 'city', id: ec.id }); }
    }
    if (!game.units.includes(u) || (u._stratTurn ?? -1) === game.turn) continue;
    const caster = u.officers.map(i => game.officers[i]).sort((a, b) => b.int - a.int)[0];
    if (!caster) continue;
    const tgt = game.units.find(x => x.force !== u.force && !game.isPeace(u.force, x.force) && !game.unitHasSkill(x, '위장') && inR(x.x, x.z));
    if (tgt && caster.int >= 80 && (u.qi ?? 100) >= 25 && (tgt.conf ?? 0) <= 0) game.fireStrat(u.id, 'confuse', { type: 'unit', id: tgt.id }); // 혼란 우선
    else if (tgt && caster.int >= 75 && (u.qi ?? 100) >= 30) game.fireStrat(u.id, 'fire', { type: 'unit', id: tgt.id });
    else if (!tgt && ec && caster.int >= 75 && (u.qi ?? 100) >= 30) game.fireStrat(u.id, 'fire', { type: 'city', id: ec.id });
  }
}
