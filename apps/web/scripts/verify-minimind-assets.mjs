import { createHash } from "node:crypto";
import { closeSync, lstatSync, openSync, readFileSync, readSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCHEMA = "legalfly-minimind-browser/1";
const MODEL = "jingyaogong/minimind-3";
const REVISION = "f92512d4cd6142fa9acc0d6022375049a8974bf6";
const SOURCE_SHA256 = "3adf69402b5d22e693151cabadc12528f923c4ba6bf343738aaf13f0892162e8";
const OUTPUTS = ["logits", "last_hidden_state"];
const Q8_CONFIG = {
  method: "weight-only",
  bits: 8,
  block_size: 32,
  modules: ["causal_lm.model.layers.1.mlp.gate_proj"],
};
const MANIFEST_KEYS = [
  "schema",
  "model",
  "revision",
  "source_sha256",
  "files",
  "quantization",
  "quantization_config",
  "outputs",
];
const MAX_MANIFEST_BYTES = 128 * 1024;
const MAX_ARTIFACT_BYTES = 400 * 1024 * 1024;
const MAX_BUNDLE_BYTES = 600 * 1024 * 1024;

const exactKeys = (value, expected) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
};

const hashFile = (file) => {
  const hash = createHash("sha256");
  const descriptor = openSync(file, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (;;) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
    }
  } finally {
    closeSync(descriptor);
  }
  return hash.digest("hex");
};

const artifactCategory = (file) => {
  if (/^config\.[a-f0-9]{64}\.json$/.test(file)) return "config";
  if (/^model\.q8\.[a-f0-9]{64}\.onnx$/.test(file)) return "model";
  if (/^readouts\.[a-f0-9]{64}\.json$/.test(file)) return "readouts";
  if (/^tokenizer\.[a-f0-9]{64}\.json$/.test(file)) return "tokenizer";
  if (/^tokenizer_config\.[a-f0-9]{64}\.json$/.test(file)) return "tokenizer_config";
  return null;
};

export function verifyMiniMindAssets(root) {
  const absoluteRoot = path.resolve(root);
  const manifestPath = path.join(absoluteRoot, "manifest.json");
  let manifest;
  try {
    const stat = lstatSync(manifestPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > MAX_MANIFEST_BYTES) {
      throw new Error("invalid file");
    }
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`MiniMind browser manifest is missing or invalid at ${manifestPath}`, { cause: error });
  }

  if (
    !exactKeys(manifest, MANIFEST_KEYS)
    || manifest.schema !== SCHEMA
    || manifest.model !== MODEL
    || manifest.revision !== REVISION
    || manifest.source_sha256 !== SOURCE_SHA256
    || manifest.quantization !== "q8"
    || JSON.stringify(manifest.quantization_config) !== JSON.stringify(Q8_CONFIG)
    || JSON.stringify(manifest.outputs) !== JSON.stringify(OUTPUTS)
    || !Array.isArray(manifest.files)
    || manifest.files.length !== 5
  ) {
    throw new Error("MiniMind browser manifest does not match the parity-verified release contract");
  }

  let bytes = 0;
  const names = new Set();
  const categories = new Set();
  for (const entry of manifest.files) {
    if (
      !exactKeys(entry, ["file", "bytes", "sha256"])
      || typeof entry.file !== "string"
      || typeof entry.sha256 !== "string"
      || !/^[a-f0-9]{64}$/.test(entry.sha256)
      || !Number.isSafeInteger(entry.bytes)
      || entry.bytes < 1
      || entry.bytes > MAX_ARTIFACT_BYTES
      || names.has(entry.file)
    ) {
      throw new Error("MiniMind browser manifest contains an invalid artifact entry");
    }
    const category = artifactCategory(entry.file);
    if (!category || !entry.file.split(".").includes(entry.sha256)) {
      throw new Error(`MiniMind browser artifact is not an allowed content-addressed file: ${entry.file}`);
    }
    names.add(entry.file);
    categories.add(category);
    bytes += entry.bytes;
    if (bytes > MAX_BUNDLE_BYTES) throw new Error("MiniMind browser bundle exceeds its verified size limit");

    const artifactPath = path.join(absoluteRoot, entry.file);
    let stat;
    try {
      stat = lstatSync(artifactPath);
    } catch (error) {
      throw new Error(`MiniMind browser artifact is missing: ${entry.file}`, { cause: error });
    }
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`MiniMind browser artifact is not a regular file: ${entry.file}`);
    }
    if (stat.size !== entry.bytes) {
      throw new Error(`MiniMind browser artifact byte count mismatch: ${entry.file}`);
    }
    if (hashFile(artifactPath) !== entry.sha256) {
      throw new Error(`MiniMind browser artifact SHA-256 mismatch: ${entry.file}`);
    }
    if (entry.file.endsWith(".json")) {
      try {
        JSON.parse(readFileSync(artifactPath, "utf8"));
      } catch (error) {
        throw new Error(`MiniMind browser JSON artifact is invalid: ${entry.file}`, { cause: error });
      }
    }
  }
  if (categories.size !== 5) throw new Error("MiniMind browser bundle is incomplete");

  return { revision: REVISION, quantization: "q8", files: manifest.files.length, bytes };
}

export function requiresFullAssets(environment = process.env) {
  return environment.NODE_ENV === "production" || environment.LEGALFLY_REQUIRE_FULL === "1";
}

function main() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const defaultRoot = path.resolve(scriptDirectory, "../public/minimind");
  const root = process.env.LEGALFLY_MINIMIND_DIR
    ? path.resolve(process.env.LEGALFLY_MINIMIND_DIR)
    : defaultRoot;
  try {
    const metadata = verifyMiniMindAssets(root);
    console.log(`MiniMind browser artifacts verified: ${metadata.files} files, ${metadata.bytes} bytes, ${metadata.quantization}.`);
  } catch (error) {
    if (requiresFullAssets()) throw error;
    console.log("MiniMind browser artifacts unavailable in this fixture checkout; production builds require the verified bundle.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
