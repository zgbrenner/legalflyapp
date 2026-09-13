export const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "");
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
export const MAX_TEXT_CHARS = 4000;
export type LabelScore = { name: string; confidence: number };
export type Simulation = { indices?: number[]; node_ids?: string[]; in_degrees?: number[]; out_degrees?: number[]; total_neurons?: number; total_edges?: number; graph_hash?: string; positions?: number[][]; regions?: string[]; final_activity?: number[]; trajectory?: number[][]; edges?: number[][]; input_indices_local?: number[]; aggregate?: { mean_abs?: number; max_abs?: number; input_mean_abs?: number; region_activity?: Record<string, number> }; timesteps?: number; layout?: string; anatomical?: boolean; sampled_activity?: unknown[] };
export type ClassifyResponse = { contains_sensitive: boolean; labels: LabelScore[]; scores: Record<string, number>; model: string; demo_mode: boolean; connectome_mode?: string; graph_label: string; graph_source?: string | null; anatomical_edges?: boolean; inference_time_sec: number; simulation: Simulation; disclaimer: string; encoder_name?: string; graph_hash?: string; artifact_hash?: string; training_examples?: number; science_version?: string };
export type TwinResponse = { tissue: ClassifyResponse; twin: ClassifyResponse; baseline?: ClassifyResponse; agree_on_sensitive: boolean; disclaimer: string };
export type RecordedTwin = { text: string; recorded_at: string; result: TwinResponse };
async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 25000): Promise<T> {
  if (!API_URL) throw new Error("The live model is not connected. You can still inspect the recorded experiment and published results.");
  const controller = new AbortController(); let timedOut = false;
  const abort = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  init.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(`${API_URL}${path}`, { ...init, signal: controller.signal, cache: "no-store" });
    if (!response.ok) {
      const messages: Record<number, string> = { 413: "This passage is too long.", 422: "Enter a passage of 1 to 4,000 characters.", 429: "Too many requests. Please try again shortly.", 503: "The model is starting. Please try again shortly." };
      throw new Error(messages[response.status] || "The live model could not finish this request. Please retry.");
    }
    return await response.json() as T;
  } catch (error) {
    if (timedOut) throw new Error("The model took too long to respond. Please retry.");
    if (controller.signal.aborted) throw new DOMException("Request cancelled", "AbortError");
    if (error instanceof TypeError) throw new Error("The live model is unreachable. Recorded playback is not a new prediction.");
    throw error;
  } finally { clearTimeout(timer); init.signal?.removeEventListener("abort", abort); }
}
export function classifyText(text: string, model = "connectome", withSimulation = true) { return request<ClassifyResponse>("/classify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, model, with_simulation: withSimulation }) }); }
export function classifyTwin(text: string, withSimulation = true, signal?: AbortSignal) { return request<TwinResponse>("/twin", { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, with_simulation: withSimulation }) }); }
export async function fetchBenchmark() {
  try { const result=await request<Record<string, any>>("/benchmark", {}, 6000); if(result.science_version!=="2.0-directed-controls"||result.status!=="measured") throw new Error("Legacy result"); return result; }
  catch { const response = await fetch("/research/comparison_v2.json"); if (!response.ok) throw new Error("Corrected benchmark results are not available on this deployment yet."); return { ...await response.json(), delivery: "bundled_results" }; }
}
export async function fetchAblations() {
  try { const result=await request<Record<string, any>>("/ablations", {}, 6000); if(result.science_version!=="2.0-directed-controls"||result.status!=="measured") throw new Error("Legacy result"); return result; }
  catch { const response = await fetch("/research/ablation_v2.json"); if (!response.ok) throw new Error("Corrected ablation results are not available on this deployment yet."); return { ...await response.json(), delivery: "bundled_results" }; }
}
export async function recordedTwin(): Promise<RecordedTwin> { const response = await fetch("/research/specimen.json"); if (!response.ok) throw new Error("No recorded specimen is available."); return response.json(); }
export function sendFeedback(payload: { correct: boolean; model: string; predicted_labels: string[] }) { return request("/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); }
