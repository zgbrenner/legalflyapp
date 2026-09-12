"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Simulation } from "@/lib/api";

export function ActivityCharts({ simulation }: { simulation?: Simulation | null }) {
  const region = simulation?.aggregate?.region_activity ?? {};
  const regionData = Object.entries(region).map(([name, value]) => ({
    name: name.replaceAll("_", " "),
    value: Number(value),
  }));

  const summary = [
    { name: "Reservoir", value: simulation?.aggregate?.mean_abs ?? 0 },
    { name: "Input", value: simulation?.aggregate?.input_mean_abs ?? 0 },
    { name: "Peak", value: simulation?.aggregate?.max_abs ?? 0 },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="border border-ink/15 bg-paper/70 p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink/50">
          Aggregate activation
        </p>
        <div className="mt-3 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={summary}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,18,16,0.08)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#c45c26" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="border border-ink/15 bg-paper/70 p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink/50">
          Region activity
        </p>
        <div className="mt-3 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={regionData} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,18,16,0.08)" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#1f6f5b" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}