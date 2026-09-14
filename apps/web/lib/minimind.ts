export const MINIMIND_URL = process.env.NEXT_PUBLIC_MINIMIND_URL || "http://127.0.0.1:8123";

export const FACT_OPTIONS: Record<string, readonly string[]> = {
  matter: ["damage", "debt", "property", "delivery", "boundary", "insult", "account", "charter", "official", "threat"],
  property: ["none", "crops", "animal", "tool", "goods", "payment", "money", "land", "document", "public place", "small item", "service", "clothing", "fence"],
  harm: ["none", "low", "moderate", "high"],
  proof: ["unclear", "witness", "admitted", "document"],
  intent: ["unclear", "careless", "deliberate", "unable"],
  relationship: ["neighbors", "trade", "official"],
  urgency: ["low", "ordinary", "high"],
  ability: ["able", "unable"],
};

export type StructuredFacts = Record<keyof typeof FACT_OPTIONS, string>;
export type MiniMindHealth = { ready: boolean; model: string; model_revision: string; mode: string; load_seconds: number | null };
export type MiniMindDraft = {
  facts: StructuredFacts;
  field_confidence: Record<string, number>;
  receipt: { answer_labels_available: false; requires_confirmation: true; input: string[]; output: string[] };
};
export type MiniMindNote = { text: string; action: string; selection_confidence: number; receipt: { alternative_actions_available: false; output_mode: string } };

function assertFacts(value: unknown): StructuredFacts {
  if (!value || typeof value !== "object") throw new Error("MiniMind returned no structured facts.");
  const source = value as Record<string, unknown>, facts = {} as StructuredFacts;
  for (const [field, choices] of Object.entries(FACT_OPTIONS)) {
    const selected = source[field];
    if (typeof selected !== "string" || !choices.includes(selected)) throw new Error(`MiniMind returned an unsupported ${field} value.`);
    facts[field] = selected;
  }
  if (Object.keys(source).length !== Object.keys(FACT_OPTIONS).length) throw new Error("MiniMind returned undeclared fields.");
  return facts;
}

async function request<T>(path: string, init?: RequestInit, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${MINIMIND_URL}${path}`, { ...init, signal, headers: { "content-type": "application/json", ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail || `MiniMind adapter returned ${response.status}.`);
  }
  return response.json();
}

export async function checkMiniMind(signal?: AbortSignal): Promise<MiniMindHealth> {
  return request<MiniMindHealth>("/health", undefined, signal);
}

export async function encodePetition(petition: string, signal?: AbortSignal): Promise<MiniMindDraft> {
  const value = await request<MiniMindDraft>("/encode", { method: "POST", body: JSON.stringify({ petition }) }, signal);
  value.facts = assertFacts(value.facts);
  if (value.receipt?.answer_labels_available !== false || value.receipt?.requires_confirmation !== true) throw new Error("MiniMind did not return the required boundary receipt.");
  return value;
}

export async function verbalizeAdvice(facts: StructuredFacts, action: string, confidence: number, signal?: AbortSignal): Promise<MiniMindNote> {
  const confidence_band = confidence < 0.4 ? "low" : confidence < 0.7 ? "medium" : "high";
  const value = await request<MiniMindNote>("/verbalize", { method: "POST", body: JSON.stringify({ facts: assertFacts(facts), action, confidence_band }) }, signal);
  if (value.action !== action || value.receipt?.alternative_actions_available !== false) throw new Error("MiniMind attempted to alter the fly action.");
  return value;
}

export async function benchmarkMiniMind(cases: Array<{ id: string; petition: string }>, signal?: AbortSignal) {
  return request<{ rows: Array<{ id: string; action: string; confidence: number }>; model_revision: string }>("/benchmark-control", { method: "POST", body: JSON.stringify({ cases }) }, signal);
}
