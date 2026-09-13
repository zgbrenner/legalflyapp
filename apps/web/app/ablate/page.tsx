"use client";
import { useEffect, useState } from "react";
import { fetchAblations } from "@/lib/api";
import { DownloadIcon } from "@/components/ActionIcon";
type Mode="hybrid"|"activity_only";
type Measure={macro_f1:number;delta_macro_f1:number;binary_accuracy:number};
type Lesion={ablation:string;kind:string;region?:string;removed_neurons:number;remaining_edges:number;measurements:Record<Mode,Measure>};
type Report={status:string;timestamp:string;note:string;protocol:string;total_neurons:number;total_edges:number;n_train:number;n_test:number;original:Record<Mode,{macro_f1:number}>;ablations:Lesion[]};
export default function AblatePage(){
 const [data,setData]=useState<Report|null>(null),[error,setError]=useState(""),[mode,setMode]=useState<Mode>("activity_only"),[selected,setSelected]=useState(0);
 useEffect(()=>{let alive=true;fetchAblations().then(d=>{if(alive)setData(d as Report);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[]);
 const current=data?.ablations?.[selected];const before=data?.original?.[mode]?.macro_f1??0;const after=current?.measurements?.[mode];
 return <div className="page-width research-page"><div className="research-title"><p className="section-label">The dissection room</p><h1>What happens when<br/><em>we cut the wiring?</em></h1><p>Switch off simulated neurons or rearrange connection strengths. Then measure what the same trained classifier gets wrong.</p></div>
 {error?<p role="alert" className="form-error">{error}</p>:null}
 {!data&&!error?<p role="status">Loading measured lesions…</p>:null}
 {data?.status!=="measured"&&data?<p className="form-error">Corrected ablation measurements are not published on this deployment yet.</p>:null}
 {data?.status==="measured"?<><div className="research-metadata"><span>{data.total_neurons.toLocaleString()} neurons</span><span>{data.n_train} training examples</span><span>{data.n_test} test examples</span><span>Single-seed diagnostic</span></div>
 <div className="results-controls"><label>Readout <select value={mode} onChange={e=>setMode(e.target.value as Mode)}><option value="activity_only">Fly activity only</option><option value="hybrid">MiniLM features + fly activity</option></select></label><p>{mode==="activity_only"?"The classifier only sees simulated neuron activity.":"The classifier still has the original MiniLM text features after the lesion."}</p></div>
 <div className="surgery-grid"><div className="lesion-list" aria-label="Choose a measured lesion">{data.ablations.map((a,i)=><button key={a.ablation} aria-pressed={selected===i} onClick={()=>setSelected(i)}><span>{String(i+1).padStart(2,"0")}</span>{a.ablation}</button>)}</div>
 {current&&after?<section className="effects-panel surgery-panel" aria-live="polite"><p className="section-label">Recorded intervention</p><h2>{current.ablation}</h2><p>{current.removed_neurons.toLocaleString()} neurons disabled · {current.remaining_edges.toLocaleString()} connections remain</p>
 <svg viewBox="0 0 520 145" className="lesion-meter" role="img" aria-label={`Macro F1 before ${before.toFixed(3)}, after ${after.macro_f1.toFixed(3)}`}><text x="0" y="32">Intact</text><text x="0" y="91">After lesion</text><rect x="110" y="10" width="320" height="30" fill="#e0e3d7"/><rect x="110" y="10" width={before*320} height="30" fill="#375e45"/><rect x="110" y="70" width="320" height="30" fill="#e0e3d7"/><rect x="110" y="70" width={after.macro_f1*320} height="30" fill="#823d32"/><text x="445" y="32">{before.toFixed(3)}</text><text x="445" y="92">{after.macro_f1.toFixed(3)}</text><text x="110" y="135">Macro F1, from 0 to 1</text></svg>
 <p className="effect-number">{after.delta_macro_f1>0?"+":""}{(after.delta_macro_f1*100).toFixed(2)} <small>F1 points</small></p><p>{mode==="hybrid"?"A small change can mean the text features carry the prediction. It does not prove that the damaged fly circuitry is resilient.":"This measures dependence on a computational circuit. It is not an experiment on a living fly."}</p></section>:null}</div>
 <div className="research-notes"><h2>What stays fixed</h2><p>{data.protocol} Disabled neurons receive no input. Remaining connections are not amplified to compensate for the cut. Results here are precomputed measurements, not a new training run in your browser.</p><p>{data.note}</p><a href="/research/ablation_v2.json" download className="with-icon">Download the measured lesions <DownloadIcon/></a></div></>:null}</div>;
}
