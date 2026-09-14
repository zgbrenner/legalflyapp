import { afterEach, describe, expect, it, vi } from "vitest";
import { encodePetition, verbalizeAdvice } from "@/lib/minimind";

const facts = { matter: "damage", property: "crops", harm: "moderate", proof: "unclear", intent: "careless", relationship: "neighbors", urgency: "ordinary", ability: "able" };

afterEach(() => vi.restoreAllMocks());

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
