import { lstatSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

type Asset = { file?: unknown; neurons?: unknown; connections?: unknown };
type Manifest = { available?: unknown; graph?: Asset; anatomy?: Asset; shuffled?: Asset };
type MiniMindFile = { file?: unknown; bytes?: unknown; sha256?: unknown };
type MiniMindManifest = {
  schema?: unknown;
  model?: unknown;
  revision?: unknown;
  source_sha256?: unknown;
  files?: unknown;
  quantization?: unknown;
  quantization_config?: unknown;
  outputs?: unknown;
};

const MINI_MIND_REVISION = "f92512d4cd6142fa9acc0d6022375049a8974bf6";
const MINI_MIND_SOURCE_SHA256 = "3adf69402b5d22e693151cabadc12528f923c4ba6bf343738aaf13f0892162e8";

type MiniMindHealth = { revision: string; quantization: "q8"; bytes: number };

const response = (maleCns: boolean, miniMind: MiniMindHealth | null) => {
  const ready = maleCns && miniMind !== null;
  return Response.json(
    {
      status: ready ? "ok" : "unavailable",
      service: "legalfly-web",
      services: {
        maleCns: maleCns ? "ready" : "unavailable",
        miniMindArtifacts: miniMind ? "ready" : "unavailable",
      },
      ...(miniMind ? { miniMind } : {}),
    },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
};

const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;

function maleCnsReady(root: string) {
  try {
    const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")) as Manifest;
    if (manifest.available !== true || !manifest.graph || !manifest.anatomy || !manifest.shuffled) return false;
    const { graph, anatomy, shuffled } = manifest;
    if (!integer(graph.neurons) || !integer(graph.connections) || anatomy.neurons !== graph.neurons) return false;
    if (shuffled.neurons !== graph.neurons || shuffled.connections !== graph.connections) return false;

    const graphBytes = 16 + (graph.neurons + 1) * 4 + graph.connections * 8;
    const anatomyBytes = 16 + graph.neurons * 17;
    const required = [
      [graph.file, "malecns.bin", graphBytes],
      [anatomy.file, "malecns-anatomy.bin", anatomyBytes],
      [shuffled.file, "malecns-shuffled.bin", graphBytes],
    ] as const;
    return required.every(([file, expectedName, bytes]) => (
      file === expectedName && statSync(join(root, expectedName)).size === bytes
    ));
  } catch {
    return false;
  }
}

function miniMindReady(root: string): MiniMindHealth | null {
  try {
    const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")) as MiniMindManifest;
    if (
      manifest.schema !== "legalfly-minimind-browser/1"
      || manifest.model !== "jingyaogong/minimind-3"
      || manifest.revision !== MINI_MIND_REVISION
      || manifest.source_sha256 !== MINI_MIND_SOURCE_SHA256
      || manifest.quantization !== "q8"
      || JSON.stringify(manifest.quantization_config) !== JSON.stringify({
        method: "weight-only",
        bits: 8,
        block_size: 32,
        modules: ["causal_lm.model.layers.1.mlp.gate_proj"],
      })
      || JSON.stringify(manifest.outputs) !== JSON.stringify(["logits", "last_hidden_state"])
      || !Array.isArray(manifest.files)
      || manifest.files.length !== 5
    ) return null;

    const categories = new Set<string>();
    const names = new Set<string>();
    let bytes = 0;
    for (const raw of manifest.files) {
      const entry = raw as MiniMindFile;
      if (
        !entry || typeof entry !== "object"
        || typeof entry.file !== "string"
        || typeof entry.sha256 !== "string"
        || !/^[a-f0-9]{64}$/.test(entry.sha256)
        || !Number.isSafeInteger(entry.bytes)
        || Number(entry.bytes) < 1
        || Number(entry.bytes) > 400 * 1024 * 1024
        || !entry.file.split(".").includes(entry.sha256)
        || names.has(entry.file)
      ) return null;
      let category: string | null = null;
      if (/^config\.[a-f0-9]{64}\.json$/.test(entry.file)) category = "config";
      else if (/^model\.q8\.[a-f0-9]{64}\.onnx$/.test(entry.file)) category = "model";
      else if (/^readouts\.[a-f0-9]{64}\.json$/.test(entry.file)) category = "readouts";
      else if (/^tokenizer\.[a-f0-9]{64}\.json$/.test(entry.file)) category = "tokenizer";
      else if (/^tokenizer_config\.[a-f0-9]{64}\.json$/.test(entry.file)) category = "tokenizer_config";
      if (!category) return null;
      const stat = lstatSync(join(root, entry.file));
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== entry.bytes) return null;
      names.add(entry.file);
      categories.add(category);
      bytes += Number(entry.bytes);
      if (bytes > 600 * 1024 * 1024) return null;
    }
    if (categories.size !== 5) return null;
    return { revision: MINI_MIND_REVISION, quantization: "q8", bytes };
  } catch {
    return null;
  }
}

export function createHealthResponse(
  graphRoot = join(process.cwd(), "public", "legalfly"),
  miniMindRoot = join(dirname(graphRoot), "minimind"),
) {
  return response(maleCnsReady(graphRoot), miniMindReady(miniMindRoot));
}
