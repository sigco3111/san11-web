// Research policy only. No live mutation or public approval.
// Thresholds reuse current AI trade(3000)/recruit(>500) gates and exact salary/production quotes.
export function budgetInfo(g,c,key){
 const a=g.armsInfo(c,key);if(a.why)return{why:a.why};
 const r=g.forceOverview(c.force).cities.find(x=>x.id===c.id);if(!r)return{why:'no forecast'};
 const salary=r.sal,tradeGate=3000,recruit=200;
 // Existing AI can buy 2 lots (2000) and recruit once (200) per opportunity. Reserve
 // a month of salary plus those cash obligations, rather than treating 1200 as universally safe.
 const foodBuffer=Math.max(3000,Math.round(c.troops*0.8)),foodRisk=c.food<foodBuffer;
 const reserve=salary+tradeGate+recruit;
 const monthKey=`${g.year}-${g.month}`,old=c.armsBudget;
 const spent=old?.month===monthKey&&old.force===c.force?old.gold:0;
 const surplus=Math.max(0,r.goldIn-salary-(foodRisk?2000:0)-recruit);
 const apReserve=40; // current full recruit30 + trade10, no AP discount assumed.
 const why=foodRisk?'two-month food buffer':r.goldIn<salary?'monthly salary deficit':c.gold-a.gold<reserve?'cash reserve':spent+a.gold>surplus?'monthly cash budget':g.forces[c.force].ap-a.ap<apReserve?'next-command AP reserve':'';
 return{why,gold:a.gold,ap:a.ap,reserve,salary,spent,surplus,monthKey,apReserve};
}
export function safeProduce(g,c,key){
 const b=budgetInfo(g,c,key);if(b.why)return false;
 // Stage the budget before the engine's synchronous autosave so a saved production
 // can never omit its monthly charge. Failed calls restore the previous field.
 const had=Object.hasOwn(c,'armsBudget'),previous=c.armsBudget;
 c.armsBudget={month:b.monthKey,force:c.force,gold:b.spent+b.gold};
 let ok=false;try{ok=g.produceArms(c.id,key);return ok}finally{if(!ok){if(had)c.armsBudget=previous;else delete c.armsBudget}}
}
export function supply(g,fid,leg){for(const c of g.forceCities(fid).filter(c=>!leg||leg.cities.includes(c.id))){if(!c.officers.length||c.troops<6000)continue;const enemy=g.cities.some(e=>e.force!==fid&&(e.force==null||!g.isPeace(fid,e.force))&&Math.hypot(c.lon-e.lon,c.lat-e.lat)<12),target=Math.min(c.troops-3000,6000);if(!enemy||Math.max(c.spears,c.pikes,c.bows,c.horses)>=target)continue;const keys=['spears','pikes','bows','horses'].filter(k=>!g.armsInfo(c,k).why).sort((a,b)=>c[b]-c[a]);if(keys.length)safeProduce(g,c,keys[0])}}
