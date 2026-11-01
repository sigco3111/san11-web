import fs from 'node:fs';
const src=fs.readFileSync('js/main.js','utf8');
let n=0;function ok(name,v){if(!v)throw Error(name);console.log('PASS '+name);n++}
const why=new Function('OFFICES','UNIT_TYPES','SHIP_TYPES',src.slice(src.indexOf('function dispatchUiWhy('),src.indexOf('function showDispatch('))+';return dispatchUiWhy')([{cmd:0}],{sword:{name:'검병',cost:{}}},new Set());
const g={playerForce:2,turn:1,officers:{365:{state:{force:2}}},forces:{2:{ap:20}},dispatchCap:()=>3,unitTroopCap:()=>20000,officeOf:()=>0,_blocked:()=>false,apMult:()=>1};
const c={force:2,officers:[365],troops:10000};
ok('AP20 부족',why(g,c,5000,'sword',[365])==='행동력 40 필요');
g.turn=2;g.forces[2].ap=50;ok('턴후 AP50 가능',why(g,c,5000,'sword',[365])==='');
c.officers=[];ok('주둔 이탈 거부',why(g,c,5000,'sword',[365]).includes('주둔'));
c.officers=[365];g.officers[365].state.force=3;ok('소속 변경 거부',why(g,c,5000,'sword',[365]).includes('주둔'));
g.officers[365].state.force=2;c.force=3;ok('도시 상실 거부',why(g,c,5000,'sword',[365]).includes('소유'));
const show=src.slice(src.indexOf('function showDispatch('),src.indexOf('// R148:'));
const refresh=show.slice(show.indexOf('  p.refreshDispatch ='),show.indexOf('  refreshCap(); refreshDispatch();'));
ok('입력 유지 갱신: 값·선택 재할당 없음',!/\.value\s*=|\.checked\s*=|innerHTML/.test(refresh)&&refresh.includes('refreshCap(false)'));
ok('현재 상한 및 재고 갱신',refresh.includes('capBase = game.unitTroopCap')&&refresh.includes('opt.textContent')&&refresh.includes('refreshDispatch();'));
const turn=src.slice(src.indexOf('function doTurn('),src.indexOf('// === R123:'));
ok('실제 턴 종료 경로 훅',turn.includes("dataset.view === 'dispatch'")&&turn.includes('refreshDispatch?.()'));
ok('대결 외교 종료 훅',src.slice(src.indexOf('function refreshOpenPanel('),src.indexOf('function refreshHud(')).includes('p.refreshDispatch?.()'));
console.log(`R161 ${n} PASS`);
