"use client";

import { useMemo, useState } from "react";
import {
  classifyText,
  sendFeedback,
  type ClassifyResponse,
} from "@/lib/api";
import { ConnectomeViz } from "@/components/ConnectomeViz";
import { ActivityCharts } from "@/components/ActivityCharts";

const STAGES = [
  "ENCODING THE SPECIMEN",
  "STIMULATING EXCISED TISSUE",
  "READING RESERVOIR RESIDUE",
  "RENDERING THE VERDICT",
] as const;

type Stage = (typeof STAGES)[number] | null;

export function ClassifierPanel({ defaultModel = "connectome" }: { defaultModel?: string }) {
  const [text, setText] = useState("");
  const [stage, setStage] = useState<Stage>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClassifyResponse | null>(null);
  const [feedback, setFeedback] = useState<"yes" | "no" | null>(null);

  const confidence = useMemo(() => {
    if (!result?.labels?.length) return 0;
    return Math.round(Math.max(...result.labels.map((l) => l.confidence)) * 100);
  }, [result]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    setResult(null);
    if (!text.trim()) {
      setError("Offer the apparatus some text.");
      return;
    }
    setLoading(true);
    try {
      for (const s of STAGES.slice(0, 3)) {
        setStage(s);
        await new Promise((r) => setTimeout(r, 280));
      }
      const response = await classifyText(text, defaultModel, true);
      setStage(STAGES[3]);
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Classification failed");
    } finally {
      setLoading(false);
      setTimeout(() => setStage(null), 400);
    }
  }

  async function onFeedback(correct: boolean) {
    if (!result) return;
    setFeedback(correct ? "yes" : "no");
    try {
      await sendFeedback({
        correct,
        model: result.model,
        predicted_labels: result.labels.map((l) => l.name),
      });
    } catch {
      // non-blocking
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="animate-rise">
        <form onSubmit={onSubmit} className="border border-ink/15 bg-paper/80 p-5 shadow-soft md:p-6">
          <label className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink/50">
            Offer a passage to the reanimated wiring
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            className="mt-3 w-full resize-y border border-ink/20 bg-white/70 p-3 text-base outline-none ring-blood/30 focus:ring-2"
            placeholder="My email is alex@example.com"
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={loading}
              className="bg-ink px-5 py-3 font-mono text-xs uppercase tracking-[0.18em] text-paper transition hover:bg-blood disabled:opacity-60"
            >
              {loading ? "The tissue is working…" : "Let the stolen brain read it"}
            </button>
            <p className="text-xs text-ink/55">Your text is not saved by default. We keep the corpse, not your secrets.</p>
          </div>
          {stage ? (
            <p className="mt-4 font-mono text-xs uppercase tracking-[0.22em] text-blood animate-pulseSoft">
              {stage}
            </p>
          ) : null}
          {error ? (
            <p className="mt-4 border border-accent/30 bg-accentsoft px-3 py-2 text-sm text-accent" role="alert">
              {error}
            </p>
          ) : null}
        </form>

        {result ? (
          <div className="mt-6 border border-ink/15 bg-white/70 p-5 animate-rise md:p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink/50">
              The tissue has rendered its verdict
            </p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              {result.contains_sensitive
                ? "Sensitive information detected"
                : "No sensitive information detected"}
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {result.labels.map((label) => (
                <span
                  key={label.name}
                  className="border border-ink/15 bg-mist px-3 py-1 font-mono text-xs uppercase tracking-wider"
                >
                  {label.name} · {Math.round(label.confidence * 100)}%
                </span>
              ))}
            </div>
            <p className="mt-4 text-sm text-ink/70">
              Confidence {confidence}% · model <span className="font-mono">{result.graph_label}</span> ·{" "}
              {(result.inference_time_sec * 1000).toFixed(0)} ms
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className="text-sm text-ink/60">Was the stolen wiring right?</span>
              <button
                type="button"
                onClick={() => onFeedback(true)}
                className={`border px-3 py-1.5 font-mono text-xs uppercase tracking-wider ${
                  feedback === "yes" ? "border-signal bg-signal text-white" : "border-ink/20"
                }`}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => onFeedback(false)}
                className={`border px-3 py-1.5 font-mono text-xs uppercase tracking-wider ${
                  feedback === "no" ? "border-accent bg-accent text-white" : "border-ink/20"
                }`}
              >
                No
              </button>
            </div>
            <p className="mt-4 text-xs text-ink/50">{result.disclaimer}</p>
          </div>
        ) : null}
      </div>

      <div className="space-y-4 animate-rise" style={{ animationDelay: "80ms" }}>
        <ConnectomeViz simulation={result?.simulation} playing={Boolean(result)} heightClass="h-[320px] md:h-[420px]" title="Stolen tissue firing" />
        <ActivityCharts simulation={result?.simulation} />
      </div>
    </div>
  );
}