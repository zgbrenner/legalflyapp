// @vitest-environment node
/**
 * JavaScript runtime parity against the PyTorch reference.
 *
 * `tools/export_minimind_readouts.py --compare` proves PyTorch and ONNX Runtime CPU
 * agree when both use the Python tokenizer. This suite closes the remaining gap: it
 * drives the production stack (Transformers.js tokenizer + ONNX Runtime Web, through
 * the real `createTransformersEngine` and `createMiniMindWorkerRuntime`) over a real
 * converted bundle and checks every discrete decision against the labels the Python
 * reference exported into `tests/fixtures/minimind-expectations.json`.
 *
 * Every reference decision carries its margin (top-1 minus top-2 cosine score). Decisions
 * at or above the fixture's `margin_floor` must match exactly. Decisions below it are
 * knife edges that another float32 backend may legitimately flip, so the JavaScript label
 * must be one of the reference's top two, and each such case is logged with its margin.
 * The number of sub-floor decisions must equal the count the fixture declares, so a
 * regenerated fixture cannot widen the tolerance silently.
 *
 * The suite is opt-in: it runs only when `LEGALFLY_TEST_MINIMIND_BUNDLE` names a verified
 * bundle directory (a missing manifest there is a hard error) and is skipped otherwise, so
 * plain `npm test` stays fast. Run it with `npm run test:minimind-runtime`.
 */

import { webcrypto } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  MINI_MIND_MANIFEST_URL,
  createMiniMindWorkerRuntime,
  createTransformersEngine,
  type MiniMindArtifactSet,
  type MiniMindInferenceEngine,
} from "@/workers/minimind.worker";
import rawExpectations from "./fixtures/minimind-expectations.json";

type MiniMindBackend = Parameters<typeof createTransformersEngine>[1];

type Expectations = {
  schema: string;
  model: string;
  revision: string;
  source_sha256: string;
  readouts_sha256: string;
  teaching_cases_sha256: string;
  cases_sha256: string;
  confidence_band: "low" | "medium" | "high";
  margin_floor: number;
  margin_floor_rationale: string;
  sub_floor_decisions: Array<{ case: string; decision: string; margin: number; labels: [string, string] }>;
  sub_floor_count: number;
  note_actions: string[];
  note_subject: { field: string; placeholder: string; none: string };
  note_templates: Record<string, string[]>;
  fields: string[];
  case_count: number;
  cases: Array<{
    id: string;
    split: string;
    label: string;
    facts: Record<string, string>;
    action: string;
    margins: Record<string, number>;
    runners_up: Record<string, string>;
    notes: Record<string, number[]>;
  }>;
};

type Mismatch = { case: string; decision: string; margin: number; expected: string; runnerUp: string | null; actual: string };

type LockedCase = { id: string; split: string; label: string; petition: string; facts: Record<string, string> };

type ManifestFile = { file: string; bytes: number; sha256: string };

const SUITE_TIMEOUT_MS = 10 * 60 * 1000;
const ORIGIN = "http://127.0.0.1";
const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const CASES_PATH = path.join(WEB_ROOT, "public", "legalfly", "cases.json");
const expectations = rawExpectations as unknown as Expectations;

function resolveBundleDirectory(): string | null {
  const configured = process.env.LEGALFLY_TEST_MINIMIND_BUNDLE;
  if (!configured) return null;
  const directory = path.resolve(process.cwd(), configured);
  if (!existsSync(path.join(directory, "manifest.json"))) {
    throw new Error(`LEGALFLY_TEST_MINIMIND_BUNDLE=${configured} does not contain a manifest.json`);
  }
  return directory;
}

/**
 * Compare one JavaScript decision with the reference. At or above the margin floor the
 * label must match exactly; below it the label must be one of the reference's top two.
 */
function judge(
  entry: Expectations["cases"][number],
  decision: string,
  expected: string,
  actual: string,
  mismatches: Mismatch[],
  subFloor: string[],
) {
  const margin = entry.margins[decision];
  const runnerUp = entry.runners_up[decision];
  if (margin >= expectations.margin_floor) {
    if (actual !== expected) mismatches.push({ case: entry.id, decision, margin, expected, runnerUp: null, actual });
    return;
  }
  const tolerated = actual === expected || actual === runnerUp;
  subFloor.push(`[minimind-runtime-parity] sub-floor ${entry.id} ${decision} margin=${margin.toExponential(3)} reference=${expected} runner-up=${runnerUp} javascript=${actual}${tolerated ? "" : " (OUTSIDE TOP TWO)"}`);
  if (!tolerated) mismatches.push({ case: entry.id, decision, margin, expected, runnerUp, actual });
}

/** Mirror `json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)`. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await webcrypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function elapsed(since: number) {
  return `${((performance.now() - since) / 1000).toFixed(1)}s`;
}

/**
 * A Cache API stand-in backed by the on-disk bundle. It serves exactly the URLs the
 * worker computes for `ORIGIN`, refuses writes, and records every delete so the suite
 * can prove verification never evicted anything.
 */
class BundleCache {
  readonly deleted: string[] = [];
  readonly served: string[] = [];

  constructor(private readonly files: ReadonlyMap<string, string>) {}

  private static url(request: RequestInfo | URL) {
    return request instanceof Request ? request.url : String(request);
  }

  async match(request: RequestInfo | URL) {
    const url = BundleCache.url(request);
    const file = this.files.get(url);
    if (!file) return undefined;
    this.served.push(url);
    const bytes = await readFile(file);
    return new Response(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
      status: 200,
      headers: {
        "content-type": file.endsWith(".json") ? "application/json" : "application/octet-stream",
        "content-length": String(bytes.byteLength),
      },
    });
  }

  async put(request: RequestInfo | URL) {
    throw new Error(`The parity bundle cache is read-only: ${BundleCache.url(request)}`);
  }

  async delete(request: RequestInfo | URL) {
    this.deleted.push(BundleCache.url(request));
    return false;
  }

  async keys() {
    return [...this.files.keys()].map((url) => new Request(url));
  }
}

const bundleDirectory = resolveBundleDirectory();
if (!bundleDirectory) {
  console.warn(
    "[minimind-runtime-parity] skipped: set LEGALFLY_TEST_MINIMIND_BUNDLE to a verified bundle directory (for example public/minimind) to run the JavaScript runtime parity suite.",
  );
}
const suite = bundleDirectory ? describe : describe.skip;

suite(
  bundleDirectory
    ? "MiniMind JavaScript runtime parity"
    : "MiniMind JavaScript runtime parity (skipped: set LEGALFLY_TEST_MINIMIND_BUNDLE to a verified bundle directory)",
  () => {
    const cases = JSON.parse(readFileSync(CASES_PATH, "utf-8")) as LockedCase[];
    // The describe body is collected even when skipped, so only touch the bundle when it exists.
    const manifest = bundleDirectory
      ? JSON.parse(readFileSync(path.join(bundleDirectory, "manifest.json"), "utf-8")) as { files: ManifestFile[] }
      : { files: [] as ManifestFile[] };
    const petitions = cases.map((entry) => entry.petition);
    const messages: unknown[] = [];
    const fetchCalls: string[] = [];
    const engineErrors: unknown[] = [];
    const backends: MiniMindBackend[] = [];
    const timings: Record<string, string> = {};
    let cache: BundleCache;
    let runtime: ReturnType<typeof createMiniMindWorkerRuntime>;
    let nextId = 1;

    async function call<T>(command: Record<string, unknown>): Promise<T> {
      const id = nextId;
      nextId += 1;
      const before = messages.length;
      await runtime.handle({ id, ...command });
      const reply = messages.slice(before).find((message) => isObject(message) && message.id === id);
      if (!isObject(reply)) throw new Error(`MiniMind worker posted no reply for ${String(command.type)} #${id}`);
      if (reply.type !== "result") throw new Error(`MiniMind worker rejected ${String(command.type)} #${id}: ${String(reply.message)}`);
      return reply.result as T;
    }

    async function createEngine(artifacts: MiniMindArtifactSet, backend: MiniMindBackend): Promise<MiniMindInferenceEngine> {
      backends.push(backend);
      try {
        // Under Node, ONNX Runtime Web cannot fetch() its .wasm binary from a file:// URL and
        // has no Worker global for its thread pool. Hand it the pinned binary directly and pin
        // the pool to one thread; everything else is the production engine, untouched.
        const ort = await import("onnxruntime-web/wasm");
        const require = createRequire(import.meta.url);
        ort.env.wasm.wasmBinary = readFileSync(require.resolve("onnxruntime-web/ort-wasm-simd-threaded.wasm"));
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.proxy = false;
        return await createTransformersEngine(artifacts, backend);
      } catch (error) {
        engineErrors.push(error);
        throw error;
      }
    }

    beforeAll(async () => {
      const started = performance.now();
      const files = new Map<string, string>();
      files.set(new URL(MINI_MIND_MANIFEST_URL, ORIGIN).href, path.join(bundleDirectory!, "manifest.json"));
      for (const entry of manifest.files) files.set(new URL(`/minimind/${entry.file}`, ORIGIN).href, path.join(bundleDirectory!, entry.file));
      cache = new BundleCache(files);
      runtime = createMiniMindWorkerRuntime({
        origin: ORIGIN,
        fetch: (async (input: RequestInfo | URL) => {
          fetchCalls.push(String(input));
          throw new Error("Network access is disabled in the parity suite.");
        }) as unknown as typeof fetch,
        cacheStorage: { open: async () => cache as unknown as Cache },
        crypto: webcrypto as unknown as Crypto,
        hasWebGpu: () => false,
        createInferenceEngine: createEngine,
        postMessage: (message) => messages.push(message),
      });
      await runtime.start();
      timings.ready = elapsed(started);
      console.info(`[minimind-runtime-parity] bundle ${bundleDirectory} · runtime ${runtime.getState().phase} in ${timings.ready}`);
    }, SUITE_TIMEOUT_MS);

    afterAll(async () => {
      if (runtime && runtime.getState().phase === "ready") await runtime.handle({ id: nextId, type: "dispose" });
      console.info(`[minimind-runtime-parity] timings ${JSON.stringify(timings)}`);
    }, SUITE_TIMEOUT_MS);

    it("ties the fixture to the locked cases and the shipped readouts", async () => {
      expect(expectations.schema).toBe("legalfly-minimind-expectations/1");
      expect(expectations.case_count).toBe(48);
      expect(expectations.cases).toHaveLength(48);
      expect(cases).toHaveLength(48);
      expect(expectations.cases.map((entry) => entry.id)).toEqual(cases.map((entry) => entry.id));
      expect(expectations.confidence_band).toBe("medium");
      expect(expectations.fields).toEqual(["matter", "property", "harm", "proof", "intent", "relationship", "urgency", "ability"]);
      expect(expectations.margin_floor).toBe(5e-4);

      const casesDigest = await sha256Hex(new TextEncoder().encode(canonicalJson(cases)));
      expect(casesDigest).toBe(expectations.cases_sha256);

      const readoutsEntry = manifest.files.find((entry) => entry.file.startsWith("readouts."));
      expect(readoutsEntry?.sha256).toBe(expectations.readouts_sha256);
      const readouts = JSON.parse(readFileSync(path.join(bundleDirectory!, readoutsEntry!.file), "utf-8")) as { teaching_cases_sha256: string };
      expect(readouts.teaching_cases_sha256).toBe(expectations.teaching_cases_sha256);
    });

    it("declares exactly the sub-floor decisions its margins imply", () => {
      const implied = expectations.cases.flatMap((entry) => [...expectations.fields, "action"].flatMap((decision) => {
        const margin = entry.margins[decision];
        expect(Number.isFinite(margin) && margin >= 0, `${entry.id}/${decision} margin`).toBe(true);
        if (margin >= expectations.margin_floor) return [];
        const label = decision === "action" ? entry.action : entry.facts[decision];
        return [{ case: entry.id, decision, margin, labels: [label, entry.runners_up[decision]] }];
      }));
      expect(implied).toEqual(expectations.sub_floor_decisions);
      expect(expectations.sub_floor_count).toBe(implied.length);
      console.info(`[minimind-runtime-parity] ${implied.length} sub-floor decision(s) below margin_floor=${expectations.margin_floor}: ${implied.map((item) => `${item.case}/${item.decision}@${item.margin.toExponential(3)}`).join(", ") || "none"}`);
    });

    it("restores the verified bundle from cache and becomes ready on the wasm backend", () => {
      const state = runtime.getState();
      const diagnostics = engineErrors.map((error) => (error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error))).join("\n---\n");
      expect(state, `state=${JSON.stringify(state)}\nengine errors:\n${diagnostics}`).toMatchObject({ phase: "ready", source: "cache", backend: "wasm" });
      expect(backends).toEqual(["wasm"]);
      expect(cache.deleted).toEqual([]);
    });

    it(
      "encodes every locked case to the reference field labels",
      async () => {
        const started = performance.now();
        const mismatches: Mismatch[] = [];
        const subFloor: string[] = [];
        let decisions = 0;
        for (const [index, entry] of cases.entries()) {
          const expected = expectations.cases[index];
          const result = await call<{ facts: Record<string, string> }>({ type: "encode", petition: entry.petition });
          for (const field of expectations.fields) {
            judge(expected, field, expected.facts[field], result.facts[field], mismatches, subFloor);
            decisions += 1;
          }
        }
        timings.encode = elapsed(started);
        for (const line of subFloor) console.info(line);
        console.info(`[minimind-runtime-parity] encode ${cases.length} cases (${decisions} field decisions, ${subFloor.length} sub-floor) in ${timings.encode}`);
        expect(decisions).toBe(cases.length * expectations.fields.length);
        expect(mismatches).toEqual([]);
      },
      SUITE_TIMEOUT_MS,
    );

    it(
      "benchmarks every locked case to the reference action labels",
      async () => {
        const started = performance.now();
        const mismatches: Mismatch[] = [];
        const subFloor: string[] = [];
        let decisions = 0;
        const batchSize = 24; // The worker accepts at most 32 cases per benchmark command.
        for (let offset = 0; offset < cases.length; offset += batchSize) {
          const batch = cases.slice(offset, offset + batchSize);
          const result = await call<{ rows: Array<{ id: string; action: string }> }>({
            type: "benchmark",
            cases: batch.map((entry) => ({ id: entry.id, petition: entry.petition })),
          });
          expect(result.rows.map((row) => row.id)).toEqual(batch.map((entry) => entry.id));
          for (const [index, row] of result.rows.entries()) {
            const expected = expectations.cases[offset + index];
            judge(expected, "action", expected.action, row.action, mismatches, subFloor);
            decisions += 1;
          }
        }
        timings.benchmark = elapsed(started);
        for (const line of subFloor) console.info(line);
        console.info(`[minimind-runtime-parity] benchmark ${cases.length} cases (${decisions} action decisions, ${subFloor.length} sub-floor) in ${timings.benchmark}`);
        expect(decisions).toBe(cases.length);
        expect(mismatches).toEqual([]);
      },
      SUITE_TIMEOUT_MS,
    );

    it(
      "selects the reference counsel note for every action on representative cases",
      async () => {
        const started = performance.now();
        // One teaching and one holdout case per authored action label, or every case on request.
        const selected = process.env.LEGALFLY_TEST_MINIMIND_ALL_NOTES
          ? cases.map((_, index) => index)
          : expectations.note_actions.flatMap((label) => ["teach", "holdout"].flatMap((split) => {
            const index = cases.findIndex((entry) => entry.label === label && entry.split === split);
            return index >= 0 ? [index] : [];
          }));
        expect(selected.length).toBeGreaterThanOrEqual(8);
        const mismatches: Array<{ case: string; action: string; expected: string; actual: string }> = [];
        let calls = 0;
        for (const index of selected) {
          const entry = cases[index];
          const expected = expectations.cases[index];
          const subject = entry.facts[expectations.note_subject.field] !== "none"
            ? entry.facts[expectations.note_subject.field]
            : expectations.note_subject.none;
          for (const action of expectations.note_actions) {
            const ranking = expected.notes[action];
            const expectedText = expectations.note_templates[action][ranking[0]].replaceAll(expectations.note_subject.placeholder, subject);
            const result = await call<{ text: string; action: string }>({
              type: "verbalize",
              facts: entry.facts,
              action,
              confidenceBand: expectations.confidence_band,
            });
            calls += 1;
            expect(result.action).toBe(action);
            if (result.text !== expectedText) mismatches.push({ case: entry.id, action, expected: expectedText, actual: result.text });
          }
        }
        timings.verbalize = `${elapsed(started)} (${calls} selections over ${selected.length} cases)`;
        console.info(`[minimind-runtime-parity] verbalize ${timings.verbalize}`);
        expect(mismatches).toEqual([]);
      },
      SUITE_TIMEOUT_MS,
    );

    it("never touched the network and never posted petition text", () => {
      expect(fetchCalls).toEqual([]);
      expect(messages.length).toBeGreaterThan(0);
      const leaks: Array<{ index: number; case: string }> = [];
      messages.forEach((message, index) => {
        const serialized = JSON.stringify(message);
        petitions.forEach((petition, caseIndex) => {
          if (serialized.includes(petition)) leaks.push({ index, case: cases[caseIndex].id });
        });
      });
      expect(leaks).toEqual([]);
    });
  },
);
