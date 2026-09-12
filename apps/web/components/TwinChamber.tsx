"use client";

import { useMemo, useState } from "react";
import { classifyTwin, type ClassifyResponse, type TwinResponse } from "@/lib/api";
import { ConnectomeViz } from "@/components/ConnectomeViz";

const EXAMPLES = [
  "CONFIDENTIAL — ATTORNEY'S EYES ONLY. Buried in ¶14 of the engagement letter, the only authorized recipient is jordan.chen41@corp.example. Nothing herein waives privilege.",
  "WITHOUT WAIVING ANY OBJECTION: DO NOT CIRCULATE SSN 412-88-2910 outside the encrypted channel.",
  "Call Section 555 of the statute before filing the motion in limine.",
  "Attorney-client privilege is asserted as to the highlighted passages; no identifiers appear herein.",
];

function Side({
  title,
  subtitle,
  result,
  accent,
}: {
  title: string;
  subtitle: string;
  result: ClassifyResponse | null;
  accent: "blood" | "ink";
}) {
  const top = result?.labels?.[0];
  const border =
    accent === "blood" ? "border-blood/35 bg-blood/[0.04]" : "border-ink/20 bg-white/55";
  return (
    <div className={`border ${border} p-4 md:p-5`}>
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">{title}</p>
      <p className="mt-1 text-xs text-ink/55">{subtitle}</p>
      {result ? (
        <>
          <h3 className="mt-4 font-display text-2xl font-semibold tracking-tight md:text-3xl">
            {result.contains_sensitive ? "Sensitive residue" : "Clean passage"}
          </h3>
          <p className="mt-2 font-mono text-sm text-ink/70">
            {(top?.name ?? (result.contains_sensitive ? "SENSITIVE" : "NONE")) +
              (top ? ` · ${Math.round(top.confidence * 100)}%` : "")}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {result.labels.slice(0, 4).map((label) => (
              <span
                key={label.name}
                className="border border-ink/15 bg-mist/70 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider"
              >
                {label.name}
              </span>
            ))}
          </div>
          <div className="mt-4 overflow-hidden border border-ink/10 bg-ink/[0.03]">
            <ConnectomeViz
              simulation={result.simulation}
              playing={Boolean(result)}
              title={`${title} firing`}
              className="h-full"
              heightClass="h-[320px] md:h-[420px]"
            />
          </div>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-ink/45">
            {result.graph_label} · {(result.inference_time_sec * 1000).toFixed(0)} ms
          </p>
        </>
      ) : (
        <p className="mt-10 text-sm text-ink/45">Awaiting stimulation…</p>
      )}
    </div>
  );
}

export function TwinChamber() {
  const [text, setText] = useState(EXAMPLES[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<TwinResponse | null>(null);

  const verdict = useMemo(() => {
    if (!payload) return null;
    if (payload.agree_on_sensitive) {
      return "The corpse and its random twin agree on the sensitive bit.";
    }
    return "The stolen tissue and the scrambled twin disagree — topology mattered on this specimen.";
  }, [payload]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPayload(null);
    if (!text.trim()) {
      setError("Offer both chambers a passage.");
      return;
    }
    setLoading(true);
    try {
      const response = await classifyTwin(text, true);
      setPayload(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Twin stimulation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-rise">
      <form onSubmit={onSubmit} className="border border-ink/15 bg-paper/85 p-5 shadow-soft md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-blood">
              Twin chamber
            </p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight md:text-4xl">
              Real tissue vs random twin
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setText(example)}
                className="max-w-[14rem] truncate border border-ink/15 px-2 py-1 text-left text-[11px] text-ink/65 hover:border-blood/40 hover:text-blood"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="mt-5 w-full resize-y border border-ink/20 bg-white/70 p-3 text-base outline-none ring-blood/30 focus:ring-2"
          placeholder="Feed both chambers the same legal passage…"
        />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="bg-ink px-5 py-3 font-mono text-xs uppercase tracking-[0.18em] text-paper transition hover:bg-blood disabled:opacity-60"
          >
            {loading ? "Stimulating both corpses…" : "Stimulate tissue + twin"}
          </button>
          <p className="text-xs text-ink/55">
            Same encoder. Different graph. Text not saved by default.
          </p>
        </div>
        {error ? (
          <p className="mt-4 border border-accent/30 bg-accentsoft px-3 py-2 text-sm text-accent" role="alert">
            {error}
          </p>
        ) : null}
      </form>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Side
          title="Real tissue"
          subtitle="Hemibrain / demo biological reservoir"
          result={payload?.tissue ?? null}
          accent="blood"
        />
        <Side
          title="Random twin"
          subtitle="Matched random Erdos–Renyi corpse"
          result={payload?.twin ?? null}
          accent="ink"
        />
      </div>

      {payload ? (
        <div className="mt-5 border border-ink/15 bg-white/70 p-4 md:p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink/50">Verdict</p>
          <p className="mt-2 font-display text-xl font-semibold tracking-tight md:text-2xl">
            {verdict}
          </p>
          <p className="mt-3 text-xs text-ink/50">{payload.disclaimer}</p>
        </div>
      ) : null}
    </div>
  );
}
