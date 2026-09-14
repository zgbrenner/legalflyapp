/** Integration evidence must use actual complete biological data, never a fixture. */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseGraph,Brain,ENGINE} from '../site/lib/graph.mjs';
import {encode,corpus} from '../site/lib/cases.mjs';
import {teach,benchmark} from '../site/lib/experiment.mjs';
import {predict,exportModel,importModel,correct} from '../site/lib/learner.mjs';
const dir=new URL('../site/data/',import.meta.url),m=JSON.parse(await readFile(new URL('manifest.json',dir),'utf8'));
const parts=[];for(const p of m.parts){const b=await readFile(new URL(p.file,dir));assert.equal(createHash('sha256').update(b).digest('hex'),p.sha256);parts.push(b);}
const buffer=Buffer.concat(parts);assert.equal(createHash('sha256').update(buffer).digest('hex'),m.sha256);
const graph=parseGraph(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),m),brain=new Brain(graph);
const start=performance.now();let stopped=false,steps=0;
await assert.rejects(()=>brain.run(encode(corpus('test')[0].facts),{cancelled:()=>stopped,onStep:()=>{steps++;if(steps===3)stopped=true;}}),/cancel/i);
assert.equal(steps,3);
const sample=await brain.run(encode(corpus('test')[0].facts));assert.equal(sample.edgeVisits,25582938*12);assert.ok(sample.readoutNorm>0,'No sensory signal reached the non-input readout.');
const repeated=await brain.run(encode(corpus('test')[0].facts));assert.deepEqual(sample.features,repeated.features);
const zero=await brain.run(encode(corpus('test')[0].facts),{disconnected:true});assert.ok(zero.features.every(x=>x===0));
const training=await teach(brain,{onProgress:p=>{if(p.done%16===0)console.log(`Teaching ${p.done}/${p.total}`);}});
const before=predict(training.model,sample.features),saved=exportModel(training.model),restored=importModel(saved,m.sha256);
assert.deepEqual(before,predict(restored,sample.features));assert.throws(()=>importModel(saved,'0'.repeat(64)),/graph/);
const revised=correct(restored,sample.features,(before.choice+1)%8);assert.equal(revised.corrections,1);assert.notDeepEqual(revised.weights,restored.weights);
const bench=await benchmark(brain,{onProgress:p=>{if(p.done%16===0)console.log(`Benchmark ${p.done}/${p.total}`);}});
const report={verifiedAt:new Date().toISOString(),engine:ENGINE,node:process.version,graphSha256:m.sha256,sourceChecksums:m.sourceChecksums,neurons:graph.n,connections:graph.e,edgeVisitsPerCase:sample.edgeVisits,source:'Checksum-pinned fly.ai brain-v1 compiled MaleCNS artifact; not a direct raw-source audit.',checks:{checksum:true,completeGraph:true,repeatability:true,cancellation:true,modelRoundtrip:true,foreignModelRejection:true,feedbackChangesReadout:true,disconnectedNoBypass:true},neuralProbe:{nonInputNorm:sample.readoutNorm,final:sample.trace.at(-1)},benchmark:bench,totalMs:performance.now()-start};
await mkdir(new URL('../results/',import.meta.url),{recursive:true});await writeFile(new URL('../results/full-verification.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log('FULL_MALECNS_VERIFICATION '+JSON.stringify(report));
