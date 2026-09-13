import { VERSION, DEFAULTS, DIM, FEATURES, MAX_STEPS, parseGraph, validateModel, validateCards, train, DreamSession, displayGraph, yieldThread } from './core.mjs';
let generation=0,aborter=null,graph=null,model=null,session=null,layout=null,trace=[],controls=[];
const cached=new Map();
const send=(id,type,data={})=>postMessage({id,type,...data});
async function loadGraph(kind,signal){
 if(cached.has(kind))return cached.get(kind);
 const m=await fetch('/dream/manifest.json',{signal});if(!m.ok)throw Error('The brain manifest could not be loaded');
 const manifest=await m.json(),info=manifest.graphs?.[kind];
 if(manifest.schema!=='legalfly-graph/1'||!info||!/^([a-z_]+)\.bin$/.test(info.file))throw Error('Invalid brain manifest');
 const response=await fetch(`/dream/${info.file}`,{signal});if(!response.ok)throw Error('The biological brain file is unavailable');
 const buffer=await response.arrayBuffer();
 if(!crypto.subtle)throw Error('A secure HTTPS page is required to verify the brain');
 const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),b=>b.toString(16).padStart(2,'0')).join('');
 if(actual!==info.sha256)throw Error('Brain checksum failed. No substitute network was loaded');
 const result=parseGraph(buffer,info);cached.set(kind,result);return result;
}
function begin(){generation++;aborter?.abort();aborter=new AbortController();return generation;}
function summary(){return model?{cards:model.cards,metrics:model.metrics,seed:model.seed,graphHash:model.graphHash}:null;}
function emitFrame(id){
 const frame=session.frame();const values=layout.indices.map(i=>Math.abs(session.reservoir.x[i]));
 trace.push({...frame,sampledActivity:values});if(trace.length>257)trace.shift();
 send(id,'frame',{frame,activity:values});
}
async function loop(id,token,mode,noise){
 send(id,'status',{status:'running'});
 while(token===generation&&session.steps<MAX_STEPS){
  for(let k=0;k<8&&session.steps<MAX_STEPS;k++)session.tick(mode,noise);
  emitFrame(id);await new Promise(resolve=>setTimeout(resolve,80));
 }
 if(token===generation)send(id,'status',{status:'complete'});
}
async function handle(m){
 const id=m.id;
 if(m.type==='export-model'){if(!model)throw Error('Read a corpus first');send(id,'download',{name:'legalfly-learned-model.json',content:JSON.stringify(model)});return;}
 if(m.type==='export-trace'){
  if(!session)throw Error('No session to export');
  send(id,'download',{name:'legalfly-dream-notebook.json',content:JSON.stringify({schema:'legalfly-notebook/1',engine:VERSION,createdAt:new Date().toISOString(),graphHash:model.graphHash,graphSha256:model.graphSha256,seed:model.seed,cue:session.cue,cards:model.cards,settings:{...DEFAULTS,inputDimensions:DIM,readoutNeurons:FEATURES,recurrenceScale:graph.info.recurrenceScale},sampledNodeIds:layout.node_ids,sampledNodeIndices:layout.indices,mode:session.mode,noise:session.noise,frames:trace,controls,note:'Numerical association trace, not legal findings. No proof of biological sleep or novel law.'},null,2)});return;
 }
 const token=begin(),signal=aborter.signal;
 const current=()=>token===generation;
 if(m.type==='pause'||m.type==='cancel'){send(id,'status',{status:model?'paused':'ready'});return;}
 try{
  if(m.type==='load'){
   graph=await loadGraph('biological',signal);if(!current())return;layout=displayGraph(graph);send(id,'loaded',{layout,info:graph.info});send(id,'status',{status:'ready'});return;
  }
  if(!graph){graph=await loadGraph('biological',signal);if(!current())return;layout=displayGraph(graph);send(id,'loaded',{layout,info:graph.info});}
  if(m.type==='train'){
   send(id,'status',{status:'reading'});
   const next=await train(graph,m.cards,{seed:m.seed},p=>{if(current())send(id,'progress',p);},()=>!current());
   if(!current())return;model=next;session=new DreamSession(graph,model);session.prime(m.cue??0);trace=[];controls=[];
   send(id,'trained',{model:summary()});emitFrame(id);
   if(m.autoRun)await loop(id,token,m.mode??'replay',m.noise??0);else send(id,'status',{status:'paused'});return;
  }
  if(m.type==='import-corpus'){const next=validateCards(m.cards);model=null;session=null;trace=[];controls=[];send(id,'corpus',{cards:next});send(id,'status',{status:'ready'});return;}
  if(m.type==='import-model'){
   const next=validateModel(m.model,graph.info);model=next;session=new DreamSession(graph,next);session.prime(0);trace=[];controls=[];
   send(id,'trained',{model:summary(),imported:true});emitFrame(id);send(id,'status',{status:'paused'});return;
  }
  if(m.type==='start'){
   if(!model)throw Error('Read a corpus first');session=new DreamSession(graph,model);session.prime(m.cue??0);trace=[];emitFrame(id);await loop(id,token,m.mode,m.noise);return;
  }
  if(m.type==='resume'){
   if(!session)throw Error('No paused session');await loop(id,token,session.mode,session.noise);return;
  }
  if(m.type==='controls'){
   if(!model)throw Error('Read a corpus first');send(id,'status',{status:'controls'});
   const rewired=await loadGraph('random_degree_preserving',signal);if(!current())return;
   const other=await train(rewired,model.cards,{seed:model.seed},p=>{if(current())send(id,'progress',{...p,phase:'rewired control'});},()=>!current());
   if(!current())return;const rows=[];
   for(const [name,g,learned,mode] of [['Learned replay',graph,model,'replay'],['Feedback off',graph,model,'silence'],['Rewired replay',rewired,other,'replay']]){
    const s=new DreamSession(g,learned);s.prime(m.cue??0);let matches=0,changes=0,last=null,energy=0;
    for(let i=0;i<256;i++){
     if(!current())return;s.tick(mode,0);const f=s.frame();energy+=f.rms;if(f.match!==null)matches++;if(i>0&&f.match!==last)changes++;last=f.match;
     if(i%32===0)await yieldThread();
    }
    rows.push({name,steps:256,noise:0,cue:m.cue??0,seed:model.seed,meanRMS:energy/256,finalRMS:s.frame().rms,matchedSteps:matches,labelChanges:changes,graphHash:g.info.graphHash,connections:g.weights.length,mode});
   }
   if(!current())return;controls=rows;send(id,'controls',{rows});send(id,'status',{status:'paused'});return;
  }
  throw Error('Unknown worker command');
 }catch(error){
  if(!current()||signal.aborted)return;send(id,'error',{message:error instanceof Error?error.message:'The experiment could not finish'});send(id,'status',{status:model?'paused':'ready'});
 }
}
onmessage=e=>{handle(e.data).catch(error=>send(e.data.id,'error',{message:error.message||'Worker failure'}));};
