const MODEL_ID = "jingyaogong/minimind-3";
const MODEL_REVISION = "f92512d4cd6142fa9acc0d6022375049a8974bf6";
const isLoopback = (hostname: string) => ["localhost", "127.0.0.1", "[::1]"].includes(hostname);

export type MiniMindStatus = "not-configured" | "invalid-configuration" | "unreachable" | "invalid-response" | "not-ready" | "ready";

export function getMiniMindConfiguration(): { url: string | null; status: "configured" | "not-configured" | "invalid-configuration"; message: string } {
  const configured = process.env.NEXT_PUBLIC_MINIMIND_URL?.trim();
  const localPage = typeof location !== "undefined" && isLoopback(location.hostname);
  if (!configured && !localPage) return { url: null, status: "not-configured", message: "Local MiniMind is not configured for this hosted page. The web host does not run the model. Manual facts remain available." };
  try {
    const url = new URL(configured || "http://127.0.0.1:8123");
    if (!["http:", "https:"].includes(url.protocol) || !isLoopback(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("unsafe endpoint");
    return { url: url.origin, status: "configured", message: "Requests go directly to the visitor's loopback MiniMind adapter, never through the web host." };
  } catch {
    return { url: null, status: "invalid-configuration", message: "MiniMind requires an absolute HTTP(S) loopback origin without credentials, path, query or fragment. External petition transmission is disabled." };
  }
}

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
export type MiniMindHealth = { ready: boolean; model: string; model_revision: string; mode: string; load_seconds: number | null; status: MiniMindStatus; message: string };
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
  const config = getMiniMindConfiguration();
  if (!config.url) throw new Error(config.message);
  const response = await fetch(`${config.url}${path}`, { ...init, signal, redirect: "error", credentials: "omit", cache: "no-store", headers: { "content-type": "application/json", ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail || `MiniMind adapter returned ${response.status}.`);
  }
  return response.json();
}

export async function checkMiniMind(signal?: AbortSignal): Promise<MiniMindHealth> {
  const unavailable = (status: MiniMindStatus, message: string): MiniMindHealth => ({ ready: false, status, message, model: "", model_revision: "", mode: "unavailable", load_seconds: null });
  const config = getMiniMindConfiguration();
  if (config.status !== "configured") return unavailable(config.status, config.message);
  let response: Response;
  try {
    response = await fetch(`${config.url}/health`, { signal: signal ?? AbortSignal.timeout(6000), redirect: "error", credentials: "omit", cache: "no-store" });
  } catch {
    return unavailable("unreachable", "The browser cannot reach local MiniMind. Check the process, exact CORS origin and browser local-network permissions; this does not establish whether a checkpoint is installed.");
  }
  if (!response.ok) return unavailable("not-ready", `MiniMind health returned HTTP ${response.status}. Check adapter startup logs and checkpoint setup.`);
  const value = await response.json().catch(() => null);
  if (!value || typeof value.ready !== "boolean" || value.model !== MODEL_ID || value.model_revision !== MODEL_REVISION || !["candidate-likelihood", "frozen-embedding-readouts"].includes(value.mode) || !(value.load_seconds === null || (typeof value.load_seconds === "number" && Number.isFinite(value.load_seconds) && value.load_seconds >= 0))) {
    return unavailable("invalid-response", "The endpoint did not return the pinned MiniMind adapter health contract.");
  }
  return { ...value, status: value.ready ? "ready" : "not-ready", message: value.ready ? "Local MiniMind reports ready." : "The adapter is reachable but its model is not ready. Check adapter logs and checkpoint setup." };
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
