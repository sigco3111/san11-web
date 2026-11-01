import fs from 'node:fs';import {Game,restoreOfficer} from '../js/game.js';
const s=JSON.parse(fs.readFileSync('data/scenario-190.json')),off=Object.fromEntries(JSON.parse(fs.readFileSync('data/officers670.json')).map(o=>[o.idx,o]));const g=new Game(s,off,{},5),o=off[60],f=g.forces[5];let n=0;const ok=(msg,v)=>{if(!v)throw Error(msg);console.log('PASS '+msg);n++};
ok('정상 가후 임명',g.appointAdvisor(60)&&g.activeAdvisor(5)===o&&g.mindDefense(5)===.194);
for(const status of ['captive','free','dead']){o.state.status=status;ok(status+' 임명차단·방어제외·이력유지',!g.appointAdvisor(60)&&g.activeAdvisor(5)===null&&g.mindDefense(5)===off[f.ruler].int/500&&f.advisor===60)}
o.state.status='serving';o.state.force=9;ok('이적 군사 제외',g.activeAdvisor(5)===null&&g.mindDefense(5)===off[f.ruler].int/500);
o.state.force=5;ok('원소속 석방복귀 재직',g.activeAdvisor(5)===o&&g.mindDefense(5)===.194);
f.alive=false;ok('멸망 임명차단·방어0',!g.appointAdvisor(60)&&g.activeAdvisor(5)===null&&g.mindDefense(5)===0);f.alive=true;
const c=g.cityById[o.state.city];g.appointAdvisor(60);const rnd=Math.random;Math.random=()=>0;const did=g._captureOfficer(o,9,c.lon,c.lat);Math.random=rnd;ok('실포박 helper로 군사효과중지',did&&o.state.status==='captive'&&g.activeAdvisor(5)===null&&g.mindDefense(5)===.116);
let save;globalThis.localStorage={setItem:(k,v)=>save=JSON.parse(v)};g.autosave();const o2=Object.fromEntries(JSON.parse(fs.readFileSync('data/officers670.json')).map(o=>[o.idx,o]));const h=new Game(s,o2,{},5);h.forces=save.forces;for(const [i,st]of Object.entries(save.officerStates))restoreOfficer(o2[i],st);ok('저장·복원 포로군사 제외·이력유지',h.forces[5].advisor===60&&h.activeAdvisor(5)===null&&h.mindDefense(5)===.116);
const src=fs.readFileSync('js/main.js','utf8'),ui=src.slice(src.indexOf('function showAdvisor('),src.indexOf('function showLegions('));ok('화면 현재유효군사·후보status필터',ui.includes('game.activeAdvisor(c.force)')&&ui.includes("['ruler', 'taesu', 'serving'].includes(o.state.status)")&&ui.includes('현재 재직하지 않습니다'));
ok('군사 첫진입0/동일뷰스크롤유지',ui.includes('p.scrollTop = reopening ? 0 : oldScroll'));
console.log(`R162 ${n} PASS`);
