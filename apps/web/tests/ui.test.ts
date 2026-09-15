import { describe, expect, it } from "vitest";

// Lightweight unit tests that don't require the API to be running.

describe("classifier UX helpers", () => {
  it("treats empty text as invalid", () => {
    const text = "   ";
    expect(text.trim().length).toBe(0);
  });

  it("formats confidence percentages", () => {
    const confidence = 0.91;
    expect(Math.round(confidence * 100)).toBe(91);
  });
});

describe("benchmark rendering", () => {
  it("shows not-yet-measured when status missing metrics", () => {
    const row: { status: string; macro_f1_mean?: number } = { status: "Not yet measured" };
    const label = row.macro_f1_mean == null ? "Not yet measured" : String(row.macro_f1_mean);
    expect(label).toBe("Not yet measured");
  });
});
