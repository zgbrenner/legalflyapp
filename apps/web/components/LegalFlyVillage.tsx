"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { FACT_OPTIONS, benchmarkMiniMind, checkMiniMind, encodePetition, verbalizeAdvice, type MiniMindDraft, type MiniMindHealth, type MiniMindNote, type StructuredFacts } from "@/lib/minimind";

type LegalCase = { id: string; split: string; family: string; title: string; villager: string; prop: string; petition: string; facts: StructuredFacts; label?: string };
type Advice = { case: LegalCase; advice: { action: string; confidence: number; margin: number; reason: string }; recommendation: string; energy: number; sampledNodeIds: string[] };
type Action = [string, string];
type LanguageState = "checking" | "ready" | "offline" | "encoding" | "verbalizing" | "benchmarking";

const factFields = Object.keys(FACT_OPTIONS);
const phaseCopy: Record<string, string> = {
  loading: "Opening the office", idle: "The ledger is untrained", "petitioner-approaching": "Calling the petitioner",
  "petition-ready": "Petition on the desk", computing: "Consulting the connectome", "advice-ready": "Counsel's note ready",
  filing: "Filing the petition", errored: "Proceedings stopped",
};
const actionClass: Record<string, string> = {
  "let-rest": "seal-rest", "seek-small-reparation": "seal-small", "seek-full-reparation": "seal-full",
  "request-return": "seal-return", "find-witness": "seal-witness", "sworn-account": "seal-oath",
  "propose-settlement": "seal-settle", "refer-higher": "seal-refer", abstain: "seal-abstain",
};

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 800);
}

function ChamberArt({ cases, selected, phase, advice, reduced }: { cases: LegalCase[]; selected?: LegalCase; phase: string; advice: Advice | null; reduced: boolean }) {
  const called = Math.max(0, cases.findIndex(item => item.id === selected?.id));
  return <div className={`lf-chamber-art ${phase} ${reduced ? "motion-reduced" : ""}`} aria-hidden="true">
    <div className="lf-room-light" />
    <div className="lf-villagers">
      {cases.slice(0, 5).map((item, index) => <div key={item.id} className={`lf-villager v${index} ${called === index ? "is-called" : ""}`} style={{ "--sprite-index": index } as CSSProperties}>
        <span className="lf-villager-figure upper" /><span className="lf-villager-figure lower" />
      </div>)}
    </div>
    <div className="lf-desk-plate" />
    <div className={`lf-petition ${["petition-ready", "computing", "advice-ready", "filing"].includes(phase) ? "is-visible" : ""}`}><span>{selected?.title ?? "Petition"}</span></div>
    <div className={`lf-quill ${phase === "computing" ? "is-writing" : ""}`} />
    <div className={`lf-seal ${actionClass[advice?.advice.action ?? "abstain"] ?? ""} ${["advice-ready", "filing"].includes(phase) ? "is-visible" : ""}`} />
    <div className="lf-fly"><span className="wing left" /><span className="wing right" /><span className="body" /><span className="antenna a" /><span className="antenna b" /></div>
    <div className="lf-scene-caption"><span>Chamber</span><strong>{phaseCopy[phase] ?? phase}</strong></div>
  </div>;
}

function NeuralInspection({ activity, active }: { activity: any; active: boolean }) {
  if (!activity) return <p className="lf-muted">No sampled activity yet. Inspection begins when a petition is heard.</p>;
  return <div className={`lf-neural ${active ? "is-live" : ""}`}>
    <svg viewBox="0 0 520 280" role="img" aria-label="Sampled MaleCNS activity">
      <path className="cord" d="M260 32 C220 80 220 138 260 170 C300 138 300 80 260 32 M260 168 C252 206 254 238 260 264" />
      {activity.values.slice(0, 90).map((value: number, index: number) => {
        const side = index % 2 ? 1 : -1, y = 28 + (index % 45) * 5.1, x = 260 + side * (24 + ((index * 29) % 190));
        return <circle key={activity.node_ids[index] ?? index} cx={x} cy={y} r={2 + Math.min(7, value * 16)} opacity={0.28 + Math.min(0.7, value * 8)} />;
      })}
    </svg>
    <p>Sampled activation tied to real source neuron IDs. The drawing is schematic. Computation uses the full loaded graph.</p>
    <ol>{activity.node_ids.slice(0, 6).map((id: string, index: number) => <li key={id}>{id}: {(activity.values[index] ?? 0).toFixed(5)}</li>)}</ol>
  </div>;
}

function LanguageReceipt({ draft, onAccept, onDismiss }: { draft: MiniMindDraft; onAccept: () => void; onDismiss: () => void }) {
  return <div className="lf-language-receipt" aria-live="polite">
    <div><span>MiniMind draft</span><strong>Action labels withheld</strong></div>
    <dl>{factFields.map(field => <div key={field}><dt>{field}</dt><dd>{draft.facts[field]} <small>{Math.round((draft.field_confidence[field] ?? 0) * 100)}%</small></dd></div>)}</dl>
    <p>These eight proposed fields have not reached the fly. Confirm or discard them.</p>
    <div className="lf-controls slim"><button className="lf-button primary" type="button" onClick={onAccept}>Use these facts</button><button className="lf-button" type="button" onClick={onDismiss}>Discard</button></div>
  </div>;
}

function BenchmarkPanel({ benchmark, miniMindReady }: { benchmark: any; miniMindReady: boolean }) {
  return <div className="lf-benchmark">
    <p>
      <b>Fly:</b> {benchmark.summary.correct}/{benchmark.summary.heldout} exact, {benchmark.summary.abstentions} abstentions. {" "}
      <b>Facts only:</b> {benchmark.summary.factsOnlyCorrect}/{benchmark.summary.heldout}. {" "}
      <b>MiniMind alone:</b> {benchmark.summary.minimindCorrect == null ? (miniMindReady ? "running" : "offline") : String(benchmark.summary.minimindCorrect) + "/" + String(benchmark.summary.heldout)}. {" "}
      <b>Rules:</b> {benchmark.summary.rulesCorrect}/{benchmark.summary.heldout}. {" "}
      <b>Shuffled:</b> {benchmark.summary.shuffledCorrect == null ? "not prepared" : String(benchmark.summary.shuffledCorrect) + "/" + String(benchmark.summary.heldout)}.
    </p>
    <div className="lf-table-wrap"><table className="lf-table">
      <thead><tr><th>Case</th><th>Expected</th><th>Fly + clerk</th><th>MiniMind alone</th><th>Facts only</th><th>Shuffled</th><th>Rules</th></tr></thead>
      <tbody>{benchmark.rows.map((row: any) => <tr key={row.id}><td>{row.title}</td><td>{row.expected}</td><td>{row.biological}</td><td>{row.minimind ?? (miniMindReady ? "running" : "offline")}</td><td>{row.factsOnly}</td><td>{row.shuffled ?? "not run"}</td><td>{row.rules}</td></tr>)}</tbody>
    </table></div>
    <small>Fly + clerk is scored on the fly action before verbalization. MiniMind alone is independent. {benchmark.summary.controls}</small>
  </div>;
}

export function LegalFlyVillage() {
  const worker = useRef<Worker | null>(null), seq = useRef(0), approachTimer = useRef<number | null>(null), languageOp = useRef(0), languageReady = useRef(false);
  const modelInput = useRef<HTMLInputElement>(null), casebookInput = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState("loading"), [error, setError] = useState("");
  const [cases, setCases] = useState<LegalCase[]>([]), [actions, setActions] = useState<Action[]>([]), [selectedId, setSelectedId] = useState("");
  const [custom, setCustom] = useState<LegalCase | null>(null), [modelSummary, setModelSummary] = useState<any>(null), [graph, setGraph] = useState<any>(null);
  const [advice, setAdvice] = useState<Advice | null>(null), [activity, setActivity] = useState<any>(null), [casebook, setCasebook] = useState<any[]>([]), [benchmark, setBenchmark] = useState<any>(null);
  const [progress, setProgress] = useState({ current: 0, total: 1, title: "" }), [reduced, setReduced] = useState(false), [showLab, setShowLab] = useState(false), [seed, setSeed] = useState(42);
  const [languageState, setLanguageState] = useState<LanguageState>("checking"), [languageHealth, setLanguageHealth] = useState<MiniMindHealth | null>(null), [languageError, setLanguageError] = useState("");
  const [factDraft, setFactDraft] = useState<MiniMindDraft | null>(null), [miniNote, setMiniNote] = useState<MiniMindNote | null>(null);

  const selected = useMemo(() => custom && selectedId === "custom" ? custom : cases.find(item => item.id === selectedId) ?? cases[0], [cases, custom, selectedId]);
  const visibleCases = cases.slice(0, 5), teachingCount = cases.filter(item => item.split === "teach").length, heldoutCount = cases.filter(item => item.split === "holdout").length;
  const narrative = custom && selectedId === "custom" ? custom.petition : selected?.petition ?? "";

  const send = (type: string, payload: Record<string, unknown> = {}) => { setError(""); worker.current?.postMessage({ id: ++seq.current, type, ...payload }); };
  const inspectLanguageClerk = async () => {
    const operation = ++languageOp.current; setLanguageState("checking"); setLanguageError("");
    try { const value = await checkMiniMind(AbortSignal.timeout(6000)); if (operation !== languageOp.current) return; languageReady.current = value.ready; setLanguageHealth(value); setLanguageState(value.ready ? "ready" : "offline"); }
    catch { if (operation === languageOp.current) { languageReady.current = false; setLanguageState("offline"); setLanguageError("Local MiniMind is not running. Manual facts and authored counsel notes still work."); } }
  };
  const renderWithMiniMind = async (result: Advice) => {
    if (!languageReady.current) return;
    const operation = ++languageOp.current; setLanguageState("verbalizing"); setLanguageError("");
    try { const note = await verbalizeAdvice(result.case.facts, result.advice.action, result.advice.confidence, AbortSignal.timeout(12000)); if (operation === languageOp.current) { setMiniNote(note); setLanguageState("ready"); } }
    catch (caught) { if (operation === languageOp.current) { setLanguageState("ready"); setLanguageError(caught instanceof Error ? caught.message : "MiniMind could not render the note."); } }
  };
  const addMiniMindControl = async (result: any) => {
    if (!languageReady.current) return;
    const operation = ++languageOp.current; setLanguageState("benchmarking");
    try {
      const control = await benchmarkMiniMind(result.rows.map((row: any) => ({ id: row.id, petition: row.petition })), AbortSignal.timeout(30000));
      if (operation !== languageOp.current) return;
      const byId = new Map(control.rows.map(row => [row.id, row]));
      const rows = result.rows.map((row: any) => ({ ...row, minimind: byId.get(row.id)?.action ?? null }));
      const minimindCorrect = rows.filter((row: any) => row.minimind === row.expected).length;
      setBenchmark({ ...result, rows, summary: { ...result.summary, minimindCorrect }, minimindRevision: control.model_revision }); setLanguageState("ready");
    } catch (caught) { if (operation === languageOp.current) { setLanguageState("ready"); setLanguageError(caught instanceof Error ? caught.message : "MiniMind control failed."); } }
  };

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)"), updateMotion = () => setReduced(media.matches);
    updateMotion(); media.addEventListener("change", updateMotion); void inspectLanguageClerk();
    let activeWorker: Worker | null = null;
    try { activeWorker = new Worker("/legalfly/worker.mjs", { type: "module" }); worker.current = activeWorker; }
    catch { setPhase("errored"); setError("This browser could not start the local worker. No petition text was sent anywhere."); }
    if (activeWorker) {
      activeWorker.onmessage = event => {
        const message = event.data;
        if (message.id && message.id !== seq.current && message.type !== "provenance") return;
        if (message.type === "status") setPhase(message.state);
        if (message.type === "error") { setError(message.message); setPhase("errored"); }
        if (message.type === "cases") { setCases(message.cases); setActions(message.actions); setSelectedId(message.cases[0]?.id ?? ""); }
        if (message.type === "loaded") setGraph(message.graph);
        if (message.type === "trained") setModelSummary(message.modelSummary);
        if (message.type === "model-reset") { setModelSummary(null); setAdvice(null); setMiniNote(null); setActivity(null); }
        if (message.type === "progress") setProgress(message);
        if (message.type === "activity") setActivity(message.activity);
        if (message.type === "advice") { setAdvice(message.result); setMiniNote(null); void renderWithMiniMind(message.result); }
        if (message.type === "casebook") setCasebook(message.entries);
        if (message.type === "benchmark") { setBenchmark(message); void addMiniMindControl(message); }
        if (message.type === "download") download(message.name, message.content);
      };
      activeWorker.onerror = () => { setPhase("errored"); setError("The local worker stopped unexpectedly."); };
      send("load");
    }
    const visibility = () => { if (document.hidden) send("cancel"); };
    document.addEventListener("visibilitychange", visibility);
    return () => { if (approachTimer.current) clearTimeout(approachTimer.current); document.removeEventListener("visibilitychange", visibility); media.removeEventListener("change", updateMotion); activeWorker?.terminate(); worker.current = null; };
  // The worker and local adapter are intentionally initialized once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const callPetitioner = (item: LegalCase) => {
    if (approachTimer.current) clearTimeout(approachTimer.current);
    languageOp.current++; setSelectedId(item.id); setAdvice(null); setMiniNote(null); setFactDraft(null); setActivity(null); setBenchmark(null); setPhase("petitioner-approaching");
    approachTimer.current = window.setTimeout(() => setPhase("petition-ready"), reduced ? 10 : 850);
  };
  const updateNarrative = (value: string) => selected && setCustom({ ...selected, id: "custom", split: "holdout", title: "Custom petition", petition: value, label: undefined });
  const updateFact = (field: string, value: string) => selected && setCustom({ ...selected, id: "custom", split: "holdout", title: "Custom petition", facts: { ...selected.facts, [field]: value }, label: undefined });
  const draftFacts = async () => {
    const operation = ++languageOp.current; setLanguageState("encoding"); setLanguageError(""); setFactDraft(null);
    try { const value = await encodePetition(narrative, AbortSignal.timeout(15000)); if (operation === languageOp.current) { setFactDraft(value); setLanguageState("ready"); } }
    catch (caught) { if (operation === languageOp.current) { setLanguageState("ready"); setLanguageError(caught instanceof Error ? caught.message : "MiniMind could not draft facts."); } }
  };
  const acceptDraft = () => { if (selected && factDraft) { setCustom({ ...selected, id: "custom", split: "holdout", title: "Custom petition", petition: narrative, facts: factDraft.facts, label: undefined }); setSelectedId("custom"); setFactDraft(null); } };
  const hear = () => selected && send("hear", { case: custom && selectedId === "custom" ? custom : selected });
  const openFile = async (event: ChangeEvent<HTMLInputElement>, kind: "model" | "casebook") => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    try { const value = JSON.parse(await file.text()); send(kind === "model" ? "import-model" : "import-casebook", kind === "model" ? { model: value } : { casebook: value }); }
    catch { setError("That JSON file could not be read. Nothing was imported."); }
  };

  return <div className="lf-page">
    <section className="lf-hero page-width">
      <ChamberArt cases={visibleCases} selected={selected} phase={phase} advice={advice} reduced={reduced} />
      <div className="lf-hero-copy"><p className="lf-question">Can a fruit fly&apos;s brain learn to advise a village on its legal matters?</p><h1>The Legal Fly</h1><p className="lf-tagline">Can a fruit fly make a good lawyer?</p><p>Villagers bring ordinary trouble to a very small counsel. The counsel recommends a next step. It does not judge.</p><div className="lf-actions"><a className="lf-button primary" href="#docket">Bring a dispute</a><button className="lf-button inverse" type="button" onClick={() => setShowLab(value => !value)}>{showLab ? "Close the back room" : "Inspect the apparatus"}</button></div></div>
    </section>
    <section className="lf-process page-width" aria-label="Experiment boundary"><span>Petition</span><i>MiniMind clerk</i><span>Confirmed facts</span><i>MaleCNS</i><span>Fly action</span><i>MiniMind clerk</i><span>Counsel&apos;s note</span></section>

    <section className="lf-work page-width" id="docket">
      <aside className="lf-docket" aria-label="Petitioner docket"><div className="lf-panel-head"><span>Today&apos;s docket</span><strong>{phaseCopy[phase] ?? phase}</strong></div>{visibleCases.map(item => <button key={item.id} className={selected?.id === item.id ? "is-selected" : ""} type="button" onClick={() => callPetitioner(item)}><span>{item.villager}</span><b>{item.title}</b><small>{item.prop}</small></button>)}<button type="button" onClick={() => selected && callPetitioner({ ...selected, id: "custom", title: "Custom petition", villager: "A new petitioner", split: "holdout", label: undefined })}><span>New petitioner</span><b>Write a custom petition</b><small>blank paper</small></button></aside>
      <section className="lf-petition-panel" aria-live="polite">
        <div className="lf-panel-head"><span>Petition on the desk</span><strong>{graph ? `${graph.neurons?.toLocaleString()} neurons loaded` : "MaleCNS required"}</strong></div>{error ? <div className="lf-error" role="alert">{error}</div> : null}<h2>{selected?.title ?? "No petitioner selected"}</h2>
        <textarea aria-label="Petition narrative" value={narrative} onChange={event => updateNarrative(event.target.value)} />
        <div className="lf-clerk-line"><p><strong>Language clerk: {languageState}</strong><span>MiniMind runs only on your local machine. Its proposed fields require confirmation.</span></p>{languageHealth?.ready ? <button className="lf-text-button" disabled={languageState !== "ready" || !narrative.trim()} type="button" onClick={() => void draftFacts()}>{languageState === "encoding" ? "Reading petition" : "Draft facts with MiniMind"}</button> : <button className="lf-text-button" type="button" onClick={() => void inspectLanguageClerk()}>Check local MiniMind</button>}</div>
        {languageError ? <p className="lf-language-error" role="status">{languageError}</p> : null}{factDraft ? <LanguageReceipt draft={factDraft} onAccept={acceptDraft} onDismiss={() => setFactDraft(null)} /> : null}<p className="lf-muted">Only the confirmed fields below reach the fly. The narrative does not.</p>
        <div className="lf-facts">{factFields.map(field => <label key={field}>{field}<select value={(custom && selectedId === "custom" ? custom : selected)?.facts?.[field] ?? ""} onChange={event => updateFact(field, event.target.value)}>{FACT_OPTIONS[field].map(value => <option key={value}>{value}</option>)}</select></label>)}</div>
        <div className="lf-controls">{!modelSummary ? <button className="lf-button primary" disabled={phase === "computing" || !graph} type="button" onClick={() => send("train", { seed })}>Teach the ledger</button> : <button className="lf-button primary" disabled={phase === "computing"} type="button" onClick={hear}>Hear the case</button>}{phase === "computing" ? <button className="lf-button" type="button" onClick={() => send("cancel")}>Cancel</button> : null}<label className="lf-seed">seed <input type="number" value={seed} onChange={event => setSeed(Number(event.target.value))} /></label></div>{phase === "computing" ? <p className="lf-progress">{progress.current}/{progress.total} {progress.title}</p> : null}
      </section>
      <aside className="lf-advice"><div className="lf-panel-head"><span>Counsel&apos;s note</span><strong>{advice ? `${Math.round(advice.advice.confidence * 100)}% readout confidence` : "abstains if unsure"}</strong></div>{advice ? <><div className={`lf-result-seal ${actionClass[advice.advice.action] ?? "seal-abstain"}`} /><h2>{actions.find(([id]) => id === advice.advice.action)?.[1] ?? "Abstain."}</h2><p>{miniNote?.text ?? advice.recommendation}</p><div className="lf-boundary-note"><span>{miniNote ? "MiniMind rendering" : "Authored fallback"}</span><p>{miniNote ? "The decoder received the selected action and confirmed facts. Alternative actions were withheld." : "The action came from the fly readout. No language model changed it."}</p></div><div className="lf-controls slim"><button className="lf-button" type="button" onClick={() => send("file-case")}>File in casebook</button><select aria-label="Correct recommendation" onChange={event => event.target.value && send("correct", { label: event.target.value })} defaultValue=""><option value="">Correct the fly</option>{actions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></div></> : <p className="lf-muted">The fly waits beside the papers. Teach the ledger, call a petitioner, and ask for advice.</p>}</aside>
    </section>

    <section className={`lf-lab page-width ${showLab ? "is-open" : ""}`} id="method"><div><div className="lf-panel-head"><span>Neural inspection</span><strong>{activity ? "sampled values" : "not a replay"}</strong></div><NeuralInspection activity={activity} active={phase === "computing"} /></div><div><div className="lf-panel-head"><span>Method and controls</span><strong>{teachingCount} teach / {heldoutCount} held out</strong></div><p>MiniMind proposes visible fields and renders a fixed fly action. The biological graph stays fixed. Only the artificial readout learns. Labels, benchmark IDs, and MiniMind hidden states never enter the connectome.</p><div className="lf-contract"><b>Encoder sees</b><span>petition text, field name, allowed field values</span><b>Fly sees</b><span>eight confirmed enums</span><b>Decoder sees</b><span>selected action, confirmed enums, confidence band</span></div><div className="lf-controls wrap"><button className="lf-button" disabled={!modelSummary || phase === "computing"} type="button" onClick={() => send("benchmark")}>Run five-way benchmark</button><button className="lf-button" disabled={!modelSummary} type="button" onClick={() => send("export-model")}>Export model</button><button className="lf-button" type="button" onClick={() => modelInput.current?.click()}>Import model</button><button className="lf-button" type="button" onClick={() => send("reset-model")}>Reset model</button><button className="lf-button" type="button" onClick={() => send("export-casebook")}>Export casebook</button><button className="lf-button" type="button" onClick={() => casebookInput.current?.click()}>Import casebook</button></div><input ref={modelInput} hidden type="file" accept="application/json,.json" onChange={event => void openFile(event, "model")} /><input ref={casebookInput} hidden type="file" accept="application/json,.json" onChange={event => void openFile(event, "casebook")} />
        {benchmark ? <BenchmarkPanel benchmark={benchmark} miniMindReady={Boolean(languageHealth?.ready)} /> : null}
      </div></section>
    <section className="lf-casebook page-width"><div className="lf-panel-head"><span>Casebook</span><strong>{casebook.length} filed</strong></div>{casebook.length ? casebook.map((entry, index) => <article key={String(entry.case.id) + "-" + String(index)}><b>{entry.case.title}</b><span>{entry.recommendation}</span></article>) : <p className="lf-muted">Filed cases appear here only when you choose to file them. Exports contain any text you entered.</p>}</section>
  </div>;
}
