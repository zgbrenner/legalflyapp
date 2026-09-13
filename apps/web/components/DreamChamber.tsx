"use client";
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { Simulation } from '@/lib/api';
import { FlyMark } from './FlyMark';
const Brain=dynamic(()=>import('./ConnectomeViz').then(m=>m.ConnectomeViz),{ssr:false,loading:()=> <div className="dream-loading">Preparing the neural display.</div>});
type Card={id:string;title:string;area:string;text:string;concepts:string[];source:string};
type Frame={step:number;rms:number;delta:number;externalInputRMS:number;feedbackRMS:number;noise:number;mode:string;status:string;match:number|null;matches:{index:number;id:string;similarity:number}[]};
type Control={name:string;steps:number;meanRMS:number;finalRMS:number;matchedSteps:number;labelChanges:number};
type Metrics={reconstructionMSE:number;thinnedCueHits:number;thinnedCueTotal:number};
const phaseText:Record<string,string>={loading:'Loading verified wiring',ready:'Ready to read',reading:'Reading',running:'Dreaming',paused:'Paused',complete:'Session complete',controls:'Running controls'};
function download(name:string,content:string){const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function DreamChamber(){
 const worker=useRef<Worker|null>(null),request=useRef(0),phaseRef=useRef('loading');
 const [phase,setPhase]=useState('loading'),[error,setError]=useState(''),[library,setLibrary]=useState<Card[]>([]),[cards,setCards]=useState<Card[]>([]),[activeCards,setActiveCards]=useState<Card[]>([]);
 const [collection,setCollection]=useState('Mixed'),[cue,setCue]=useState(0),[seed,setSeed]=useState(42),[mode,setMode]=useState('replay'),[noise,setNoise]=useState(0);
 const [layout,setLayout]=useState<Simulation|null>(null),[activity,setActivity]=useState<number[]>([]),[frame,setFrame]=useState<Frame|null>(null),[notes,setNotes]=useState<Frame[]>([]);
 const [hasModel,setHasModel]=useState(false),[hasSession,setHasSession]=useState(false),[metrics,setMetrics]=useState<Metrics|null>(null),[progress,setProgress]=useState({current:0,total:1,title:''});
 const [controls,setControls]=useState<Control[]>([]),[reduced,setReduced]=useState(false),[angle,setAngle]=useState(0),[imported,setImported]=useState(false);
 const corpusInput=useRef<HTMLInputElement>(null),modelInput=useRef<HTMLInputElement>(null);
 phaseRef.current=phase;
 const busy=phase==='reading'||phase==='controls'||phase==='loading';
 const send=(type:string,payload:Record<string,unknown>={},passive=false)=>{
  setError('');const id=passive?request.current:++request.current;worker.current?.postMessage({id,type,...payload});
 };
 useEffect(()=>{
  const abort=new AbortController();let w:Worker;
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');const motion=()=>setReduced(media.matches);motion();media.addEventListener('change',motion);
  try{w=new Worker('/dream/worker.mjs',{type:'module'});worker.current=w;}
  catch{setError('This browser could not start the local simulation worker. No text was sent.');setPhase('ready');return()=>media.removeEventListener('change',motion);}
  w.onmessage=event=>{
   const m=event.data;if(m.id!==request.current)return;
   if(m.type==='loaded'){setLayout(m.layout);setActivity(m.layout.indices.map(()=>0));}
   if(m.type==='status')setPhase(m.status);
   if(m.type==='error')setError(m.message);
   if(m.type==='progress')setProgress(m);
   if(m.type==='trained'){setImported(Boolean(m.imported));setActiveCards(m.model.cards);setHasModel(true);setHasSession(true);setMetrics(m.model.metrics);setNotes([]);setControls([]);if(m.imported){setCards(m.model.cards);setCollection('Imported');setCue(0);setSeed(m.model.seed);}}
   if(m.type==='corpus'){setActivity(prev=>prev.map(()=>0));setCards(m.cards);setActiveCards([]);setCollection('Imported');setCue(0);setHasModel(false);setHasSession(false);setFrame(null);setNotes([]);setMetrics(null);setControls([]);}
   if(m.type==='frame'){
    setFrame(m.frame);setActivity(m.activity);
    setNotes(prev=>{const last=prev[prev.length-1];if(!last||last.match!==m.frame.match||last.status!==m.frame.status||m.frame.step-last.step>=64)return [...prev,m.frame].slice(-80);return prev;});
   }
   if(m.type==='controls')setControls(m.rows);
   if(m.type==='download')download(m.name,m.content);
  };
  w.onerror=()=>{setError('The local worker stopped unexpectedly. Reload the brain to retry.');setPhase('ready');setHasModel(false);setHasSession(false);};
  w.postMessage({id:++request.current,type:'load'});
  fetch('/dream/cards.json',{signal:abort.signal}).then(r=>{if(!r.ok)throw Error('Teaching cards are unavailable');return r.json();}).then(data=>{setLibrary(data);setCards(data);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);});
  const visibility=()=>{if(document.hidden&&phaseRef.current==='running')w.postMessage({id:++request.current,type:'pause'});};
  document.addEventListener('visibilitychange',visibility);
  return()=>{abort.abort();w.terminate();worker.current=null;media.removeEventListener('change',motion);document.removeEventListener('visibilitychange',visibility);};
 },[]);
 const simulation=useMemo(()=>layout?{...layout,final_activity:activity,trajectory:[activity],timesteps:frame?.step??0}:null,[layout,activity,frame?.step]);
 const chooseCollection=(value:string)=>{send('cancel');setActivity(prev=>prev.map(()=>0));setCollection(value);setCards(value==='Mixed'?library:library.filter(c=>c.area===value));setCue(0);setHasModel(false);setHasSession(false);setFrame(null);setNotes([]);setMetrics(null);setControls([]);};
 const freshSettings=()=>{send('pause');setActivity(prev=>prev.map(()=>0));setHasSession(false);setNotes([]);setFrame(null);};
 const learn=()=>{setPhase('reading');setProgress({current:0,total:cards.length,title:''});setHasModel(false);setHasSession(false);setNotes([]);setFrame(null);send('train',{cards,seed,cue,mode,noise,autoRun:!reduced});};
 const start=()=>{setNotes([]);setHasSession(true);send('start',{cue,mode,noise});};
 const openFile=async(event:ChangeEvent<HTMLInputElement>,kind:'model'|'corpus')=>{
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  if(file.size>5_000_000){setError('That file exceeds the 5 MB import limit.');return;}
  try{const value=JSON.parse(await file.text());send(kind==='model'?'import-model':'import-corpus',kind==='model'?{model:value}:{cards:value});}
  catch{setError('Use a valid JSON model or teaching-card file. Nothing was imported.');}
 };
 const match=frame?.match!=null?activeCards[frame.match]:null;
 const stateTitle=!frame?'Nothing read yet.':frame.status==='quiet'?'The activity has faded.':match?match.title:'No clear association.';
 return <div className="dream-page">
  <section className="page-width dream-intro"><div><h1>The law,<br/><em>after hours.</em></h1><p>Teach a fly-wired network a few legal ideas.<br className="desktop-break"/> Remove the text. Watch what lingers.</p></div><div className="dream-specimen"><FlyMark/><span>Legal Dreaming<br/><i>An experiment in learned replay.</i></span></div></section>
  <section className="page-width dream-lab" aria-label="Legal Dreaming laboratory">
   <aside className="reading-room"><div className="room-title"><span>01 / READING ROOM</span><span>{cards.length} cards</span></div>
    <h2>Leave it something<br/>to remember.</h2>
    <label className="dream-field" htmlFor="reading-set">Reading set<select id="reading-set" value={collection} disabled={busy||phase==='running'} onChange={e=>chooseCollection(e.target.value)}>{['Mixed','Contracts','Torts','Privacy',...(collection==='Imported'?['Imported']:[])].map(x=><option key={x}>{x}</option>)}</select></label>
    <div className="card-shelf" role="group" aria-label="Teaching cards">{cards.map((c,i)=><button type="button" className={cue===i?'selected':''} key={c.id} disabled={busy||phase==='running'} onClick={()=>{setCue(i);freshSettings();}} aria-pressed={cue===i}><span className="card-number">{String(i+1).padStart(2,'0')}</span><span>{c.title}<small>{c.concepts.join(' · ')}</small></span><span aria-hidden="true">↗</span></button>)}</div>
    {cards[cue]?<div className="cue-card"><span>THE LAST THING IT READS</span><p>{cards[cue].text}</p></div>:null}
    <p className="corpus-note">The starter cards are fictional scenarios, not court opinions. Their concept labels are human annotations.</p>
    <div className="corpus-tools"><button type="button" disabled={busy||phase==='running'} onClick={()=>corpusInput.current?.click()}>Open your own cards</button><a href="/dream/cards.json" download="legalfly-teaching-cards.json">JSON example ↗</a></div>
    <input ref={corpusInput} type="file" accept=".json,application/json" aria-label="Import teaching cards" hidden onChange={e=>void openFile(e,'corpus')}/>
   </aside>
   <div className="dream-observatory"><div className="observatory-top"><span>02 / OBSERVATION CHAMBER</span><span className={`dream-status ${phase==='running'?'is-running':''}`} role="status">{phaseText[phase]??phase}</span></div>
    <div className="dream-brain"><Brain simulation={simulation} playing={phase==='running'&&!reduced} reducedMotion={reduced} angle={angle} live title="Dreaming brain"/>
     <div className="dream-stage-readout"><span>{layout?`${layout.total_neurons?.toLocaleString()} neurons · ${layout.total_edges?.toLocaleString()} connections`:'Verifying the biological graph'}</span><span>Hemibrain subset, not a whole brain</span></div>
    </div>
    <div className="live-association"><div><span className="association-label">{frame?.status==='matched'?'NEAREST TAUGHT PATTERN':frame?.status==='quiet'?'QUIET STATE':'CURRENT ASSOCIATION'}</span><h2>{stateTitle}</h2><p>{match?match.concepts.join(' / '):frame?'The decoder abstains. It does not invent a meaning.':'No labels are shown until there is measured activity.'}</p></div><span className="step-count">{String(frame?.step??0).padStart(4,'0')}<small>simulation steps</small></span></div>
    <div className="dream-vitals"><div><span>External text input</span><strong>{frame?'0':'–'}</strong></div><div><span>Internal feedback</span><strong>{frame?frame.feedbackRMS.toFixed(4):'–'}</strong></div><div><span>Activity RMS</span><strong>{frame?frame.rms.toFixed(4):'–'}</strong></div><div><span>State change</span><strong>{frame?frame.delta.toFixed(6):'–'}</strong></div></div>
    <div className="dream-controls"><div className="dream-main-actions">
     {busy&&phase!=='loading'?<button type="button" className="button dream-primary" onClick={()=>send('cancel')}>Cancel {phase==='controls'?'controls':'reading'}</button>:phase==='running'?<button type="button" className="button dream-primary" onClick={()=>send('pause')}>Pause dreaming</button>:!hasModel?<button type="button" className="button dream-primary" disabled={!layout||busy||cards.length<2} onClick={learn}>{reduced?'Read these cards':'Read, then dream'} <span aria-hidden="true">↗</span></button>:<><button type="button" className="button dream-primary" onClick={start}>Dream from this card <span aria-hidden="true">↗</span></button>{hasSession&&phase==='paused'?<button type="button" className="dream-minor" onClick={()=>send('resume')}>Resume</button>:null}</>}
     <label className="rotation-control">Rotate<input type="range" aria-label="Rotate the brain" min="-1.2" max="1.2" step=".05" value={angle} onChange={e=>setAngle(Number(e.target.value))}/></label>
    </div>
    {phase==='reading'||phase==='controls'?<div className="reading-progress"><progress value={progress.current} max={progress.total}/><span>{progress.current}/{progress.total} · {progress.title||'Preparing the reading'}</span></div>:null}
    <p className="dream-privacy">Text and learning stay in this browser. No language model. No document upload to a server.</p>
    </div>
   </div>
  </section>
  <div className="page-width">{error?<div className="dream-error" role="alert"><p>{error}</p>{!layout?<button type="button" onClick={()=>{setPhase('loading');send('load');}}>Retry loading the brain</button>:null}</div>:null}</div>
  <section className="page-width experiment-settings" aria-label="Experiment settings">
   <label htmlFor="dream-mode">After reading<select id="dream-mode" value={mode} disabled={busy||phase==='running'} onChange={e=>{setMode(e.target.value);freshSettings();}}><option value="replay">Learned replay: feedback on</option><option value="silence">Silence: feedback off</option></select></label>
   <label htmlFor="dream-seed">Random seed<input id="dream-seed" type="number" min="0" max="4294967295" value={seed} disabled={busy||phase==='running'} onChange={e=>{setSeed(Number(e.target.value));setHasModel(false);setMetrics(null);setControls([]);freshSettings();}}/></label>
   <label htmlFor="dream-noise">Injected noise<select id="dream-noise" value={noise} disabled={busy||phase==='running'} onChange={e=>{setNoise(Number(e.target.value));freshSettings();}}><option value="0">None</option><option value="0.002">0.002, seeded perturbation</option><option value="0.01">0.01, seeded perturbation</option></select></label>
   <p>Replay feeds learned numbers back into the wiring. Silence does not. Neither mode receives new text. Sessions stop at 2,048 steps and pause when you leave the tab.</p>
  </section>
  <section id="notebook" className="page-width dream-notebook"><div className="notebook-heading"><div><span className="section-label">03 / FIELD NOTES</span><h2>What remains.</h2></div><div className="notebook-actions"><button type="button" disabled={!hasSession||busy} onClick={()=>send('export-trace',{},true)}>Save notebook ↗</button><button type="button" disabled={!hasModel||busy} onClick={()=>send('export-model',{},true)}>Save learned model ↗</button><button type="button" disabled={busy||phase==='running'} onClick={()=>modelInput.current?.click()}>Open model</button><input ref={modelInput} type="file" accept=".json,application/json" aria-label="Import learned model" hidden onChange={e=>void openFile(e,'model')}/></div></div>
   <p className="notebook-explanation">These are nearest-pattern matches, not sentences written by a fly. An unfamiliar state is not an invented legal doctrine. Exports include your teaching text; nothing is saved automatically.</p>
   {!notes.length?<div className="notebook-empty"><span>·</span><p>The notebook is empty.<small>Read a set of cards to begin a measured trace.</small></p></div>:<div className="notebook-table-wrap"><table className="notebook-table"><thead><tr><th>Step</th><th>Association</th><th>Closest similarity</th><th>Activity</th></tr></thead><tbody>{[...notes].reverse().map((f,i)=>{const c=f.match!=null?activeCards[f.match]:null;return <tr key={`${f.step}-${i}`}><td>{String(f.step).padStart(4,'0')}</td><td><details><summary>{c?c.title:f.status==='quiet'?'Activity faded':'No clear match'}</summary><p>{c?c.text:'The network did not meet the activity and similarity criteria for a named association.'}</p>{c?<small>{c.source}</small>:null}{f.matches.map(m=><p className="nearest-pattern" key={m.id}>{activeCards[m.index]?.title}: {m.similarity.toFixed(3)}</p>)}</details></td><td>{f.matches.length?f.matches[0].similarity.toFixed(3):'–'}</td><td>{f.rms.toFixed(5)}</td></tr>;})}</tbody></table></div>}
   {metrics?<p className="learning-diagnostic">{imported?'Imported model diagnostic (file-supplied, not remeasured):':'Reading diagnostic:'} {metrics.thinnedCueHits}/{metrics.thinnedCueTotal} taught cards recognized after removing every fourth word. This is not a test on unseen cases. Training reconstruction error: {metrics.reconstructionMSE.toExponential(2)}.</p>:null}
  </section>
  <section className="page-width dream-comparisons"><div><span className="section-label">THE NECESSARY COMPARISON</span><h2>Is it the wiring,<br/>or the machinery around it?</h2><p>Run the same cue through learned replay, silent decay, and a degree-matched rewired control. Same seed. Same reading. No injected noise. A busier trace is not a better legal result.</p><button type="button" className="button button-dark" disabled={!hasModel||busy||phase==='running'} onClick={()=>{setPhase('controls');send('controls',{cue});}}>Run the controls ↗</button></div><div className="control-results">{controls.length?<div className="notebook-table-wrap"><table className="notebook-table"><thead><tr><th>256 steps</th><th>Final activity</th><th>Matched steps</th><th>Label changes</th></tr></thead><tbody>{controls.map(row=><tr key={row.name}><td>{row.name}</td><td>{row.finalRMS.toFixed(5)}</td><td>{row.matchedSteps}/256</td><td>{row.labelChanges}</td></tr>)}</tbody></table><p>Measured in this browser. One cue, one seed. These diagnostics do not establish that biological wiring is superior.</p></div>:<p className="control-empty">No comparisons have been run.<br/>No scores have been filled in.</p>}</div></section>
  <section className="page-width dream-footnote"><span>*</span><p>“Dreaming” is the metaphor. The wiring is measured; the activity and learned feedback are mathematical. This does not simulate sleep, consciousness, or legal reasoning. <Link href="/dreaming-method">Read the method ↗</Link></p></section>
 </div>;
}
