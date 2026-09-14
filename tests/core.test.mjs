import test from 'node:test';
import assert from 'node:assert/strict';
import {encode, validateFacts, customs, corpus, FIELDS, ACTIONS} from '../site/lib/cases.mjs';
import {parseGraph, Brain, GRAPH_N, GRAPH_E} from '../site/lib/graph.mjs';
import {fit, predict, exportModel, importModel} from '../site/lib/learner.mjs';

function fixture(){
 const n=12, e=12, size=16+(n+1)*4+e*8+n*4;
 const b=new ArrayBuffer(size), v=new DataView(b);
 new Uint8Array(b,0,8).set(new TextEncoder().encode('VLAW0100'));
 v.setUint32(8,n,true);v.setUint32(12,e,true);
 const p=new Uint32Array(b,16,n+1);for(let i=0;i<=n;i++)p[i]=i;
 const ix=new Uint32Array(b,16+4*(n+1),e);for(let i=0;i<n;i++)ix[i]=(i+n-1)%n;
 new Float32Array(b,16+4*(n+1)+4*e,e).fill(.8);
 const ids=new Uint32Array(b,size-4*n,n);for(let i=0;i<n;i++)ids[i]=100+i;
 return {b, meta:{schema:1,neurons:n,connections:e,sha256:'a'.repeat(64),sensory:[0,1,2],readout:[6,7,8,9,10,11]}};
}
const f=()=>corpus('train')[0].facts;
test('fixture can never be mistaken for full MaleCNS',()=>{const x=fixture();assert.throws(()=>parseGraph(x.b,x.meta),/complete MaleCNS/);assert.equal(GRAPH_N,166700);assert.equal(GRAPH_E,25582938);});
test('bad CSR fails even in explicit mechanical-test mode',()=>{const x=fixture();new Uint32Array(x.b,16,13)[12]=500;assert.throws(()=>parseGraph(x.b,x.meta,{testOnly:true}),/CSR/);});
test('unknown facts and values are rejected',()=>{assert.throws(()=>validateFacts({...f(),claim:'not-a-claim'}));assert.throws(()=>validateFacts({...f(),sneaky:'return'}));});
test('encoder uses facts only, never case title, prose or answer',()=>{const a=encode(f());assert.ok(a.every(Number.isFinite));assert.deepEqual(a,encode({...f()}));assert.throws(()=>encode({...f(),answer:7}));});
test('train and holdout contain no identical fact sheets',()=>{const a=new Set(corpus('train').map(x=>JSON.stringify(x.facts)));for(const c of corpus('test'))assert.ok(!a.has(JSON.stringify(c.facts)));assert.equal(new Set(corpus('train').map(x=>x.answer)).size,ACTIONS.length);});
test('fictional customs have stable precedence',()=>{const facts={...f(),danger:'grave'};assert.equal(ACTIONS[customs(facts)].id,'refer');});
test('simulation is deterministic and uses non-input readouts',async()=>{const x=fixture(),g=parseGraph(x.b,x.meta,{testOnly:true});const a=new Brain(g),b=new Brain(g);const r=await a.run(encode(f()));const s=await b.run(encode(f()));assert.deepEqual(r.features,s.features);assert.ok(r.activity.some(x=>x!==0));assert.equal(r.edgeVisits,g.e*12);});
test('disconnected control does not pass input into readout',async()=>{const x=fixture(),g=parseGraph(x.b,x.meta,{testOnly:true});const r=await new Brain(g).run(encode(f()),{disconnected:true});assert.ok(r.features.every(x=>x===0));});
test('running simulation can be cancelled',async()=>{const x=fixture(),g=parseGraph(x.b,x.meta,{testOnly:true});await assert.rejects(()=>new Brain(g).run(encode(f()),{cancelled:()=>true}),/cancel/i);});
test('readout learns, exports and reimports exactly',()=>{const xs=[],ys=[];for(let c=0;c<8;c++){let row=new Float32Array(8);row[c]=1;xs.push(row);ys.push(c);}const model=fit(xs,ys,'a'.repeat(64));for(let c=0;c<8;c++)assert.equal(predict(model,xs[c]).choice,c);const restored=importModel(exportModel(model),'a'.repeat(64),8);assert.deepEqual(predict(restored,xs[3]),predict(model,xs[3]));});
test('foreign or hostile models fail closed',()=>{const xs=Array.from({length:8},(_,c)=>Float32Array.from({length:8},(_,i)=>Number(c===i))),m=fit(xs,[0,1,2,3,4,5,6,7],'a'.repeat(64));let j=exportModel(m);assert.throws(()=>importModel(j,'b'.repeat(64),8),/graph/i);j.weights[0]=null;assert.throws(()=>importModel(j,'a'.repeat(64),8),/weight/i);});
test('all controls use a small explicit action space',()=>{assert.equal(ACTIONS.length,8);assert.ok(Object.keys(FIELDS).length>=7);});
