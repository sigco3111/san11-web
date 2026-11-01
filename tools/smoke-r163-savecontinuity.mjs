import fs from'node:fs';import{Game,restoreOfficer}from'../js/game.js';
const s=JSON.parse(fs.readFileSync('data/scenario-190.json')),off=Object.fromEntries(JSON.parse(fs.readFileSync('data/officers670.json')).map(o=>[o.idx,o])),g=new Game(s,off,{},5);let n=0;const ok=(msg,v)=>{if(!v)throw Error(msg);console.log('PASS '+msg);n++};
const o=off[660],c=g.cityById[o.state.city];o.state.merit=10000;g.forces[5].rank='황제';const base=o.war;ok('상한무장 관직임명',g.appointOffice(c.id,660,3));ok('100상한 실제가산0',o.war===100&&o.state._officeBonus.war===0);ok('해임해도기본100보존',g.appointOffice(c.id,660,0)&&o.war===base);
g.appointOffice(c.id,660,3);restoreOfficer(o,o.state);restoreOfficer(o,o.state);ok('동일무장재복원멱등',o.war===100&&o.state._officeBonus.war===0);g._clearOffice(o);ok('상한해임공통경로',o.war===100&&o.state.office===0);
const low=c.officers.find(i=>off[i].war<90&&off[i].state.force===5),a=off[low],w=a.war;a.state.merit=10000;g.appointOffice(c.id,low,3);const boosted=a.war;g._clearOffice(a);ok('하야해임과연구보존',boosted===w+1&&a.war===w&&a.state.office===0&&a.state._officeBonus===null);
const fresh=JSON.parse(fs.readFileSync('data/officers670.json')).find(x=>x.idx===low);restoreOfficer(fresh,structuredClone(a.state));ok('해임저장복원능력일치',fresh.war===a.war);
const main=fs.readFileSync('js/main.js','utf8');ok('황제필드존재/부재구분복원',main.includes('emperor: d.emperor !== undefined ? d.emperor : g.emperor'));
const r={war:99,state:{force:5,bonus:{war:2}}};restoreOfficer(r,r.state);restoreOfficer(r,r.state);ok('연구상한재복원멱등',r.war===100&&r.__restored.research.war===1);
console.log(`R163 ${n} PASS`);
