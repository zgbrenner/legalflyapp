export const GRAPH_N=166700, GRAPH_E=25582938, FEATURE_DIM=128, STEPS=12;
export const ENGINE='village-rate-csr-1';
export const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
export function checkCancel(fn){if(fn?.())throw Error('Operation cancelled.');}
export function parseGraph(buffer,meta,{testOnly=false}={}){
 if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<20)throw Error('Invalid graph file.');
 if(new TextDecoder().decode(new Uint8Array(buffer,0,8))!=='VLAW0100')throw Error('Invalid graph signature.');
 const view=new DataView(buffer),n=view.getUint32(8,true),e=view.getUint32(12,true);
 if(!testOnly&&(n!==GRAPH_N||e!==GRAPH_E||meta?.neurons!==GRAPH_N||meta?.connections!==GRAPH_E))throw Error('The complete MaleCNS graph is required. No subset fallback is available.');
 if(n<1||e<1||n>GRAPH_N||e>GRAPH_E||buffer.byteLength!==16+(n+1)*4+e*8+n*4)throw Error('Invalid graph dimensions or byte length.');
 let offset=16;
 const ptr=new Uint32Array(buffer,offset,n+1);offset+=4*(n+1);
 const ix=new Uint32Array(buffer,offset,e);offset+=4*e;
 const weights=new Float32Array(buffer,offset,e);offset+=4*e;
 const ids=new Uint32Array(buffer,offset,n);
 if(ptr[0]!==0||ptr[n]!==e)throw Error('Invalid CSR offsets.');
 for(let i=0;i<n;i++)if(ptr[i]>ptr[i+1])throw Error('Invalid CSR ordering.');
 for(let j=0;j<e;j++)if(ix[j]>=n||!Number.isFinite(weights[j])||weights[j]===0||Math.abs(weights[j])>1.001)throw Error('Invalid CSR edge.');
 for(let i=1;i<n;i++)if(ids[i]<=ids[i-1])throw Error('Neuron identities are not unique and ordered.');
 for(const key of ['sensory','readout']){
  const a=meta?.[key];if(!Array.isArray(a)||!a.length||a.some(i=>!Number.isInteger(i)||i<0||i>=n)||new Set(a).size!==a.length)throw Error(`Invalid ${key} annotations.`);
 }
 if(typeof meta.sha256!=='string'||!/^[a-f0-9]{64}$/.test(meta.sha256))throw Error('Invalid graph fingerprint.');
 return {n,e,ptr,ix,weights,ids,meta,testOnly};
}
function mix(x){x=Math.imul(x^(x>>>16),0x45d9f3b);x=Math.imul(x^(x>>>16),0x45d9f3b);return (x^(x>>>16))>>>0;}
export class Brain{
 constructor(graph){
  this.g=graph;this.a=new Float32Array(graph.n);this.b=new Float32Array(graph.n);
  this.sensory=[...graph.meta.sensory].sort((a,b)=>mix(graph.ids[a]+1729)-mix(graph.ids[b]+1729));
  this.bins=new Uint8Array(graph.n);this.signs=new Int8Array(graph.n);
  for(let i=0;i<graph.n;i++){const h=mix(graph.ids[i]);this.bins[i]=h%FEATURE_DIM;this.signs[i]=(h&256)?1:-1;}
  this.sample=Uint32Array.from({length:Math.min(1536,graph.n)},(_,i)=>Math.floor(i*graph.n/Math.min(1536,graph.n)));
 }
 async run(input,{cancelled,onStep,disconnected=false}={}){
  if(!(input instanceof Float32Array)||!input.length||input.some(x=>!Number.isFinite(x)))throw Error('Invalid stimulation vector.');
  const {g}=this;const drive=new Float32Array(g.n),stimulated=new Uint8Array(g.n);
  if(!g.testOnly&&this.sensory.length<input.length*4)throw Error('Insufficient annotated sensory channels.');
  for(let k=0;k<input.length;k++)for(let r=0;r<4;r++){const i=this.sensory[(k*4+r)%this.sensory.length];drive[i]+=input[k]*.8;stimulated[i]=1;}
  this.a.fill(0);this.b.fill(0);const features=new Float32Array(FEATURE_DIM),trace=[];let activity;
  for(let step=0;step<STEPS;step++){
   checkCancel(cancelled);const a=this.a,b=this.b;
   for(let i=0;i<g.n;i++){
    let recurrent=0;
    if(!disconnected)for(let j=g.ptr[i];j<g.ptr[i+1];j++)recurrent+=g.weights[j]*a[g.ix[j]];
    b[i]=.25*a[i]+.75*Math.tanh(1.15*recurrent+drive[i]);
   }
   this.a=b;this.b=a;
   if(step>=STEPS-4)for(let i=0;i<g.n;i++)if(!stimulated[i])features[this.bins[i]]+=this.signs[i]*b[i]/4;
   let energy=0,active=0;for(let i=0;i<g.n;i++){energy+=b[i]*b[i];if(Math.abs(b[i])>1e-6)active++;}
   activity=Float32Array.from(this.sample,i=>b[i]);
   const frame={step:step+1,rms:Math.sqrt(energy/g.n),active};trace.push(frame);
   onStep?.({...frame,activity});await pause();
  }
  checkCancel(cancelled);
  let norm=0;for(const x of features)norm+=x*x;norm=Math.sqrt(norm);
  if(norm>1e-12)for(let k=0;k<features.length;k++)features[k]/=norm;
  return {features,activity,trace,edgeVisits:disconnected?0:g.e*STEPS,readoutNorm:norm};
 }
}
export async function sha256(buffer){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function loadGraph(base,{cancelled,signal,onProgress}={}){
 const response=await fetch(new URL('manifest.json',base),{signal,cache:'no-cache'});
 if(!response.ok)throw Error('Full CNS files are not installed. Run npm run setup, then reload. No simulated results will be substituted.');
 const meta=await response.json();
 if(meta.schema!==1||meta.neurons!==GRAPH_N||meta.connections!==GRAPH_E||!Array.isArray(meta.parts)||!meta.parts.length||meta.parts.length>32)throw Error('Unsupported or incomplete MaleCNS manifest.');
 const expected=16+(GRAPH_N+1)*4+GRAPH_E*8+GRAPH_N*4;
 if(meta.bytes!==expected)throw Error('Manifest graph size does not match the complete CNS.');
 let buffer;try{buffer=new ArrayBuffer(expected);}catch{throw Error('This browser could not allocate the complete CNS. Try a desktop browser; no smaller graph will be used.');}
 const bytes=new Uint8Array(buffer);let offset=0;
 for(const part of meta.parts){
  checkCancel(cancelled);
  if(!/^part-\d{3}\.bin$/.test(part.file)||!Number.isInteger(part.bytes)||part.bytes<1||part.bytes>16*1024*1024||offset+part.bytes>expected||!/^[a-f0-9]{64}$/.test(part.sha256))throw Error('Unsafe or invalid graph part.');
  const res=await fetch(new URL(part.file,base),{signal});if(!res.ok)throw Error(`Could not load ${part.file}.`);
  const chunk=await res.arrayBuffer();if(chunk.byteLength!==part.bytes||await sha256(chunk)!==part.sha256)throw Error(`Checksum mismatch: ${part.file}.`);
  bytes.set(new Uint8Array(chunk),offset);offset+=chunk.byteLength;onProgress?.({done:offset,total:expected});
 }
 checkCancel(cancelled);
 if(offset!==expected||await sha256(buffer)!==meta.sha256)throw Error('Whole-graph checksum mismatch.');
 return parseGraph(buffer,meta);
}
