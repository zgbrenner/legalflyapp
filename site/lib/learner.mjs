import {ACTIONS,FEATURE_SCHEMA} from './cases.mjs';
import {ENGINE} from './graph.mjs';
const CLASSES=8;
function normalized(m,x){if(x.length!==m.dim)throw Error('Readout dimensions do not match.');return Float64Array.from(x,(v,i)=>Math.max(-12,Math.min(12,(v-m.mean[i])/m.scale[i])));}
function probabilities(m,z){const p=new Float64Array(CLASSES);let max=-Infinity;for(let c=0;c<CLASSES;c++){let s=m.weights[c*(m.dim+1)+m.dim];for(let i=0;i<m.dim;i++)s+=m.weights[c*(m.dim+1)+i]*z[i];p[c]=s;max=Math.max(max,s);}let sum=0;for(let c=0;c<CLASSES;c++){p[c]=Math.exp(p[c]-max);sum+=p[c];}for(let c=0;c<CLASSES;c++)p[c]/=sum;return p;}
function update(m,z,label,rate){const p=probabilities(m,z);for(let c=0;c<CLASSES;c++){const error=p[c]-Number(c===label);for(let i=0;i<m.dim;i++){const j=c*(m.dim+1)+i;m.weights[j]-=rate*(error*z[i]+.001*m.weights[j]);}m.weights[c*(m.dim+1)+m.dim]-=rate*error;}}
export function fit(xs,ys,graph){
 if(!xs.length||xs.length!==ys.length||xs.length>1024)throw Error('Invalid teaching set.');
 const dim=xs[0].length;if(!dim||dim>256||xs.some(x=>x.length!==dim||[...x].some(v=>!Number.isFinite(v)))||ys.some(y=>!Number.isInteger(y)||y<0||y>=CLASSES))throw Error('Invalid teaching vectors.');
 if(new Set(ys).size!==CLASSES)throw Error('The apprenticeship must include all eight kinds of advice.');
 const m={schema:1,engine:ENGINE,featureSchema:FEATURE_SCHEMA,graph,dim,mean:new Float64Array(dim),scale:new Float64Array(dim),weights:new Float64Array(CLASSES*(dim+1)),examples:xs.length,corrections:0};
 for(const x of xs)for(let i=0;i<dim;i++)m.mean[i]+=x[i]/xs.length;
 for(const x of xs)for(let i=0;i<dim;i++)m.scale[i]+=(x[i]-m.mean[i])**2/xs.length;
 for(let i=0;i<dim;i++)m.scale[i]=Math.max(1e-4,Math.sqrt(m.scale[i]));
 const zs=xs.map(x=>normalized(m,x));
 for(let epoch=0;epoch<160;epoch++)for(let j=0;j<xs.length;j++){const k=(j+epoch)%xs.length;update(m,zs[k],ys[k],.025/(1+epoch/80));}
 return m;
}
export function correct(m,x,label){if(!Number.isInteger(label)||label<0||label>=CLASSES)throw Error('Invalid advice.');const next=importModel(exportModel(m),m.graph,m.dim),z=normalized(next,x);for(let i=0;i<24;i++)update(next,z,label,.025);next.corrections++;return next;}
export function predict(m,x){const p=probabilities(m,normalized(m,x));const order=[...p.keys()].sort((a,b)=>p[b]-p[a]);return {choice:order[0],scores:Array.from(p),margin:p[order[0]]-p[order[1]],abstained:p[order[0]]-p[order[1]]<.08};}
export function exportModel(m){return {...m,actions:ACTIONS.map(a=>a.id),mean:Array.from(m.mean),scale:Array.from(m.scale),weights:Array.from(m.weights)};}
export function importModel(j,graph,dim=128){
 if(!j||j.schema!==1||j.engine!==ENGINE||j.featureSchema!==FEATURE_SCHEMA)throw Error('Unsupported model version.');
 if(j.graph!==graph)throw Error('Model belongs to a different graph.');
 if(j.dim!==dim||JSON.stringify(j.actions)!==JSON.stringify(ACTIONS.map(a=>a.id)))throw Error('Model feature or action schema does not match.');
 for(const [key,size] of [['mean',dim],['scale',dim],['weights',CLASSES*(dim+1)]]){
  if(!Array.isArray(j[key])||j[key].length!==size||j[key].some(x=>typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>1e4||(key==='scale'&&x<1e-4)))throw Error(`Invalid model ${key}.`);
 }
 if(!Number.isInteger(j.examples)||j.examples<8||j.examples>1024||!Number.isInteger(j.corrections)||j.corrections<0||j.corrections>1e7)throw Error('Invalid model teaching counts.');
 return {schema:1,engine:ENGINE,featureSchema:FEATURE_SCHEMA,graph,dim,mean:Float64Array.from(j.mean),scale:Float64Array.from(j.scale),weights:Float64Array.from(j.weights),examples:j.examples,corrections:j.corrections};
}
