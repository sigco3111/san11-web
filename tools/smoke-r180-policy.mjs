import assert from'node:assert/strict';import fs from'node:fs';import{budgetInfo,safeProduce}from'../js/arms-policy.js';let n=0;function setup(){const c={id:1,force:5,gold:10000,food:16000,troops:10000,officers:[1]},g={autosave(){},turn:1,year:190,month:1,forces:{5:{ap:100}},armsInfo:()=>({why:'',gold:200,ap:10}),forceOverview:()=>({cities:[{id:1,sal:500,goldIn:1800,foodLackMonth:null,goldLackMonth:null}]}),produceArms(){c.gold-=200;g.forces[5].ap-=10;return true}};return{g,c}}
const ok=(s,f)=>{f();n++;console.log('PASS '+s)};let{g,c}=setup();
ok('cash reserve actual salary+trade3000+recruit200',()=>assert.equal(budgetInfo(g,c,'spears').reserve,3700));
ok('exact cash boundary accepted',()=>{c.gold=3900;assert.equal(budgetInfo(g,c,'spears').why,'')});
ok('one below cash boundary rejected',()=>{c.gold=3899;assert.equal(budgetInfo(g,c,'spears').why,'cash reserve')});
({g,c}=setup());ok('two-month food buffer blocks cash-only workaround',()=>{c.food=7999;assert.equal(budgetInfo(g,c,'spears').why,'two-month food buffer')});
({g,c}=setup());ok('AP next recruit30+trade10 preserved',()=>{g.forces[5].ap=49;assert.equal(budgetInfo(g,c,'spears').why,'next-command AP reserve');g.forces[5].ap=50;assert.equal(budgetInfo(g,c,'spears').why,'')});
({g,c}=setup());ok('monthly deficit blocks',()=>{g.forceOverview=()=>({cities:[{id:1,sal:1801,goldIn:1800}]});assert.equal(budgetInfo(g,c,'spears').why,'monthly salary deficit')});
({g,c}=setup());ok('production accumulates actual costs',()=>{assert(safeProduce(g,c,'spears'));assert.equal(c.armsBudget.gold,200);assert.equal(c.gold,9800)});
ok('same month turn change does not reset budget',()=>{g.turn=2;assert.equal(budgetInfo(g,c,'spears').spent,200)});
ok('monthly budget caps repetition',()=>{c.armsBudget.gold=1000;assert.equal(budgetInfo(g,c,'spears').why,'monthly cash budget')});
ok('next month resets budget without altering old stamp',()=>{g.month=2;assert.equal(budgetInfo(g,c,'spears').spent,0);assert.equal(c.armsBudget.gold,1000)});
ok('changed owner old budget not charged',()=>{g.month=1;c.force=7;g.forces[7]={ap:100};assert.equal(budgetInfo(g,c,'spears').spent,0)});
({g,c}=setup());ok('failed engine call does not advance ledger',()=>{g.produceArms=()=>false;assert.equal(safeProduce(g,c,'spears'),false);assert.equal(c.armsBudget,undefined)});
({g,c}=setup());ok('save reload retains monthly allowance spent',()=>{safeProduce(g,c,'spears');const restored=JSON.parse(JSON.stringify(c));assert.equal(budgetInfo(g,restored,'spears').spent,200)});
({g,c}=setup());ok('city JSON saves allowance only after success',()=>{let saved;g.produceArms=()=>{c.gold-=200;g.forces[5].ap-=10;saved=JSON.parse(JSON.stringify(c));return true};safeProduce(g,c,'spears');assert.equal(saved.armsBudget.gold,200)});
console.log(n+' policy research gates PASS');
// Actual engine integration boundaries, not mocked estimates.
const {Game}=await import('../js/game.js');const{aiThink}=await import('../js/ai.js');const scen=JSON.parse(fs.readFileSync('data/scenario-190.json'));const officers=Object.fromEntries(JSON.parse(fs.readFileSync('data/officers670.json')).map(o=>[o.idx,o]));

const real=new Game(scen,officers,{},5);real.autosave=()=>{};const city=real.forceCities(5)[0];city.gold=10000;city.food=50000;city.troops=10000;city.commerce=100;city.facilities=[{type:'대장간',done:true,level:1},{type:'군사부',done:true}];city.specialty=['창'];real.forces[5].ap=100;
ok('specialty and military costs use same engine quote',()=>{real.delegated=true;const b=budgetInfo(real,city,'spears');assert.equal(b.gold,150);assert.equal(b.ap,8);assert.equal(b.why,'')});
ok('real success ledger matches discounted paid amount',()=>{const before=city.gold;assert(safeProduce(real,city,'spears'));assert.equal(city.armsBudget.gold,150);assert.equal(before-city.gold,150)});
ok('used shared facility no ledger charge',()=>{assert.equal(safeProduce(real,city,'bows'),false);assert.equal(city.armsBudget.gold,150)});
ok('manual legion boundary stays blocked',()=>{real.turn++;real.delegated=false;real.forces[5].legions=[{id:2,cities:[city.id]}];assert.equal(budgetInfo(real,city,'spears').why,'군단 소속 도시')});
ok('acting legion uses same paid command and shared budget',()=>{real._legionActing=true;assert(safeProduce(real,city,'spears'));assert.equal(city.armsBudget.gold,300);real._legionActing=false});
ok('JSON budget reload repeated turn cannot reset',()=>{const restored=JSON.parse(JSON.stringify(city));assert.equal(budgetInfo(real,restored,'spears').why,'군단 소속 도시');real._legionActing=true;assert.equal(budgetInfo(real,restored,'spears').why,'이번 턴 생산 횟수 소진');real._legionActing=false});
console.log(n+' total policy gates PASS');

({g,c}=setup());ok('engine autosave sees budget at same instant as stock payment',()=>{let captured;g.produceArms=()=>{captured=structuredClone(c.armsBudget);return true};assert(safeProduce(g,c,'spears'));assert.equal(captured.gold,200)});
({g,c}=setup());ok('engine failure restores pre-existing ledger identity',()=>{c.armsBudget={month:'189-12',force:5,gold:400};const old=c.armsBudget;g.produceArms=()=>false;assert.equal(safeProduce(g,c,'spears'),false);assert.equal(c.armsBudget,old)});
({g,c}=setup());ok('engine exception rolls back staged budget',()=>{g.produceArms=()=>{throw Error('injected test')};assert.throws(()=>safeProduce(g,c,'spears'));assert.equal(Object.hasOwn(c,'armsBudget'),false)});
console.log(n+' total policy gates PASS');
