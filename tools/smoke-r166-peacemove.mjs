import fs from'node:fs';import{Game}from'../js/game.js';let n=0;const ok=(k,v)=>{if(!v)throw Error(k);console.log('PASS '+k);n++};
function setup(kind,retreat=false){const off=Object.fromEntries(JSON.parse(fs.readFileSync('data/officers670.json')).map(o=>[o.idx,o])),s=JSON.parse(fs.readFileSync('data/scenario-190.json')),g=new Game(s,off,{},5),c=g.forceCities(5)[0],dst=retreat?g.forceCities(5)[1]:g.cities.find(c=>c.force!==5&&Math.hypot(c.lon-g.forceCities(5)[0].lon,c.lat-g.forceCities(5)[0].lat)>5);g.econV=1;g.changeRelation(5,0,0);if(kind==='peace')g.diplo[g.diploKey(5,0)].truceUntil=30;if(kind==='allied')g.diplo[g.diploKey(5,0)].allianceUntil=30;if(kind==='expired')g.diplo[g.diploKey(5,0)].truceUntil=0;const u={id:9001,force:5,type:'sword',label:'fixture',officers:[c.officers[0]],troops:5000,qi:100,x:c.lon,z:c.lat,tx:dst.lon,tz:dst.lat,targetCity:dst.id,path:[]},v={...u,id:9002,force:kind==='bandit'?-1:kind==='own'?5:0,x:c.lon+1,tx:null,tz:null,officers:[]};g.units=kind==='none'?[u]:[u,v];return {g,u,v,b:[u.x,u.z]}}
const run=(kind,retreat=false)=>{const x=setup(kind,retreat);x.g.stepUnit(x.u);return {...x,moved:Math.hypot(x.u.x-x.b[0],x.u.z-x.b[1])}};
const baseline=run('none').moved;ok('통상행군',baseline>0);
for(const k of ['peace','allied','own'])ok(k+' 행군불변',Math.abs(run(k).moved-baseline)<1e-9);
for(const k of ['enemy','expired','bandit'])ok(k+' 요격유지',run(k).moved===0);
ok('적근접 아군도시퇴각허용',run('enemy',true).moved>0);
const x=setup('peace');x.g.diplo[x.g.diploKey(5,0)].truceUntil=0;x.g.stepUnit(x.u);ok('만료후요격',x.u.x===x.b[0]&&x.u.z===x.b[1]);
const m=setup('peace');m.g.units.push({...m.v,id:9003,force:-1});m.g.stepUnit(m.u);ok('평화곁도적요격',m.u.x===m.b[0]&&m.u.z===m.b[1]);
console.log('R166 '+n+' PASS');
