/** Legal Dreaming v1. Numerical replay on measured wiring, not biological sleep.
 * This module has no network, storage, language model or scripted transition calls.
 */
export const VERSION='legalfly-dream/1';
export const DIM=64, FEATURES=192, WAKE_STEPS=32, MAX_STEPS=2048;
export const DEFAULTS=Object.freeze({leak:.3,inputScale:1.2,ridge:1e-5,feedbackGain:1.015,quietRMS:1e-4,similarity:.8,margin:.035});
export const yieldThread=()=>new Promise(resolve=>setTimeout(resolve,0));
export function rng(seed){let x=seed>>>0;return()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};}
export function rms(a){let s=0;for(const x of a)s+=x*x;return Math.sqrt(s/Math.max(1,a.length));}
const finite=(x,max=1e4)=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=max;
export function parseGraph(buffer,info){
 const v=new DataView(buffer);
 if(buffer.byteLength<16||new TextDecoder().decode(new Uint8Array(buffer,0,8))!=='LFDREAM1')throw Error('Invalid brain file');
 const n=v.getUint32(8,true),nnz=v.getUint32(12,true),end=16+(n+1)*4+nnz*8;
 if(n!==info.n||nnz!==info.nnz||n<1||n>200000||nnz>20000000||buffer.byteLength!==end)throw Error('Brain dimensions do not match its manifest');
 const indptr=new Uint32Array(buffer,16,n+1),indices=new Uint32Array(buffer,16+(n+1)*4,nnz),weights=new Float32Array(buffer,16+(n+1)*4+nnz*4,nnz);
 if(indptr[0]!==0||indptr[n]!==nnz)throw Error('Invalid brain offsets');
 for(let i=0;i<n;i++)if(indptr[i]>indptr[i+1])throw Error('Invalid brain offsets');
 for(let j=0;j<nnz;j++)if(indices[j]>=n||!finite(weights[j]))throw Error('Invalid synaptic connection');
 if(!finite(info.recurrenceScale,10)||info.recurrenceScale<=0)throw Error('Invalid recurrence scale');
 return {n,indptr,indices,weights,info};
}
export function validateCards(value){
 if(!Array.isArray(value)||value.length<2||value.length>48)throw Error('Use between 2 and 48 teaching cards');
 const seen=new Set();let length=0;
 const text=(v,max,name)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error(`Invalid ${name}`);return v.trim();};
 return value.map(c=>{
  if(!c||typeof c!=='object')throw Error('Invalid teaching card');
  const id=text(c.id,80,'card ID');if(seen.has(id))throw Error('Teaching card IDs must be unique');seen.add(id);
  const body=text(c.text,6000,'card text');length+=body.length;if(length>120000)throw Error('Corpus exceeds 120,000 characters');
  if(!Array.isArray(c.concepts)||c.concepts.length>8)throw Error('Use at most eight concept labels per card');
  return {id,title:text(c.title,160,'card title'),area:text(c.area,80,'area'),text:body,concepts:c.concepts.map(x=>text(x,80,'concept')),source:text(c.source,500,'source')};
 });
}
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
export function encode(text){
 const u=new Float32Array(DIM),tokens=text.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
 const add=(s,w)=>{const h=hash(s);u[h%DIM]+=((h>>>8)&1?1:-1)*w;};
 for(const word of tokens){add(word,1);if(word.length>3)for(let j=0;j<word.length-2;j++)add(`#${word.slice(j,j+3)}`,.18);}
 const norm=Math.sqrt(u.reduce((a,b)=>a+b*b,0));if(norm)for(let i=0;i<DIM;i++)u[i]/=norm;return u;
}
export class Reservoir{
 constructor(graph,seed=42){
  this.graph=graph;this.n=graph.n;this.x=new Float32Array(this.n);this.sum=new Float64Array(this.n);this.input=new Float64Array(this.n);
  const random=rng(seed),order=Array.from({length:this.n},(_,i)=>i);
  for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
  const count=Math.min(this.n,Math.max(1,Math.floor(this.n/8)));this.inputIds=order.slice(0,count);
  this.featureIds=order.slice(count,count+FEATURES);while(this.featureIds.length<FEATURES)this.featureIds.push(order[this.featureIds.length%this.n]);
  this.projection=new Float32Array(count*DIM);
  for(let k=0;k<count;k++){
   let norm=0;for(let j=0;j<DIM;j++){const v=random()*2-1;this.projection[k*DIM+j]=v;norm+=v*v;}
   for(let j=0;j<DIM;j++)this.projection[k*DIM+j]*=DEFAULTS.inputScale/Math.sqrt(norm);
  }
 }
 reset(){this.x.fill(0);}
 features(){return Float32Array.from(this.featureIds,i=>this.x[i]);}
 step(u,noise=0,random=()=>.5){
  if(u.length!==DIM)throw Error('Invalid input dimension');
  const {indptr,indices,weights}=this.graph;this.sum.fill(0);this.input.fill(0);
  // CSR rows are presynaptic sources. Scatter forward, never backwards.
  for(let src=0;src<this.n;src++){const x=this.x[src];for(let j=indptr[src];j<indptr[src+1];j++)this.sum[indices[j]]+=weights[j]*x;}
  for(let k=0;k<this.inputIds.length;k++){let z=0;for(let j=0;j<DIM;j++)z+=this.projection[k*DIM+j]*u[j];this.input[this.inputIds[k]]=z;}
  const scale=this.graph.info.recurrenceScale??1;
  for(let i=0;i<this.n;i++)this.x[i]=.7*this.x[i]+.3*Math.tanh(this.sum[i]*scale+this.input[i]+(noise?(random()*2-1)*noise:0));
 }
}
function dot(a,b){let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s;}
function cosine(a,b){return dot(a,b)/(Math.sqrt(dot(a,a)*dot(b,b))+1e-12);}
export function decode(features,model,energy){
 if(energy<DEFAULTS.quietRMS)return {status:'quiet',matches:[],match:null};
 const matches=model.atlas.map((a,i)=>({index:i,id:model.cards[i].id,similarity:cosine(features,a)})).sort((a,b)=>b.similarity-a.similarity).slice(0,3);
 const first=matches[0],margin=first?first.similarity-(matches[1]?.similarity??-1):0;
 const identified=first&&first.similarity>=DEFAULTS.similarity&&margin>=DEFAULTS.margin;
 return {status:identified?'matched':'unmapped',matches,match:identified?first.index:null};
}
function predict(readout,features){
 const u=new Float32Array(DIM);for(let j=0;j<DIM;j++){let s=0;for(let k=0;k<FEATURES;k++)s+=readout[j*FEATURES+k]*features[k];u[j]=s;}return u;
}
/** Cholesky solve of ridge normal equations; only the artificial feedback map learns. */
function fit(xs,ys){
 const n=FEATURES,A=new Float64Array(n*n),B=new Float64Array(DIM*n);
 for(let k=0;k<xs.length;k++){
  const x=xs[k],y=ys[k];for(let i=0;i<n;i++){for(let j=0;j<=i;j++)A[i*n+j]+=x[i]*x[j];for(let d=0;d<DIM;d++)B[d*n+i]+=y[d]*x[i];}
 }
 for(let i=0;i<n;i++)A[i*n+i]+=DEFAULTS.ridge;
 const L=new Float64Array(n*n);
 for(let i=0;i<n;i++)for(let j=0;j<=i;j++){
  let s=A[i*n+j];for(let k=0;k<j;k++)s-=L[i*n+k]*L[j*n+k];
  if(i===j){if(s<=0||!Number.isFinite(s))throw Error('Feedback fit is numerically unstable');L[i*n+j]=Math.sqrt(s);}
  else L[i*n+j]=s/L[j*n+j];
 }
 const out=new Float32Array(DIM*n);
 for(let d=0;d<DIM;d++){
  const y=new Float64Array(n);for(let i=0;i<n;i++){let s=B[d*n+i];for(let j=0;j<i;j++)s-=L[i*n+j]*y[j];y[i]=s/L[i*n+i];}
  for(let i=n-1;i>=0;i--){let s=y[i];for(let j=i+1;j<n;j++)s-=L[j*n+i]*out[d*n+j];out[d*n+i]=s/L[i*n+i];}
 }return out;
}
export async function train(graph,rawCards,options={},progress=()=>{},cancelled=()=>false){
 const cards=validateCards(rawCards),seed=options.seed??42;
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error('Seed must be an unsigned 32-bit integer');
 const r=new Reservoir(graph,seed),xs=[],ys=[],atlas=[];
 for(let i=0;i<cards.length;i++){
  if(cancelled())throw Error('Training cancelled');
  const u=encode(cards[i].text);r.reset();
  for(let t=0;t<WAKE_STEPS;t++){r.step(u);if(t===19||t===25||t===31){xs.push(r.features());ys.push(u);}}
  atlas.push(Array.from(r.features()));progress({phase:'reading',current:i+1,total:cards.length,title:cards[i].title});await yieldThread();
 }
 if(cancelled())throw Error('Training cancelled');const readout=fit(xs,ys);let error=0,zero=0;
 for(let i=0;i<xs.length;i++){const p=predict(readout,xs[i]);for(let j=0;j<DIM;j++){error+=(p[j]-ys[i][j])**2;zero+=ys[i][j]**2;}}
 const model={schema:VERSION,graphSha256:graph.info.sha256,graphHash:graph.info.graphHash,control:graph.info.control,seed,cards,atlas,readout:Array.from(readout),metrics:{reconstructionMSE:error/(xs.length*DIM),zeroReadoutMSE:zero/(xs.length*DIM),trainingStates:xs.length}};
 // Diagnostic only: recognize a taught card after removing every fourth word. Not unseen cases.
 let hits=0;
 for(let i=0;i<cards.length;i++){
  if(cancelled())throw Error('Training cancelled');r.reset();const u=encode(cards[i].text.split(/\s+/).filter((_,k)=>k%4!==2).join(' '));
  for(let j=0;j<WAKE_STEPS;j++)r.step(u);
  const d=decode(r.features(),model,rms(r.x));if(d.match===i)hits++;await yieldThread();
 }
 model.metrics.thinnedCueHits=hits;model.metrics.thinnedCueTotal=cards.length;return model;
}
export function validateModel(value,info){
 if(!value||value.schema!==VERSION||value.graphSha256!==info.sha256||value.graphHash!==info.graphHash||value.control!==info.control)throw Error('Model version or brain fingerprint does not match');
 if(!Number.isInteger(value.seed)||value.seed<0||value.seed>0xffffffff)throw Error('Invalid model seed');
 const cards=validateCards(value.cards),array=(a,length,max)=>Array.isArray(a)&&a.length===length&&a.every(v=>finite(v,max));
 if(!array(value.readout,DIM*FEATURES,1e4))throw Error('Invalid learned feedback weights');
 if(!Array.isArray(value.atlas)||value.atlas.length!==cards.length||!value.atlas.every(a=>array(a,FEATURES,1)))throw Error('Invalid concept atlas');
 const metrics=value.metrics;
 if(!metrics||!['reconstructionMSE','zeroReadoutMSE','trainingStates','thinnedCueHits','thinnedCueTotal'].every(k=>finite(metrics[k],1e8)&&metrics[k]>=0)||metrics.trainingStates!==cards.length*3||metrics.thinnedCueTotal!==cards.length||!Number.isInteger(metrics.thinnedCueHits)||metrics.thinnedCueHits>cards.length)throw Error('Invalid model diagnostics');
 return {schema:VERSION,graphSha256:info.sha256,graphHash:info.graphHash,control:info.control,seed:value.seed,cards,atlas:value.atlas,readout:value.readout,metrics};
}
export class DreamSession{
 constructor(graph,model){this.model=validateModel(model,graph.info);this.reservoir=new Reservoir(graph,model.seed);this.random=rng(model.seed^0x5eeda11);this.steps=0;this.feedbackRMS=0;this.noise=0;this.delta=0;this.mode='replay';}
 prime(index){
  if(!Number.isInteger(index)||index<0||index>=this.model.cards.length)throw Error('Choose a valid teaching card');
  this.reservoir.reset();const u=encode(this.model.cards[index].text);
  for(let i=0;i<WAKE_STEPS;i++)this.reservoir.step(u);
  this.steps=0;this.cue=index;this.random=rng(this.model.seed^0x5eeda11);this.feedbackRMS=0;
 }
 tick(mode='replay',noise=0){
  if(mode!=='replay'&&mode!=='silence')throw Error('Unknown replay mode');
  if(!finite(noise,.02)||noise<0)throw Error('Noise must be between 0 and 0.02');
  this.mode=mode;this.noise=noise;let u=new Float32Array(DIM);
  if(mode==='replay'){
   u=predict(this.model.readout,this.reservoir.features());const norm=Math.sqrt(dot(u,u));const gain=DEFAULTS.feedbackGain*Math.min(1,1.2/(norm||1));for(let i=0;i<DIM;i++)u[i]*=gain;
  }
  this.feedbackRMS=rms(u);const before=this.reservoir.x.slice();this.reservoir.step(u,noise,this.random);
  let d=0;for(let i=0;i<before.length;i++)d+=(before[i]-this.reservoir.x[i])**2;this.delta=Math.sqrt(d/before.length);this.steps++;
 }
 frame(){const energy=rms(this.reservoir.x);return {step:this.steps,rms:energy,delta:this.delta,externalInputRMS:0,feedbackRMS:this.feedbackRMS,noise:this.noise,mode:this.mode,...decode(this.reservoir.features(),this.model,energy)};}
}
export function displayGraph(graph){
 const stride=Math.max(1,Math.floor(graph.n/320)),indices=[];for(let i=0;i<graph.n;i+=stride)indices.push(i);
 const local=new Map(indices.map((id,i)=>[id,i])),edges=[],ins=new Uint32Array(graph.n);
 for(const d of graph.indices)ins[d]++;
 for(const src of indices)for(let j=graph.indptr[src];j<graph.indptr[src+1];j++){const dst=graph.indices[j];if(local.has(dst))edges.push([local.get(src),local.get(dst),graph.weights[j]]);}
 return {indices,node_ids:indices.map(i=>graph.info.nodeIds[i]),regions:indices.map(i=>graph.info.regions[i]),in_degrees:indices.map(i=>ins[i]),out_degrees:indices.map(i=>graph.indptr[i+1]-graph.indptr[i]),edges:edges.slice(0,1600),total_neurons:graph.n,total_edges:graph.weights.length,graph_hash:graph.info.graphHash,anatomical:graph.info.control==='biological'};
}
