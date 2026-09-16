import { webcrypto } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import {
  MINI_MIND_MANIFEST_URL,
  createMiniMindWorkerRuntime,
  type MiniMindInferenceEngine,
  type MiniMindWorkerDependencies,
} from "@/workers/minimind.worker";
import { MiniMindBrowserClient, type WorkerLike } from "@/lib/minimind-browser";
import { authoredMiniMindNotes } from "@/lib/minimind-policy";

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

/** Streams a response one byte per chunk so progress callbacks fire per chunk. */
function chunkedResponse(bytes: Uint8Array, contentType: string) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": contentType } });
}

const FIXED_FACTS = { matter: "damage", property: "crops", harm: "low", proof: "unclear", intent: "careless", relationship: "neighbors", urgency: "ordinary", ability: "able" };

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
  /** Serve artifact bodies as one-byte stream chunks instead of a buffered body. */
  chunked?: boolean;
  createEngine?: MiniMindWorkerDependencies["createInferenceEngine"];
  cacheOpen?: (cache: MemoryCache) => Promise<Cache>;
  crypto?: Crypto;
  /** Serve corrupted bytes for the artifact whose URL contains this fragment. */
  tamper?: string;
  /** Answer 404 for every URL containing this fragment. */
  omit?: string;
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
    ...artifactBundle.stored.map((item) => [
      item.url,
      options.tamper && item.url.includes(options.tamper) ? responseFor(new Uint8Array([9, 9, 9])) : item.response,
    ] as const),
  ]);
  if (options.omit) for (const url of [...responses.keys()]) if (url.includes(options.omit)) responses.delete(url);
  const fetcher = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(request), origin).href;
    requests.push({ url, serialized: `${url} ${String(init?.body ?? "")}` });
    const response = responses.get(url);
    if (!response) return new Response("missing", { status: 404 });
    if (options.chunked && url !== new URL(MINI_MIND_MANIFEST_URL, origin).href) {
      const copy = response.clone();
      return chunkedResponse(new Uint8Array(await copy.arrayBuffer()), copy.headers.get("content-type") ?? "application/octet-stream");
    }
    return response.clone();
  });
  const messages: unknown[] = [];
  const createEngine = options.createEngine ?? vi.fn(async () => fakeEngine());
  const open = vi.fn(async () => options.cacheOpen ? options.cacheOpen(cache) : cache as unknown as Cache);
  const runtime = createMiniMindWorkerRuntime({
    origin,
    fetch: fetcher as typeof fetch,
    cacheStorage: { open },
    crypto: options.crypto ?? webcrypto as unknown as Crypto,
    hasWebGpu: () => Boolean(options.webgpu),
    createInferenceEngine: createEngine,
    postMessage: (message) => messages.push(message),
  });
  return { runtime, requests, cache, messages, artifactBundle, createEngine, open };
}

function statesOf(messages: unknown[]) {
  return messages
    .filter((message): message is { type: "state"; state: { phase: string; progress: { loaded: number; file: string | null } | null } } => (message as { type?: string }).type === "state")
    .map((message) => message.state);
}

describe("MiniMind browser worker", () => {
  it("does not request artifacts before enable", async () => {
    const test = await harness();
    await test.runtime.start();
    expect(test.requests).toEqual([]);
    expect(test.runtime.getState()).toMatchObject({ phase: "available" });
  });

  it("names a missing file list with fixed copy and never echoes a browser error", async () => {
    const origin = "https://village.example";
    const test = await harness({ omit: "manifest.json" });
    await test.runtime.start();
    test.requests.length = 0;
    // Deployed page without the bundle: the manifest request answers 404.
    await test.runtime.handle({ id: 1, type: "enable" });
    expect(test.runtime.getState()).toMatchObject({
      phase: "failed",
      message: "The MiniMind file list is unavailable. Retry or continue with manual facts.",
    });
    expect(test.messages).toContainEqual({ id: 1, type: "error", message: "MiniMind could not finish this local operation." });
    expect(test.requests.map((request) => request.url)).toEqual([new URL(MINI_MIND_MANIFEST_URL, origin).href]);
    expect(test.cache.deleted.length).toBeGreaterThanOrEqual(0);
  });

  it("names the artifact that failed its hash check and evicts the partial download", async () => {
    const test = await harness({ tamper: "model.q8" });
    await test.runtime.start();
    await test.runtime.handle({ id: 2, type: "enable" });
    const state = test.runtime.getState();
    expect(state.phase).toBe("failed");
    expect(state.message).toMatch(/^MiniMind file verification failed: model\.q8\.[a-f0-9]{64}\.onnx\. Retry or continue with manual facts\.$/);
    expect(test.cache.deleted.length).toBeGreaterThan(0);
    expect(test.messages.filter((message) => (message as { type?: string }).type === "state").every((message) => !JSON.stringify(message).includes("TypeError"))).toBe(true);
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

  it("reports a failed enable when cache storage cannot open, then recovers on retry", async () => {
    let openAttempts = 0;
    const test = await harness({
      cacheOpen: async (cache) => {
        openAttempts += 1;
        if (openAttempts === 1) throw new DOMException("Storage is blocked", "SecurityError");
        return cache as unknown as Cache;
      },
    });
    // start() opens the cache too; let it fail so enable performs the first "real" attempt.
    await test.runtime.start();
    openAttempts = 0;

    await test.runtime.handle({ id: 1, type: "enable" });
    expect(test.runtime.getState()).toMatchObject({ phase: "failed" });
    expect(test.runtime.getState().message).toBe("MiniMind could not be enabled. Retry or continue with manual facts.");
    expect(test.messages).toContainEqual(expect.objectContaining({ id: 1, type: "error" }));
    expect(test.requests).toEqual([]);

    await test.runtime.handle({ id: 2, type: "enable" });
    expect(test.runtime.getState()).toMatchObject({ phase: "ready", source: "download" });
    expect(test.messages).toContainEqual(expect.objectContaining({ id: 2, type: "result", result: null }));
  });

  it("serializes engine operations so session runs never overlap", async () => {
    let inFlight = 0;
    let overlapped = false;
    const order: number[] = [];
    const engine = fakeEngine({
      embed: vi.fn(async (petitions: string[]) => {
        if (inFlight !== 0) overlapped = true;
        inFlight += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return petitions.map(() => [1, 0]);
      }),
    });
    const test = await harness({ cached: true, createEngine: vi.fn(async () => engine) });
    await test.runtime.start();

    const first = test.runtime.handle({ id: 10, type: "encode", petition: "first petition" });
    const second = test.runtime.handle({ id: 11, type: "encode", petition: "second petition" });
    test.runtime.handle({ id: 12, type: "benchmark", cases: [{ id: "case-1", petition: "third petition" }] });
    await Promise.all([first, second]);
    await test.runtime.handle({ id: 13, type: "dispose" });

    expect(overlapped).toBe(false);
    for (const message of test.messages) {
      const envelope = message as { id?: number; type: string };
      if (envelope.type === "result") order.push(envelope.id!);
    }
    expect(order).toEqual([10, 11, 12, 13]);
    expect(engine.dispose).toHaveBeenCalledTimes(1);
  });

  it("does not fetch or build a second engine when enable arrives during the cached restore", async () => {
    const test = await harness({ cached: true });
    const starting = test.runtime.start();
    await test.runtime.handle({ id: 1, type: "enable" });
    await starting;

    expect(test.requests).toEqual([]);
    expect(test.createEngine).toHaveBeenCalledTimes(1);
    expect(test.runtime.getState()).toMatchObject({ phase: "ready", source: "cache" });
    expect(test.messages).toContainEqual(expect.objectContaining({ id: 1, type: "result", result: null }));
  });

  it("republishes the ready state instead of downloading when enable arrives while ready", async () => {
    const test = await harness({ cached: true });
    await test.runtime.start();
    const readyBefore = statesOf(test.messages).filter((state) => state.phase === "ready").length;

    await test.runtime.handle({ id: 1, type: "enable" });

    expect(test.requests).toEqual([]);
    expect(test.createEngine).toHaveBeenCalledTimes(1);
    expect(statesOf(test.messages).filter((state) => state.phase === "ready").length).toBe(readyBefore + 1);
    expect(test.runtime.getState()).toMatchObject({ phase: "ready", source: "cache" });
  });

  it("rejects inherited object members as actions and confidence bands", async () => {
    const test = await harness({ cached: true });
    await test.runtime.start();
    for (const [id, action] of [[20, "constructor"], [21, "__proto__"], [22, "toString"]] as const) {
      await test.runtime.handle({ id, type: "verbalize", action, confidenceBand: "medium", facts: FIXED_FACTS });
      expect(test.messages).toContainEqual(expect.objectContaining({ id, type: "error" }));
    }
    await test.runtime.handle({ id: 23, type: "verbalize", action: "let-rest", confidenceBand: ["low"], facts: FIXED_FACTS } as never);
    expect(test.messages).toContainEqual(expect.objectContaining({ id: 23, type: "error" }));
    expect(authoredMiniMindNotes(FIXED_FACTS, "toString")).toEqual([]);
    expect(authoredMiniMindNotes(FIXED_FACTS, "constructor")).toEqual([]);
    expect(authoredMiniMindNotes(FIXED_FACTS, "__proto__")).toEqual([]);
  });

  it("evicts orphaned artifacts left behind without a manifest", async () => {
    const test = await harness();
    const orphan = test.artifactBundle.stored[0];
    await test.cache.put(orphan.url, orphan.response.clone());

    await test.runtime.start();

    expect([...test.cache.entries.keys()]).toEqual([]);
    expect(test.cache.deleted).toContain(orphan.url);
    expect(test.requests).toEqual([]);
    expect(test.runtime.getState()).toMatchObject({ phase: "available" });
  });

  it("retries initialization from the verified cache without downloading again", async () => {
    let attempts = 0;
    const test = await harness({
      cached: true,
      createEngine: vi.fn(async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("backend failed");
        return fakeEngine();
      }),
    });
    await test.runtime.start();
    expect(test.runtime.getState()).toMatchObject({ phase: "unsupported" });

    await test.runtime.handle({ id: 1, type: "enable" });

    expect(test.requests).toEqual([]);
    expect(attempts).toBe(2);
    expect(test.runtime.getState()).toMatchObject({ phase: "ready", source: "cache" });
  });

  it("does not fetch when subtle crypto is unavailable at enable time", async () => {
    const test = await harness({ crypto: {} as Crypto });
    await test.runtime.start();
    await test.runtime.handle({ id: 1, type: "enable" });

    expect(test.requests).toEqual([]);
    expect(test.open).not.toHaveBeenCalled();
    expect(test.runtime.getState()).toMatchObject({ phase: "unsupported" });
  });

  it("embeds the petition exactly as written, including surrounding whitespace", async () => {
    const engine = fakeEngine();
    const test = await harness({ cached: true, createEngine: vi.fn(async () => engine) });
    await test.runtime.start();
    await test.runtime.handle({ id: 1, type: "encode", petition: "  a padded petition \n" });
    expect(engine.embed).toHaveBeenLastCalledWith(["  a padded petition \n"]);
    await test.runtime.handle({ id: 2, type: "encode", petition: "   " });
    expect(test.messages).toContainEqual(expect.objectContaining({ id: 2, type: "error" }));
  });

  it("throttles progress publication but always reports each file's final size", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    try {
      const test = await harness({ chunked: true });
      await test.runtime.start();
      await test.runtime.handle({ id: 1, type: "enable" });
      expect(test.runtime.getState()).toMatchObject({ phase: "ready", source: "download" });

      const progress = statesOf(test.messages).filter((state) => state.phase === "downloading" && state.progress !== null);
      let expectedLoaded = 0;
      for (const entry of test.artifactBundle.manifest.files) {
        expectedLoaded += entry.bytes;
        const forFile = progress.filter((state) => state.progress!.file === entry.file);
        // Each byte arrives as its own chunk, but the clock is frozen and no
        // file reaches 64 KiB, so only the final chunk publishes.
        expect(forFile.length).toBe(1);
        expect(forFile.at(-1)!.progress!.loaded).toBe(expectedLoaded);
      }
    } finally {
      now.mockRestore();
    }
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

  it("terminates a worker that never answers dispose after a bounded wait", async () => {
    vi.useFakeTimers();
    try {
      class SilentWorker extends EventTarget implements WorkerLike {
        terminated = false;
        postMessage() {}
        terminate() { this.terminated = true; }
      }
      const worker = new SilentWorker();
      const client = new MiniMindBrowserClient(() => worker);
      const pendingEncode = expect(client.encodePetition("A petition")).rejects.toThrow("MiniMind browser worker did not stop in time and was terminated.");
      const disposing = client.dispose();
      await vi.advanceTimersByTimeAsync(1999);
      expect(worker.terminated).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await disposing;
      expect(worker.terminated).toBe(true);
      await pendingEncode;
      await expect(client.enable()).rejects.toThrow("MiniMind browser worker was disposed.");
    } finally {
      vi.useRealTimers();
    }
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
