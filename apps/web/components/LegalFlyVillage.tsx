"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

type Facts = Record<string, string>;
type LegalCase = { id: string; split: string; family: string; title: string; villager: string; prop: string; petition: string; facts: Facts; label?: string };
type Advice = { case: LegalCase; advice: { action: string; confidence: number; margin: number; reason: string }; recommendation: string; energy: number; sampledNodeIds: string[] };
type Action = [string, string];

const factFields = ["matter", "property", "harm", "proof", "intent", "relationship", "urgency", "ability"];
const options: Record<string, string[]> = {
  matter: ["damage", "debt", "property", "delivery", "boundary", "insult", "account", "charter", "official", "threat"],
  property: ["none", "crops", "animal", "tool", "goods", "payment", "money", "land", "document", "public place", "small item", "service", "clothing", "fence"],
  harm: ["none", "low", "moderate", "high"],
  proof: ["unclear", "witness", "admitted", "document"],
  intent: ["unclear", "careless", "deliberate", "unable"],
  relationship: ["neighbors", "trade", "official"],
  urgency: ["low", "ordinary", "high"],
  ability: ["able", "unable"]
};

const phaseCopy: Record<string, string> = {
  loading: "Loading the chamber",
  idle: "The fly has not read the ledger",
  "petitioner-approaching": "Calling a petitioner",
  "petition-ready": "Petition on the desk",
  computing: "Consulting the connectome",
  "advice-ready": "Advice ready",
  filing: "Filed in the casebook",
  errored: "Stopped"
};

const actionClass: Record<string, string> = {
  "let-rest": "seal-rest",
  "seek-small-reparation": "seal-small",
  "seek-full-reparation": "seal-full",
  "request-return": "seal-return",
  "find-witness": "seal-witness",
  "sworn-account": "seal-oath",
  "propose-settlement": "seal-settle",
  "refer-higher": "seal-refer",
  abstain: "seal-abstain"
};

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 800);
}

function ChamberArt({ cases, selected, phase, advice, reduced }: { cases: LegalCase[]; selected?: LegalCase; phase: string; advice: Advice | null; reduced: boolean }) {
  const villagers = cases.slice(0, 5);
  return <div className={`lf-chamber-art ${phase} ${reduced ? "motion-reduced" : ""}`} aria-hidden="true">
    <div className="lf-window"><span /></div>
    <div className="lf-beam beam-one" /><div className="lf-beam beam-two" />
    <div className="lf-shelves"><i /><i /><i /></div>
    <div className="lf-desk">
      <div className="paper-stack stack-left" /><div className="paper-stack stack-right" />
      <div className={`lf-petition ${phase === "petition-ready" || phase === "computing" || phase === "advice-ready" || phase === "filing" ? "is-visible" : ""}`}>
        <span>{selected?.title ?? "Petition"}</span>
      </div>
      <div className={`lf-quill ${phase === "computing" ? "is-writing" : ""}`} />
      <div className={`lf-seal ${actionClass[advice?.advice.action ?? "abstain"] ?? ""} ${phase === "advice-ready" || phase === "filing" ? "is-visible" : ""}`} />
      <div className="lf-fly"><span className="wing left" /><span className="wing right" /><span className="body" /><span className="antenna a" /><span className="antenna b" /></div>
    </div>
    <div className="lf-villagers">
      {villagers.map((c, index) => <div key={c.id} className={`lf-villager v${index} ${selected?.id === c.id ? "is-called" : ""}`}>
        <span className="head" /><span className="torso" /><span className="arm one" /><span className="arm two" /><span className="leg one" /><span className="leg two" /><span className="prop">{c.prop.slice(0, 1)}</span>
      </div>)}
    </div>
    <div className="lf-foreground"><span /><span /></div>
  </div>;
}

function NeuralInspection({ activity, active }: { activity: any; active: boolean }) {
  if (!activity) return <p className="lf-muted">No sampled activity yet. The inspection opens after a petition is heard.</p>;
  return <div className={`lf-neural ${active ? "is-live" : ""}`}>
    <svg viewBox="0 0 520 280" role="img" aria-label="Sampled MaleCNS activity">
      <path className="cord" d="M260 32 C220 80 220 138 260 170 C300 138 300 80 260 32 M260 168 C252 206 254 238 260 264" />
      {activity.values.slice(0, 90).map((v: number, i: number) => {
        const side = i % 2 ? 1 : -1, y = 28 + (i % 45) * 5.1, x = 260 + side * (24 + ((i * 29) % 190));
        return <circle key={activity.node_ids[i] ?? i} cx={x} cy={y} r={2 + Math.min(7, v * 16)} opacity={0.28 + Math.min(0.7, v * 8)} />;
      })}
    </svg>
    <p>Showing sampled activation values tied to real source neuron IDs. Computation uses the full loaded graph; this drawing is sampled and schematic.</p>
    <ol>{activity.node_ids.slice(0, 6).map((id: string, i: number) => <li key={id}>{id}: {(activity.values[i] ?? 0).toFixed(5)}</li>)}</ol>
  </div>;
}

export function LegalFlyVillage() {
  const worker = useRef<Worker | null>(null);
  const seq = useRef(0);
  const modelInput = useRef<HTMLInputElement>(null);
  const casebookInput = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState("loading");
  const [error, setError] = useState("");
  const [cases, setCases] = useState<LegalCase[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [custom, setCustom] = useState<LegalCase | null>(null);
  const [modelSummary, setModelSummary] = useState<any>(null);
  const [graph, setGraph] = useState<any>(null);
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [activity, setActivity] = useState<any>(null);
  const [casebook, setCasebook] = useState<any[]>([]);
  const [benchmark, setBenchmark] = useState<any>(null);
  const [progress, setProgress] = useState({ current: 0, total: 1, title: "" });
  const [reduced, setReduced] = useState(false);
  const [showLab, setShowLab] = useState(false);
  const [seed, setSeed] = useState(42);

  const selected = useMemo(() => custom && selectedId === "custom" ? custom : cases.find(c => c.id === selectedId) ?? cases[0], [cases, custom, selectedId]);
  const visibleCases = cases.slice(0, 5);
  const teachingCount = cases.filter(c => c.split === "teach").length;
  const heldoutCount = cases.filter(c => c.split === "holdout").length;

  const send = (type: string, payload: Record<string, unknown> = {}) => {
    setError("");
    worker.current?.postMessage({ id: ++seq.current, type, ...payload });
  };

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReduced(media.matches);
    updateMotion();
    media.addEventListener("change", updateMotion);
    let w: Worker | null = null;
    try {
      w = new Worker("/legalfly/worker.mjs", { type: "module" });
      worker.current = w;
    } catch {
      setPhase("errored");
      setError("This browser could not start the local worker. No petition text was sent anywhere.");
    }
    if (w) {
      w.onmessage = event => {
        const m = event.data;
        if (m.id && m.id !== seq.current && m.type !== "provenance") return;
        if (m.type === "status") setPhase(m.state);
        if (m.type === "error") { setError(m.message); setPhase("errored"); }
        if (m.type === "cases") { setCases(m.cases); setActions(m.actions); setSelectedId(m.cases[0]?.id ?? ""); }
        if (m.type === "loaded") setGraph(m.graph);
        if (m.type === "trained") setModelSummary(m.modelSummary);
        if (m.type === "progress") setProgress(m);
        if (m.type === "activity") setActivity(m.activity);
        if (m.type === "advice") setAdvice(m.result);
        if (m.type === "casebook") setCasebook(m.entries);
        if (m.type === "benchmark") setBenchmark(m);
        if (m.type === "download") download(m.name, m.content);
      };
      w.onerror = () => { setPhase("errored"); setError("The local worker stopped unexpectedly."); };
      send("load");
    }
    const visibility = () => { if (document.hidden) send("cancel"); };
    document.addEventListener("visibilitychange", visibility);
    return () => { document.removeEventListener("visibilitychange", visibility); media.removeEventListener("change", updateMotion); w?.terminate(); worker.current = null; };
  }, []);

  const callPetitioner = (c: LegalCase) => {
    setSelectedId(c.id); setAdvice(null); setActivity(null); setBenchmark(null); setPhase("petitioner-approaching");
    window.setTimeout(() => setPhase("petition-ready"), reduced ? 10 : 620);
  };
  const updateFact = (field: string, value: string) => selected && setCustom({ ...selected, id: "custom", split: "holdout", title: "Custom petition", villager: "A new petitioner", prop: selected.prop || "paper", facts: { ...selected.facts, [field]: value }, label: undefined });
  const hear = () => selected && send("hear", { case: custom && selectedId === "custom" ? custom : selected });
  const correct = (label: string) => send("correct", { label });
  const openFile = async (event: ChangeEvent<HTMLInputElement>, kind: "model" | "casebook") => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    try { const value = JSON.parse(await file.text()); send(kind === "model" ? "import-model" : "import-casebook", kind === "model" ? { model: value } : { casebook: value }); }
    catch { setError("That JSON file could not be read. Nothing was imported."); }
  };

  return <div className="lf-page">
    <section className="lf-hero page-width">
      <div>
        <p className="lf-product">The Legal Fly</p>
        <h1>Can a fruit fly make a good lawyer?</h1>
        <p className="lf-question">Can a fruit fly&apos;s brain learn to advise a village on it&apos;s legal matters?</p>
        <p className="lf-copy">Villagers bring ordinary trouble to a very small counsel. I turn only the structured facts into neural stimulation, run the fixed MaleCNS wiring in a worker, and train an artificial readout on a fictional charter.</p>
        <div className="lf-actions">
          <a className="lf-button primary" href="#docket">Bring a dispute</a>
          <button className="lf-button" type="button" onClick={() => setShowLab(v => !v)}>{showLab ? "Hide the apparatus" : "Inspect the apparatus"}</button>
        </div>
      </div>
      <ChamberArt cases={visibleCases} selected={selected} phase={phase} advice={advice} reduced={reduced} />
    </section>

    <section className="lf-work page-width" id="docket">
      <aside className="lf-docket" aria-label="Petitioner docket">
        <div className="lf-panel-head"><span>Docket</span><strong>{phaseCopy[phase] ?? phase}</strong></div>
        {visibleCases.map(c => <button key={c.id} className={selected?.id === c.id ? "is-selected" : ""} type="button" onClick={() => callPetitioner(c)}>
          <span>{c.villager}</span><b>{c.title}</b><small>{c.prop}</small>
        </button>)}
        <button type="button" onClick={() => selected && callPetitioner({ ...selected, id: "custom", title: "Custom petition", villager: "A new petitioner", split: "holdout", label: undefined })}>Write a custom petition</button>
      </aside>

      <section className="lf-petition-panel" aria-live="polite">
        <div className="lf-panel-head"><span>Petition</span><strong>{graph ? `${graph.neurons?.toLocaleString()} neurons` : "MaleCNS required"}</strong></div>
        {error ? <div className="lf-error" role="alert">{error}</div> : null}
        <h2>{selected?.title ?? "No petitioner selected"}</h2>
        <textarea aria-label="Narrative context. This does not directly reach the model." value={custom?.petition ?? selected?.petition ?? ""} onChange={e => selected && setCustom({ ...selected, id: "custom", split: "holdout", title: "Custom petition", villager: selected.villager, prop: selected.prop, petition: e.target.value, facts: selected.facts, label: undefined })} />
        <p className="lf-muted">Narrative text is for the village record. The fields below are what actually reach the model.</p>
        <div className="lf-facts">
          {factFields.map(field => <label key={field}>{field}<select value={(custom && selectedId === "custom" ? custom : selected)?.facts?.[field] ?? ""} onChange={e => updateFact(field, e.target.value)}>{options[field].map(v => <option key={v}>{v}</option>)}</select></label>)}
        </div>
        <div className="lf-controls">
          {!modelSummary ? <button className="lf-button primary" disabled={phase === "computing" || !graph} type="button" onClick={() => send("train", { seed })}>Teach the ledger</button> : <button className="lf-button primary" disabled={phase === "computing"} type="button" onClick={hear}>Hear the case</button>}
          {phase === "computing" ? <button className="lf-button" type="button" onClick={() => send("cancel")}>Cancel</button> : null}
          <label className="lf-seed">seed <input type="number" value={seed} onChange={e => setSeed(Number(e.target.value))} /></label>
        </div>
        {phase === "computing" ? <p className="lf-progress">{progress.current}/{progress.total} {progress.title}</p> : null}
      </section>

      <aside className="lf-advice">
        <div className="lf-panel-head"><span>Counsel&apos;s note</span><strong>{advice ? `${Math.round(advice.advice.confidence * 100)}%` : "abstains if unsure"}</strong></div>
        {advice ? <>
          <div className={`lf-result-seal ${actionClass[advice.advice.action] ?? "seal-abstain"}`} />
          <h2>{actions.find(([id]) => id === advice.advice.action)?.[1] ?? "Abstain."}</h2>
          <p>{advice.recommendation}</p>
          <p className="lf-muted">Supplied facts only. No hidden language model. No binding judgment, thankfully for everyone involved.</p>
          <div className="lf-controls slim">
            <button className="lf-button" type="button" onClick={() => send("file-case")}>File in casebook</button>
            <select aria-label="Correct recommendation" onChange={e => e.target.value && correct(e.target.value)} defaultValue=""><option value="">Correct the fly</option>{actions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
          </div>
        </> : <p className="lf-muted">The fly waits beside the papers. Train the ledger, call a petitioner, and ask for advice.</p>}
      </aside>
    </section>

    <section className={`lf-lab page-width ${showLab ? "is-open" : ""}`}>
      <div>
        <div className="lf-panel-head"><span>Neural inspection</span><strong>{activity ? "sampled live values" : "not a replay"}</strong></div>
        <NeuralInspection activity={activity} active={phase === "computing"} />
      </div>
      <div>
        <div className="lf-panel-head"><span>Method and controls</span><strong>{teachingCount} teach / {heldoutCount} held out</strong></div>
        <p>The charter is fictional. Labels teach eight recommendations. The biological graph stays fixed; only an artificial readout learns. Labels and expected answers never enter the neural input.</p>
        <div className="lf-controls wrap">
          <button className="lf-button" disabled={!modelSummary || phase === "computing"} type="button" onClick={() => send("benchmark")}>Run benchmark</button>
          <button className="lf-button" disabled={!modelSummary} type="button" onClick={() => send("export-model")}>Export model</button>
          <button className="lf-button" type="button" onClick={() => modelInput.current?.click()}>Import model</button>
          <button className="lf-button" type="button" onClick={() => send("reset-model")}>Reset model</button>
          <button className="lf-button" type="button" onClick={() => send("export-casebook")}>Export casebook</button>
          <button className="lf-button" type="button" onClick={() => casebookInput.current?.click()}>Import casebook</button>
        </div>
        <input ref={modelInput} hidden type="file" accept="application/json,.json" onChange={e => void openFile(e, "model")} />
        <input ref={casebookInput} hidden type="file" accept="application/json,.json" onChange={e => void openFile(e, "casebook")} />
        {benchmark ? <table className="lf-table"><caption>{benchmark.summary.correct}/{benchmark.summary.heldout} held-out exact matches, {benchmark.summary.abstentions} abstentions. {benchmark.summary.controls}</caption><tbody>{benchmark.rows.slice(0, 8).map((r: any) => <tr key={r.id}><td>{r.title}</td><td>{r.expected}</td><td>{r.biological}</td></tr>)}</tbody></table> : null}
      </div>
    </section>

    <section className="lf-casebook page-width">
      <div className="lf-panel-head"><span>Casebook</span><strong>{casebook.length} filed</strong></div>
      {casebook.length ? casebook.map((entry, i) => <article key={`${entry.case.id}-${i}`}><b>{entry.case.title}</b><span>{entry.recommendation}</span></article>) : <p className="lf-muted">Filed cases appear here only when you choose to file them. Exports contain any text you entered.</p>}
    </section>
  </div>;
}
