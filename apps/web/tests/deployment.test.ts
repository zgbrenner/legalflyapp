import { describe, expect, it } from "vitest";
import { mkdtempSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import type { NextConfig } from "next";

const nextConfig: NextConfig = createRequire(import.meta.url)("../next.config.js");
import { createHealthResponse } from "../app/api/health/readiness";

describe("production deployment contract", () => {
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

  it("reports ready only when every required connectome asset has the expected size", async () => {
    const root = mkdtempSync(join(tmpdir(), "legalfly-health-"));
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

    const response = createHealthResponse(root);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok", service: "legalfly-web" });
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

    const response = createHealthResponse(root);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "unavailable", service: "legalfly-web" });
  });
});
