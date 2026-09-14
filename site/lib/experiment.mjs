import {corpus,encode} from './cases.mjs';
import {fit,predict} from './learner.mjs';
import {checkCancel} from './graph.mjs';
export async function teach(brain,{cancelled,onProgress}={}){
 const cards=corpus('train'),xs=[],ys=[];const start=performance.now();
 for(let i=0;i<cards.length;i++){
  checkCancel(cancelled);const r=await brain.run(encode(cards[i].facts),{cancelled});xs.push(r.features);ys.push(cards[i].answer);
  onProgress?.({done:i+1,total:cards.length,activity:r.activity,trace:r.trace.at(-1)});
 }
 checkCancel(cancelled);return {model:fit(xs,ys,brain.g.meta.sha256),xs,ys,ms:performance.now()-start};
}
function score(model,xs,ys){let correct=0,accepted=0,acceptedCorrect=0;const confusion=Array.from({length:8},()=>Array(8).fill(0));for(let i=0;i<xs.length;i++){const p=predict(model,xs[i]);confusion[ys[i]][p.choice]++;correct+=Number(p.choice===ys[i]);if(!p.abstained){accepted++;acceptedCorrect+=Number(p.choice===ys[i]);}}return {correct,total:ys.length,accuracy:correct/ys.length,coverage:accepted/ys.length,acceptedAccuracy:accepted?acceptedCorrect/accepted:null,confusion};}
export async function benchmark(brain,{cancelled,onProgress}={}){
 const start=performance.now(),train=corpus('train'),test=corpus('test');
 const xs=[],xt=[],ys=train.map(c=>c.answer),yt=test.map(c=>c.answer),cards=[...train,...test];
 for(let i=0;i<cards.length;i++){
  checkCancel(cancelled);const r=await brain.run(encode(cards[i].facts),{cancelled});(i<train.length?xs:xt).push(r.features);onProgress?.({done:i+1,total:cards.length,activity:r.activity});
 }
 checkCancel(cancelled);
 const biological=score(fit(xs,ys,brain.g.meta.sha256),xt,yt);
 const inputOnly=score(fit(train.map(c=>encode(c.facts)),ys,'input-only'),test.map(c=>encode(c.facts)),yt);
 // Exact zero-recurrence control: every readout excludes stimulated neurons, so all features are zero.
 const zeroTrain=xs.map(x=>new Float32Array(x.length)),zeroTest=xt.map(x=>new Float32Array(x.length));
 const disconnected=score(fit(zeroTrain,ys,'disconnected'),zeroTest,yt);
 return {schema:1,graph:brain.g.meta.sha256,neurons:brain.g.n,connections:brain.g.e,train:train.length,test:test.length,biological,inputOnly,disconnected,ms:performance.now()-start,notes:['Distinct fact combinations, not independent human-authored legal cases.','All labels come from the disclosed fictional village rules.','Readouts are trained independently. No held-out labels enter the biological encoder.','No rewired-topology control is included; this benchmark cannot establish an advantage of biological wiring.','Scores are measurements, not legal reliability or evidence of consciousness.']};
}
