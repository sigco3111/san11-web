// 세력 AI — 위임 시 플레이어 세력도 이 AI가 운영 (위임·샌드박스의 실질 주체)
export function aiThink(game, fid) {
  const f = game.forces[fid];
  if (!f || !f.alive) return;
  const cities = game.forceCities(fid);
  if (cities.length === 0) return;
  // 1) 내정: 여유 금이 있으면 개발
  for (const c of cities) {
    if (f.ap < 30) break;
    if (c.gold > 1200) {
      game.develop(c.id, c.commerce <= c.farm ? 'commerce' : 'farm');
    }
  }
  // 2) 징병: 병력이 적은 도시
  for (const c of cities) {
    if (f.ap < 30) break;
    const avgNbr = cities.reduce((s,x) => s + x.troops, 0) / cities.length;
    if (c.troops < Math.min(avgNbr, 12000) && c.gold > 500 && c.food > 3000) game.recruit(c.id);
  }
  // 2.5) 인재 등용: 도시의 재야 무장을 같은 규칙으로 영입
  for (const c of cities) {
    if (f.ap < 20 || c.gold < 300 || !c.officers.length) continue;
    const free = game.freeOfficers(c.id);
    if (!free.length) continue;
    const target = free.sort((a, b) => game.recruitChance(c.id, b.idx) - game.recruitChance(c.id, a.idx))[0];
    if (game.recruitChance(c.id, target.idx) >= 0.3) game.recruitOfficer(c.id, target.idx);
  }
  // 3) 군사: 전방 도시(적과 인접) 병력이 충분하면 공격, 아니면 집결
  const enemyCities = game.cities.filter(c => c.force !== fid);
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
          const u = game.dispatch(c.id, pick, n, type);
          if (u) game.orderUnit(u.id, best.id);
        }
      }
    }
  }
  // 4) 목표 없는 야전 부대 재지정: 인접 적 도시가 약하면 공격, 아니면 귀환
  for (const u of game.units) {
    if (u.force !== fid || u.targetCity != null) continue;
    const foes = game.cities.filter(c => c.force !== fid && (c.force == null || game.forces[c.force]?.alive));
    let best = null, bd = 1e9;
    for (const e of foes) { const d = Math.hypot(e.lon - u.x, e.lat - u.z); if (d < bd) { bd = d; best = e; } }
    const homes = cities.slice().sort((a,b) => Math.hypot(a.lon-u.x,a.lat-u.z) - Math.hypot(b.lon-u.x,b.lat-u.z));
    if (best && bd < 10 && u.troops > Math.max(best.troops * 1.2, 4000)) game.orderUnit(u.id, best.id);
    else if (homes.length) game.orderUnit(u.id, homes[0].id);  // 귀환·합류
  }
}
