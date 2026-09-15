import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
