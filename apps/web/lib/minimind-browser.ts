import { FACT_OPTIONS, type MiniMindDraft, type MiniMindNote, type StructuredFacts } from "@/lib/minimind";

export type MiniMindBrowserPhase =
  | "available"
  | "downloading"
  | "verifying"
  | "cached"
  | "loading"
  | "ready"
  | "unsupported"
  | "failed";

export type MiniMindBackend = "webgpu" | "wasm";
export type MiniMindSource = "cache" | "download";

export type MiniMindProgress = {
  loaded: number;
  total: number;
  percent: number;
  file: string | null;
};

export type MiniMindBrowserState = {
  phase: MiniMindBrowserPhase;
  source: MiniMindSource | null;
  backend: MiniMindBackend | null;
  progress: MiniMindProgress | null;
  message: string;
};

export type MiniMindBenchmark = {
  rows: Array<{ id: string; action: string; confidence: number }>;
  model_revision: string;
};

export interface WorkerLike extends EventTarget {
  postMessage(message: unknown): void;
  terminate(): void;
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

const PHASES = new Set<MiniMindBrowserPhase>([
  "available",
  "downloading",
  "verifying",
  "cached",
  "loading",
  "ready",
  "unsupported",
  "failed",
]);
const BACKENDS = new Set<MiniMindBackend>(["webgpu", "wasm"]);
const SOURCES = new Set<MiniMindSource>(["cache", "download"]);
const BENCHMARK_ACTIONS = new Set([
  "let-rest",
  "seek-small-reparation",
  "seek-full-reparation",
  "request-return",
  "find-witness",
  "sworn-account",
  "propose-settlement",
  "refer-higher",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseState(value: unknown): MiniMindBrowserState {
  if (!isObject(value) || !PHASES.has(value.phase as MiniMindBrowserPhase)) {
    throw new Error("MiniMind worker returned an invalid state.");
  }
  const source = value.source;
  const backend = value.backend;
  const progress = value.progress;
  if (!(source === null || SOURCES.has(source as MiniMindSource))) {
    throw new Error("MiniMind worker returned an invalid source.");
  }
  if (!(backend === null || BACKENDS.has(backend as MiniMindBackend))) {
    throw new Error("MiniMind worker returned an invalid backend.");
  }
  let parsedProgress: MiniMindProgress | null = null;
  if (progress !== null) {
    if (
      !isObject(progress)
      || !Number.isSafeInteger(progress.loaded)
      || !Number.isSafeInteger(progress.total)
      || typeof progress.percent !== "number"
      || !Number.isFinite(progress.percent)
      || !(progress.file === null || typeof progress.file === "string")
    ) {
      throw new Error("MiniMind worker returned invalid progress.");
    }
    parsedProgress = progress as MiniMindProgress;
  }
  if (typeof value.message !== "string") {
    throw new Error("MiniMind worker returned an invalid message.");
  }
  return {
    phase: value.phase as MiniMindBrowserPhase,
    source: source as MiniMindSource | null,
    backend: backend as MiniMindBackend | null,
    progress: parsedProgress,
    message: value.message,
  };
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function parseFacts(value: unknown): StructuredFacts {
  const fields = Object.keys(FACT_OPTIONS);
  if (!isObject(value) || !exactKeys(value, fields)) throw new Error("MiniMind returned invalid facts.");
  const facts = {} as StructuredFacts;
  for (const [field, options] of Object.entries(FACT_OPTIONS)) {
    const selected = value[field];
    if (typeof selected !== "string" || !options.includes(selected)) throw new Error(`MiniMind returned an unsupported ${field} value.`);
    facts[field] = selected;
  }
  return facts;
}

function parseDraft(value: unknown): MiniMindDraft {
  if (!isObject(value) || !exactKeys(value, ["facts", "field_confidence", "receipt"]) || !isObject(value.field_confidence) || !isObject(value.receipt)) {
    throw new Error("MiniMind returned an invalid fact draft.");
  }
  const fields = Object.keys(FACT_OPTIONS);
  if (!exactKeys(value.field_confidence, fields)) throw new Error("MiniMind returned invalid fact confidence.");
  for (const confidence of Object.values(value.field_confidence)) {
    if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error("MiniMind returned invalid fact confidence.");
  }
  if (
    !exactKeys(value.receipt, ["input", "output", "answer_labels_available", "requires_confirmation", "mode"])
    || value.receipt.answer_labels_available !== false
    || value.receipt.requires_confirmation !== true
    || !Array.isArray(value.receipt.input)
    || value.receipt.input.length !== 1
    || value.receipt.input[0] !== "petition"
    || !Array.isArray(value.receipt.output)
    || value.receipt.output.length !== fields.length
    || value.receipt.output.some((field, index) => field !== fields[index])
    || typeof value.receipt.mode !== "string"
  ) {
    throw new Error("MiniMind returned an invalid boundary receipt.");
  }
  return {
    facts: parseFacts(value.facts),
    field_confidence: value.field_confidence as Record<string, number>,
    receipt: value.receipt as MiniMindDraft["receipt"],
  };
}

function parseNote(value: unknown, expectedAction: string): MiniMindNote {
  if (
    !isObject(value)
    || !exactKeys(value, ["text", "action", "selection_confidence", "receipt"])
    || typeof value.text !== "string"
    || !value.text
    || value.action !== expectedAction
    || typeof value.selection_confidence !== "number"
    || !Number.isFinite(value.selection_confidence)
    || value.selection_confidence < 0
    || value.selection_confidence > 1
    || !isObject(value.receipt)
    || !exactKeys(value.receipt, ["input", "alternative_actions_available", "output_mode"])
    || value.receipt.alternative_actions_available !== false
    || !Array.isArray(value.receipt.input)
    || value.receipt.input.join(",") !== "selected_action,confirmed_facts,confidence_band"
    || value.receipt.output_mode !== "allow-listed sentence selection"
  ) {
    throw new Error("MiniMind returned an invalid or altered fly action.");
  }
  return value as MiniMindNote;
}

function parseBenchmark(value: unknown): MiniMindBenchmark {
  if (!isObject(value) || !exactKeys(value, ["rows", "model_revision"]) || value.model_revision !== "f92512d4cd6142fa9acc0d6022375049a8974bf6" || !Array.isArray(value.rows)) {
    throw new Error("MiniMind returned an invalid benchmark.");
  }
  const rows = value.rows.map((row) => {
    if (
      !isObject(row)
      || !exactKeys(row, ["id", "action", "confidence"])
      || typeof row.id !== "string"
      || !row.id
      || typeof row.action !== "string"
      || !BENCHMARK_ACTIONS.has(row.action)
      || typeof row.confidence !== "number"
      || !Number.isFinite(row.confidence)
      || row.confidence < 0
      || row.confidence > 1
    ) {
      throw new Error("MiniMind returned an invalid benchmark row.");
    }
    return { id: row.id, action: row.action, confidence: row.confidence };
  });
  return { rows, model_revision: value.model_revision };
}

function defaultWorkerFactory(): WorkerLike {
  return new Worker(new URL("../workers/minimind.worker.ts", import.meta.url), {
    type: "module",
    name: "legalfly-minimind",
  });
}

export class MiniMindBrowserClient {
  private readonly worker: WorkerLike;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Set<(state: MiniMindBrowserState) => void>();
  private nextId = 1;
  private disposed = false;
  private state: MiniMindBrowserState = {
    phase: "available",
    source: null,
    backend: null,
    progress: null,
    message: "MiniMind is optional and has not been enabled.",
  };

  constructor(workerFactory: () => WorkerLike = defaultWorkerFactory) {
    this.worker = workerFactory();
    this.worker.addEventListener("message", this.onMessage);
    this.worker.addEventListener("error", this.onWorkerError);
    this.worker.addEventListener("messageerror", this.onWorkerError);
  }

  getState(): MiniMindBrowserState {
    return this.state;
  }

  subscribe(listener: (state: MiniMindBrowserState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  enable(): Promise<void> {
    return this.request({ type: "enable" }).then(() => undefined);
  }

  cancelDownload(): Promise<void> {
    return this.request({ type: "cancel" }).then(() => undefined);
  }

  encodePetition(petition: string): Promise<MiniMindDraft> {
    return this.request({ type: "encode", petition }).then(parseDraft);
  }

  verbalizeAdvice(
    facts: StructuredFacts,
    action: string,
    confidence: number,
  ): Promise<MiniMindNote> {
    const confidenceBand = confidence < 0.4 ? "low" : confidence < 0.7 ? "medium" : "high";
    return this.request({ type: "verbalize", facts, action, confidenceBand }).then((value) => parseNote(value, action));
  }

  benchmarkMiniMind(cases: Array<{ id: string; petition: string }>): Promise<MiniMindBenchmark> {
    return this.request({ type: "benchmark", cases }).then(parseBenchmark);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    try {
      await this.request({ type: "dispose" });
    } catch {
      // Terminating the dedicated worker still releases its isolated runtime.
    } finally {
      this.disposed = true;
      this.worker.removeEventListener("message", this.onMessage);
      this.worker.removeEventListener("error", this.onWorkerError);
      this.worker.removeEventListener("messageerror", this.onWorkerError);
      this.worker.terminate();
      this.rejectPending(new Error("MiniMind browser worker was disposed."));
      this.listeners.clear();
    }
  }

  private request(command: Record<string, unknown>): Promise<unknown> {
    if (this.disposed) return Promise.reject(new Error("MiniMind browser worker was disposed."));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, ...command });
    });
  }

  private readonly onMessage = (event: Event) => {
    const data = (event as MessageEvent<unknown>).data;
    if (!isObject(data) || typeof data.type !== "string") {
      this.failProtocol();
      return;
    }
    if (data.type === "state") {
      try {
        this.state = parseState(data.state);
      } catch {
        this.failProtocol();
        return;
      }
      for (const listener of this.listeners) listener(this.state);
      return;
    }
    if (!Number.isSafeInteger(data.id)) {
      this.failProtocol();
      return;
    }
    const pending = this.pending.get(data.id as number);
    if (!pending) return;
    this.pending.delete(data.id as number);
    if (data.type === "result") {
      pending.resolve(data.result);
    } else if (data.type === "error" && typeof data.message === "string") {
      pending.reject(new Error(data.message));
    } else {
      pending.reject(new Error("MiniMind worker returned an invalid response."));
    }
  };

  private readonly onWorkerError = () => {
    this.state = {
      phase: "failed",
      source: null,
      backend: null,
      progress: null,
      message: "MiniMind stopped. You can retry or continue with manual facts.",
    };
    for (const listener of this.listeners) listener(this.state);
    this.rejectPending(new Error(this.state.message));
  };

  private failProtocol() {
    this.rejectPending(new Error("MiniMind worker returned an invalid response."));
  }

  private rejectPending(error: Error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}
