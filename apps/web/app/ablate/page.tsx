"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchAblations } from "@/lib/api";

type Ablation = {
  ablation: string;
  kind?: string;
  region?: string | null;
  macro_f1: number;
  binary_accuracy: number;
  delta_macro_f1: number;
  delta_binary_accuracy: number;
  original_macro_f1: number;
  original_binary_accuracy: number;
};

export default function AblatePage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    fetchAblations()
      .then((payload) => {
        setData(payload);
        if (payload.ablations?.length) setSelected(payload.ablations[0].ablation);
      })
      .catch((e) => setError(e.message));
  }, []);

  const current: Ablation | undefined = useMemo(
    () => data?.ablations?.find((a: Ablation) => a.ablation === selected),
    [data, selected],
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">Destroy the Brain</p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight md:text-5xl">
        Ablate, then measure
      </h1>
      <p className="mt-4 max-w-3xl text-ink/70">
        Playful name, serious controls. We remove neurons, scramble weights, or disable regions,
        then recompute readout performance from precomputed research artifacts — not a full
        browser-side retrain of a giant connectome.
      </p>

      {error ? <p className="mt-6 text-sm text-accent">{error}</p> : null}

      {!data ? (
        <p className="mt-8 text-ink/50">Loading ablation artifacts…</p>
      ) : data.status === "not_yet_measured" ? (
        <p className="mt-8 border border-ink/15 bg-mist/50 p-4 text-sm">
          Not yet measured. Run <code className="font-mono">make ablate</code> to generate results.
        </p>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="border border-ink/15 bg-paper/80 p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink/50">
              Choose an ablation
            </p>
            <ul className="mt-3 space-y-2">
              {(data.ablations as Ablation[]).map((item) => (
                <li key={item.ablation}>
                  <button
                    type="button"
                    onClick={() => setSelected(item.ablation)}
                    className={`w-full border px-3 py-2 text-left text-sm transition ${
                      selected === item.ablation
                        ? "border-accent bg-accentsoft"
                        : "border-ink/10 hover:border-ink/30"
                    }`}
                  >
                    {item.ablation}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {current ? (
            <div className="border border-ink/15 bg-white/70 p-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink/50">Impact</p>
              <h2 className="mt-2 font-display text-3xl font-semibold">{current.ablation}</h2>
              {current.region ? (
                <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-blood">
                  ROI · {current.region}
                </p>
              ) : current.kind ? (
                <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-ink/50">
                  {current.kind}
                </p>
              ) : null}
              <dl className="mt-6 grid gap-4 sm:grid-cols-3">
                <div>
                  <dt className="text-xs uppercase tracking-wider text-ink/50">Original accuracy</dt>
                  <dd className="mt-1 font-display text-3xl">
                    {(current.original_binary_accuracy * 100).toFixed(1)}%
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-ink/50">After ablation</dt>
                  <dd className="mt-1 font-display text-3xl">
                    {(current.binary_accuracy * 100).toFixed(1)}%
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-ink/50">Delta</dt>
                  <dd className="mt-1 font-display text-3xl text-accent">
                    {(current.delta_binary_accuracy * 100).toFixed(1)} pts
                  </dd>
                </div>
              </dl>
              <p className="mt-6 text-sm text-ink/65">
                Macro F1: {current.original_macro_f1.toFixed(3)} → {current.macro_f1.toFixed(3)} (
                {current.delta_macro_f1 >= 0 ? "+" : ""}
                {current.delta_macro_f1.toFixed(3)})
              </p>
              <p className="mt-4 text-xs text-ink/50">{data.note}</p>
              {Array.isArray(data.regions) && data.regions.length ? (
                <p className="mt-2 text-xs text-ink/45">
                  Live ROIs in this tissue: {data.regions.join(", ")}
                </p>
              ) : null}
              {data.dataset ? (
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink/40">
                  Dataset · {data.dataset} · encoder · {data.encoder ?? "n/a"}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}