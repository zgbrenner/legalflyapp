import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import type { NextConfig } from "next";
import vercelConfig from "../vercel.json";

const nextConfig: NextConfig = createRequire(import.meta.url)("../next.config.js");
import { createHealthResponse } from "../app/api/health/readiness";
import { exportLegalFlyGraph } from "../scripts/export-legalfly-graph.mjs";
import { verifyMiniMindAssets } from "../scripts/verify-minimind-assets.mjs";

const digest = (content: string) => createHash("sha256").update(content).digest("hex");

function writeMiniMindFixture(root: string) {
  mkdirSync(root, { recursive: true });
  const artifacts = [
    ["config", "json", "{\"model_type\":\"qwen3\"}"],
    ["model.q8", "onnx", "model"],
    ["readouts", "json", "{\"schema\":\"legalfly-minimind-readouts/1\"}"],
    ["tokenizer", "json", "{}"],
    ["tokenizer_config", "json", "{}"],
  ] as const;
  const files = artifacts.map(([stem, extension, content]) => {
    const sha256 = digest(content);
    const file = `${stem}.${sha256}.${extension}`;
    writeFileSync(join(root, file), content);
    return { file, bytes: Buffer.byteLength(content), sha256 };
  });
  writeFileSync(join(root, "manifest.json"), JSON.stringify({
    schema: "legalfly-minimind-browser/1",
    model: "jingyaogong/minimind-3",
    revision: "f92512d4cd6142fa9acc0d6022375049a8974bf6",
    source_sha256: "3adf69402b5d22e693151cabadc12528f923c4ba6bf343738aaf13f0892162e8",
    files,
    quantization: "q8",
    quantization_config: {
      method: "weight-only",
      bits: 8,
      block_size: 32,
      modules: ["causal_lm.model.layers.1.mlp.gate_proj"],
    },
    outputs: ["logits", "last_hidden_state"],
  }));
  return { files, totalBytes: files.reduce((total, entry) => total + entry.bytes, 0) };
}

function writeGraphFixture(root: string) {
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "manifest.json"), JSON.stringify({
    available: true,
    graph: { neurons: 2, connections: 1, file: "malecns.bin" },
    anatomy: { neurons: 2, file: "malecns-anatomy.bin" },
    shuffled: { neurons: 2, connections: 1, file: "malecns-shuffled.bin" },
  }));
  for (const [file, size] of [["malecns.bin", 36], ["malecns-anatomy.bin", 50], ["malecns-shuffled.bin", 36]] as const) {
    writeFileSync(join(root, file), "");
    truncateSync(join(root, file), size);
  }
}


const repositoryRoot = resolve(__dirname, "../../..");
const readRepositoryFile = (relative: string) => readFileSync(join(repositoryRoot, relative), "utf8");

function pipInstallBlocks(dockerfile: string) {
  return dockerfile
    .split(/^FROM /m)
    .slice(1)
    .flatMap((stage) => {
      const instructions = stage.replace(/\\\n/g, " ").split("\n");
      return instructions.filter((line) => /^RUN\s+python -m pip install/.test(line));
    });
}

function lockedRequirements(lock: string) {
  const lines = lock.split("\n");
  const requirements: Array<{ name: string; version: string; hashes: number }> = [];
  let current: { name: string; version: string; hashes: number } | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("--index-url") || line.startsWith("--extra-index-url")) continue;
    const pin = /^([A-Za-z0-9_.-]+)==([A-Za-z0-9_.+!-]+)\s*\\?$/.exec(line);
    if (pin) {
      current = { name: pin[1].toLowerCase(), version: pin[2], hashes: 0 };
      requirements.push(current);
      continue;
    }
    const hash = /^--hash=sha256:[a-f0-9]{64}\s*\\?$/.exec(line);
    if (hash && current) {
      current.hashes += 1;
      continue;
    }
    throw new Error(`Unexpected lock line: ${line}`);
  }
  return requirements;
}

describe("production deployment contract", () => {
  it("routes the Vercel alias to the full-data Render deployment", () => {
    expect(vercelConfig.redirects).toEqual([
      {
        source: "/",
        destination: "https://legalfly-web.onrender.com/",
        permanent: false,
      },
      {
        source: "/:path*",
        destination: "https://legalfly-web.onrender.com/:path*",
        permanent: false,
      },
    ]);
  });

  it("builds a standalone server image", () => {
    expect(nextConfig.output).toBe("standalone");
  });

  it("serves revalidated connectome binaries with explicit byte semantics", async () => {
    const groups = await nextConfig.headers!();
    for (const asset of ["malecns.bin", "malecns-anatomy.bin", "malecns-shuffled.bin"]) {
      const binary = groups.find((group) => group.source === `/legalfly/${asset}`);
      const headers = Object.fromEntries(binary?.headers.map(({ key, value }) => [key, value]) ?? []);

      expect(headers).toEqual({
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=0, must-revalidate",
        "Content-Type": "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      });
    }
  });

  it("serves immutable content-addressed MiniMind files and revalidates its manifest", async () => {
    const groups = await nextConfig.headers!();
    const immutable = groups.find((group) => group.source === "/minimind/:artifact*");
    const manifest = groups.find((group) => group.source === "/minimind/manifest.json");

    expect(Object.fromEntries(immutable?.headers.map(({ key, value }) => [key, value]) ?? [])).toEqual({
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    });
    expect(Object.fromEntries(manifest?.headers.map(({ key, value }) => [key, value]) ?? [])).toEqual({
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    });
  });

  it("fails production verification without browser MiniMind artifacts", () => {
    const root = mkdtempSync(join(tmpdir(), "legalfly-minimind-empty-"));
    expect(() => verifyMiniMindAssets(root)).toThrow(/MiniMind browser manifest/);
  });

  it("verifies every content-addressed MiniMind artifact", () => {
    const root = mkdtempSync(join(tmpdir(), "legalfly-minimind-"));
    const fixture = writeMiniMindFixture(root);

    expect(verifyMiniMindAssets(root)).toMatchObject({
      revision: "f92512d4cd6142fa9acc0d6022375049a8974bf6",
      quantization: "q8",
      files: 5,
      bytes: fixture.totalBytes,
    });

    writeFileSync(join(root, fixture.files[1].file), "changed");
    expect(() => verifyMiniMindAssets(root)).toThrow(/byte count|SHA-256/);
  });


  it("rejects a placeholder or stray file in the runtime MiniMind directory in exact mode", () => {
    const root = mkdtempSync(join(tmpdir(), "legalfly-minimind-exact-"));
    writeMiniMindFixture(root);

    expect(verifyMiniMindAssets(root, { exact: true })).toMatchObject({ files: 5, exact: true });

    writeFileSync(join(root, ".gitkeep"), "");
    expect(() => verifyMiniMindAssets(root, { exact: true })).toThrow(/unexpected entries: \.gitkeep/);
    // Development checkouts keep the tracked placeholder beside a local bundle.
    expect(verifyMiniMindAssets(root)).toMatchObject({ files: 5, exact: false });
  });

  it("keeps the tracked MiniMind placeholder out of the Docker context and the runtime image", () => {
    expect(existsSync(join(repositoryRoot, "apps/web/public/minimind/.gitkeep"))).toBe(true);
    const ignore = readRepositoryFile("Dockerfile.web.dockerignore").split("\n").map((line) => line.trim());
    expect(ignore).toContain("apps/web/public/minimind");
    expect(ignore).toContain("**/.gitkeep");

    const dockerfile = readRepositoryFile("Dockerfile.web").replace(/\\\n/g, " ");
    const builder = dockerfile.slice(dockerfile.indexOf(" AS builder"), dockerfile.indexOf(" AS runner"));
    expect(builder).toMatch(/COPY --from=minimind \/repo\/browser-minimind \.\/public\/minimind/);
    expect(builder).toMatch(/RUN node scripts\/verify-minimind-assets\.mjs --exact && npm run build/);
    expect(builder.indexOf("COPY apps/web ./")).toBeLessThan(builder.indexOf("COPY --from=minimind"));
  });

  it("re-runs the discrete parity comparison inside the conversion stage", () => {
    const dockerfile = readRepositoryFile("Dockerfile.web").replace(/\\\n/g, " ");
    const stage = dockerfile.slice(dockerfile.indexOf(" AS minimind"), dockerfile.indexOf(" AS dependencies"));
    expect(stage).toMatch(/prepare_minimind_browser\.py\s+--download\s+--convert\s+--quantization q8/);
    expect(stage).toMatch(/prepare_minimind_browser\.py\s+--check\s+--output \/repo\/browser-minimind/);
    expect(stage).toMatch(/export_minimind_readouts\.py\s+--model-path \/repo\/models\/minimind-3\s+--output \/repo\/browser-minimind\s+--compare/);
    expect(stage.indexOf("--convert")).toBeLessThan(stage.indexOf("--compare"));
  });

  it("pins every base image by digest", () => {
    const dockerfile = readRepositoryFile("Dockerfile.web");
    const froms = dockerfile.split("\n").filter((line) => line.startsWith("FROM "));
    expect(froms).toHaveLength(5);
    for (const line of froms) {
      expect(line).toMatch(/^FROM (python:3\.12-slim|node:20-alpine)@sha256:[a-f0-9]{64} AS [a-z]+$/);
    }
    const pythonDigests = new Set(froms.filter((line) => line.includes("python:")).map((line) => line.split("@")[1].split(" ")[0]));
    expect(pythonDigests.size).toBe(1);
  });

  it("installs every conversion dependency from a hash-locked requirements file", () => {
    const dockerfile = readRepositoryFile("Dockerfile.web");
    const installs = pipInstallBlocks(dockerfile);
    expect(installs).toHaveLength(2);
    const lockFiles: string[] = [];
    for (const install of installs) {
      expect(install).toMatch(/--require-hashes/);
      expect(install).toMatch(/--only-binary=:all:/);
      const requirement = /--requirement (tools\/requirements\/[a-z-]+\.txt)/.exec(install);
      expect(requirement).not.toBeNull();
      expect(install.replace(requirement![0], "")).not.toMatch(/[A-Za-z0-9_-]+==\d/);
      lockFiles.push(requirement![1]);
    }
    expect(lockFiles.sort()).toEqual(["tools/requirements/malecns.txt", "tools/requirements/minimind-browser.txt"]);

    const expectedDirect: Record<string, Record<string, string>> = {
      "tools/requirements/malecns.txt": { numpy: "2.1.3", pandas: "2.2.3", pyarrow: "17.0.0" },
      "tools/requirements/minimind-browser.txt": {
        fastapi: "0.141.1",
        "huggingface-hub": "0.36.2",
        numpy: "2.3.3",
        onnx: "1.22.0",
        onnxruntime: "1.30.0",
        onnxscript: "0.7.2",
        pydantic: "2.13.5",
        safetensors: "0.8.0",
        torch: "2.14.0+cpu",
        transformers: "4.57.6",
      },
    };
    for (const lockFile of lockFiles) {
      const lock = readRepositoryFile(lockFile);
      expect(lock).not.toMatch(/^(-e|git\+|https?:\/\/|file:)/m);
      const requirements = lockedRequirements(lock);
      expect(requirements.length).toBeGreaterThan(0);
      for (const requirement of requirements) expect(requirement.hashes, requirement.name).toBeGreaterThan(0);
      const versions = Object.fromEntries(requirements.map((entry) => [entry.name, entry.version]));
      expect(versions).toMatchObject(expectedDirect[lockFile]);
      const unlocked = lock.split("\n").filter((line) => /^[A-Za-z0-9_.-]+(>=|~=|<|>|!=|$)/.test(line.trim()) && !line.includes("=="));
      expect(unlocked).toEqual([]);
    }
    const torchIndex = readRepositoryFile("tools/requirements/minimind-browser.txt");
    expect(torchIndex).toMatch(/^--extra-index-url https:\/\/download\.pytorch\.org\/whl\/cpu$/m);
  });

  it("fails closed when a full graph export is required but inputs are missing", () => {
    const root = mkdtempSync(join(tmpdir(), "legalfly-graph-export-"));
    expect(() => exportLegalFlyGraph({ repositoryRoot: root, requireFull: true })).toThrow(/MaleCNS browser graph/);
  });

  it("reports ready only when every required connectome asset has the expected size", async () => {
    const root = mkdtempSync(join(tmpdir(), "legalfly-health-"));
    const miniMindRoot = mkdtempSync(join(tmpdir(), "legalfly-health-minimind-"));
    writeGraphFixture(root);
    const miniMind = writeMiniMindFixture(miniMindRoot);

    const response = createHealthResponse(root, miniMindRoot);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      service: "legalfly-web",
      services: { maleCns: "ready", miniMindArtifacts: "ready" },
      miniMind: {
        revision: "f92512d4cd6142fa9acc0d6022375049a8974bf6",
        quantization: "q8",
        bytes: miniMind.totalBytes,
      },
    });
  });

  it("rejects a truncated biological graph", async () => {
    const root = mkdtempSync(join(tmpdir(), "legalfly-health-"));
    writeFileSync(join(root, "manifest.json"), JSON.stringify({
      available: true,
      graph: { neurons: 2, connections: 1, file: "malecns.bin" },
      anatomy: { neurons: 2, file: "malecns-anatomy.bin" },
      shuffled: { neurons: 2, connections: 1, file: "malecns-shuffled.bin" },
    }));
    for (const [file, size] of [["malecns.bin", 35], ["malecns-anatomy.bin", 50], ["malecns-shuffled.bin", 36]] as const) {
      writeFileSync(join(root, file), "");
      truncateSync(join(root, file), size);
    }

    const miniMindRoot = mkdtempSync(join(tmpdir(), "legalfly-health-minimind-"));
    writeMiniMindFixture(miniMindRoot);
    const response = createHealthResponse(root, miniMindRoot);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "unavailable",
      services: { maleCns: "unavailable", miniMindArtifacts: "ready" },
    });
  });

  it("reports MiniMind unavailable independently of a healthy graph", async () => {
    const root = mkdtempSync(join(tmpdir(), "legalfly-health-"));
    const miniMindRoot = mkdtempSync(join(tmpdir(), "legalfly-health-minimind-empty-"));
    writeGraphFixture(root);

    const response = createHealthResponse(root, miniMindRoot);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "unavailable",
      services: { maleCns: "ready", miniMindArtifacts: "unavailable" },
    });
  });
});
