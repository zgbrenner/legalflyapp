import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FACT_OPTIONS } from "@/lib/minimind";

describe("MiniMind shared schema", () => {
  it("declares the eight fact fields in the order the fly and the worker use", () => {
    expect(Object.keys(FACT_OPTIONS)).toEqual([
      "matter", "property", "harm", "proof", "intent", "relationship", "urgency", "ability",
    ]);
    for (const options of Object.values(FACT_OPTIONS)) {
      expect(options.length).toBeGreaterThan(1);
      expect(new Set(options).size).toBe(options.length);
    }
  });

  it("ships no language-service HTTP client inside the privacy boundary", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/minimind.ts"), "utf8");
    for (const forbidden of ["fetch(", "8123", "NEXT_PUBLIC_MINIMIND_URL", "loopback", "XMLHttpRequest", "WebSocket"]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
    const worker = readFileSync(resolve(process.cwd(), "workers/minimind.worker.ts"), "utf8");
    expect(worker).toContain("env.allowRemoteModels = false");
    expect(worker).not.toMatch(/https?:\/\/(?!127\.0\.0\.1)/);
  });
});
