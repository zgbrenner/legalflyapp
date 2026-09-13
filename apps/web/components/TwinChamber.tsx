"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { classifyTwin, recordedTwin, MAX_TEXT_CHARS, type ClassifyResponse, type TwinResponse } from "@/lib/api";
import type { PlaybackClock } from "./ConnectomeViz";
const ConnectomeViz = dynamic(()=>import("./ConnectomeViz").then(m=>m.ConnectomeViz), { ssr:false, loading:()=> <div className="brain-empty">Preparing the neural display…</div> });
const EXAMPLES = [
  { name:"An email", text:"Please email the draft to alex@example.com" },
  { name:"A private number", text:"For the confidential personnel file, the employee's Social Security number is 000-12-3456. This is an invented example." },
  { name:"A legal decoy", text:"Call Section 555 of the statute before filing the motion in limine." },
  { name:"Nothing private", text:"The parties agree to meet next week to discuss the draft agreement." },
];
function encoderName(name?: string) { return name?.toLowerCase().includes("minilm") ? "MiniLM" : name?.startsWith("hashing") ? "Hashing text encoder" : "Text encoder not reported"; }
function ResultLabel({ result }: { result: ClassifyResponse | null }) {
  const top=result?.labels?.[0];
  return <div className="prediction-tag" title="Model scores are not calibrated guarantees of safety.">{result ? <><strong>{result.contains_sensitive ? "Flagged as sensitive" : "No sensitive flag"}</strong><br/>{top?.name ?? "NONE"} {top ? `· ${Math.round(top.confidence*100)}% score` : ""}</> : "Awaiting a passage"}</div>;
}
export function TwinChamber() {
  const [text,setText]=useState(EXAMPLES[0].text),[shownText,setShownText]=useState("");
  const [payload,setPayload]=useState<TwinResponse|null>(null);
  const [source,setSource]=useState<"none"|"recorded"|"live">("none");
  const [recordedAt,setRecordedAt]=useState("");
  const [loading,setLoading]=useState(false),[error,setError]=useState<string|null>(null);
  const [paused,setPaused]=useState(false),[reduced,setReduced]=useState(true),[angle,setAngle]=useState(0);
  const clock=useRef<PlaybackClock>({time:0,paused:false});
  const controller=useRef<AbortController|null>(null),requestId=useRef(0),edited=useRef(false);
  useEffect(()=>{
    let alive=true;
    recordedTwin().then(record=>{
      if (!alive || requestId.current!==0) return;
      setPayload(record.result);setShownText(record.text);setRecordedAt(record.recorded_at);setSource("recorded");
      if (!edited.current) setText(record.text);
    }).catch(()=>{});
    return()=>{alive=false;controller.current?.abort();};
  },[]);
  useEffect(()=>{
    const query=window.matchMedia("(prefers-reduced-motion: reduce)");
    const update=()=>{setReduced(query.matches);if(query.matches)setPaused(true);};
    update();query.addEventListener("change",update);return()=>query.removeEventListener("change",update);
  },[]);
  useEffect(()=>{
    clock.current.paused=paused;
    let frame=0,last=performance.now();
    const tick=(now:number)=>{if(!paused&&!document.hidden)clock.current.time+=Math.min(.1,(now-last)/1000);last=now;frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[paused]);
  async function run(passage:string) {
    edited.current=true;
    if (!passage.trim()) {setError("Enter a passage to test.");return;}
    if (passage.length>MAX_TEXT_CHARS) {setError("Keep the passage under 4,000 characters.");return;}
    controller.current?.abort();controller.current=new AbortController();
    const id=++requestId.current;setLoading(true);setError(null);
    try {
      const response=await classifyTwin(passage,true,controller.current.signal);
      if(id!==requestId.current)return;
      if (response.tissue?.science_version!=="2.0-directed-controls" || response.twin?.science_version!=="2.0-directed-controls") {
        throw new Error("The live server is running an older model. The recorded experiment remains available; the backend needs the corrected release.");
      }
      setPayload(response);setShownText(passage);setSource("live");clock.current.time=0;
    } catch(e) {
      if(id===requestId.current && !(e instanceof DOMException && e.name==="AbortError"))setError(e instanceof Error?e.message:"The request failed. Please retry.");
    } finally {if(id===requestId.current)setLoading(false);}
  }
  function cancelRequest() {
    controller.current?.abort();requestId.current+=1;setLoading(false);
    setError("Request cancelled. The display has not been replaced.");
  }
  function submit(event:FormEvent) {event.preventDefault();void run(text);}
  const tissue=payload?.tissue ?? null,twin=payload?.twin ?? null;
  const actual=tissue?.anatomical_edges && !tissue.demo_mode;
  const status=loading?"Running live":source==="recorded"?"Recorded example":source==="live"?"Live result":"Ready to test";
  return <div>
    <div className="experiment-heading"><div><p className="section-label">The specimen chamber</p><h2>Put the fly to the test.</h2></div><span className="status-tag" role="status">{status}</span></div>
    <form onSubmit={submit} className="input-workbench">
      <div className="input-topline"><label htmlFor="passage">Your passage, or one of ours</label><div className="sample-buttons" aria-label="Example passages">{EXAMPLES.map(ex=><button key={ex.name} type="button" onClick={()=>{edited.current=true;setText(ex.text);void run(ex.text);}}>{ex.name}</button>)}</div></div>
      <textarea id="passage" value={text} onChange={e=>{edited.current=true;setText(e.target.value);}} maxLength={MAX_TEXT_CHARS} rows={3} aria-describedby="privacy-warning" placeholder="Use an invented or redacted passage…"/>
      <div className="input-footer"><button type="submit" className="button button-dark" disabled={loading}>{loading?"Testing the passage…":"Run the experiment"}<span aria-hidden>↗</span></button>{loading ? <button type="button" className="button button-cancel" onClick={cancelRequest}>Cancel request</button> : null}<p id="privacy-warning">Public research demo. Your text is sent to a server. Do not enter real client information, passwords, or privileged material.</p><span className="character-count">{text.length.toLocaleString()} / 4,000</span></div>
      {error ? <p role="alert" className="form-error">{error}</p> : null}
    </form>
    <div className="brain-workbench" aria-busy={loading}>
      <div className="playback-tools"><p>{source==="recorded"?"Recorded model activity":source==="live"?"Replay of this inference":"Neural activity"} · same display scale</p><div className="playback-buttons"><button type="button" onClick={()=>setPaused(v=>!v)} aria-pressed={paused}>{paused?"Play activity":"Pause activity"}</button><button type="button" onClick={()=>{clock.current.time=0;setPaused(false);}}>Replay</button><label>Rotate both <input aria-label="Rotate both brains" type="range" min={-1.6} max={1.6} step={.04} value={angle} onChange={e=>setAngle(Number(e.target.value))}/></label></div></div>
      <div className="brain-columns">{[{result:tissue,title:actual?"The fly’s wiring":tissue?"Synthetic demo wiring":"The fly’s wiring",letter:"A",note:actual?"Real connections from hemibrain v1.2":tissue?"Not an anatomical fly graph":"Source reported when loaded"},{result:twin,title:"The scrambled twin",letter:"B",note:"Same neurons. Connections rearranged."}].map(side=><section key={side.letter} className="brain-column" aria-label={side.title}>
        <div className="brain-column-header"><div><p className="section-label">Specimen {side.letter}</p><h3>{side.title}</h3><p className="graph-caption">{side.note}</p></div><ResultLabel result={side.result}/></div>
        <ConnectomeViz simulation={side.result?.simulation} title={side.title} clock={clock} angle={angle} reducedMotion={reduced} playing={!paused}/>
        <div className="provenance-line">{side.result ? <>{side.result.simulation.total_neurons?.toLocaleString() ?? "?"} neurons · {side.result.simulation.total_edges?.toLocaleString() ?? "?"} connections · {(side.result.inference_time_sec*1000).toFixed(0)} ms<br/>Graph {side.result.graph_hash?.slice(0,12) ?? "hash unavailable"} · {encoderName(side.result.encoder_name)}</> : "No model results loaded."}</div>
      </section>)}</div>
    </div>
    <div className="result-summary" aria-live="polite"><div><h3>{payload ? payload.agree_on_sensitive ? tissue?.contains_sensitive ? "Both flagged this passage." : "Neither flagged this passage." : "The two models disagree." : "One passage. Two sets of wiring."}</h3><p>{payload?"Agreement is not proof of correctness. A disagreement does not establish why the models differ.":"Both receive the same text features. Only their connections differ."}</p></div><div className="baseline-line">{payload?.baseline ? <><b>Standard classifier · {encoderName(payload.baseline.encoder_name)} + linear readout</b><span>{payload.baseline.contains_sensitive?"Flagged as sensitive":"No sensitive flag"} · {payload.baseline.labels[0]?.name} · {Math.round((payload.baseline.labels[0]?.confidence??0)*100)}% model score</span></> : <><b>Compared against a standard text classifier</b><span>The live API includes this baseline when available. The research results also compare MiniLM-based models.</span></>}</div></div>
    <p className="experiment-footnote">{source==="recorded"?`A saved inference, not a new run${recordedAt?` · ${new Date(recordedAt).toLocaleDateString()}`:""}. `:""}{shownText&&shownText!==text?"The display still shows the previous passage. Run your edits to update it. ":""}The model’s readout was trained{tissue?.training_examples?` on ${tissue.training_examples.toLocaleString()} examples`:""}. Connections are fixed during inference. Brain shapes are illustrative; the activity is measured. Scores are not safety guarantees.</p>
    {tissue && tissue.science_version!=="2.0-directed-controls"?<p role="alert" className="form-error">This API is serving an older experiment. Deploy the corrected backend before treating these outputs as current research.</p>:null}
  </div>;
}
