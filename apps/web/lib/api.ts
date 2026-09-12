export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8000";

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

export type LabelScore = {
  name: string;
  confidence: number;
};

export type Simulation = {
  indices?: number[];
  positions?: number[][];
  regions?: string[];
  final_activity?: number[];
  trajectory?: number[][];
  aggregate?: {
    mean_abs?: number;
    max_abs?: number;
    input_mean_abs?: number;
    region_activity?: Record<string, number>;
  };
  timesteps?: number;
  layout?: string;
  anatomical?: boolean;
  sampled_activity?: unknown[];
};

export type ClassifyResponse = {
  contains_sensitive: boolean;
  labels: LabelScore[];
  scores: Record<string, number>;
  model: string;
  demo_mode: boolean;
  connectome_mode?: string;
  graph_label: string;
  graph_source?: string | null;
  anatomical_edges?: boolean;
  inference_time_sec: number;
  simulation: Simulation;
  disclaimer: string;
};

export async function classifyText(
  text: string,
  model = "connectome",
  withSimulation = true,
): Promise<ClassifyResponse> {
  const res = await fetch(`${API_URL}/classify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, model, with_simulation: withSimulation }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `API error ${res.status}`);
  }
  return res.json();
}

export async function fetchBenchmark() {
  const res = await fetch(`${API_URL}/benchmark`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load benchmark");
  return res.json();
}

export async function fetchAblations() {
  const res = await fetch(`${API_URL}/ablations`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load ablations");
  return res.json();
}

export async function sendFeedback(payload: {
  correct: boolean;
  model: string;
  predicted_labels: string[];
}) {
  const res = await fetch(`${API_URL}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Feedback failed");
  return res.json();
}