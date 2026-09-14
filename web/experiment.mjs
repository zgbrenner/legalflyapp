import {makeCorpus,encodeFacts,charter,rng} from './cases.mjs';
import {simulate,trainReadout,predict,STEPS,SEED,ENGINE} from './engine.mjs';
export async function fitStarter(graph,{cancel=()=>false,onProgress=()=>{}}={}) {
  const corpus=makeCorpus(SEED),xs=[],ys=[];
  for(const c of corpus.train) {
    const run=await simulate(graph,encodeFacts(c.facts),{cancel});
    xs.push(run.features);ys.push(charter(c.facts));
    onProgress({done:xs.length,total:corpus.train.length});
  }
  return trainReadout(xs,ys,{fingerprint:graph.fingerprint});
}
export async function audit(graph,starter,{cancel=()=>false,onProgress=()=>{}}={}) {
  const corpus=makeCorpus(SEED),r=rng(731),shuffled=[...starter.labels];
  for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
  const direct=trainReadout(corpus.train.map(c=>encodeFacts(c.facts)),corpus.train.map(c=>charter(c.facts)),{fingerprint:'direct-facts'});
  const shuffle=trainReadout(starter.samples,shuffled,{fingerprint:graph.fingerprint});
  const severed=trainReadout(starter.samples.map(x=>x.map(()=>0)),starter.labels,{fingerprint:graph.fingerprint});
  const rows=[],start=performance.now();
  for(const c of corpus.test) {
    if(cancel())throw Error('Cancelled.');
    const input=encodeFacts(c.facts),t=performance.now();
    const run=await simulate(graph,input,{cancel});
    const cut=await simulate(graph,input,{cancel,severed:true});
    if(cut.features.some(v=>v!==0))throw Error('Severed control leaked sensory input into its readout.');
    rows.push({id:c.id,facts:c.facts,expected:charter(c.facts),biological:predict(starter,run.features).action,direct:predict(direct,input).action,shuffled:predict(shuffle,run.features).action,severed:predict(severed,cut.features).action,active:run.trace.at(-1).active,rms:run.trace.at(-1).rms,milliseconds:performance.now()-t});
    onProgress({done:rows.length,total:corpus.test.length});
  }
  const names={biological:'MaleCNS + learned readout',direct:'Direct facts + same readout',shuffled:'MaleCNS + shuffled teaching labels',severed:'Severed connections + same readout'};
  const scores=Object.keys(names).map(key=>({key,name:names[key],correct:rows.filter(row=>row[key]===row.expected).length,total:rows.length}));
  return {engine:ENGINE,fingerprint:graph.fingerprint,seed:SEED,steps:STEPS,corpus:corpus.version,train:corpus.train.length,test:rows.length,trainingCorrect:starter.samples.filter((x,i)=>predict(starter,x).action===starter.labels[i]).length,measuredAt:new Date().toISOString(),milliseconds:performance.now()-start,scores,rows,limitations:'One predefined synthetic split, not real or historical law. This does not establish superiority of biological wiring. Teaching changes only an artificial ridge readout, not biological synapses.'};
}
