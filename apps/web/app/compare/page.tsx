"use client";

import { useState } from "react";
import { classifyText, type ClassifyResponse } from "@/lib/api";
import { ConnectomeViz } from "@/components/ConnectomeViz";

export default function ComparePage() {
  const [text, setText] = useState("Please email the draft to alex@example.com and call 555-123-4567.");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [real, setReal] = useState<ClassifyResponse | null>(null);
  const [random, setRandom] = useState<ClassifyResponse | null>(null);

  async function onCompare(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setReal(null);
    setRandom(null);
    try {
      const [a, b] = await Promise.all([
        classifyText(text, "connectome", true),
        classifyText(text, "random_erdos", true),
      ]);
      setReal(a);
      setRandom(b);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Compare failed");
    } finally {
      setLoading(false);
    }
  }

  function Panel({
    title,
    result,
  }: {
    title: string;
    result: ClassifyResponse | null;
  }) {
    const top = result?.labels?.[0];
    return (
      <div className="border border-ink/15 bg-paper/80 p-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink/50">{title}</p>
        {result ? (
          <>
            <h3 className="mt-2 font-display text-2xl font-semibold">
              {top?.name ?? (result.contains_sensitive ? "SENSITIVE" : "NONE")}
            </h3>
            <p className="mt-1 font-mono text-sm text-ink/65">
              {top ? `${Math.round(top.confidence * 100)}%` : "—"}
            </p>
            <div className="mt-4">
              <ConnectomeViz simulation={result.simulation} title={`${title} activity`} />
            </div>
          </>
        ) : (
          <p className="mt-6 text-sm text-ink/45">Awaiting stimulation…</p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">Compare brains</p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight md:text-5xl">
        Real fly vs. random fly
      </h1>
      <p className="mt-4 max-w-3xl text-ink/70">
        Same text, same encoder, same readout family — different graph topology. Outputs are live
        model inferences, not staged demo strings.
      </p>

      <form onSubmit={onCompare} className="mt-8 border border-ink/15 bg-white/70 p-5">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="w-full border border-ink/20 bg-paper/80 p-3 outline-none ring-accent/30 focus:ring-2"
        />
        <button
          type="submit"
          disabled={loading}
          className="mt-4 bg-ink px-5 py-3 font-mono text-xs uppercase tracking-[0.18em] text-paper hover:bg-accent disabled:opacity-60"
        >
          {loading ? "Comparing…" : "Stimulate both"}
        </button>
        <p className="mt-3 text-xs text-ink/50">Submitted text is not saved by default.</p>
        {error ? <p className="mt-3 text-sm text-accent">{error}</p> : null}
      </form>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Panel title="Real connectome" result={real} />
        <Panel title="Randomized connectome" result={random} />
      </div>
    </div>
  );
}