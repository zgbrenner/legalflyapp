import { webcrypto } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import {
  MINI_MIND_MANIFEST_URL,
  createMiniMindWorkerRuntime,
  type MiniMindInferenceEngine,
  type MiniMindWorkerDependencies,
} from "@/workers/minimind.worker";
import { MiniMindBrowserClient, type WorkerLike } from "@/lib/minimind-browser";

const MODEL_ID = "jingyaogong/minimind-3";
const MODEL_REVISION = "f92512d4cd6142fa9acc0d6022375049a8974bf6";
const SOURCE_SHA256 = "3adf69402b5d22e693151cabadc12528f923c4ba6bf343738aaf13f0892162e8";

const encoder = new TextEncoder();
const hex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");

async function digest(bytes: Uint8Array) {
  return hex(await webcrypto.subtle.digest("SHA-256", bytes));
}

type StoredResponse = { url: string; response: Response };

class MemoryCache {
  entries = new Map<string, Response>();
  deleted: string[] = [];

  private url(request: RequestInfo | URL) {
    return request instanceof Request ? request.url : String(request);
  }

  async match(request: RequestInfo | URL) {
    return this.entries.get(this.url(request))?.clone();
  }

  async put(request: RequestInfo | URL, response: Response) {
    this.entries.set(this.url(request), response.clone());
  }

  async delete(request: RequestInfo | URL) {
    const url = this.url(request);
    this.deleted.push(url);
    return this.entries.delete(url);
  }

  async keys() {
    return [...this.entries.keys()].map((url) => new Request(url));
  }
}

function responseFor(bytes: Uint8Array, contentType = "application/octet-stream") {
  return new Response(bytes.slice().buffer as ArrayBuffer, { status: 200, headers: { "content-type": contentType } });
}

async function bundle() {
  const readout = {
    schema: "legalfly-minimind-readouts/1",
    model: MODEL_ID,
    revision: MODEL_REVISION,
    source_sha256: SOURCE_SHA256,
    teaching_cases_sha256: "1".repeat(64),
    dimensions: 2,
    temperature_multiplier: 4,
    fields: {
      matter: { labels: ["damage", "debt"], centroids: [[1, 0], [0, 1]] },
      property: { labels: ["none", "crops"], centroids: [[1, 0], [0, 1]] },
      harm: { labels: ["none", "low"], centroids: [[1, 0], [0, 1]] },
      proof: { labels: ["unclear", "witness"], centroids: [[1, 0], [0, 1]] },
      intent: { labels: ["unclear", "careless"], centroids: [[1, 0], [0, 1]] },
      relationship: { labels: ["neighbors", "trade"], centroids: [[1, 0], [0, 1]] },
      urgency: { labels: ["low", "ordinary"], centroids: [[1, 0], [0, 1]] },
      ability: { labels: ["able", "unable"], centroids: [[1, 0], [0, 1]] },
    },
    actions: {
      labels: [
        "let-rest",
        "seek-small-reparation",
        "seek-full-reparation",
        "request-return",
        "find-witness",
        "sworn-account",
        "propose-settlement",
        "refer-higher",
      ],
      centroids: [[1, 0], [0, 1], [-1, 0], [0, -1], [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2], [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2]],
    },
  };
  const raw: Record<string, Uint8Array> = {
    "config.json": encoder.encode(JSON.stringify({ model_type: "qwen3" })),
    "model.q8.onnx": new Uint8Array([1, 2, 3, 4]),
    "readouts.json": encoder.encode(JSON.stringify(readout)),
    "tokenizer.json": encoder.encode(JSON.stringify({ version: "1.0" })),
    "tokenizer_config.json": encoder.encode(JSON.stringify({ tokenizer_class: "PreTrainedTokenizerFast" })),
  };
  const files = [];
  const stored: StoredResponse[] = [];
  for (const [logicalName, bytes] of Object.entries(raw)) {
    const sha256 = await digest(bytes);
    const dot = logicalName.lastIndexOf(".");
    const file = `${logicalName.slice(0, dot)}.${sha256}${logicalName.slice(dot)}`;
    files.push({ file, bytes: bytes.byteLength, sha256 });
    stored.push({ url: new URL(`/minimind/${file}`, "https://village.example").href, response: responseFor(bytes, file.endsWith(".json") ? "application/json" : undefined) });
  }
  const manifest = {
    schema: "legalfly-minimind-browser/1",
    model: MODEL_ID,
    revision: MODEL_REVISION,
    source_sha256: SOURCE_SHA256,
    files,
    quantization: "q8",
    quantization_config: { method: "weight-only", bits: 8, block_size: 32, modules: ["causal_lm.model.layers.1.mlp.gate_proj"] },
    outputs: ["logits", "last_hidden_state"],
  };
  return {
    manifest,
    stored,
    manifestResponse: responseFor(encoder.encode(JSON.stringify(manifest)), "application/json"),
  };
}

function fakeEngine(overrides: Partial<MiniMindInferenceEngine> = {}): MiniMindInferenceEngine {
  return {
    embed: vi.fn(async (petitions: string[]) => petitions.map(() => [1, 0])),
    score: vi.fn(async (_prompt: string, candidates: string[]) => candidates.map((_, index) => index)),
    dispose: vi.fn(async () => undefined),
    ...overrides,
  };
}

class ProtocolWorker extends EventTarget implements WorkerLike {
  sent: unknown[] = [];
  postMessage(message: unknown) { this.sent.push(message); }
  terminate() {}
  reply(data: unknown) { this.dispatchEvent(new MessageEvent("message", { data })); }
}

async function harness(options: {
  cached?: boolean;
  corrupt?: boolean;
  webgpu?: boolean;
  createEngine?: MiniMindWorkerDependencies["createInferenceEngine"];
} = {}) {
  const artifactBundle = await bundle();
  const cache = new MemoryCache();
  const origin = "https://village.example";
  if (options.cached) {
    await cache.put(new URL(MINI_MIND_MANIFEST_URL, origin).href, artifactBundle.manifestResponse);
    for (const item of artifactBundle.stored) await cache.put(item.url, item.response);
    if (options.corrupt) {
      const target = artifactBundle.stored.find((item) => item.url.includes("model.q8"))!;
      await cache.put(target.url, responseFor(new Uint8Array([9, 9, 9, 9])));
    }
  }
  const requests: Array<{ url: string; serialized: string }> = [];
  const responses = new Map<string, Response>([
    [new URL(MINI_MIND_MANIFEST_URL, origin).href, artifactBundle.manifestResponse],
    ...artifactBundle.stored.map((item) => [item.url, item.response] as const),
  ]);
  const fetcher = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(request), origin).href;
    requests.push({ url, serialized: `${url} ${String(init?.body ?? "")}` });
    const response = responses.get(url);
    if (!response) return new Response("missing", { status: 404 });
    return response.clone();
  });
  const messages: unknown[] = [];
  const runtime = createMiniMindWorkerRuntime({
    origin,
    fetch: fetcher as typeof fetch,
    cacheStorage: { open: vi.fn(async () => cache as unknown as Cache) },
    crypto: webcrypto as unknown as Crypto,
    hasWebGpu: () => Boolean(options.webgpu),
    createInferenceEngine: options.createEngine ?? vi.fn(async () => fakeEngine()),
    postMessage: (message) => messages.push(message),
  });
  return { runtime, requests, cache, messages, artifactBundle };
}

describe("MiniMind browser worker", () => {
  it("does not request artifacts before enable", async () => {
    const test = await harness();
    await test.runtime.start();
    expect(test.requests).toEqual([]);
    expect(test.runtime.getState()).toMatchObject({ phase: "available" });
  });

  it("restores a verified cached model and becomes ready", async () => {
    const test = await harness({ cached: true });
    await test.runtime.start();
    expect(test.runtime.getState()).toMatchObject({ phase: "ready", source: "cache", backend: "wasm" });
    expect(test.requests).toEqual([]);
  });

  it("evicts a corrupt cached artifact without downloading a replacement", async () => {
    const test = await harness({ cached: true, corrupt: true });
    await test.runtime.start();
    expect(test.runtime.getState()).toMatchObject({ phase: "available" });
    expect(test.cache.deleted.length).toBeGreaterThan(0);
    expect(test.requests).toEqual([]);
  });

  it("clears every versioned cache entry when the saved manifest is unparsable", async () => {
    const test = await harness();
    const manifestUrl = new URL(MINI_MIND_MANIFEST_URL, "https://village.example").href;
    const orphanUrl = "https://village.example/minimind/orphan.previous.onnx";
    await test.cache.put(manifestUrl, new Response("{not-json"));
    await test.cache.put(orphanUrl, responseFor(new Uint8Array([7, 8, 9])));

    await test.runtime.start();

    expect([...test.cache.entries.keys()]).toEqual([]);
    expect(test.cache.deleted).toEqual(expect.arrayContaining([manifestUrl, orphanUrl]));
    expect(test.requests).toEqual([]);
  });

  it("downloads only after enable, reports aggregate progress, and falls back once from WebGPU to WASM", async () => {
    const attempts: string[] = [];
    const test = await harness({
      webgpu: true,
      createEngine: vi.fn(async (_artifacts, backend) => {
        attempts.push(backend);
        if (backend === "webgpu") throw new Error("adapter failed");
        return fakeEngine();
      }),
    });
    await test.runtime.start();
    await test.runtime.handle({ id: 1, type: "enable" });
    expect(attempts).toEqual(["webgpu", "wasm"]);
    expect(test.runtime.getState()).toMatchObject({ phase: "ready", source: "download", backend: "wasm" });
    expect(test.messages).toContainEqual(expect.objectContaining({ type: "state", state: expect.objectContaining({ phase: "downloading" }) }));
    expect(test.requests[0].url).toBe("https://village.example/minimind/manifest.json");
  });

  it("rejects a silently broken WebGPU session and falls back to WASM", async () => {
    const attempts: string[] = [];
    const test = await harness({
      cached: true,
      webgpu: true,
      createEngine: vi.fn(async (_artifacts, backend) => {
        attempts.push(backend);
        return backend === "webgpu"
          ? fakeEngine({ embed: vi.fn(async () => [[0, 0]]) })
          : fakeEngine();
      }),
    });

    await test.runtime.start();

    expect(attempts).toEqual(["webgpu", "wasm"]);
    expect(test.runtime.getState()).toMatchObject({ phase: "ready", backend: "wasm" });
  });

  it("checks the logits output before accepting an inference backend", async () => {
    const attempts: string[] = [];
    const test = await harness({
      cached: true,
      webgpu: true,
      createEngine: vi.fn(async (_artifacts, backend) => {
        attempts.push(backend);
        return backend === "webgpu"
          ? fakeEngine({ score: vi.fn(async () => [0, 0]) })
          : fakeEngine();
      }),
    });

    await test.runtime.start();

    expect(attempts).toEqual(["webgpu", "wasm"]);
    expect(test.runtime.getState()).toMatchObject({ phase: "ready", backend: "wasm" });
  });

  it("never fetches or persists petition text", async () => {
    const test = await harness({ cached: true });
    await test.runtime.start();
    const beforeKeys = [...test.cache.entries.keys()];
    await test.runtime.handle({ id: 2, type: "encode", petition: "private goat petition" });
    expect(test.requests.some((request) => request.serialized.includes("private goat petition"))).toBe(false);
    expect([...test.cache.entries.keys()]).toEqual(beforeKeys);
  });

  it("uses fixed readouts for visible facts and requires confirmation", async () => {
    const test = await harness({ cached: true });
    await test.runtime.start();
    await test.runtime.handle({ id: 3, type: "encode", petition: "A private petition" });
    expect(test.messages).toContainEqual(expect.objectContaining({
      id: 3,
      type: "result",
      result: expect.objectContaining({
        facts: expect.objectContaining({ matter: "damage", property: "none", ability: "able" }),
        receipt: expect.objectContaining({ answer_labels_available: false, requires_confirmation: true }),
      }),
    }));
  });

  it("selects only an authored note and preserves the fixed fly action", async () => {
    const engine = fakeEngine();
    const test = await harness({ cached: true, createEngine: vi.fn(async () => engine) });
    await test.runtime.start();
    await test.runtime.handle({
      id: 4,
      type: "verbalize",
      action: "seek-small-reparation",
      confidenceBand: "medium",
      facts: { matter: "damage", property: "crops", harm: "low", proof: "unclear", intent: "careless", relationship: "neighbors", urgency: "ordinary", ability: "able" },
    });
    expect(test.messages).toContainEqual(expect.objectContaining({
      id: 4,
      type: "result",
      result: expect.objectContaining({
        text: "Document the harm to crops, then ask for a small reparation.",
        action: "seek-small-reparation",
        receipt: expect.objectContaining({ alternative_actions_available: false }),
      }),
    }));
    expect(engine.score).toHaveBeenCalledWith(
      expect.stringContaining("Confirmed facts: {'matter': 'damage', 'property': 'crops', 'harm': 'low', 'proof': 'unclear', 'intent': 'careless', 'relationship': 'neighbors', 'urgency': 'ordinary', 'ability': 'able'}"),
      expect.any(Array),
    );
  });

  it("rejects unknown commands and undeclared fields", async () => {
    const test = await harness({ cached: true });
    await test.runtime.start();
    await test.runtime.handle({ id: 5, type: "mystery" } as never);
    await test.runtime.handle({
      id: 6,
      type: "verbalize",
      action: "let-rest",
      confidenceBand: "medium",
      facts: { matter: "damage", property: "none", harm: "low", proof: "unclear", intent: "careless", relationship: "neighbors", urgency: "ordinary", ability: "able", hidden: "action" },
    } as never);
    expect(test.messages).toContainEqual(expect.objectContaining({ id: 5, type: "error" }));
    expect(test.messages).toContainEqual(expect.objectContaining({ id: 6, type: "error" }));
  });
});

describe("MiniMindBrowserClient", () => {
  it("rejects undeclared fields in state envelopes, states, and nested progress", () => {
    const state = { phase: "ready", source: "cache", backend: "wasm", progress: null, message: "Ready" };
    const malformed = [
      { type: "state", state, hidden: true },
      { type: "state", state: { ...state, hidden: true } },
      { type: "state", state: { ...state, phase: "downloading", progress: { loaded: 1, total: 2, percent: 50, file: "model.onnx", hidden: true } } },
    ];

    for (const payload of malformed) {
      const worker = new ProtocolWorker();
      const client = new MiniMindBrowserClient(() => worker);
      worker.reply(payload);
      expect(client.getState().phase).toBe("available");
    }
  });

  it("rejects undeclared response-envelope fields and non-null void results", async () => {
    const cases = [
      { reply: (id: number) => ({ id, type: "result", result: null, hidden: true }), error: /invalid response/i },
      { reply: (id: number) => ({ id, type: "error", message: "forged", hidden: true }), error: /invalid response/i },
      { reply: (id: number) => ({ id, type: "result", result: { hidden: true } }), error: /void result/i },
    ];

    for (const entry of cases) {
      const worker = new ProtocolWorker();
      const client = new MiniMindBrowserClient(() => worker);
      const pending = client.enable();
      const command = worker.sent.at(-1) as { id: number };
      worker.reply(entry.reply(command.id));
      await expect(pending).rejects.toThrow(entry.error);
    }
  });

  it("rejects undeclared fields at every level of returned object shapes", async () => {
    const facts = { matter: "damage", property: "crops", harm: "low", proof: "unclear", intent: "careless", relationship: "neighbors", urgency: "ordinary", ability: "able" };
    const confidence = { matter: 0.5, property: 0.5, harm: 0.5, proof: 0.5, intent: 0.5, relationship: 0.5, urgency: 0.5, ability: 0.5 };
    const receipt = {
      input: ["petition"],
      output: ["matter", "property", "harm", "proof", "intent", "relationship", "urgency", "ability"],
      answer_labels_available: false,
      requires_confirmation: true,
      mode: "frozen MiniMind embedding with teaching-only field readouts",
    };
    const malformedDrafts = [
      { facts, field_confidence: confidence, receipt, hidden: true },
      { facts: { ...facts, hidden: "value" }, field_confidence: confidence, receipt },
      { facts, field_confidence: { ...confidence, hidden: 0.5 }, receipt },
      { facts, field_confidence: confidence, receipt: { ...receipt, hidden: true } },
    ];
    for (const result of malformedDrafts) {
      const worker = new ProtocolWorker();
      const client = new MiniMindBrowserClient(() => worker);
      const pending = client.encodePetition("A petition");
      const command = worker.sent.at(-1) as { id: number };
      worker.reply({ id: command.id, type: "result", result });
      await expect(pending).rejects.toThrow(/invalid|undeclared/i);
    }

    const note = {
      text: "Document the harm to crops, then ask for a small reparation.",
      action: "seek-small-reparation",
      selection_confidence: 0.5,
      receipt: { input: ["selected_action", "confirmed_facts", "confidence_band"], alternative_actions_available: false, output_mode: "allow-listed sentence selection" },
    };
    for (const result of [{ ...note, hidden: true }, { ...note, receipt: { ...note.receipt, hidden: true } }]) {
      const worker = new ProtocolWorker();
      const client = new MiniMindBrowserClient(() => worker);
      const pending = client.verbalizeAdvice(facts, "seek-small-reparation", 0.5);
      const command = worker.sent.at(-1) as { id: number };
      worker.reply({ id: command.id, type: "result", result });
      await expect(pending).rejects.toThrow(/invalid/i);
    }

    const benchmark = { rows: [{ id: "case-1", action: "let-rest", confidence: 0.5 }], model_revision: MODEL_REVISION };
    for (const result of [{ ...benchmark, hidden: true }, { ...benchmark, rows: [{ ...benchmark.rows[0], hidden: true }] }]) {
      const worker = new ProtocolWorker();
      const client = new MiniMindBrowserClient(() => worker);
      const pending = client.benchmarkMiniMind([{ id: "case-1", petition: "A petition" }]);
      const command = worker.sent.at(-1) as { id: number };
      worker.reply({ id: command.id, type: "result", result });
      await expect(pending).rejects.toThrow(/invalid/i);
    }
  });

  it("subscribes to worker state, resolves requests, and terminates on dispose", async () => {
    class FakeWorker extends EventTarget implements WorkerLike {
      sent: unknown[] = [];
      terminated = false;
      postMessage(message: unknown) { this.sent.push(message); }
      terminate() { this.terminated = true; }
      reply(data: unknown) { this.dispatchEvent(new MessageEvent("message", { data })); }
    }
    const worker = new FakeWorker();
    const client = new MiniMindBrowserClient(() => worker);
    const states: string[] = [];
    client.subscribe((state) => states.push(state.phase));
    worker.reply({ type: "state", state: { phase: "ready", source: "cache", backend: "wasm", progress: null, message: "Ready" } });
    const pending = client.enable();
    const command = worker.sent.at(-1) as { id: number };
    worker.reply({ id: command.id, type: "result", result: null });
    await expect(pending).resolves.toBeUndefined();
    expect(states).toContain("ready");
    const disposing = client.dispose();
    const disposeCommand = worker.sent.at(-1) as { id: number };
    worker.reply({ id: disposeCommand.id, type: "result", result: null });
    await disposing;
    expect(worker.terminated).toBe(true);
  });

  it("rejects a worker result that changes the fixed fly action", async () => {
    class FakeWorker extends EventTarget implements WorkerLike {
      sent: unknown[] = [];
      postMessage(message: unknown) { this.sent.push(message); }
      terminate() {}
      reply(data: unknown) { this.dispatchEvent(new MessageEvent("message", { data })); }
    }
    const worker = new FakeWorker();
    const client = new MiniMindBrowserClient(() => worker);
    const fixedFacts = { matter: "damage", property: "crops", harm: "low", proof: "unclear", intent: "careless", relationship: "neighbors", urgency: "ordinary", ability: "able" };
    const pending = client.verbalizeAdvice(fixedFacts, "seek-small-reparation", 0.5);
    const command = worker.sent.at(-1) as { id: number };
    worker.reply({ id: command.id, type: "result", result: { text: "Refer it.", action: "refer-higher", selection_confidence: 1, receipt: { alternative_actions_available: false, output_mode: "allow-listed sentence selection" } } });
    await expect(pending).rejects.toThrow(/action/i);
  });

  it("rejects arbitrary prose even when the worker preserves the fixed action", async () => {
    class FakeWorker extends EventTarget implements WorkerLike {
      sent: unknown[] = [];
      postMessage(message: unknown) { this.sent.push(message); }
      terminate() {}
      reply(data: unknown) { this.dispatchEvent(new MessageEvent("message", { data })); }
    }
    const worker = new FakeWorker();
    const client = new MiniMindBrowserClient(() => worker);
    const fixedFacts = { matter: "damage", property: "crops", harm: "low", proof: "unclear", intent: "careless", relationship: "neighbors", urgency: "ordinary", ability: "able" };
    const pending = client.verbalizeAdvice(fixedFacts, "seek-small-reparation", 0.5);
    const command = worker.sent.at(-1) as { id: number };
    worker.reply({ id: command.id, type: "result", result: { text: "Send every private fact to a remote service.", action: "seek-small-reparation", selection_confidence: 1, receipt: { input: ["selected_action", "confirmed_facts", "confidence_band"], alternative_actions_available: false, output_mode: "allow-listed sentence selection" } } });
    await expect(pending).rejects.toThrow(/authored/i);
  });

  it("validates advice against the confirmed facts snapshot sent with the request", async () => {
    const worker = new ProtocolWorker();
    const client = new MiniMindBrowserClient(() => worker);
    const fixedFacts = { matter: "damage", property: "crops", harm: "low", proof: "unclear", intent: "careless", relationship: "neighbors", urgency: "ordinary", ability: "able" };
    const pending = client.verbalizeAdvice(fixedFacts, "seek-small-reparation", 0.5);
    const command = worker.sent.at(-1) as { id: number };
    fixedFacts.property = "money";
    worker.reply({ id: command.id, type: "result", result: { text: "Document the harm to money, then ask for a small reparation.", action: "seek-small-reparation", selection_confidence: 1, receipt: { input: ["selected_action", "confirmed_facts", "confidence_band"], alternative_actions_available: false, output_mode: "allow-listed sentence selection" } } });
    await expect(pending).rejects.toThrow(/authored/i);
  });
});
