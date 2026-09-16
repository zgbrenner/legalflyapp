import type {
  MiniMindBackend,
  MiniMindBrowserState,
  MiniMindSource,
} from "@/lib/minimind-browser";
import { authoredMiniMindNotes } from "@/lib/minimind-policy";

const MODEL_ID = "jingyaogong/minimind-3";
const MODEL_REVISION = "f92512d4cd6142fa9acc0d6022375049a8974bf6";
const SOURCE_SHA256 = "3adf69402b5d22e693151cabadc12528f923c4ba6bf343738aaf13f0892162e8";
const MANIFEST_SCHEMA = "legalfly-minimind-browser/1";
const READOUT_SCHEMA = "legalfly-minimind-readouts/1";
const CACHE_NAME = "legalfly-minimind-browser-v1";
const MAX_MANIFEST_BYTES = 128 * 1024;
const MAX_ARTIFACT_BYTES = 400 * 1024 * 1024;
const MAX_BUNDLE_BYTES = 600 * 1024 * 1024;
const PROGRESS_BYTES_INTERVAL = 64 * 1024;
const PROGRESS_TIME_INTERVAL_MS = 100;
const ENABLE_FAILED_MESSAGE = "MiniMind could not be enabled. Retry or continue with manual facts.";
const RETRY_SUFFIX = " Retry or continue with manual facts.";

/**
 * A download failure whose text is one of this worker's own fixed strings
 * (naming at most a manifest artifact file). Only these reasons are surfaced
 * to the page; browser exceptions carry arbitrary text and are reported with
 * the generic ENABLE_FAILED_MESSAGE instead.
 */
class DownloadFailure extends Error {}
const UNSUPPORTED_CRYPTO_MESSAGE = "This browser cannot verify MiniMind files. Continue with manual facts.";
const ACTIONS = {
  "let-rest": "Let the matter rest.",
  "seek-small-reparation": "Seek small reparation.",
  "seek-full-reparation": "Seek full reparation.",
  "request-return": "Request return of property.",
  "find-witness": "Find a witness.",
  "sworn-account": "Request a sworn account within the fictional charter.",
  "propose-settlement": "Propose settlement.",
  "refer-higher": "Refer the matter to a higher authority.",
  abstain: "The fly declines to advise.",
} as const;
const ACTION_READOUT_LABELS = Object.keys(ACTIONS).slice(0, -1);
const FACT_OPTIONS = {
  matter: ["damage", "debt", "property", "delivery", "boundary", "insult", "account", "charter", "official", "threat"],
  property: ["none", "crops", "animal", "tool", "goods", "payment", "money", "land", "document", "public place", "small item", "service", "clothing", "fence"],
  harm: ["none", "low", "moderate", "high"],
  proof: ["unclear", "witness", "admitted", "document"],
  intent: ["unclear", "careless", "deliberate", "unable"],
  relationship: ["neighbors", "trade", "official"],
  urgency: ["low", "ordinary", "high"],
  ability: ["able", "unable"],
} as const;
const FACT_FIELDS = Object.keys(FACT_OPTIONS) as Array<keyof typeof FACT_OPTIONS>;

export const MINI_MIND_MANIFEST_URL = "/minimind/manifest.json";

type CacheLike = Pick<Cache, "match" | "put" | "delete" | "keys">;
type CacheStorageLike = { open(name: string): Promise<CacheLike> };

type ManifestFile = { file: string; bytes: number; sha256: string };
type BrowserManifest = {
  schema: typeof MANIFEST_SCHEMA;
  model: typeof MODEL_ID;
  revision: typeof MODEL_REVISION;
  source_sha256: typeof SOURCE_SHA256;
  files: ManifestFile[];
  quantization: "q4" | "q8";
  quantization_config: Record<string, unknown>;
  outputs: ["logits", "last_hidden_state"];
};
type ReadoutGroup = { labels: string[]; centroids: number[][] };
type BrowserReadouts = {
  schema: typeof READOUT_SCHEMA;
  model: typeof MODEL_ID;
  revision: typeof MODEL_REVISION;
  source_sha256: typeof SOURCE_SHA256;
  teaching_cases_sha256: string;
  dimensions: number;
  temperature_multiplier: number;
  fields: Record<keyof typeof FACT_OPTIONS, ReadoutGroup>;
  actions: ReadoutGroup;
};
export type MiniMindArtifactSet = {
  cache: CacheLike;
  crypto: Crypto;
  manifest: BrowserManifest;
  readouts: BrowserReadouts;
  urls: ReadonlyMap<string, string>;
};

export type MiniMindInferenceEngine = {
  embed(petitions: string[]): Promise<number[][]>;
  score(prompt: string, candidates: string[]): Promise<number[]>;
  dispose(): Promise<void>;
};

export type MiniMindWorkerDependencies = {
  origin: string;
  fetch: typeof fetch;
  cacheStorage: CacheStorageLike;
  crypto: Crypto;
  hasWebGpu(): boolean;
  createInferenceEngine(
    artifacts: MiniMindArtifactSet,
    backend: MiniMindBackend,
  ): Promise<MiniMindInferenceEngine>;
  postMessage(message: unknown): void;
};

type WorkerCommand =
  | { id: number; type: "enable" }
  | { id: number; type: "cancel" }
  | { id: number; type: "encode"; petition: string }
  | {
      id: number;
      type: "verbalize";
      facts: Record<string, string>;
      action: string;
      confidenceBand: "low" | "medium" | "high";
    }
  | { id: number; type: "benchmark"; cases: Array<{ id: string; petition: string }> }
  | { id: number; type: "dispose" };

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: string[]) {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index]);
}

function assertSafeText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

function parseCommand(value: unknown): WorkerCommand {
  if (!isObject(value) || !Number.isSafeInteger(value.id) || (value.id as number) < 1 || typeof value.type !== "string") {
    throw new Error("Invalid MiniMind worker command.");
  }
  const id = value.id as number;
  switch (value.type) {
    case "enable":
    case "cancel":
    case "dispose":
      if (!exactKeys(value, ["id", "type"])) throw new Error("Invalid MiniMind worker command.");
      return { id, type: value.type };
    case "encode":
      if (!exactKeys(value, ["id", "type", "petition"])) throw new Error("Invalid MiniMind worker command.");
      return { id, type: "encode", petition: assertSafeText(value.petition, "petition", 1000) };
    case "verbalize": {
      if (!exactKeys(value, ["id", "type", "facts", "action", "confidenceBand"])) throw new Error("Invalid MiniMind worker command.");
      const facts = assertFacts(value.facts);
      if (
        typeof value.action !== "string"
        || !Object.hasOwn(ACTIONS, value.action)
        || typeof value.confidenceBand !== "string"
        || !["low", "medium", "high"].includes(value.confidenceBand)
      ) {
        throw new Error("Invalid MiniMind counsel-note request.");
      }
      return {
        id,
        type: "verbalize",
        facts,
        action: value.action as keyof typeof ACTIONS,
        confidenceBand: value.confidenceBand as "low" | "medium" | "high",
      };
    }
    case "benchmark": {
      if (!exactKeys(value, ["id", "type", "cases"]) || !Array.isArray(value.cases) || value.cases.length < 1 || value.cases.length > 32) {
        throw new Error("Invalid MiniMind benchmark request.");
      }
      const cases = value.cases.map((entry) => {
        if (!isObject(entry) || !exactKeys(entry, ["id", "petition"])) throw new Error("Invalid MiniMind benchmark case.");
        return {
          id: assertSafeText(entry.id, "benchmark case ID", 100),
          petition: assertSafeText(entry.petition, "petition", 1000),
        };
      });
      return { id, type: "benchmark", cases };
    }
    default:
      throw new Error("Unknown MiniMind worker command.");
  }
}

function assertFacts(value: unknown): Record<keyof typeof FACT_OPTIONS, string> {
  if (!isObject(value) || !exactKeys(value, FACT_FIELDS)) throw new Error("MiniMind facts must contain exactly eight declared fields.");
  const facts = {} as Record<keyof typeof FACT_OPTIONS, string>;
  for (const field of FACT_FIELDS) {
    const selected = value[field];
    if (typeof selected !== "string" || !(FACT_OPTIONS[field] as readonly string[]).includes(selected)) {
      throw new Error(`MiniMind received an unsupported ${field} value.`);
    }
    facts[field] = selected;
  }
  return facts;
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error(`Invalid ${label}.`);
  }
}

function contentAddressed(name: string, digest: string) {
  return name.split(".").includes(digest);
}

function parseManifest(value: unknown): BrowserManifest {
  const keys = ["schema", "model", "revision", "source_sha256", "files", "quantization", "quantization_config", "outputs"];
  if (!isObject(value) || !exactKeys(value, keys)) throw new Error("Invalid MiniMind browser manifest.");
  if (
    value.schema !== MANIFEST_SCHEMA
    || value.model !== MODEL_ID
    || value.revision !== MODEL_REVISION
    || value.source_sha256 !== SOURCE_SHA256
    || !Array.isArray(value.outputs)
    || value.outputs.length !== 2
    || value.outputs[0] !== "logits"
    || value.outputs[1] !== "last_hidden_state"
    || !["q4", "q8"].includes(String(value.quantization))
    || !isObject(value.quantization_config)
    || !Array.isArray(value.files)
    || value.files.length !== 5
  ) {
    throw new Error("Invalid MiniMind browser manifest.");
  }
  const expectedQuantization = value.quantization === "q8"
    ? { method: "weight-only", bits: 8, block_size: 32, modules: ["causal_lm.model.layers.1.mlp.gate_proj"] }
    : { method: "weight-only", bits: 4, block_size: 128, modules: ["*"] };
  if (JSON.stringify(value.quantization_config) !== JSON.stringify(expectedQuantization)) {
    throw new Error("Invalid MiniMind quantization contract.");
  }
  const names = new Set<string>();
  const categories = new Set<string>();
  let total = 0;
  const files = value.files.map((entry) => {
    if (!isObject(entry) || !exactKeys(entry, ["file", "bytes", "sha256"])) throw new Error("Invalid MiniMind artifact entry.");
    const { file, bytes, sha256 } = entry;
    if (
      typeof file !== "string"
      || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(file)
      || typeof sha256 !== "string"
      || !/^[a-f0-9]{64}$/.test(sha256)
      || !Number.isSafeInteger(bytes)
      || (bytes as number) < 1
      || (bytes as number) > MAX_ARTIFACT_BYTES
      || !contentAddressed(file, sha256)
      || names.has(file)
    ) {
      throw new Error("Invalid MiniMind artifact entry.");
    }
    names.add(file);
    total += bytes as number;
    if (file.startsWith("config.") && file.endsWith(".json")) categories.add("config");
    else if (file.startsWith("model.") && file.endsWith(".onnx")) categories.add("model");
    else if (file.startsWith("readouts.") && file.endsWith(".json")) categories.add("readouts");
    else if (file.startsWith("tokenizer_config.") && file.endsWith(".json")) categories.add("tokenizer_config");
    else if (file.startsWith("tokenizer.") && file.endsWith(".json")) categories.add("tokenizer");
    else throw new Error("MiniMind manifest contains an unexpected artifact.");
    return { file, bytes: bytes as number, sha256 };
  });
  if (categories.size !== 5 || total > MAX_BUNDLE_BYTES) throw new Error("Invalid MiniMind browser bundle.");
  return { ...value, files } as BrowserManifest;
}

function validateGroup(group: unknown, dimensions: number, allowed: readonly string[], label: string): ReadoutGroup {
  if (!isObject(group) || !exactKeys(group, ["labels", "centroids"]) || !Array.isArray(group.labels) || !Array.isArray(group.centroids) || group.labels.length < 1 || group.labels.length !== group.centroids.length) {
    throw new Error(`Invalid MiniMind ${label} readout.`);
  }
  const labels = group.labels.map((value) => {
    if (typeof value !== "string" || !allowed.includes(value)) throw new Error(`Invalid MiniMind ${label} label.`);
    return value;
  });
  if (new Set(labels).size !== labels.length) throw new Error(`Invalid MiniMind ${label} labels.`);
  const centroids = group.centroids.map((row) => {
    if (!Array.isArray(row) || row.length !== dimensions || row.some((number) => typeof number !== "number" || !Number.isFinite(number))) {
      throw new Error(`Invalid MiniMind ${label} centroid.`);
    }
    const norm = Math.sqrt(row.reduce((sum, number) => sum + number * number, 0));
    if (Math.abs(norm - 1) > 1e-3) throw new Error(`Invalid MiniMind ${label} centroid.`);
    return row as number[];
  });
  return { labels, centroids };
}

function parseReadouts(value: unknown): BrowserReadouts {
  const keys = ["schema", "model", "revision", "source_sha256", "teaching_cases_sha256", "dimensions", "temperature_multiplier", "fields", "actions"];
  if (!isObject(value) || !exactKeys(value, keys)) throw new Error("Invalid MiniMind readouts.");
  if (
    value.schema !== READOUT_SCHEMA
    || value.model !== MODEL_ID
    || value.revision !== MODEL_REVISION
    || value.source_sha256 !== SOURCE_SHA256
    || typeof value.teaching_cases_sha256 !== "string"
    || !/^[a-f0-9]{64}$/.test(value.teaching_cases_sha256)
    || !Number.isSafeInteger(value.dimensions)
    || (value.dimensions as number) < 1
    || (value.dimensions as number) > 4096
    || typeof value.temperature_multiplier !== "number"
    || !Number.isFinite(value.temperature_multiplier)
    || value.temperature_multiplier <= 0
    || !isObject(value.fields)
    || !exactKeys(value.fields, FACT_FIELDS)
  ) {
    throw new Error("Invalid MiniMind readouts.");
  }
  const dimensions = value.dimensions as number;
  const fields = {} as BrowserReadouts["fields"];
  for (const field of FACT_FIELDS) {
    fields[field] = validateGroup(value.fields[field], dimensions, FACT_OPTIONS[field], field);
  }
  const actions = validateGroup(value.actions, dimensions, ACTION_READOUT_LABELS, "action");
  if (actions.labels.some((label, index) => label !== ACTION_READOUT_LABELS[index]) || actions.labels.length !== ACTION_READOUT_LABELS.length) {
    throw new Error("Invalid MiniMind action readout ordering.");
  }
  return { ...value, dimensions, fields, actions } as BrowserReadouts;
}

async function readBounded(response: Response, maximum: number, progress?: (received: number) => void) {
  const declared = response.headers.get("content-length");
  if (declared && (!Number.isSafeInteger(Number(declared)) || Number(declared) > maximum)) throw new Error("MiniMind artifact exceeds its declared size.");
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maximum) throw new Error("MiniMind artifact is too large.");
    progress?.(bytes.byteLength);
    return bytes;
  }
  const bytes = new Uint8Array(maximum);
  const reader = response.body.getReader();
  let received = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (received + chunk.value.byteLength > maximum) throw new Error("MiniMind artifact exceeds its manifest size.");
      bytes.set(chunk.value, received);
      received += chunk.value.byteLength;
      progress?.(received);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  return received === bytes.byteLength ? bytes : bytes.slice(0, received);
}

async function sha256(crypto: Crypto, bytes: Uint8Array) {
  const source = bytes.buffer instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes.buffer
    : bytes.slice().buffer as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", source);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function artifactUrl(origin: string, file: string) {
  const url = new URL(`/minimind/${file}`, origin);
  if (url.origin !== new URL(origin).origin) throw new Error("MiniMind artifact must be same-origin.");
  return url.href;
}

function logicalName(file: string) {
  if (file.startsWith("tokenizer_config.")) return "tokenizer_config.json";
  if (file.startsWith("tokenizer.")) return "tokenizer.json";
  if (file.startsWith("config.")) return "config.json";
  if (file.startsWith("readouts.")) return "readouts.json";
  if (file.startsWith("model.")) return file;
  throw new Error("Unknown MiniMind artifact.");
}

function readout(vector: number[], group: ReadoutGroup, multiplier: number) {
  const scores = group.centroids.map((centroid) => centroid.reduce((sum, value, index) => sum + value * vector[index], 0));
  const peak = Math.max(...scores);
  const weights = scores.map((score) => Math.exp((score - peak) * multiplier));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let index = 0;
  for (let cursor = 1; cursor < scores.length; cursor += 1) if (scores[cursor] > scores[index]) index = cursor;
  return { label: group.labels[index], confidence: weights[index] / total };
}

export function createMiniMindWorkerRuntime(dependencies: MiniMindWorkerDependencies) {
  let state: MiniMindBrowserState = {
    phase: "available",
    source: null,
    backend: null,
    progress: null,
    message: "MiniMind is optional and has not been enabled.",
  };
  let engine: MiniMindInferenceEngine | null = null;
  let artifacts: MiniMindArtifactSet | null = null;
  let controller: AbortController | null = null;
  let enableInFlight: Promise<void> | null = null;
  let startInFlight: Promise<void> | null = null;
  let queue: Promise<void> = Promise.resolve();

  // ONNX Runtime Web rejects overlapping session.run calls on one session, so
  // every operation that may touch the engine runs through a single chain.
  // The chain itself never rejects; each caller observes only its own result.
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const run = queue.then(operation, operation);
    queue = run.then(() => undefined, () => undefined);
    return run;
  }

  const publish = (next: MiniMindBrowserState) => {
    state = next;
    dependencies.postMessage({ type: "state", state });
  };
  const baseState = (phase: MiniMindBrowserState["phase"], message: string, source: MiniMindSource | null = null): MiniMindBrowserState => ({
    phase,
    source,
    backend: null,
    progress: null,
    message,
  });
  const manifestUrl = new URL(MINI_MIND_MANIFEST_URL, dependencies.origin).href;

  async function evict(cache: CacheLike, manifest?: BrowserManifest) {
    if (!manifest) {
      const keys = await cache.keys();
      await Promise.all(keys.map((request) => cache.delete(request).catch(() => false)));
      return;
    }
    await cache.delete(manifestUrl).catch(() => false);
    await Promise.all(manifest.files.map((entry) => cache.delete(artifactUrl(dependencies.origin, entry.file)).catch(() => false)));
  }

  async function verifyArtifacts(cache: CacheLike, manifest: BrowserManifest): Promise<MiniMindArtifactSet> {
    const urls = new Map<string, string>();
    let readouts: BrowserReadouts | null = null;
    for (const entry of manifest.files) {
      const url = artifactUrl(dependencies.origin, entry.file);
      const response = await cache.match(url);
      if (!response) throw new Error(`MiniMind artifact is missing: ${entry.file}`);
      const bytes = await readBounded(response, entry.bytes);
      if (bytes.byteLength !== entry.bytes || await sha256(dependencies.crypto, bytes) !== entry.sha256) {
        throw new Error(`MiniMind artifact verification failed: ${entry.file}`);
      }
      const logical = logicalName(entry.file);
      urls.set(logical, url);
      if (logical === "readouts.json") readouts = parseReadouts(parseJson(bytes, "MiniMind readouts"));
    }
    if (!readouts) throw new Error("MiniMind readouts are missing.");
    return { cache, crypto: dependencies.crypto, manifest, readouts, urls };
  }

  async function loadFromCache(cache: CacheLike) {
    const cachedManifest = await cache.match(manifestUrl);
    if (!cachedManifest) {
      // An interrupted download can leave verified artifacts behind without a
      // manifest; they can never be restored, so reclaim the space now.
      const keys = await cache.keys();
      if (keys.length > 0) await evict(cache);
      return null;
    }
    let manifest: BrowserManifest | undefined;
    try {
      publish(baseState("cached", "Checking the MiniMind files saved in this browser.", "cache"));
      const bytes = await readBounded(cachedManifest, MAX_MANIFEST_BYTES);
      manifest = parseManifest(parseJson(bytes, "MiniMind browser manifest"));
      return await verifyArtifacts(cache, manifest);
    } catch {
      await evict(cache, manifest);
      publish(baseState("available", "Saved MiniMind files were incomplete. Enable MiniMind to download a clean copy."));
      return null;
    }
  }

  async function initialize(verified: MiniMindArtifactSet, source: MiniMindSource) {
    const attempts: MiniMindBackend[] = dependencies.hasWebGpu() ? ["webgpu", "wasm"] : ["wasm"];
    let lastError: unknown;
    for (const backend of attempts) {
      publish(baseState("loading", backend === "webgpu" ? "Starting MiniMind with this device's graphics processor." : "Starting MiniMind in this browser.", source));
      let candidate: MiniMindInferenceEngine | null = null;
      try {
        candidate = await dependencies.createInferenceEngine(verified, backend);
        const fixture = await candidate.embed(["A neighbor reports a small village dispute."]);
        const vector = fixture[0];
        const norm = vector?.reduce((sum, value) => sum + value * value, 0) ?? 0;
        if (
          fixture.length !== 1
          || vector.length !== verified.readouts.dimensions
          || vector.some((value) => !Number.isFinite(value))
          || Math.abs(norm - 1) > 1e-3
        ) {
          throw new Error("MiniMind readiness check failed.");
        }
        const scores = await candidate.score(
          "<|im_start|>user\nChoose one supplied note.<|im_end|>\n<|im_start|>assistant\n",
          ["Let this matter rest.", "Seek a small reparation."],
        );
        if (
          scores.length !== 2
          || scores.some((value) => !Number.isFinite(value))
          || Math.abs(scores[0] - scores[1]) < Number.EPSILON
        ) {
          throw new Error("MiniMind readiness check failed.");
        }
        const previous = engine;
        engine = candidate;
        artifacts = verified;
        if (previous && previous !== candidate) await previous.dispose().catch(() => undefined);
        publish({ phase: "ready", source, backend, progress: null, message: "MiniMind ready · runs on this device" });
        return;
      } catch (error) {
        if (candidate) await candidate.dispose().catch(() => undefined);
        lastError = error;
      }
    }
    void lastError;
    publish(baseState("unsupported", "MiniMind could not start in this browser. Try a current Chrome or Edge browser, retry, or continue with manual facts.", source));
  }

  async function download() {
    if (enableInFlight) return enableInFlight;
    enableInFlight = (async () => {
      let cache: CacheLike | undefined;
      let manifest: BrowserManifest | undefined;
      try {
        // Never race the initial cached restore; if it already produced an
        // engine there is nothing to fetch.
        if (startInFlight) await startInFlight.catch(() => undefined);
        if (engine && artifacts && state.phase === "ready") {
          publish(state);
          return;
        }
        if (!dependencies.crypto?.subtle) {
          publish(baseState("unsupported", UNSUPPORTED_CRYPTO_MESSAGE));
          return;
        }
        controller = new AbortController();
        cache = await dependencies.cacheStorage.open(CACHE_NAME);
        // A verified cache whose engine failed to start (or a restore that
        // never ran) can be initialized again without touching the network.
        const restored = await loadFromCache(cache);
        if (restored) {
          await initialize(restored, "cache");
          return;
        }
        controller.signal.throwIfAborted();
        publish(baseState("downloading", "Getting the MiniMind file list.", "download"));
        const manifestResponse = await dependencies.fetch(manifestUrl, {
          signal: controller.signal,
          credentials: "omit",
          redirect: "error",
          cache: "no-store",
        });
        if (!manifestResponse.ok) throw new DownloadFailure("The MiniMind file list is unavailable.");
        const manifestBytes = await readBounded(manifestResponse, MAX_MANIFEST_BYTES);
        manifest = parseManifest(parseJson(manifestBytes, "MiniMind browser manifest"));
        const total = manifest.files.reduce((sum, entry) => sum + entry.bytes, 0);
        let completed = 0;
        let lastPublishedLoaded = -1;
        let lastPublishedAt = Date.now();
        for (const entry of manifest.files) {
          controller.signal.throwIfAborted();
          const url = artifactUrl(dependencies.origin, entry.file);
          const response = await dependencies.fetch(url, {
            signal: controller.signal,
            credentials: "omit",
            redirect: "error",
            cache: "no-store",
          });
          if (!response.ok) throw new DownloadFailure(`A required MiniMind file is unavailable: ${entry.file}.`);
          const bytes = await readBounded(response, entry.bytes, (received) => {
            const loaded = completed + received;
            const now = Date.now();
            const final = received >= entry.bytes;
            if (!final && loaded - lastPublishedLoaded < PROGRESS_BYTES_INTERVAL && now - lastPublishedAt < PROGRESS_TIME_INTERVAL_MS) return;
            lastPublishedLoaded = loaded;
            lastPublishedAt = now;
            publish({
              phase: "downloading",
              source: "download",
              backend: null,
              progress: {
                loaded,
                total,
                percent: Math.min(100, (loaded / total) * 100),
                file: entry.file,
              },
              message: "Downloading MiniMind to this browser.",
            });
          });
          if (bytes.byteLength !== entry.bytes || await sha256(dependencies.crypto, bytes) !== entry.sha256) {
            throw new DownloadFailure(`MiniMind file verification failed: ${entry.file}.`);
          }
          await cache.put(url, new Response(bytes.slice().buffer as ArrayBuffer, { headers: response.headers }));
          completed += entry.bytes;
        }
        publish({
          phase: "verifying",
          source: "download",
          backend: null,
          progress: { loaded: total, total, percent: 100, file: null },
          message: "Checking the downloaded MiniMind files.",
        });
        const verified = await verifyArtifacts(cache, manifest);
        await cache.put(manifestUrl, new Response(manifestBytes, { headers: { "content-type": "application/json" } }));
        await initialize(verified, "download");
      } catch (error) {
        if (cache) await evict(cache, manifest).catch(() => undefined);
        if (controller?.signal.aborted) {
          publish(baseState("available", "MiniMind download canceled. Manual facts are still available."));
          return;
        }
        // Fixed copy only: browser and network errors are never echoed.
        publish(baseState("failed", error instanceof DownloadFailure ? error.message + RETRY_SUFFIX : ENABLE_FAILED_MESSAGE));
        throw error;
      } finally {
        controller = null;
        enableInFlight = null;
      }
    })();
    return enableInFlight;
  }

  function requireReady() {
    if (!engine || !artifacts || state.phase !== "ready") throw new Error("MiniMind is not ready. Enable it or continue with manual facts.");
    return { engine, readouts: artifacts.readouts };
  }

  async function encode(petition: string) {
    const ready = requireReady();
    const vectors = await ready.engine.embed([petition]);
    const vector = vectors[0];
    if (!vector || vector.length !== ready.readouts.dimensions || vector.some((value) => !Number.isFinite(value))) throw new Error("MiniMind could not read this petition.");
    const facts: Record<string, string> = {};
    const fieldConfidence: Record<string, number> = {};
    for (const field of FACT_FIELDS) {
      const result = readout(vector, ready.readouts.fields[field], ready.readouts.temperature_multiplier);
      facts[field] = result.label;
      fieldConfidence[field] = result.confidence;
    }
    return {
      facts,
      field_confidence: fieldConfidence,
      receipt: {
        input: ["petition"],
        output: FACT_FIELDS,
        answer_labels_available: false,
        requires_confirmation: true,
        mode: "frozen MiniMind embedding with teaching-only field readouts",
      },
    };
  }

  async function verbalize(facts: Record<keyof typeof FACT_OPTIONS, string>, action: keyof typeof ACTIONS, confidenceBand: string) {
    const ready = requireReady();
    const candidates = authoredMiniMindNotes(facts, action);
    const pythonFactMap = `{${FACT_FIELDS.map((field) => `'${field}': '${facts[field]}'`).join(", ")}}`;
    const prompt = "<|im_start|>system\nSelect one supplied counsel note. The action is fixed and cannot be changed.<|im_end|>\n<|im_start|>user\n"
      + `Selected action: ${ACTIONS[action]}\nConfirmed facts: ${pythonFactMap}\n`
      + `Confidence band: ${confidenceBand}<|im_end|>\n<|im_start|>assistant\n`;
    const scores = await ready.engine.score(prompt, candidates);
    if (scores.length !== candidates.length || scores.some((value) => !Number.isFinite(value))) throw new Error("MiniMind could not select a counsel note.");
    let selected = 0;
    for (let index = 1; index < scores.length; index += 1) if (scores[index] > scores[selected]) selected = index;
    const peak = Math.max(...scores);
    const weights = scores.map((score) => Math.exp(score - peak));
    return {
      text: candidates[selected],
      action,
      selection_confidence: weights[selected] / weights.reduce((sum, value) => sum + value, 0),
      receipt: {
        input: ["selected_action", "confirmed_facts", "confidence_band"],
        alternative_actions_available: false,
        output_mode: "allow-listed sentence selection",
      },
    };
  }

  async function benchmark(cases: Array<{ id: string; petition: string }>) {
    const ready = requireReady();
    const vectors = await ready.engine.embed(cases.map((entry) => entry.petition));
    if (vectors.length !== cases.length) throw new Error("MiniMind benchmark returned the wrong number of rows.");
    return {
      rows: cases.map((entry, index) => {
        const vector = vectors[index];
        if (!vector || vector.length !== ready.readouts.dimensions || vector.some((value) => !Number.isFinite(value))) throw new Error("MiniMind benchmark returned an invalid row.");
        const result = readout(vector, ready.readouts.actions, ready.readouts.temperature_multiplier);
        return { id: entry.id, action: result.label, confidence: result.confidence };
      }),
      model_revision: MODEL_REVISION,
    };
  }

  async function restore() {
    try {
      if (!dependencies.crypto?.subtle) {
        publish(baseState("unsupported", UNSUPPORTED_CRYPTO_MESSAGE));
        return;
      }
      const cache = await dependencies.cacheStorage.open(CACHE_NAME);
      const cached = await loadFromCache(cache);
      if (cached) await initialize(cached, "cache");
      else if (state.phase !== "available") publish(baseState("available", "MiniMind is optional and has not been enabled."));
    } catch {
      publish(baseState("unsupported", "This browser cannot use saved MiniMind files. Continue with manual facts."));
    }
  }

  function start() {
    if (!startInFlight) startInFlight = restore();
    return startInFlight;
  }

  async function release() {
    if (startInFlight) await startInFlight.catch(() => undefined);
    const current = engine;
    engine = null;
    artifacts = null;
    if (current) await current.dispose();
  }

  async function handle(raw: unknown) {
    const possibleId = isObject(raw) && Number.isSafeInteger(raw.id) ? raw.id as number : 0;
    try {
      const command = parseCommand(raw);
      let result: unknown = null;
      if (command.type === "enable") await serialize(download);
      else if (command.type === "cancel") {
        // Cancel bypasses the queue so it can interrupt an in-flight download.
        controller?.abort(new DOMException("Download canceled", "AbortError"));
        if (enableInFlight) await enableInFlight.catch(() => undefined);
      } else if (command.type === "encode") result = await serialize(() => encode(command.petition));
      else if (command.type === "verbalize") result = await serialize(() => verbalize(command.facts, command.action as keyof typeof ACTIONS, command.confidenceBand));
      else if (command.type === "benchmark") result = await serialize(() => benchmark(command.cases));
      else if (command.type === "dispose") {
        controller?.abort();
        // Wait for whatever is running on the session before releasing it.
        await serialize(release);
      }
      dependencies.postMessage({ id: command.id, type: "result", result });
    } catch {
      dependencies.postMessage({ id: possibleId, type: "error", message: "MiniMind could not finish this local operation." });
    }
  }

  return { start, handle, getState: () => state };
}

export async function createTransformersEngine(artifacts: MiniMindArtifactSet, backend: MiniMindBackend): Promise<MiniMindInferenceEngine> {
  const ort = backend === "webgpu"
    ? await import("onnxruntime-web/webgpu")
    : await import("onnxruntime-web/wasm");
  // Transformers.js honors this symbol as an injected runtime. Set it before
  // importing the tokenizer so its tensor wrappers use our pinned ORT version.
  (globalThis as unknown as Record<symbol, unknown>)[Symbol.for("onnxruntime")] = ort;
  const transformers = await import("@huggingface/transformers");
  const { AutoTokenizer, env } = transformers;
  // Transformers.js sets a jsdelivr CDN default for ORT's `wasmPaths` while it
  // is imported. Clearing it on the injected runtime and on Transformers'
  // own view restores ORT's default resolution: the glue embedded in the
  // bundle plus the .wasm binaries Next emits under /_next/static, so no
  // request ever leaves the page's origin.
  ort.env.wasm.wasmPaths = undefined;
  const transformersOnnx = (env as { backends?: { onnx?: { wasm?: { wasmPaths?: unknown } } } }).backends?.onnx?.wasm;
  if (transformersOnnx) transformersOnnx.wasmPaths = undefined;
  const modelFile = [...artifacts.urls.keys()].find((name) => name.endsWith(".onnx"));
  if (!modelFile) throw new Error("MiniMind model is missing.");
  const aliases = new Map<string, string>([
    ["config.json", artifacts.urls.get("config.json")!],
    ["tokenizer.json", artifacts.urls.get("tokenizer.json")!],
    ["tokenizer_config.json", artifacts.urls.get("tokenizer_config.json")!],
  ]);
  const entries = new Map(artifacts.manifest.files.map((entry) => [logicalName(entry.file), entry]));
  const readVerified = async (name: string) => {
    const entry = entries.get(name);
    const url = artifacts.urls.get(name);
    if (!entry || !url) throw new Error(`MiniMind artifact is missing: ${name}`);
    const response = await artifacts.cache.match(url);
    if (!response) throw new Error(`MiniMind artifact is missing: ${name}`);
    const bytes = await readBounded(response, entry.bytes);
    if (bytes.byteLength !== entry.bytes || await sha256(artifacts.crypto, bytes) !== entry.sha256) {
      throw new Error(`MiniMind artifact changed after verification: ${name}`);
    }
    return { bytes, headers: response.headers };
  };
  const aliasCache = {
    async match(request: RequestInfo | URL) {
      const normalized = String(request).replaceAll("\\", "/");
      const alias = [...aliases.entries()].find(([name]) => normalized.endsWith(`/${name}`));
      if (!alias) return undefined;
      const verified = await readVerified(alias[0]);
      return new Response(verified.bytes, { headers: verified.headers });
    },
    async put() {
      throw new Error("MiniMind runtime may not write unverified cache entries.");
    },
  };
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.useBrowserCache = false;
  env.useFSCache = false;
  env.useCustomCache = true;
  env.customCache = aliasCache;
  let session: Awaited<ReturnType<typeof ort.InferenceSession.create>> | null = null;
  try {
    const modelRoot = "/minimind/runtime";
    const tokenizer = await AutoTokenizer.from_pretrained(modelRoot, { local_files_only: true });
    const { bytes: modelBytes } = await readVerified(modelFile);
    const wasmPaths = ort.env.wasm.wasmPaths;
    const remote = (value: unknown) => typeof value === "string" && /^[a-z]+:\/\//i.test(value) && !value.startsWith(`${new URL(artifacts.urls.get("config.json")!).origin}/`);
    if (remote(wasmPaths) || (typeof wasmPaths === "object" && wasmPaths !== null && Object.values(wasmPaths).some((value) => remote(String(value))))) {
      throw new Error("MiniMind runtime files must be same-origin.");
    }
    session = await ort.InferenceSession.create(modelBytes, {
      executionProviders: [backend],
      graphOptimizationLevel: "all",
    });
    const loadedSession = session;

    const makeInt64Tensor = (data: BigInt64Array, dimensions: readonly number[]) =>
      new ort.Tensor("int64", data, [...dimensions]);

    const embed = async (petitions: string[]) => {
      const prompts = petitions.map((petition) => `<|im_start|>user\nRead this village petition literally: ${petition}<|im_end|>\n<|im_start|>assistant\n`);
      const inputs = tokenizer(prompts, { padding: true, truncation: true, max_length: 256 });
      const inputIds = makeInt64Tensor(inputs.input_ids.data as BigInt64Array, inputs.input_ids.dims);
      const attentionMask = makeInt64Tensor(inputs.attention_mask.data as BigInt64Array, inputs.attention_mask.dims);
      const outputs = await loadedSession.run({ input_ids: inputIds, attention_mask: attentionMask });
      const hidden = outputs.last_hidden_state;
      if (!hidden || hidden.dims.length !== 3) throw new Error("MiniMind model did not return hidden states.");
      const [batch, sequence, dimensions] = hidden.dims;
      const hiddenData = hidden.data as Float32Array;
      const maskData = inputs.attention_mask.data as BigInt64Array;
      const vectors: number[][] = [];
      for (let row = 0; row < batch; row += 1) {
        const pooled = new Array<number>(dimensions).fill(0);
        let count = 0;
        for (let token = 0; token < sequence; token += 1) {
          if (Number(maskData[row * sequence + token]) === 0) continue;
          count += 1;
          const offset = (row * sequence + token) * dimensions;
          for (let column = 0; column < dimensions; column += 1) pooled[column] += Number(hiddenData[offset + column]);
        }
        const divisor = Math.max(count, 1);
        for (let column = 0; column < dimensions; column += 1) pooled[column] /= divisor;
        const norm = Math.max(Math.sqrt(pooled.reduce((sum, value) => sum + value * value, 0)), 1e-12);
        vectors.push(pooled.map((value) => value / norm));
      }
      return vectors;
    };

    const score = async (prompt: string, candidates: string[]) => {
      const prefix = tokenizer.encode(prompt, { add_special_tokens: false });
      const encoded = candidates.map((candidate) => [...prefix, ...tokenizer.encode(candidate, { add_special_tokens: false })]);
      const width = Math.max(...encoded.map((row) => row.length));
      const padId = tokenizer.pad_token_id || tokenizer.eos_token_id || 0;
      const ids = new BigInt64Array(encoded.length * width).fill(BigInt(padId));
      const mask = new BigInt64Array(encoded.length * width);
      encoded.forEach((row, rowIndex) => row.forEach((value, column) => {
        ids[rowIndex * width + column] = BigInt(value);
        mask[rowIndex * width + column] = 1n;
      }));
      const output = await loadedSession.run({
        input_ids: makeInt64Tensor(ids, [encoded.length, width]),
        attention_mask: makeInt64Tensor(mask, [encoded.length, width]),
      });
      const logits = output.logits;
      if (!logits || logits.dims.length !== 3) throw new Error("MiniMind model did not return logits.");
      const vocabulary = logits.dims[2];
      const data = logits.data as Float32Array;
      return encoded.map((row, rowIndex) => {
        const start = Math.max(0, prefix.length - 1);
        let total = 0;
        let count = 0;
        for (let position = start; position < row.length - 1; position += 1) {
          const offset = (rowIndex * width + position) * vocabulary;
          let peak = -Infinity;
          for (let token = 0; token < vocabulary; token += 1) peak = Math.max(peak, Number(data[offset + token]));
          let denominator = 0;
          for (let token = 0; token < vocabulary; token += 1) denominator += Math.exp(Number(data[offset + token]) - peak);
          total += Number(data[offset + row[position + 1]]) - peak - Math.log(denominator);
          count += 1;
        }
        if (!count) throw new Error("MiniMind candidate produced no scoreable tokens.");
        return total / count;
      });
    };

    return {
      embed,
      score,
      async dispose() { await loadedSession.release(); },
    };
  } catch (error) {
    if (session) await session.release().catch(() => undefined);
    throw error;
  } finally {
    env.customCache = null;
    env.useCustomCache = false;
  }
}

type DedicatedWorkerScopeLike = {
  location: { origin: string };
  fetch: typeof fetch;
  caches: CacheStorage;
  crypto: Crypto;
  navigator: Navigator & { gpu?: unknown };
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
};

function isDedicatedWorker() {
  return globalThis.constructor?.name === "DedicatedWorkerGlobalScope";
}

if (isDedicatedWorker()) {
  const scope = globalThis as unknown as DedicatedWorkerScopeLike;
  const runtime = createMiniMindWorkerRuntime({
    origin: scope.location.origin,
    fetch: scope.fetch.bind(scope),
    cacheStorage: scope.caches,
    crypto: scope.crypto,
    hasWebGpu: () => "gpu" in scope.navigator,
    createInferenceEngine: createTransformersEngine,
    postMessage: (message) => scope.postMessage(message),
  });
  scope.onmessage = (event) => { void runtime.handle(event.data); };
  void runtime.start();
}
