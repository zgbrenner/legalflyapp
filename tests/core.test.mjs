import test from 'node:test';
import assert from 'node:assert/strict';
import {validateFacts, encodeFacts, charter, makeCorpus, CASES, ACTIONS} from '../web/cases.mjs';
import {Graph, simulate, trainReadout, predict, validateModel, ENGINE} from '../web/engine.mjs';
test('all authored petitions have valid facts and a charter disposition', () => {
  for (const c of CASES) { validateFacts(c.facts); assert.ok(ACTIONS[charter(c.facts)]); }
});
test('reject malformed, unknown and nonfinite input', () => {
  assert.throws(() => validateFacts({...CASES[0].facts, loss:NaN}));
  assert.throws(() => validateFacts({...CASES[0].facts, issue:'treaty'}));
  assert.throws(() => validateFacts({...CASES[0].facts, evidence:-1}));
});
test('case prose and gifts cannot secretly supply the decision', () => {
  const a = encodeFacts(CASES[0].facts);
  const b = encodeFacts({...CASES[0].facts, note:'return property now', gift:100});
  assert.deepEqual(a,b);
});
test('training and held-out encodings are disjoint and deterministic', () => {
  const a=makeCorpus(42), b=makeCorpus(42);
  assert.deepEqual(a,b);
  const signatures=new Set(a.train.map(c=>JSON.stringify(encodeFacts(c.facts))));
  for (const c of a.test) assert.ok(!signatures.has(JSON.stringify(encodeFacts(c.facts))));
  assert.equal(new Set(a.train.map(c=>charter(c.facts))).size,8);
});
function fixture() {
  // Explicit synthetic unit-test graph, never a product fallback.
  return new Graph({n:5,ptr:new Uint32Array([0,1,2,3,4,4]),targets:new Uint32Array([1,2,3,4]),weights:new Float32Array([1,1,1,1]),fingerprint:'synthetic-unit-test',inputs:[0],outputs:[3,4]});
}
test('signal traverses every retained connection, including last neuron', async () => {
  const g=fixture(); const r=await simulate(g,new Float32Array([1]),{steps:12});
  assert.ok(r.state[4]>0); assert.equal(r.state.length,5);
  const silent=await simulate(g,new Float32Array([0]),{steps:12});
  assert.equal(silent.state[4],0);
});
test('simulation deterministic and cancellable', async()=>{
  const g=fixture(); const x=new Float32Array([1]);
  const a=await simulate(g,x,{steps:8}); const b=await simulate(g,x,{steps:8});
  assert.deepEqual(a.features,b.features);
  await assert.rejects(simulate(g,x,{steps:8,cancel:()=>true}), /cancel/i);
});
test('corrupt CSR rejected',()=>{
  assert.throws(()=>new Graph({n:2,ptr:new Uint32Array([0,2,1]),targets:new Uint32Array([3]),weights:new Float32Array([1]),inputs:[0],outputs:[1]}));
});
test('artificial readout learns, validates and refuses wrong provenance',()=>{
  const xs=[[1,0],[0,1],[.9,.1],[.1,.9]]; const ys=[0,1,0,1];
  const m=trainReadout(xs,ys,{fingerprint:'test',seed:42,classes:2});
  assert.equal(predict(m,[1,0]).action,0); assert.equal(predict(m,[0,1]).action,1);
  validateModel(m,{fingerprint:'test',seed:42,featureSize:2,classes:2});
  assert.throws(()=>validateModel(m,{fingerprint:'different',seed:42,featureSize:2,classes:2}));
  m.weights[0][0]=Infinity;
  assert.throws(()=>validateModel(m,{fingerprint:'test',seed:42,featureSize:2,classes:2}));
});
test('manifest rejects missing or overlapping sensory/readout electrodes',async()=>{
 const {validateManifest}=await import('../web/engine.mjs');
 const part=(key,len)=>({length:len,parts:[{file:`${key}-000.bin.gz`,offset:0,length:len,bytes:10,sha256:'a'.repeat(64)}]});
 const m={dataset:'male-cns:v1.0',engine:ENGINE,n:166700,edges:1000001,fingerprint:'a'.repeat(64),coverage:{selection:'all-nonnull-superclass'},arrays:{ptr:part('ptr',166701),targets:part('targets',1000001),weights:part('weights',1000001)}};
 assert.throws(()=>validateManifest(m));
 assert.throws(()=>validateManifest({...m,inputs:[0],outputs:[0],sample:[]}));
});
