import {loadGraph,Brain,checkCancel} from './lib/graph.mjs';
import {encode,validateFacts} from './lib/cases.mjs';
import {predict,correct,exportModel,importModel} from './lib/learner.mjs';
import {teach,benchmark} from './lib/experiment.mjs';
let brain=null,model=null,busy=false,cancelled=false,controller=null,last=null;
self.onmessage=async({data})=>{
 const {id,type,payload}=data||{};
 if(type==='cancel'){cancelled=true;controller?.abort();return;}
 if(busy){postMessage({id,type:'error',error:'Another operation is running.'});return;}
 busy=true;cancelled=false;controller=new AbortController();
 const progress=value=>postMessage({id,type:'progress',value});
 try{
  let result;
  if(type==='load'){
   const graph=await loadGraph(new URL('./data/',import.meta.url),{cancelled:()=>cancelled,signal:controller.signal,onProgress:progress});
   checkCancel(()=>cancelled);brain=new Brain(graph);model=null;last=null;
   result={neurons:graph.n,connections:graph.e,sha256:graph.meta.sha256,bytes:graph.meta.bytes,sensory:graph.meta.sensory.length,descending:graph.meta.readout.length,source:graph.meta.source,classes:graph.meta.neuronClasses};
  }else{
   if(!brain)throw Error('Load the complete CNS first.');
   if(type==='teach'){
    const trained=await teach(brain,{cancelled:()=>cancelled,onProgress:progress});checkCancel(()=>cancelled);model=trained.model;last=null;result={model:exportModel(model),ms:trained.ms};
   }else if(type==='consult'){
    if(!model)throw Error('Teach the readout before asking for advice.');const facts=validateFacts(payload.facts);
    const r=await brain.run(encode(facts),{cancelled:()=>cancelled,onStep:progress});checkCancel(()=>cancelled);
    last={facts,features:r.features};result={...predict(model,r.features),activity:r.activity,trace:r.trace,edgeVisits:r.edgeVisits,readoutNorm:r.readoutNorm};
   }else if(type==='correct'){
    if(!model||!last)throw Error('Hear a case before teaching a correction.');
    if(JSON.stringify(last.facts)!==JSON.stringify(validateFacts(payload.facts)))throw Error('Facts changed. Hear the case again before correcting it.');
    model=correct(model,last.features,payload.choice);result={model:exportModel(model),prediction:predict(model,last.features)};
   }else if(type==='import'){
    const checked=importModel(payload,brain.g.meta.sha256);model=checked;last=null;result={model:exportModel(model)};
   }else if(type==='benchmark'){
    result=await benchmark(brain,{cancelled:()=>cancelled,onProgress:progress});
   }else throw Error('Unknown operation.');
  }
  postMessage({id,type:'result',value:result});
 }catch(error){postMessage({id,type:'error',error:cancelled?'Operation cancelled. Previous completed model kept.':error.message});}
 finally{busy=false;controller=null;}
};
