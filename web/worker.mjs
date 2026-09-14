import {loadGraph,validateModel,simulate,predict,teach,ENGINE} from './engine.mjs';
import {encodeFacts,validateFacts} from './cases.mjs';
import {audit} from './experiment.mjs';
let graph=null,manifest=null,model=null,starter=null,last=null,active=null;
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const send=(id,type,payload)=>postMessage({id,type,payload});
async function readJSON(path,signal){const r=await fetch(new URL(path,import.meta.url),{signal});if(!r.ok)throw Error(`Missing prepared data: ${path}. Build the full distribution first.`);return r.json();}
onmessage=async({data})=>{
  if(data.type==='cancel'){if(active){active.cancelled=true;active.abort.abort();}return;}
  const {id,type,payload={}}=data;
  if(active){send(id,'error',{message:'Another operation is still running.',ready:!!graph&&!!model});return;}
  const task={id,cancelled:false,abort:new AbortController()};active=task;
  const cancel=()=>task.cancelled;
  try {
    if(type==='load') {
      manifest=await readJSON('./data/manifest.json',task.abort.signal);
      graph=await loadGraph(manifest,async part=>{
        const response=await fetch(new URL('./data/'+part.file,import.meta.url),{signal:task.abort.signal});
        if(!response.ok)throw Error('A connectome part could not be downloaded.');
        const packed=await response.arrayBuffer();
        if(packed.byteLength!==part.bytes||await sha(packed)!==part.sha256)throw Error('Connectome checksum mismatch. No substitute graph will be loaded.');
        return new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      },{cancel,onProgress:p=>send(id,'progress',{...p,phase:'Loading the complete nervous system'})});
      const proof=await readJSON('./data/model-manifest.json',task.abort.signal);
      const response=await fetch(new URL('./data/starter.json',import.meta.url),{signal:task.abort.signal});
      if(!response.ok)throw Error('The prepared starter model is missing.');
      const bytes=await response.arrayBuffer();
      if(await sha(bytes)!==proof.sha256)throw Error('Starter model checksum mismatch.');
      starter=validateModel(JSON.parse(new TextDecoder().decode(bytes)),{fingerprint:graph.fingerprint,featureSize:graph.outputs.length*3});
      model=structuredClone(starter);last=null;
      send(id,'loaded',{manifest,lessons:model.lessons});
    } else {
      if(!graph||!model)throw Error('Load the complete nervous system first.');
      if(type==='consult') {
        const facts=validateFacts(payload.facts),input=encodeFacts(facts),start=performance.now();
        const result=await simulate(graph,input,{cancel,onFrame:f=>send(id,'frame',f)});
        last={key:JSON.stringify(input),features:result.features};
        send(id,'consulted',{...predict(model,result.features),milliseconds:performance.now()-start,trace:result.trace,lessons:model.lessons});
      } else if(type==='teach') {
        if(!last||JSON.stringify(encodeFacts(payload.facts))!==last.key)throw Error('Consult on these exact facts before teaching an answer.');
        model=teach(model,last.features,payload.action);
        send(id,'taught',{...predict(model,last.features),lessons:model.lessons});
      } else if(type==='audit') {
        const report=await audit(graph,starter,{cancel,onProgress:p=>send(id,'progress',{...p,phase:'Testing unseen fact combinations'})});
        send(id,'audited',report);
      } else if(type==='export')send(id,'exported',model);
      else if(type==='import') {
        const next=validateModel(payload.model,{fingerprint:graph.fingerprint,featureSize:graph.outputs.length*3});
        model=structuredClone(next);last=null;send(id,'imported',{lessons:model.lessons});
      } else if(type==='reset') {model=structuredClone(starter);last=null;send(id,'imported',{lessons:model.lessons});}
      else throw Error('Unknown operation.');
    }
  } catch(error) {
    if(type==='load'){graph=null;model=null;starter=null;}
    send(id,task.cancelled?'cancelled':'error',{message:task.cancelled?'Stopped. No partial result was recorded.':(error instanceof RangeError?'The browser could not allocate enough memory for the complete graph. Close other tabs or use a desktop browser.':error.message),ready:!!graph&&!!model});
  } finally {if(active===task)active=null;}
};
