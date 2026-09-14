/** Original fictional game rules. This is not historical or contemporary law. */
export const ISSUES = ['damage','debt','possession','insult','boundary','violence'];
export const ISSUE_NAMES = ['Damage to goods','Unpaid bargain','Possession of goods','An insult','A disputed boundary','An injury or threat'];
export const ACTIONS = [
  {title:'Let the matter rest', verb:'Withdraw the petition', text:'The advocate recommends leaving this claim alone. Not every grievance needs another sheet of paper.'},
  {title:'Make a small payment', verb:'Small compensation', text:'The advocate recommends a modest payment for the loss, agreed by both parties rather than imposed by this office.'},
  {title:'Make substantial amends', verb:'Larger compensation', text:'The advocate recommends substantial compensation. The village must still agree on the amount.'},
  {title:'Return the disputed goods', verb:'Return the property', text:'The advocate recommends returning the goods to the claimant and recording the handover.'},
  {title:'Bring a witness', verb:'Seek more evidence', text:'The advocate asks for a witness or a better account of what happened. An accusation is not a receipt.'},
  {title:'Meet halfway', verb:'Broker a settlement', text:'The advocate recommends a negotiated settlement, written down before either neighbour changes their mind.'},
  {title:'Honour the bargain', verb:'Pay the agreed debt', text:'The advocate recommends paying the outstanding bargain, or agreeing a date for payment.'},
  {title:'Go to the magistrate', verb:'Refer the matter', text:'The advocate recommends taking this serious matter to the magistrate. The fly has a desk, not a constable.'},
];
export const DEFAULT_FACTS = Object.freeze({issue:'damage',evidence:2,loss:1,agreement:false,due:false,returnable:false,mutual:false,danger:false});
export const FLAGS = ['agreement','due','returnable','mutual','danger'];
export function validateFacts(f) {
  if (!f || typeof f!=='object' || Array.isArray(f) || !ISSUES.includes(f.issue)) throw Error('Choose a recognised kind of dispute.');
  for (const key of ['evidence','loss']) if (!Number.isInteger(f[key]) || f[key]<0 || f[key]>2) throw Error(`${key} must be 0, 1 or 2.`);
  for (const key of FLAGS) if (typeof f[key]!=='boolean') throw Error(`${key} must be true or false.`);
  return Object.fromEntries(['issue','evidence','loss',...FLAGS].map(k=>[k,f[k]]));
}
export function encodeFacts(facts) {
  const f=validateFacts(facts);
  return [...ISSUES.map(t=>+(f.issue===t)),...[0,1,2].map(v=>+(f.evidence===v)),...[0,1,2].map(v=>+(f.loss===v)),...FLAGS.map(k=>+f[k])];
}
export function charter(facts) {
  const f=validateFacts(facts);
  if (f.danger || (f.issue==='violence'&&f.loss===2)) return 7;
  if (f.evidence===0) return 4;
  if (f.mutual) return 5;
  if (f.issue==='possession'&&f.returnable) return 3;
  if (f.issue==='debt'&&f.agreement&&f.due) return 6;
  if (['damage','boundary','violence'].includes(f.issue)&&f.loss>0) return f.loss===2 ? 2 : 1;
  return 0;
}
export function charterReason(facts) {
  const a=charter(facts);
  return ['No supported remedy under this game\'s charter.','A supported claim with a modest loss.','A supported claim with a substantial loss.','The identified goods can be returned.','The account has no supporting evidence.','Both neighbours are willing to negotiate.','An agreed debt has come due.','A serious injury or continuing threat requires referral.'][a];
}
export const CASES = [
  {id:'cabbages',name:'The pig in the cabbages',person:'Jan, a market gardener',fee:'A basket of turnips',note:'Pieter\'s pig got through my fence and ate three rows of cabbages. The miller saw it. Pieter says the pig cannot read a boundary.',facts:{...DEFAULT_FACTS},point:[.48,.53]},
  {id:'barrel',name:'A barrel, half paid',person:'Maarten, the cooper',fee:'Two eggs',note:'I made six sound barrels for the innkeeper. We agreed a price before harvest. The payment is overdue, and his own tally records the debt.',facts:{...DEFAULT_FACTS,issue:'debt',agreement:true,due:true},point:[.60,.60]},
  {id:'kettle',name:'The borrowed copper kettle',person:'Lijsbeth, a neighbour',fee:'A crust of bread',note:'I lent my good kettle for a wedding. Three weeks later it is still in their kitchen. My mark is on the handle and a neighbour remembers the loan.',facts:{...DEFAULT_FACTS,issue:'possession',evidence:1,returnable:true,loss:0},point:[.29,.68]},
  {id:'goose',name:'A missing goose',person:'Willem, a goose keeper',fee:'An empty basket',note:'My best goose disappeared. I suspect the man over the lane because he looked pleased at dinner. No one saw him take it.',facts:{...DEFAULT_FACTS,issue:'possession',evidence:0,returnable:true},point:[.12,.52]},
  {id:'fence',name:'Three inches of common ground',person:'Anthonis, a smallholder',fee:'A small cheese',note:'Our new fence leaves my neighbour less room to turn his cart. We each have a different old sketch. We are both willing to move it a little.',facts:{...DEFAULT_FACTS,issue:'boundary',evidence:1,mutual:true},point:[.76,.40]},
  {id:'mill',name:'Trouble at the mill',person:'Hendrik, the miller',fee:'A sack of meal',note:'A quarrel became a beating. One man is badly hurt, and the other has threatened to return tonight. Two witnesses agree about the threat.',facts:{...DEFAULT_FACTS,issue:'violence',loss:2,danger:true},point:[.89,.49]},
  {id:'cart',name:'The cart in the fire',person:'Kathelijne, a carter',fee:'A promise to pay',note:'A carelessly tended fire burned my cart and its load. The damage is substantial. The neighbours saw the fire spread from the smithy.',facts:{...DEFAULT_FACTS,loss:2},point:[.42,.49]},
  {id:'bells',name:'The insult after vespers',person:'Joos, a bell ringer',fee:'One pear',note:'He called me the worst bell ringer in three parishes. Everyone heard it. I suffered no loss, but I would like the record to show that he sings flat.',facts:{...DEFAULT_FACTS,issue:'insult',loss:0},point:[.64,.45]},
];
export function rng(seed=42) { let s=seed>>>0; return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;}; }
export function makeCorpus(seed=42) {
  const r=rng(seed), buckets=Array.from({length:8},()=>[]), seen=new Set();
  for(let tries=0;tries<200000&&buckets.some(b=>b.length<9);tries++) {
    const f={issue:ISSUES[Math.floor(r()*6)],evidence:Math.floor(r()*3),loss:Math.floor(r()*3)};
    for(const k of FLAGS) f[k]=r()<.3;
    const key=JSON.stringify(encodeFacts(f)), y=charter(f);
    if(seen.has(key)||buckets[y].length>=9) continue;
    seen.add(key);buckets[y].push({id:`charter-${seed}-${y}-${buckets[y].length}`,facts:f});
  }
  if(buckets.some(b=>b.length!==9)) throw Error('Could not construct a disjoint corpus.');
  return {seed,version:'village-charter-1',train:buckets.flatMap(b=>b.slice(0,6)),test:buckets.flatMap(b=>b.slice(6))};
}
