/** A complete-topology rate reservoir, not a biophysical brain emulator. */
export const ENGINE='malecns-village-rate-1';
export const STEPS=24;
export const SEED=42;
const tick=()=>new Promise(r=>setTimeout(r,0));
const finiteArray=(a,n)=>Array.isArray(a)&&a.length===n&&a.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<1e12);
export class Graph {
  constructor({n,ptr,targets,weights,fingerprint,inputs,outputs,sample=[]}) {
    if(!Number.isInteger(n)||n<1||n>500000||!(ptr instanceof Uint32Array)||ptr.length!==n+1||!(targets instanceof Uint32Array)||!(weights instanceof Float32Array)||targets.length!==weights.length||ptr[0]!==0||ptr[n]!==targets.length) throw Error('Invalid graph dimensions.');
    for(let i=0;i<n;i++) if(ptr[i]>ptr[i+1]) throw Error('Invalid CSR offsets.');
    for(let j=0;j<targets.length;j++) if(targets[j]>=n||!Number.isFinite(weights[j])) throw Error('Invalid graph edge.');
    for(const a of [inputs,outputs,sample]) if(!Array.isArray(a)||a.some(i=>!Number.isInteger(i)||i<0||i>=n)||new Set(a).size!==a.length) throw Error('Invalid electrode index.');
    if(!inputs.length||!outputs.length||outputs.some(i=>inputs.includes(i))) throw Error('Input and readout electrodes must be nonempty and disjoint.');
    Object.assign(this,{n,ptr,targets,weights,fingerprint,inputs,outputs,sample});
  }
}
export async function simulate(g,input,{steps=STEPS,cancel=()=>false,onFrame=()=>{},severed=false}={}) {
  if(!input?.length||Array.from(input).some(v=>!Number.isFinite(v))) throw Error('Invalid stimulus.');
  if(!Number.isInteger(steps)||steps<3||steps>64) throw Error('Invalid simulation duration.');
  let state=new Float32Array(g.n), next=new Float32Array(g.n), drive=new Float32Array(g.n);
  // Biological sensory cells, with invented feature/electrode assignments.
  for(let k=0;k<g.inputs.length;k++) drive[g.inputs[k]]=(input[k%input.length]-.15)*1.3;
  // A zero stimulus is genuine silence, not the offset baseline.
  if(Array.from(input).every(v=>v===0)) drive.fill(0);
  const snapshots=[], trace=[], boundaries=new Set([Math.floor(steps/3),Math.floor(2*steps/3),steps]);
  const {ptr,targets,weights,n}=g;
  for(let t=1;t<=steps;t++) {
    if(cancel()) throw Error('Cancelled.');
    next.fill(0);
    if(!severed) for(let i=0;i<n;i++) {
      const v=state[i];
      if(v===0) continue; // Exact zero skip, not an active-subgraph approximation.
      for(let j=ptr[i],end=ptr[i+1];j<end;j++) next[targets[j]]+=v*weights[j];
    }
    let square=0, active=0;
    for(let i=0;i<n;i++) {
      next[i]=.55*state[i]+.45*Math.tanh(.92*next[i]+drive[i]);
      square+=next[i]*next[i]; if(Math.abs(next[i])>1e-8) active++;
    }
    [state,next]=[next,state];
    const frame={step:t,rms:Math.sqrt(square/n),active,values:g.sample.map(i=>state[i])};
    trace.push({step:t,rms:frame.rms,active});
    if(boundaries.has(t)) snapshots.push(...g.outputs.map(i=>state[i]));
    onFrame(frame);
    if(t%2===0) await tick();
  }
  return {features:snapshots,state,trace};
}
function cholesky(A) {
  const n=A.length,L=Array.from({length:n},()=>new Float64Array(n));
  for(let i=0;i<n;i++) for(let j=0;j<=i;j++) {
    let s=A[i][j];for(let k=0;k<j;k++) s-=L[i][k]*L[j][k];
    if(i===j) {if(!(s>0)) throw Error('Readout fit is singular.');L[i][j]=Math.sqrt(s);}
    else L[i][j]=s/L[j][j];
  }
  return L;
}
function solve(L,b) {
  const n=L.length,y=new Float64Array(n),x=new Float64Array(n);
  for(let i=0;i<n;i++){let s=b[i];for(let j=0;j<i;j++)s-=L[i][j]*y[j];y[i]=s/L[i][i];}
  for(let i=n-1;i>=0;i--){let s=y[i];for(let j=i+1;j<n;j++)s-=L[j][i]*x[j];x[i]=s/L[i][i];}
  return x;
}
export function trainReadout(xs,ys,{fingerprint,seed=SEED,classes=8}={}) {
  const n=xs.length,d=xs[0]?.length;
  if(!n||n>128||!d||d>2048||ys.length!==n||xs.some(x=>!finiteArray(x,d))||ys.some(y=>!Number.isInteger(y)||y<0||y>=classes)) throw Error('Invalid teaching set.');
  const mean=Array(d).fill(0),scale=Array(d).fill(0);
  for(const x of xs)for(let j=0;j<d;j++)mean[j]+=x[j]/n;
  for(const x of xs)for(let j=0;j<d;j++)scale[j]+=(x[j]-mean[j])**2/n;
  for(let j=0;j<d;j++)scale[j]=Math.max(1e-9,Math.sqrt(scale[j]));
  const Z=xs.map(x=>[...x.map((v,j)=>(v-mean[j])/scale[j]/Math.sqrt(d)),1]);
  const gram=Array.from({length:n},(_,i)=>Float64Array.from({length:n},(_,j)=>Z[i].reduce((s,v,k)=>s+v*Z[j][k],0)+(i===j?.12:0)));
  const L=cholesky(gram),weights=[];
  for(let c=0;c<classes;c++) {
    const alpha=solve(L,ys.map(y=>+(y===c)));
    weights.push(Array.from({length:d+1},(_,j)=>Z.reduce((s,z,i)=>s+alpha[i]*z[j],0)));
  }
  return {engine:ENGINE,fingerprint,seed,steps:STEPS,classes,featureSize:d,mean,scale,weights,samples:xs.map(x=>[...x]),labels:[...ys],lessons:n};
}
export function validateModel(m,{fingerprint,seed=SEED,featureSize,classes=8}) {
  if(!m||m.engine!==ENGINE||m.fingerprint!==fingerprint||m.seed!==seed||m.steps!==STEPS||m.featureSize!==featureSize||m.classes!==classes) throw Error('This model belongs to a different graph, encoder or engine.');
  if(!finiteArray(m.mean,featureSize)||!finiteArray(m.scale,featureSize)||m.scale.some(v=>v<=0)||!Array.isArray(m.weights)||m.weights.length!==classes||m.weights.some(w=>!finiteArray(w,featureSize+1))) throw Error('Malformed model weights.');
  if(!Array.isArray(m.samples)||m.samples.length<1||m.samples.length>128||m.samples.some(x=>!finiteArray(x,featureSize))||!Array.isArray(m.labels)||m.labels.length!==m.samples.length||m.labels.some(y=>!Number.isInteger(y)||y<0||y>=classes)||m.lessons!==m.samples.length) throw Error('Malformed model lessons.');
  return m;
}
export function predict(m,x) {
  if(!finiteArray(x,m.featureSize)) throw Error('Invalid neural readout.');
  const z=[...x.map((v,j)=>(v-m.mean[j])/m.scale[j]/Math.sqrt(x.length)),1];
  const scores=m.weights.map(w=>w.reduce((s,v,j)=>s+v*z[j],0));
  if(scores.some(v=>!Number.isFinite(v))) throw Error('Nonfinite decision scores.');
  const ranked=scores.map((score,action)=>({score,action})).sort((a,b)=>b.score-a.score);
  return {action:ranked[0].action,margin:ranked[0].score-ranked[1].score,scores};
}
export function teach(m,x,y) {
  if(!Number.isInteger(y)||y<0||y>=m.classes) throw Error('Choose an advice to teach.');
  const xs=m.samples.map(a=>[...a]),ys=[...m.labels];
  const idx=xs.findIndex(a=>a.every((v,j)=>Math.abs(v-x[j])<1e-12));
  if(idx>=0)ys[idx]=y;else{if(xs.length>=128){xs.splice(48,1);ys.splice(48,1);}xs.push([...x]);ys.push(y);}
  return trainReadout(xs,ys,{fingerprint:m.fingerprint,seed:m.seed,classes:m.classes});
}
export function validateManifest(m) {
  if(!m||m.dataset!=='male-cns:v1.0'||m.engine!==ENGINE||m.n!==166700||!Number.isInteger(m.edges)||m.edges<1000000||m.edges>100000000||typeof m.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(m.fingerprint)||m.coverage?.selection!=='all-nonnull-superclass')throw Error('This is not the complete supported MaleCNS release.');
  if(!Array.isArray(m.inputs)||!Array.isArray(m.outputs)||!m.inputs.length||!m.outputs.length||!Array.isArray(m.sample))throw Error('Missing graph electrodes or source positions.');
  for(const a of [m.inputs,m.outputs,m.sample.map(p=>p?.index)])if(a.some(i=>!Number.isInteger(i)||i<0||i>=m.n)||new Set(a).size!==a.length)throw Error('Invalid graph electrodes.');
  const inputSet=new Set(m.inputs);if(m.outputs.some(i=>inputSet.has(i)))throw Error('Sensory and readout electrodes overlap.');
  for(const key of ['ptr','targets','weights']) {
    const a=m.arrays?.[key],expected=key==='ptr'?m.n+1:m.edges;
    if(!a||a.length!==expected||!Array.isArray(a.parts)||!a.parts.length||a.parts.length>200)throw Error('Invalid graph manifest.');
    let offset=0;
    for(const p of a.parts){if(p.offset!==offset||!Number.isInteger(p.length)||p.length<1||!/^[a-z]+-\d+\.bin\.gz$/.test(p.file)||!/^[a-f0-9]{64}$/.test(p.sha256)||!Number.isInteger(p.bytes)||p.bytes<1)throw Error('Invalid graph part.');offset+=p.length;}
    if(offset!==expected)throw Error('Incomplete graph parts.');
  }
  return m;
}
export async function loadGraph(manifest,loadPart,{cancel=()=>false,onProgress=()=>{}}={}) {
  const m=validateManifest(manifest), data={},parts=Object.values(m.arrays).flatMap(a=>a.parts),total=parts.reduce((s,p)=>s+p.bytes,0);let done=0;
  for(const key of ['ptr','targets','weights']) {
    const C=key==='weights'?Float32Array:Uint32Array,def=m.arrays[key];
    data[key]=new C(def.length);
    for(const p of def.parts){if(cancel())throw Error('Cancelled.');const buf=await loadPart(p);if(buf.byteLength!==p.length*4)throw Error('Graph part size mismatch.');data[key].set(new C(buf),p.offset);done+=p.bytes;onProgress({done,total});}
  }
  return new Graph({...data,n:m.n,fingerprint:m.fingerprint,inputs:m.inputs,outputs:m.outputs,sample:m.sample.map(p=>p.index)});
}
