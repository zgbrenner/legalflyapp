"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ErrorBar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchBenchmark } from "@/lib/api";

type ModelRow = {
  macro_f1_mean?: number;
  macro_f1_std?: number;
  macro_f1_ci95_approx?: number;
  binary_sensitive_f1_mean?: number;
  trainable_params?: number;
  reservoir_size?: number | null;
  edge_count?: number | null;
  n_runs?: number;
  status?: string;
};

const ORDER = [
  "connectome",
  "random_erdos",
  "random_degree_preserving",
  "random_weights",
  "linear",
  "mlp",
];

const LABELS: Record<string, string> = {
  connectome: "Fly Connectome (demo)",
  random_erdos: "Random Reservoir",
  random_degree_preserving: "Degree-Controlled",
  random_weights: "Random Weights",
  linear: "Linear Baseline",
  mlp: "MLP Baseline",
};

export default function BenchmarkPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBenchmark()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  const models: Record<string, ModelRow> = data?.models ?? {};
  const chartData = ORDER.filter((k) => models[k]).map((key) => ({
    name: LABELS[key] ?? key,
    f1: models[key].macro_f1_mean ?? 0,
    err: models[key].macro_f1_ci95_approx ?? models[key].macro_f1_std ?? 0,
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">Benchmark</p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight md:text-5xl">
        Measured results
      </h1>
      <p className="mt-4 max-w-3xl text-ink/70">
        The point is not leaderboard chasing. The central question is whether biological topology
        differs from controlled random graphs under matched capacity. Values below are loaded from
        experiment JSON — never fabricated.
      </p>

      {error ? (
        <p className="mt-6 border border-accent/30 bg-accentsoft p-3 text-sm text-accent">{error}</p>
      ) : null}

      {!data ? (
        <p className="mt-8 text-ink/50">Loading benchmark artifacts…</p>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-4 font-mono text-xs uppercase tracking-wider text-ink/55">
            <span>Status: {data.status}</span>
            <span>Seeds: {(data.seeds ?? []).join(", ") || "—"}</span>
            <span>N seeds: {data.n_seeds ?? "—"}</span>
          </div>

          <div className="mt-8 overflow-x-auto border border-ink/15 bg-paper/80">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-ink/10 bg-mist/60 font-mono text-[11px] uppercase tracking-wider text-ink/60">
                <tr>
                  <th className="px-4 py-3">Model</th>
                  <th className="px-4 py-3">Macro F1</th>
                  <th className="px-4 py-3">Binary F1</th>
                  <th className="px-4 py-3">Trainable params</th>
                  <th className="px-4 py-3">Nodes / edges</th>
                </tr>
              </thead>
              <tbody>
                {ORDER.map((key) => {
                  const row = models[key];
                  if (!row) return null;
                  if (row.status === "Not yet measured" || row.macro_f1_mean == null) {
                    return (
                      <tr key={key} className="border-b border-ink/5">
                        <td className="px-4 py-3 font-medium">{LABELS[key]}</td>
                        <td className="px-4 py-3 text-ink/45" colSpan={4}>
                          Not yet measured
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={key} className="border-b border-ink/5">
                      <td className="px-4 py-3 font-medium">{LABELS[key]}</td>
                      <td className="px-4 py-3 font-mono">
                        {row.macro_f1_mean.toFixed(3)}
                        {row.macro_f1_std != null ? ` ± ${row.macro_f1_std.toFixed(3)}` : ""}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {row.binary_sensitive_f1_mean?.toFixed(3) ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono">{row.trainable_params ?? "—"}</td>
                      <td className="px-4 py-3 font-mono">
                        {row.reservoir_size ?? "—"} / {row.edge_count ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-8 border border-ink/15 bg-white/60 p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink/50">
              Macro F1 with approx. 95% CI whiskers
            </p>
            <div className="mt-3 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,18,16,0.08)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-18} textAnchor="end" height={70} />
                  <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="f1" fill="#c45c26" radius={[2, 2, 0, 0]}>
                    <ErrorBar dataKey="err" width={4} stroke="#0f1210" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="prose-narrow mt-10 space-y-3 text-sm text-ink/70">
            <p>
              <strong className="font-medium text-ink">Measured result:</strong> values come from
              `results/comparison_latest.json` produced by `python -m research.experiments.compare`.
            </p>
            <p>
              <strong className="font-medium text-ink">Hypothesis:</strong> biological wiring may
              provide useful inductive bias versus random controls matched for size.
            </p>
            <p>
              <strong className="font-medium text-ink">Do not overclaim:</strong> if the linear
              baseline wins on this synthetic task, say so. Demo graphs are not anatomical fly brains.
            </p>
            <p>{data.interpretation}</p>
          </div>
        </>
      )}
    </div>
  );
}