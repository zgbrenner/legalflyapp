import {CASES,ISSUES,ISSUE_NAMES,ACTIONS,FLAGS,DEFAULT_FACTS,validateFacts,charter,charterReason} from './cases.mjs';
import {createEntry,casebookFile,parseCasebook} from './ledger.mjs';
import {Atlas} from './atlas.mjs';
import {validateManifest} from './engine.mjs';
const $=id=>document.getElementById(id);
let fingerprint=null;
const atlas=new Atlas($('atlas'),$('atlas-caption'));
let ready=false,busy=false,selected=0,current=structuredClone(CASES[0]),result=null,book=[],report=null,seq=0,job=null,loadedManifest=null;
const worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
function status(text,error=false){$('status').textContent=text;$('operation').classList.toggle('error',error);}
function download(name,value){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=node('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
async function readFile(input,max=4*1024*1024){const file=input.files[0];if(!file)return null;if(file.size>max)throw Error('That file is too large. The maximum import size is 4 MB.');return JSON.parse(await file.text());}
function controls(){
  $('load').disabled=busy||ready;$('cancel').hidden=!busy;$('load').hidden=ready;$('facts-fieldset').disabled=busy;$('consult').disabled=busy||!ready;
  for(const id of ['teach','export-model','import-model','reset-model','run-audit'])$(id).disabled=busy||!ready;
  $('record').disabled=busy||!result||book.length>=128||!!result.recorded;
  for(const button of document.querySelectorAll('.hotspot,.queue button'))button.disabled=busy;
  $('new-petition').disabled=busy;$('note-input').disabled=busy;$('import-book').disabled=busy||!fingerprint;$('export-book').disabled=!fingerprint;$('clear-book').disabled=busy;
  if(!busy)$('progress').hidden=true;
}
function call(type,payload={}){
  if(busy)return status('Finish or stop the current operation first.',true);
  busy=true;seq++;job={id:seq,type};controls();$('progress').value=0;$('progress').hidden=false;
  status({load:'Downloading and verifying all graph parts. No smaller network will be substituted.',consult:'The facts are stimulating the nervous system.',teach:'Fitting the artificial readout with your lesson.',audit:'Testing the untouched starter against held-out cases.',import:'Checking the model and graph fingerprint.',reset:'Restoring the verified starter model.',export:'Preparing the model export.'}[type]||'Working.');
  worker.postMessage({id:seq,type,payload});
}
function factsFromForm(){const f={issue:$('issue').value,evidence:Number($('evidence').value),loss:Number($('loss').value)};for(const k of FLAGS)f[k]=$('facts-form').elements[k].checked;return validateFacts(f);}
function discardResult(){result=null;$('advice').hidden=true;atlas.clear();controls();}
function selectPetition(index){
  if(busy)return;selected=index;current=index<0?{id:'custom',name:'A petition of your own',person:'A visitor to the office',fee:'No fee recorded',note:'',facts:{...DEFAULT_FACTS}}:structuredClone(CASES[index]);
  $('person').textContent=current.person;$('fee').textContent=current.fee;$('petition-title').textContent=current.name;$('petition-note').textContent=current.note;$('petition-note').hidden=index<0;$('custom-note').hidden=index>=0;$('note-input').value=current.note;$('petition-number').textContent=index<0?'A new petition':`Petition ${String(index+1).padStart(2,'0')} / 08`;
  $('issue').value=current.facts.issue;$('evidence').value=current.facts.evidence;$('loss').value=current.facts.loss;for(const k of FLAGS)$('facts-form').elements[k].checked=current.facts[k];
  for(const b of document.querySelectorAll('[data-case]'))b.setAttribute('aria-pressed',String(Number(b.dataset.case)===index));
  discardResult();
}
function showAdvice(data){
  result={...data,facts:structuredClone(current.facts),recorded:false};const advice=ACTIONS[data.action];$('advice').hidden=false;$('advice-title').textContent=advice.title;$('advice-text').textContent=advice.text;
  $('advice-time').textContent=`${(data.milliseconds/1000).toFixed(2)} s`;$('advice-detail').textContent=`Readout margin: ${data.margin.toFixed(3)}. This is a score difference, not the probability of a correct answer. Wording is a fixed narrative template.`;
  $('lesson').value=data.action;$('lessons').textContent=`${data.lessons} learned examples`;$('record').textContent='Enter in the casebook';controls();
}
function renderBook(){
  $('book-count').textContent=book.length;const sound=book.filter(e=>charter(e.facts)===e.action).length;$('reputation').textContent=book.length?`${sound} follows the charter · ${book.length-sound} questioned`:'No advice recorded';$('book-entries').replaceChildren();
  if(!book.length){$('book-entries').append(node('p','Not a single grievance committed to paper.','empty'));return;}
  book.forEach((e,i)=>{const article=node('article',undefined,'ledger-entry'),body=node('div'),decision=node('div',undefined,'ledger-decision');article.append(node('span',String(i+1).padStart(2,'0'),'number'));body.append(node('h3',e.title),node('p',e.note||'No prose note supplied.'),node('p',`${e.person} · ${new Date(e.recordedAt).toLocaleDateString()} · ${e.lessons} lessons at decision`,'fine'));
    const expected=charter(e.facts);decision.append(node('strong',ACTIONS[e.action].title),node('p',expected===e.action?'Follows the village charter':'Questioned by the village charter',expected===e.action?'check':'check questioned'),node('p',charterReason(e.facts),'fine'));
    if(expected!==e.action)decision.append(node('p',`Charter advice: ${ACTIONS[expected].title}.`,'fine'));
    const details=node('details'),summary=node('summary','Recorded facts');details.append(summary,node('p',`${ISSUE_NAMES[ISSUES.indexOf(e.facts.issue)]}; evidence ${e.facts.evidence}/2; loss ${e.facts.loss}/2; ${FLAGS.filter(k=>e.facts[k]).join(', ')||'no other circumstances'}.`));body.append(details);article.append(body,decision);$('book-entries').append(article);
  });
}
function renderReport(data){
  if(!data||data.fingerprint!==fingerprint||data.train!==48||data.test!==24||!Array.isArray(data.scores))throw Error('The audit report does not match this graph.');report=data;$('audit-rows').replaceChildren();
  for(const item of data.scores){const row=node('tr');row.append(node('td',item.name),node('td',`${item.correct} / ${data.test}`),node('td',`${(100*item.correct/data.test).toFixed(1)}%`));$('audit-rows').append(row);}
  $('audit-caption').textContent=`Measured ${new Date(data.measuredAt).toLocaleString()}. Seed ${data.seed}. ${data.train} teaching / ${data.test} held-out examples. ${(data.milliseconds/1000).toFixed(1)} seconds for this audit run. Training-set recognition: ${data.trainingCorrect}/48.`;
}
worker.onmessage=({data})=>{
  if(!job||data.id!==job.id)return;
  if(data.type==='progress'){
    const p=data.payload;if(p.total)$('progress').value=p.done/p.total;
    status(job.type==='load'?`${p.phase}: ${(p.done/1e6).toFixed(1)} / ${(p.total/1e6).toFixed(1)} MB verified.`:`${p.phase}: ${p.done} / ${p.total}.`);return;
  }
  if(data.type==='frame'){atlas.setFrame(data.payload);$('progress').value=data.payload.step/24;status(`Hearing the petition: step ${data.payload.step}/24; ${data.payload.active.toLocaleString()} neurons above the display activity threshold.`);return;}
  const type=data.type,p=data.payload;busy=false;job=null;
  try{
    if(type==='loaded'){ready=true;loadedManifest=p.manifest;fingerprint=p.manifest.fingerprint;atlas.setManifest(p.manifest);$('load-heading').textContent='The advocate is at the desk.';$('load-description').textContent=`166,700 neurons · ${p.manifest.edges.toLocaleString()} connections · complete classified MaleCNS v1.0. Computation stays in this browser.`;$('lessons').textContent=`${p.lessons} starter lessons`;status('The complete graph and starter readout are verified. Choose a petition, then ask the advocate.');}
    else if(type==='consulted'){showAdvice(p);status('The advocate has offered advice. Record it, or teach a different answer.');}
    else if(type==='taught'){const prior=result;showAdvice({...prior,...p,milliseconds:prior.milliseconds});status('Your lesson changed the artificial readout. The displayed advice now uses that updated readout.');}
    else if(type==='audited'){renderReport(p);status('The held-out test is complete. All four measured controls are shown below.');}
    else if(type==='exported'){download('village-lawyer-model.json',p);status('Model exported. It contains numerical lessons, not petition prose.');}
    else if(type==='imported'){discardResult();$('lessons').textContent=`${p.lessons} learned examples`;status('Model ready. Consult a petition again before recording or teaching advice.');}
    else if(type==='error'||type==='cancelled'){ready=p.ready;status(p.message,type==='error');}
  }catch(e){status(e.message,true);}controls();
};
worker.onerror=e=>{busy=false;job=null;ready=false;status(`The simulation worker stopped: ${e.message||'unknown error'}. Reload the page to restart.`,true);controls();};
for(let i=0;i<ISSUES.length;i++){const option=node('option',ISSUE_NAMES[i]);option.value=ISSUES[i];$('issue').append(option);}
ACTIONS.forEach((a,i)=>{const option=node('option',a.title);option.value=i;$('lesson').append(option);});
CASES.forEach((c,i)=>{
  const hotspot=node('button',String(i+1),'hotspot');hotspot.dataset.case=i;hotspot.setAttribute('aria-label',`${c.person}: ${c.name}`);hotspot.title=c.name;hotspot.onclick=()=>selectPetition(i);$('hotspots').append(hotspot);
  const b=node('button');b.dataset.case=i;b.append(node('span',String(i+1).padStart(2,'0')),node('span',c.name),node('small',c.person));b.onclick=()=>selectPetition(i);$('queue').append(b);
});
$('facts-form').addEventListener('change',()=>{current.facts=factsFromForm();discardResult();status('Facts changed. Ask the advocate again for advice on this version.');});
$('facts-form').addEventListener('submit',e=>{e.preventDefault();try{current.facts=factsFromForm();current.note=selected<0?$('note-input').value:current.note;discardResult();call('consult',{facts:current.facts});}catch(error){status(error.message,true);}});
$('note-input').addEventListener('input',()=>{current.note=$('note-input').value;});
$('new-petition').onclick=()=>{selectPetition(-1);$('petition-title').scrollIntoView({block:'start'});$('note-input').focus();};
$('load').onclick=()=>call('load');$('cancel').onclick=()=>{if(job){worker.postMessage({type:'cancel'});status('Stopping after the current simulation step. No partial result will be recorded.');}};
$('record').onclick=()=>{if(!result||result.recorded||busy||book.length>=128)return;book.push(createEntry(current,result,fingerprint));result.recorded=true;$('record').textContent='Entered in the casebook';renderBook();controls();status(`Recorded. ${charter(current.facts)===result.action?'The advice follows':'The advice differs from'} the fictional village charter. Recording does not train the model.`);};
$('teach').onclick=()=>call('teach',{facts:current.facts,action:Number($('lesson').value)});
$('run-audit').onclick=()=>call('audit');$('export-model').onclick=()=>call('export');$('reset-model').onclick=()=>{if(confirm('Discard this session’s teaching and restore the verified starter?'))call('reset');};
$('import-model').onchange=async e=>{try{const model=await readFile(e.target);if(model)call('import',{model});}catch(err){status(`Model import failed: ${err.message}`,true);}finally{e.target.value='';}};
$('export-book').onclick=()=>{download('village-lawyer-casebook.json',casebookFile(book,fingerprint));status('Casebook exported. The file includes your petition text.');};
$('import-book').onchange=async e=>{try{const file=await readFile(e.target);if(!file)return;const entries=parseCasebook(file,fingerprint);if(book.length&&!confirm('Replace the current casebook with the imported entries?'))return;book=entries;renderBook();controls();status('Casebook imported as a saved record. Its decisions were not rerun or independently verified.');}catch(err){status(`Casebook import failed: ${err.message}`,true);}finally{e.target.value='';}};
$('clear-book').onclick=()=>{if(book.length&&confirm('Clear this casebook? Export it first to keep a copy.')){book=[];renderBook();controls();}};
$('export-audit').onclick=()=>{if(report)download('village-lawyer-audit.json',report);else status('No verified audit report is available to export.',true);};
function navigate(){const target=['office','casebook','nervous-system','about'].includes(location.hash.slice(1))?location.hash.slice(1):'office';for(const view of document.querySelectorAll('.view'))view.hidden=view.id!==target;for(const a of document.querySelectorAll('[data-tab]')){if(a.dataset.tab===target)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}if(target==='nervous-system')atlas.draw();}
addEventListener('hashchange',navigate);navigate();selectPetition(0);renderBook();controls();
Promise.all(['manifest.json','audit.json'].map(name=>fetch(new URL('./data/'+name,import.meta.url)).then(r=>{if(!r.ok)throw Error('Build the full distribution to produce verified data.');return r.json();}))).then(([manifest,auditReport])=>{validateManifest(manifest);fingerprint=manifest.fingerprint;renderReport(auditReport);controls();}).catch(e=>{$('audit-caption').textContent=`No verified build report: ${e.message}`;});
