/** Fictional village customs. These are game rules, not historical or modern law. */
export const ACTIONS = [
 {id:'refer', name:'Petition the magistrate', seal:'REFER', text:'This exceeds the chamber. Prepare a petition for the magistrate; do not settle a grave threat with a handshake.'},
 {id:'witness', name:'Find a witness', seal:'WITNESS', text:'Bring someone who saw what happened, or a record of the bargain. The allegation alone is too thin.'},
 {id:'oath', name:'Offer a sworn account', seal:'OATH', text:'No independent evidence has been offered. Under this fictional village custom, offer a sworn account before taking the dispute further.'},
 {id:'return', name:'Seek the goods back', seal:'RETURN', text:'Ask for the identified goods to be returned. If the other party refuses, take that request to the village officer.'},
 {id:'pay', name:'Request the promised payment', seal:'PAYMENT', text:'Ask for the payment now due under the stated bargain. Put the request and the promised amount in writing.'},
 {id:'repair', name:'Seek compensation', seal:'REPAIR', text:'Prepare an account of the substantial loss and request compensation. This recommendation is not an enforceable award.'},
 {id:'settle', name:'Propose a settlement', seal:'SETTLE', text:'Offer a practical compromise before spending another day in this office. Record what each neighbor agrees to do.'},
 {id:'decline', name:'Do not pursue the claim', seal:'DECLINE', text:'On these stated facts, this chamber recommends no further claim. A grievance is not always a useful petition.'}
];
export const FIELDS = {
 claim:{label:'What is disputed?',options:{land:'Land or boundaries',debt:'An unpaid bargain',goods:'Possession of goods',insult:'An insult',injury:'Damage or injury'}},
 evidence:{label:'Independent evidence',options:{none:'None offered',witness:'A witness',record:'A written record'}},
 loss:{label:'Size of the loss',options:{none:'No stated loss',small:'A small loss',large:'A substantial loss'}},
 promise:{label:'Was there a promise?',options:{no:'No',yes:'Yes'}},
 due:{label:'Is payment due?',options:{no:'No',yes:'Yes'}},
 ownership:{label:'Ownership of the goods',options:{unclear:'Unclear',clear:'Clearly identified'}},
 oath:{label:'Will a party swear an account?',options:{no:'No',yes:'Yes'}},
 danger:{label:'Immediate danger',options:{ordinary:'No grave threat',grave:'A grave threat'}},
 relationship:{label:'The other party',options:{neighbor:'A neighbor',stranger:'A stranger'}}
};
export const FEATURE_SCHEMA='village-facts-1';
export function validateFacts(f){
 if(!f || typeof f!=='object' || Array.isArray(f))throw Error('A fact sheet is required.');
 if(Object.keys(f).length!==Object.keys(FIELDS).length)throw Error('Unknown or missing fact fields.');
 for(const [k,def] of Object.entries(FIELDS))if(!Object.hasOwn(def.options,f[k]))throw Error(`Invalid fact: ${k}.`);
 return Object.fromEntries(Object.keys(FIELDS).map(k=>[k,f[k]]));
}
export function encode(f){
 f=validateFacts(f);const out=[];
 for(const [k,def] of Object.entries(FIELDS))for(const value of Object.keys(def.options))out.push(f[k]===value?1:0);
 return Float32Array.from(out);
}
export function customs(f){
 f=validateFacts(f);
 if(f.danger==='grave')return 0;
 if(f.evidence==='none')return f.oath==='yes'?2:1;
 if(f.claim==='goods'&&f.ownership==='clear')return 3;
 if(f.claim==='debt'&&f.promise==='yes'&&f.due==='yes')return 4;
 if(f.loss==='large')return 5;
 if(f.loss==='small'||f.claim==='land')return 6;
 return 7;
}
export function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function allFacts(i=0,f={}){const keys=Object.keys(FIELDS);if(i===keys.length)return [{...f}];return Object.keys(FIELDS[keys[i]].options).flatMap(v=>allFacts(i+1,{...f,[keys[i]]:v}));}
let datasets;
export function corpus(split){
 if(!['train','test'].includes(split))throw Error('Unknown corpus split.');
 if(!datasets){
  const groups=Array.from({length:8},()=>[]);
  for(const facts of allFacts())groups[customs(facts)].push(facts);
  for(const g of groups)g.sort((a,b)=>hash('village-2026:'+JSON.stringify(a))-hash('village-2026:'+JSON.stringify(b)));
  datasets={train:[],test:[]};
  for(let answer=0;answer<8;answer++)for(let i=0;i<12;i++){
   const part=i<8?'train':'test';datasets[part].push({id:`${part}-${answer}-${i}`,facts:groups[answer][i],answer});
  }
 }
 return datasets[split].map(c=>({...c,facts:{...c.facts}}));
}
const base={claim:'land',evidence:'witness',loss:'small',promise:'no',due:'no',ownership:'unclear',oath:'no',danger:'ordinary',relationship:'neighbor'};
export const VILLAGERS=[
 {id:'cabbages',name:'Marta the gardener',title:'The pig and the cabbages',offering:'A basket of cabbages',story:'Her neighbor’s pig has gone through the fence again. Six cabbages are gone. Marta wants to know what to ask for.',facts:{...base,claim:'injury'}},
 {id:'wheel',name:'Jan the wheelwright',title:'One hen short',offering:'A troublesome wheel',story:'Two hens were promised for a repaired wheel. Only one arrived. Jan has the written bargain, and the payment date has passed.',facts:{...base,claim:'debt',evidence:'record',promise:'yes',due:'yes'}},
 {id:'wool',name:'Lena the spinner',title:'Whose wool is it?',offering:'A skein of wool',story:'A bundle of wool disappeared from the common. Lena suspects a stranger, but has no witness and cannot identify a mark on the bundle.',facts:{...base,claim:'goods',evidence:'none',ownership:'unclear',relationship:'stranger'}},
 {id:'jug',name:'Pieter the potter',title:'The borrowed blue jug',offering:'An empty jug',story:'A borrowed jug has not come back. Pieter’s mark is underneath it, and a neighbor saw it being lent.',facts:{...base,claim:'goods',ownership:'clear'}},
 {id:'insult',name:'Anke the baker',title:'Words at the market',offering:'Half a loaf',story:'Someone called her bread a building material. There were witnesses. Anke reports no loss, but has taken considerable offense.',facts:{...base,claim:'insult',loss:'none'}},
 {id:'mill',name:'Willem the miller',title:'A threat at the mill',offering:'A sack of flour',story:'A dispute over a watercourse has turned into a grave threat. Willem wants advice before returning to the mill.',facts:{...base,claim:'land',loss:'large',danger:'grave'}}
];
export function factSummary(f){f=validateFacts(f);return Object.entries(FIELDS).map(([k,d])=>`${d.label}: ${d.options[f[k]]}`).join('. ')+'.';
