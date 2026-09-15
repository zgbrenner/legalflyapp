"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import Image from "next/image";
import { FACT_OPTIONS, type MiniMindDraft, type MiniMindNote, type StructuredFacts } from "@/lib/minimind";
import { MiniMindBrowserClient, type MiniMindBrowserState } from "@/lib/minimind-browser";
import { MaleCNSMap, type MaleCNSFrame } from "./MaleCNSMap";

type LegalCase = { id: string; split: string; family: string; title: string; villager: string; prop: string; petition: string; facts: StructuredFacts; label?: string };
type Advice = { case: LegalCase; advice: { action: string; confidence: number; margin: number; reason: string }; recommendation: string; energy: number; sampledNodeIds: string[] };
type Action = [string, string];
type LanguageTask = "idle" | "encoding" | "verbalizing" | "benchmarking";

const INITIAL_MINIMIND_STATE: MiniMindBrowserState = {
  phase: "available",
  source: null,
  backend: null,
  progress: null,
  message: "MiniMind is optional and has not been enabled.",
};

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

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

function MiniMindSetup({ state, manualFacts, onEnable, onCancel, onManual }: {
  state: MiniMindBrowserState;
  manualFacts: boolean;
  onEnable: () => void;
  onCancel: () => void;
  onManual: () => void;
}) {
  if (state.phase === "ready") {
    return <p className="lf-minimind-ready" role="status">MiniMind ready · runs on this device</p>;
  }

  const busy = ["downloading", "verifying", "cached", "loading"].includes(state.phase);
  const canRetry = state.phase === "failed" || state.phase === "unsupported";
  const progress = state.progress;
  let status = "MiniMind has not been downloaded.";
  if (state.phase === "downloading") status = "Downloading MiniMind to this browser.";
  if (state.phase === "verifying") status = "Download complete. Checking the saved files.";
  if (state.phase === "cached") status = "Found saved MiniMind files. Checking them on this device.";
  if (state.phase === "loading") status = state.message.includes("graphics") ? "Starting MiniMind with this device's graphics engine." : "Starting MiniMind with the browser compatibility engine.";
  if (canRetry) status = "MiniMind could not start here. You can retry, keep using manual facts, or try a current Chrome, Edge, or another Chromium browser.";

  return <section className={`lf-minimind-setup ${manualFacts ? "is-manual" : ""}`} aria-labelledby="minimind-setup-title">
    <div className="lf-minimind-copy">
      <p className="lf-eyebrow">Optional language helper</p>
      <h3 id="minimind-setup-title">Let MiniMind suggest the eight fact choices</h3>
      {!manualFacts ? <p>Download it once and it runs only in this browser. Your petition stays on this device. You will review every suggestion before the fly sees it.</p> : <p><strong>Using manual facts.</strong> MiniMind remains optional, and you can enable it later.</p>}
      {state.phase !== "available" || manualFacts ? <p className="lf-minimind-status" role="status">{status}</p> : null}
      {progress && state.phase === "downloading" ? <div className="lf-minimind-progress">
        <progress aria-label="MiniMind download progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.percent)} max={100} value={progress.percent}>{progress.percent}%</progress>
        <span>{Math.round(progress.percent)}% · {formatBytes(progress.loaded)} of {formatBytes(progress.total)}</span>
      </div> : null}
    </div>
    <div className="lf-controls slim lf-minimind-actions">
      {state.phase === "available" || canRetry ? <button className="lf-button primary" type="button" onClick={onEnable}>{canRetry ? "Retry MiniMind" : "Enable MiniMind"}</button> : null}
      {state.phase === "downloading" ? <button className="lf-button" type="button" onClick={onCancel}>Cancel download</button> : null}
      <button className="lf-button" type="button" onClick={onManual}>{manualFacts ? "Keep using manual facts" : "Continue with manual facts"}</button>
    </div>
    {busy ? <small>You can fill in the facts manually while this finishes.</small> : null}
  </section>;
}

function ChamberGuide({ currentStep, complete }: { currentStep: number; complete: Set<number> }) {
  const steps = [
    ["Choose how to fill the facts", "Enable the optional browser helper, or continue manually."],
    ["Teach the fly", "Select “Teach the ledger” so the fly can learn from the fictional examples."],
    ["Prepare the petition", "Choose or write a petition, review all eight facts, then confirm them."],
    ["Ask the fly", "Select “Hear the case” to get the fly's recommendation."],
  ];
  return <ol className="lf-step-guide page-width" aria-label="Chamber steps">
    {steps.map(([title, copy], index) => {
      const step = index + 1;
      return <li key={title} className={step === currentStep ? "is-current" : complete.has(step) ? "is-complete" : ""} aria-current={step === currentStep ? "step" : undefined}>
        <span aria-hidden="true">{step}</span><div><strong>{title}</strong><small>{copy}</small></div>
      </li>;
    })}
  </ol>;
}

function ChamberArt({ cases, selected, phase, advice, reduced, activity }: { cases: LegalCase[]; selected?: LegalCase; phase: string; advice: Advice | null; reduced: boolean; activity: MaleCNSFrame | null }) {
  const called = Math.max(0, cases.findIndex(item => item.id === selected?.id));
  const peak = activity ? Math.max(0, ...activity.points.filter(point => point.active).map(point => point.magnitude)) : 0;
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
    <div className={`lf-fly ${phase === "computing" ? "has-activity" : ""}`} style={{ "--brain-strength": Math.min(1, peak * 4) } as CSSProperties}>
      <Image src="/art/legalfly/fly-counsel.webp" width={1000} height={667} alt="" priority />
      <span className="lf-painted-brain" />
    </div>
    <div className="lf-scene-caption"><span>Chamber</span><strong>{phaseCopy[phase] ?? phase}</strong></div>
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
      <b>MiniMind alone:</b> {benchmark.summary.minimindCorrect == null ? (miniMindReady ? "not run" : "unavailable") : String(benchmark.summary.minimindCorrect) + "/" + String(benchmark.summary.heldout)}. {" "}
      <b>Rules:</b> {benchmark.summary.rulesCorrect}/{benchmark.summary.heldout}. {" "}
      <b>Shuffled:</b> {benchmark.summary.shuffledCorrect == null ? "not prepared" : String(benchmark.summary.shuffledCorrect) + "/" + String(benchmark.summary.heldout)}.
    </p>
    <div className="lf-table-wrap"><table className="lf-table">
      <thead><tr><th>Case</th><th>Expected</th><th>Fly + clerk</th><th>MiniMind alone</th><th>Facts only</th><th>Shuffled</th><th>Rules</th></tr></thead>
      <tbody>{benchmark.rows.map((row: any) => <tr key={row.id}><td>{row.title}</td><td>{row.expected}</td><td>{row.biological}</td><td>{row.minimind ?? (miniMindReady ? "not run" : "unavailable")}</td><td>{row.factsOnly}</td><td>{row.shuffled ?? "not run"}</td><td>{row.rules}</td></tr>)}</tbody>
    </table></div>
    <small>Fly + clerk is scored on the fly action before verbalization. MiniMind alone is independent. {benchmark.summary.controls}</small>
  </div>;
}

export function LegalFlyVillage() {
  const worker = useRef<Worker | null>(null), seq = useRef(0), workerBusy = useRef(false), approachTimer = useRef<number | null>(null), languageOp = useRef(0), languageReady = useRef(false);
  const miniMindClient = useRef<MiniMindBrowserClient | null>(null);
  const modelInput = useRef<HTMLInputElement>(null), casebookInput = useRef<HTMLInputElement>(null);
  const [operationPhase, setPhase] = useState("idle"), [error, setError] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "errored">("loading");
  const graphReady = useRef(false);
  const operationKind = useRef("");
  const phase = loadState === "ready" ? operationPhase : loadState;
  const [anatomy, setAnatomy] = useState<MaleCNSFrame | null>(null);
  const [loadProgress, setLoadProgress] = useState({ current: 0, total: 1, title: "Loading and verifying the full MaleCNS graph" });
  const [cases, setCases] = useState<LegalCase[]>([]), [actions, setActions] = useState<Action[]>([]), [selectedId, setSelectedId] = useState("");
  const [custom, setCustom] = useState<LegalCase | null>(null), [modelSummary, setModelSummary] = useState<any>(null), [graph, setGraph] = useState<any>(null);
  const [advice, setAdvice] = useState<Advice | null>(null), [activity, setActivity] = useState<MaleCNSFrame | null>(null), [casebook, setCasebook] = useState<any[]>([]), [benchmark, setBenchmark] = useState<any>(null);
  const [progress, setProgress] = useState({ current: 0, total: 1, title: "" }), [reduced, setReduced] = useState(false), [showLab, setShowLab] = useState(true), [seed, setSeed] = useState(42);
  const [miniMindState, setMiniMindState] = useState<MiniMindBrowserState>(INITIAL_MINIMIND_STATE), [languageTask, setLanguageTask] = useState<LanguageTask>("idle"), [languageError, setLanguageError] = useState("");
  const [manualFacts, setManualFacts] = useState(false), [factsConfirmed, setFactsConfirmed] = useState(false);
  const [factDraft, setFactDraft] = useState<MiniMindDraft | null>(null), [miniNote, setMiniNote] = useState<MiniMindNote | null>(null);

  const selected = useMemo(() => custom && selectedId === "custom" ? custom : cases.find(item => item.id === selectedId) ?? cases[0], [cases, custom, selectedId]);
  const visibleCases = cases.slice(0, 5), teachingCount = cases.filter(item => item.split === "teach").length, heldoutCount = cases.filter(item => item.split === "holdout").length;
  const narrative = custom && selectedId === "custom" ? custom.petition : selected?.petition ?? "";
  const mapFrame = activity ?? anatomy;
  const setupComplete = manualFacts || miniMindState.phase === "ready";
  const currentStep = !setupComplete ? 1 : !modelSummary ? 2 : !factsConfirmed ? 3 : 4;
  const completedSteps = new Set<number>();
  if (setupComplete) completedSteps.add(1);
  if (modelSummary) completedSteps.add(2);
  if (factsConfirmed) completedSteps.add(3);
  if (advice) completedSteps.add(4);

  const send = (type: string, payload: Record<string, unknown> = {}) => {
    if (type !== "load" && !graphReady.current) return;
    if (["train", "hear", "correct", "benchmark"].includes(type)) {
      if (approachTimer.current) clearTimeout(approachTimer.current);
      operationKind.current = type;
      setProgress({ current: 0, total: type === "train" ? teachingCount : 1, title: type === "train" ? "Teaching the ledger" : "Starting computation" });
      workerBusy.current = true; setPhase("computing");
    }
    if (type === "cancel") workerBusy.current = false;
    setError(""); worker.current?.postMessage({ id: ++seq.current, type, ...payload });
  };
  const enableMiniMind = async () => {
    setLanguageError(""); setManualFacts(false);
    try { await miniMindClient.current?.enable(); }
    catch (caught) { setLanguageError(caught instanceof Error ? caught.message : "MiniMind could not be enabled. Retry or continue with manual facts."); }
  };
  const cancelMiniMind = async () => {
    setLanguageError("");
    try { await miniMindClient.current?.cancelDownload(); }
    catch (caught) { setLanguageError(caught instanceof Error ? caught.message : "The MiniMind download could not be canceled."); }
  };
  const renderWithMiniMind = async (result: Advice) => {
    if (!languageReady.current || !miniMindClient.current) return;
    const operation = ++languageOp.current; setLanguageTask("verbalizing"); setLanguageError("");
    try { const note = await miniMindClient.current.verbalizeAdvice(result.case.facts, result.advice.action, result.advice.confidence); if (operation === languageOp.current) { setMiniNote(note); setLanguageTask("idle"); } }
    catch (caught) { if (operation === languageOp.current) { setLanguageTask("idle"); setLanguageError(caught instanceof Error ? caught.message : "MiniMind could not render the note. The authored note is still shown."); } }
  };
  const addMiniMindControl = async (result: any) => {
    if (!languageReady.current || !miniMindClient.current) return;
    const operation = ++languageOp.current; setLanguageTask("benchmarking");
    try {
      const control = await miniMindClient.current.benchmarkMiniMind(result.rows.map((row: any) => ({ id: row.id, petition: row.petition })));
      if (operation !== languageOp.current) return;
      const byId = new Map(control.rows.map(row => [row.id, row]));
      const rows = result.rows.map((row: any) => ({ ...row, minimind: byId.get(row.id)?.action ?? null }));
      const minimindCorrect = rows.filter((row: any) => row.minimind === row.expected).length;
      setBenchmark({ ...result, rows, summary: { ...result.summary, minimindCorrect }, minimindRevision: control.model_revision }); setLanguageTask("idle");
    } catch (caught) { if (operation === languageOp.current) { setLanguageTask("idle"); setLanguageError(caught instanceof Error ? caught.message : "The MiniMind benchmark could not run."); } }
  };

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)"), updateMotion = () => setReduced(media.matches);
    updateMotion(); media.addEventListener("change", updateMotion);
    let browserMiniMind: MiniMindBrowserClient | null = null;
    let unsubscribeMiniMind: () => void = () => {};
    try {
      browserMiniMind = new MiniMindBrowserClient();
      miniMindClient.current = browserMiniMind;
      unsubscribeMiniMind = browserMiniMind.subscribe(state => {
        languageReady.current = state.phase === "ready";
        setMiniMindState(state);
        if (state.phase === "ready") setLanguageError("");
      });
    } catch {
      languageReady.current = false;
      setMiniMindState({ phase: "unsupported", source: null, backend: null, progress: null, message: "This browser could not start MiniMind." });
    }
    let activeWorker: Worker | null = null;
    try { activeWorker = new Worker("/legalfly/worker.mjs", { type: "module" }); worker.current = activeWorker; }
    catch { setLoadState("errored"); setError("This browser could not start the local worker. No petition text was sent anywhere."); }
    if (activeWorker) {
      activeWorker.onmessage = event => {
        const message = event.data;
        if (message.id && message.id !== seq.current && message.type !== "provenance") return;
        if (message.type === "status") { if (message.state !== "computing") workerBusy.current = false; setPhase(message.state); }
        if (message.type === "error") { workerBusy.current = false; if (!graphReady.current) setLoadState("errored"); setError(message.message); setPhase("errored"); }
        if (message.type === "cases") { setCases(message.cases); setActions(message.actions); setSelectedId(message.cases[0]?.id ?? ""); }
        if (message.type === "loaded") { graphReady.current = true; setGraph(message.graph); setLoadState("ready"); }
        if (message.type === "load-progress") setLoadProgress(message);
        if (message.type === "trained") setModelSummary(message.modelSummary);
        if (message.type === "model-reset") { setModelSummary(null); setAdvice(null); setMiniNote(null); setActivity(null); }
        if (message.type === "progress") setProgress(message);
        if (message.type === "activity") {
          if (message.activity.kind === "anatomy") { setAnatomy(message.activity); setActivity(null); }
          else { setActivity(message.activity); if (operationKind.current === "hear") setProgress({ current: message.activity.step, total: message.activity.total_steps, title: "full MaleCNS update" }); }
        }
        if (message.type === "advice") { setAdvice(message.result); setMiniNote(null); void renderWithMiniMind(message.result); }
        if (message.type === "casebook") setCasebook(message.entries);
        if (message.type === "benchmark") { setBenchmark(message); void addMiniMindControl(message); }
        if (message.type === "download") download(message.name, message.content);
      };
      activeWorker.onerror = () => { workerBusy.current = false; graphReady.current = false; setLoadState("errored"); setError("The local worker stopped unexpectedly."); };
      send("load");
    }
    const visibility = () => { if (document.hidden && workerBusy.current) send("cancel"); };
    document.addEventListener("visibilitychange", visibility);
    return () => { if (approachTimer.current) clearTimeout(approachTimer.current); document.removeEventListener("visibilitychange", visibility); media.removeEventListener("change", updateMotion); unsubscribeMiniMind(); void browserMiniMind?.dispose(); miniMindClient.current = null; activeWorker?.terminate(); worker.current = null; };
  // The graph worker and browser-only MiniMind worker are intentionally initialized once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const callPetitioner = (item: LegalCase) => {
    if (approachTimer.current) clearTimeout(approachTimer.current);
    if (workerBusy.current) send("cancel", { silent: true });
    if (item.id === "custom") setCustom(item);
    // Case changes invalidate inference work, but not the browser model itself.
    languageOp.current++; setLanguageTask("idle");
    setSelectedId(item.id); setAdvice(null); setMiniNote(null); setFactDraft(null); setActivity(null); setBenchmark(null);
    setFactsConfirmed(false);
    if (!graphReady.current) return;
    setPhase("petitioner-approaching");
    approachTimer.current = window.setTimeout(() => setPhase("petition-ready"), reduced ? 10 : 850);
  };
  const updateNarrative = (value: string) => selected && callPetitioner({ ...selected, id: "custom", split: "holdout", title: "Custom petition", petition: value, label: undefined });
  const updateFact = (field: string, value: string) => selected && callPetitioner({ ...selected, id: "custom", split: "holdout", title: "Custom petition", facts: { ...selected.facts, [field]: value }, label: undefined });
  const draftFacts = async () => {
    if (!miniMindClient.current) return;
    const operation = ++languageOp.current; setLanguageTask("encoding"); setLanguageError(""); setFactDraft(null);
    try { const value = await miniMindClient.current.encodePetition(narrative); if (operation === languageOp.current) { setFactDraft(value); setLanguageTask("idle"); } }
    catch (caught) { if (operation === languageOp.current) { setLanguageTask("idle"); setLanguageError(caught instanceof Error ? caught.message : "MiniMind could not suggest facts. You can fill them in manually."); } }
  };
  const acceptDraft = () => { if (selected && factDraft) { setCustom({ ...selected, id: "custom", split: "holdout", title: "Custom petition", petition: narrative, facts: factDraft.facts, label: undefined }); setSelectedId("custom"); setFactDraft(null); setFactsConfirmed(true); } };
  const hear = () => { if (selected) { setShowLab(true); send("hear", { case: custom && selectedId === "custom" ? custom : selected }); } };
  const openFile = async (event: ChangeEvent<HTMLInputElement>, kind: "model" | "casebook") => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    try { const value = JSON.parse(await file.text()); send(kind === "model" ? "import-model" : "import-casebook", kind === "model" ? { model: value } : { casebook: value }); }
    catch { setError("That JSON file could not be read. Nothing was imported."); }
  };

  return <div className="lf-page">
    <section className="lf-hero page-width">
      <ChamberArt cases={visibleCases} selected={selected} phase={phase} advice={advice} reduced={reduced} activity={activity} />
      <div className="lf-hero-copy"><p className="lf-question">Can a fruit fly&apos;s brain learn to advise a village on its legal matters?</p><h1>The Legal Fly</h1><p className="lf-tagline">Can a fruit fly make a good lawyer?</p><p>Villagers bring ordinary trouble to a very small counsel. The counsel recommends a next step. It does not judge.</p><div className="lf-actions"><a className="lf-button primary" href="#docket">Bring a dispute</a><a className="lf-button inverse" href="#method" onClick={() => setShowLab(true)}>Inspect the brain</a></div></div>
    </section>
    <section className="lf-process page-width" aria-label="Experiment boundary"><span>Petition</span><i>MiniMind clerk</i><span>Confirmed facts</span><i>MaleCNS</i><span>Fly action</span><i>MiniMind clerk</i><span>Counsel&apos;s note</span></section>
    <ChamberGuide currentStep={currentStep} complete={completedSteps} />

    <section className="lf-work page-width" id="docket">
      <aside className="lf-docket" aria-label="Petitioner docket"><div className="lf-panel-head"><span>Today&apos;s docket</span><strong>{phaseCopy[phase] ?? phase}</strong></div>{visibleCases.map(item => <button key={item.id} className={selected?.id === item.id ? "is-selected" : ""} type="button" onClick={() => callPetitioner(item)}><span>{item.villager}</span><b>{item.title}</b><small>{item.prop}</small></button>)}<button type="button" onClick={() => selected && callPetitioner({ ...selected, id: "custom", title: "Custom petition", villager: "A new petitioner", split: "holdout", label: undefined })}><span>New petitioner</span><b>Write a custom petition</b><small>blank paper</small></button></aside>
      <section className="lf-petition-panel" aria-live="polite">
        <div className="lf-panel-head"><span>Petition on the desk</span><strong>{graph ? `${graph.neurons?.toLocaleString()} neurons loaded` : "MaleCNS required"}</strong></div>{error ? <div className="lf-error" role="alert">{error}{loadState === "errored" ? <><p>Reloading restarts the worker and discards unsaved chamber changes.</p><button className="lf-button" type="button" onClick={() => window.location.reload()}>Reload chamber</button></> : null}</div> : null}<h2>{selected?.title ?? "No petitioner selected"}</h2>
        <textarea aria-label="Petition narrative" value={narrative} onChange={event => updateNarrative(event.target.value)} />
        <MiniMindSetup state={miniMindState} manualFacts={manualFacts} onEnable={() => void enableMiniMind()} onCancel={() => void cancelMiniMind()} onManual={() => setManualFacts(true)} />
        {miniMindState.phase === "ready" ? <div className="lf-clerk-line"><p><strong>Optional fact suggestions</strong><span>MiniMind reads the petition only inside this browser. You still confirm every field.</span></p><button className="lf-text-button" disabled={languageTask !== "idle" || !narrative.trim()} type="button" onClick={() => void draftFacts()}>{languageTask === "encoding" ? "Reading petition" : "Draft facts with MiniMind"}</button></div> : null}
        {languageError ? <p className="lf-language-error" role="status">{languageError}</p> : null}{factDraft ? <LanguageReceipt draft={factDraft} onAccept={acceptDraft} onDismiss={() => setFactDraft(null)} /> : null}<p className="lf-muted">Only the eight confirmed choices below reach the fly. The petition text does not.</p>
        <div className="lf-facts">{factFields.map(field => <label key={field}>{field}<select value={(custom && selectedId === "custom" ? custom : selected)?.facts?.[field] ?? ""} onChange={event => updateFact(field, event.target.value)}>{FACT_OPTIONS[field].map(value => <option key={value}>{value}</option>)}</select></label>)}</div>
        {modelSummary ? <div className={`lf-fact-confirmation ${factsConfirmed ? "is-confirmed" : ""}`} role="status"><p>{factsConfirmed ? "All eight facts are confirmed. The fly can use these choices." : "Confirm all eight choices before the fly can use them."}</p><button className={`lf-button ${factsConfirmed ? "" : "primary"}`} type="button" onClick={() => setFactsConfirmed(true)}>{factsConfirmed ? "Facts confirmed" : "Confirm these eight facts"}</button></div> : null}
        <div className="lf-controls lf-petition-controls">{!modelSummary ? <button className="lf-button primary" disabled={phase === "computing" || loadState !== "ready"} type="button" onClick={() => send("train", { seed })}>Teach the ledger</button> : <button className="lf-button primary" disabled={!factsConfirmed || phase === "computing" || loadState !== "ready"} aria-describedby={!factsConfirmed ? "hear-case-help" : undefined} type="button" onClick={hear}>Hear the case</button>}{phase === "computing" ? <button className="lf-button" type="button" onClick={() => send("cancel")}>Cancel</button> : null}<label className="lf-seed">seed <input type="number" value={seed} onChange={event => setSeed(Number(event.target.value))} /></label><button className="lf-button" type="button" aria-expanded={showLab} aria-controls="method" onClick={() => setShowLab(value => !value)}>{showLab ? "Hide brain visualization" : "Show brain visualization"}</button></div>{!modelSummary && loadState === "ready" ? <p className="lf-control-help">Select <strong>Teach the ledger</strong> to train the fly&apos;s readout from the fictional examples.</p> : null}{modelSummary && !factsConfirmed ? <p className="lf-control-help" id="hear-case-help">Review the eight choices and select <strong>Confirm these eight facts</strong> before hearing the case.</p> : null}{loadState === "loading" ? <p className="lf-progress" role="status">{loadProgress.title}: {Math.round(100 * loadProgress.current / Math.max(1, loadProgress.total))}%</p> : null}{phase === "computing" ? <p className="lf-progress">{progress.current}/{progress.total} {progress.title}</p> : null}
      </section>
      <aside className="lf-advice"><div className="lf-panel-head"><span>Counsel&apos;s note</span><strong>{advice ? `${Math.round(advice.advice.confidence * 100)}% readout confidence` : "abstains if unsure"}</strong></div>{advice ? <><div className={`lf-result-seal ${actionClass[advice.advice.action] ?? "seal-abstain"}`} /><h2>{actions.find(([id]) => id === advice.advice.action)?.[1] ?? "Abstain."}</h2><p>{miniNote?.text ?? advice.recommendation}</p><div className="lf-boundary-note"><span>{miniNote ? "MiniMind rendering" : "Authored fallback"}</span><p>{miniNote ? "The decoder received the selected action and confirmed facts. Alternative actions were withheld." : "The action came from the fly readout. No language model changed it."}</p></div><div className="lf-controls slim"><button className="lf-button" type="button" onClick={() => send("file-case")}>File in casebook</button><select aria-label="Correct recommendation" onChange={event => event.target.value && send("correct", { label: event.target.value })} defaultValue=""><option value="">Correct the fly</option>{actions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></div></> : <p className="lf-muted">The fly waits beside the papers. Teach the ledger, call a petitioner, and ask for advice.</p>}</aside>
    </section>

    <section className={`lf-lab page-width ${showLab ? "is-open" : ""}`} id="method" aria-label="Brain visualization and controls" hidden={!showLab}><div><div className="lf-panel-head"><span>Counsel&apos;s nervous system</span><strong>{activity ? (phase === "computing" ? "live worker frame" : "last computation stopped") : anatomy ? "released anatomy only: no computation" : "waiting for verified anatomy"}</strong></div>{showLab && mapFrame ? <MaleCNSMap frame={mapFrame} active={Boolean(activity) && phase === "computing"} /> : <div className="lf-map-empty"><Image src="/art/legalfly/fly-counsel.webp" width={1000} height={667} alt="The fruit-fly counsel on the office papers" /><p>The released soma map will appear after the full graph and anatomy are verified. No synthetic neurons or decorative activity are substituted.</p></div>}</div><div><div className="lf-panel-head"><span>Method and controls</span><strong>{teachingCount} teach / {heldoutCount} held out</strong></div><p>MiniMind proposes visible fields and renders a fixed fly action. The biological graph stays fixed. Only the artificial readout learns. Labels, benchmark IDs, and MiniMind hidden states never enter the connectome.</p><div className="lf-contract"><b>Encoder sees</b><span>petition text, field name, allowed field values</span><b>Fly sees</b><span>eight confirmed enums</span><b>Decoder sees</b><span>selected action, confirmed enums, confidence band</span></div><div className="lf-controls wrap"><button className="lf-button" disabled={!modelSummary || phase === "computing"} type="button" onClick={() => send("benchmark")}>Run five-way benchmark</button><button className="lf-button" disabled={!modelSummary} type="button" onClick={() => send("export-model")}>Export model</button><button className="lf-button" type="button" onClick={() => modelInput.current?.click()}>Import model</button><button className="lf-button" type="button" onClick={() => send("reset-model")}>Reset model</button><button className="lf-button" type="button" onClick={() => send("export-casebook")}>Export casebook</button><button className="lf-button" type="button" onClick={() => casebookInput.current?.click()}>Import casebook</button></div><input ref={modelInput} hidden type="file" accept="application/json,.json" onChange={event => void openFile(event, "model")} /><input ref={casebookInput} hidden type="file" accept="application/json,.json" onChange={event => void openFile(event, "casebook")} />
        {benchmark ? <BenchmarkPanel benchmark={benchmark} miniMindReady={miniMindState.phase === "ready"} /> : null}
      </div></section>
    <section className="lf-casebook page-width"><div className="lf-panel-head"><span>Casebook</span><strong>{casebook.length} filed</strong></div>{casebook.length ? casebook.map((entry, index) => <article key={String(entry.case.id) + "-" + String(index)}><b>{entry.case.title}</b><span>{entry.recommendation}</span></article>) : <p className="lf-muted">Filed cases appear here only when you choose to file them. Exports contain any text you entered.</p>}</section>
  </div>;
}
