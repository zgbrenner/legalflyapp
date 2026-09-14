import { afterEach, describe, expect, it, vi } from "vitest";
import { checkMiniMind, encodePetition, verbalizeAdvice } from "@/lib/minimind";

const facts = { matter: "damage", property: "crops", harm: "moderate", proof: "unclear", intent: "careless", relationship: "neighbors", urgency: "ordinary", ability: "able" };

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("MiniMind configuration and health", () => {
  it("does not probe a hosted visitor's machine without explicit configuration", async () => {
    vi.stubEnv("NEXT_PUBLIC_MINIMIND_URL", "");
    vi.stubGlobal("location", new URL("https://village.example"));
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ready: true }) }); vi.stubGlobal("fetch", fetcher);
    expect(await checkMiniMind()).toMatchObject({ ready: false, status: "not-configured" });
    await expect(encodePetition("Private petition")).rejects.toThrow(/configur/i);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["https://external.example", "/api/minimind", "http://127.0.0.1.evil.test:8123", "http://user:pass@localhost:8123", "http://localhost:8123/?token=secret"])("blocks unsafe endpoint %s before sending text", async endpoint => {
    vi.stubEnv("NEXT_PUBLIC_MINIMIND_URL", endpoint);
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ready: true }) }); vi.stubGlobal("fetch", fetcher);
    expect(await checkMiniMind()).toMatchObject({ ready: false, status: "invalid-configuration" });
    await expect(encodePetition("Private petition")).rejects.toThrow(/loopback/i);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("distinguishes browser reachability failure from an absent model", async () => {
    vi.stubEnv("NEXT_PUBLIC_MINIMIND_URL", "http://127.0.0.1:8123/");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await checkMiniMind()).toMatchObject({ ready: false, status: "unreachable" });
  });

  it.each([{}, { ready: "yes" }, { ready: true, model: "another-model", model_revision: "wrong", mode: "candidate-likelihood", load_seconds: 1 }])("rejects invalid health without inventing readiness", async body => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => body }));
    expect(await checkMiniMind()).toMatchObject({ ready: false, status: "invalid-response" });
  });

  it.each([true, false])("reports actual model readiness %s", async ready => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ready, model: "jingyaogong/minimind-3", model_revision: "f92512d4cd6142fa9acc0d6022375049a8974bf6", mode: "frozen-embedding-readouts", load_seconds: ready ? 2 : null }) }));
    expect(await checkMiniMind()).toMatchObject({ ready, status: ready ? "ready" : "not-ready" });
  });
});

describe("MiniMind boundary client", () => {
  it("accepts only a confirmed fixed-schema draft", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ facts, field_confidence: {}, receipt: { answer_labels_available: false, requires_confirmation: true } }) }));
    expect((await encodePetition("A goat ate my cabbages.")).facts.property).toBe("crops");
  });

  it("rejects hidden or unsupported encoder fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ facts: { ...facts, expected_action: "seek-small-reparation" }, receipt: { answer_labels_available: false, requires_confirmation: true } }) }));
    await expect(encodePetition("A goat ate my cabbages.")).rejects.toThrow(/undeclared fields/i);
  });

  it("rejects a decoder response that changes the action", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: "Refer it.", action: "refer-higher", receipt: { alternative_actions_available: false } }) }));
    await expect(verbalizeAdvice(facts, "seek-small-reparation", 0.5)).rejects.toThrow(/alter/i);
  });
});
