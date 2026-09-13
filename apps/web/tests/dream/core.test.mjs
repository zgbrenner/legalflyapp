import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseGraph, Reservoir, encode, train, DreamSession, validateModel, decode, validateCards } from '../../public/dream/core.mjs';
const manifest = JSON.parse(readFileSync(new URL('../../public/dream/manifest.json', import.meta.url)));
const bytes = readFileSync(new URL('../../public/dream/biological.bin', import.meta.url));
const graph = parseGraph(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), manifest.graphs.biological);
const cards = [
 {id:'promise',title:'A promise',area:'Contracts',text:'A buyer promises to pay for a repaired clock. The seller repairs the clock and asks for payment.',concepts:['promise','reliance'],source:'Fictional teaching card'},
 {id:'notice',title:'The loose stair',area:'Torts',text:'A tenant warns an owner about a broken stair. The owner leaves the stair unrepaired and a visitor falls.',concepts:['notice','injury'],source:'Fictional teaching card'},
 {id:'consent',title:'The borrowed key',area:'Privacy',text:'A guest lends a key to a friend for watering plants. The friend opens a locked cabinet and copies personal letters.',concepts:['consent','scope'],source:'Fictional teaching card'},
];
let model;
test('uses all packaged biological neurons and connections',()=>{
 assert.equal(graph.n,3072);assert.equal(graph.weights.length,293766);assert.equal(graph.info.control,'biological');
});
test('source-to-destination propagation is not reversed',()=>{
 const g={n:3,indptr:new Uint32Array([0,1,1,1]),indices:new Uint32Array([1]),weights:new Float32Array([1]),info:{}};
 const r=new Reservoir(g,42);r.x[0]=.5;r.step(new Float32Array(64));
 assert.ok(r.x[1]>0);assert.equal(r.x[2],0);assert.ok(r.x[0]<.5);
});
test('zero state and no drive remain exactly zero',()=>{
 const r=new Reservoir(graph,42);for(let i=0;i<12;i++)r.step(new Float32Array(64));assert.ok(r.x.every(v=>v===0));
});
test('decoder abstains at silence even with an excellent cosine match',()=>{
 const a={atlas:[Array(192).fill(.1)],cards:[cards[0]]};
 assert.equal(decode(new Float32Array(192).fill(.1),a,0).status,'quiet');
});
test('decoder does not call an unfamiliar state a novel legal idea',()=>{
 const a={atlas:[Array(192).fill(.1)],cards:[cards[0]]};
 assert.equal(decode(new Float32Array(192).fill(-.1),a,.1).status,'unmapped');
});
test('training learns a numerical readout rather than a label playlist',async()=>{
 model=await train(graph,cards,{seed:42});assert.ok(model.readout.some(v=>Math.abs(v)>1e-6));
 assert.ok(model.metrics.reconstructionMSE<model.metrics.zeroReadoutMSE);
 assert.equal(model.atlas.length,cards.length);
});
test('trained model passes strict validation and exact deterministic replay',()=>{
 validateModel(model,graph.info);const a=new DreamSession(graph,model),b=new DreamSession(graph,model);a.prime(0);b.prime(0);
 for(let i=0;i<32;i++){a.tick('replay',.002);b.tick('replay',.002)}
 assert.deepEqual(a.reservoir.x,b.reservoir.x);
});
test('silence has no external input or feedback, and decays on actual biological wiring',()=>{
 const s=new DreamSession(graph,model);s.prime(0);const before=s.frame().rms;
 for(let i=0;i<320;i++)s.tick('silence',0);
 const f=s.frame();assert.equal(f.externalInputRMS,0);assert.equal(f.feedbackRMS,0);assert.ok(f.rms<before*.02);assert.equal(f.status,'quiet');
});
test('replay drives the brain through learned numbers with zero external text input',()=>{
 const s=new DreamSession(graph,model);s.prime(1);s.tick('replay',0);const f=s.frame();assert.equal(f.externalInputRMS,0);assert.ok(f.feedbackRMS>0);
});
test('model import rejects wrong graph, version, seed, dimensions and nonfinite values',()=>{
 for(const change of [{graphSha256:'other'},{schema:'other'},{seed:-1},{readout:[0]},{readout:model.readout.map((v,i)=>i===0?Infinity:v)}])
 assert.throws(()=>validateModel({...model,...change},graph.info));
});
test('empty, excessive, duplicate or mislabeled corpora are rejected',()=>{
 assert.throws(()=>validateCards([]));assert.throws(()=>validateCards(Array(49).fill(cards[0])));assert.throws(()=>validateCards([cards[0],cards[0]]));
 assert.throws(()=>validateCards([{...cards[0],text:''}]));
});
test('cancellation interrupts learning instead of committing a partial model',async()=>{
 let stop=false;await assert.rejects(()=>train(graph,cards,{seed:42},()=>{stop=true},()=>stop),/cancel/i);
});
test('text encoding is deterministic, normalized and never consumes case titles',()=>{
 const a=encode('clock promise payment');assert.deepEqual(a,encode('clock promise payment'));assert.ok(Math.abs(a.reduce((s,v)=>s+v*v,0)-1)<1e-6);
});
test('malformed or missing imported diagnostics are rejected',()=>{
 for(const metrics of [{},{...model.metrics,thinnedCueHits:99},{...model.metrics,reconstructionMSE:-1},{...model.metrics,thinnedCueTotal:2}]){
  assert.throws(()=>validateModel({...model,metrics},graph.info),/diagnostics/);
 }
});
test('renaming legal annotations cannot change learned dynamics',async()=>{
 const altered=cards.map((c,i)=>({...c,title:`Unrelated title ${i}`,concepts:['different label'],area:'Unrelated',source:'Different source'}));
 const other=await train(graph,altered,{seed:42});
 assert.deepEqual(other.readout,model.readout);assert.deepEqual(other.atlas,model.atlas);
});
test('rewired control preserves all degrees, unique edges and weight multiset',()=>{
 const data=readFileSync(new URL('../../public/dream/random_degree_preserving.bin',import.meta.url));
 const other=parseGraph(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),manifest.graphs.random_degree_preserving);
 assert.deepEqual(other.indptr,graph.indptr);
 const degree=g=>{const v=new Uint32Array(g.n);for(const d of g.indices)v[d]++;return v;};
 assert.deepEqual(degree(other),degree(graph));
 assert.deepEqual([...other.weights].sort((a,b)=>a-b),[...graph.weights].sort((a,b)=>a-b));
 for(let i=0;i<other.n;i++)assert.equal(new Set(other.indices.slice(other.indptr[i],other.indptr[i+1])).size,other.indptr[i+1]-other.indptr[i]);
 assert.notDeepEqual(other.indices,graph.indices);
});
test('readout nodes do not directly receive text stimulation',()=>{
 const r=new Reservoir(graph,42);const input=new Set(r.inputIds);
 assert.equal(r.featureIds.filter(i=>input.has(i)).length,0);
});
