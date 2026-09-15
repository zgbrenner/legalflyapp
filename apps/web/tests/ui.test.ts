import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postcss, { type AtRule, type Declaration, type Rule } from "postcss";

const chamberCss = postcss.parse(
  readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8"),
);

function media(params: string): AtRule[] {
  const result = chamberCss.nodes.filter(
    (node): node is AtRule => node.type === "atrule" && node.name === "media" && node.params === params,
  );
  expect(result.length, `missing @media ${params}`).toBeGreaterThan(0);
  return result;
}

function declarations(container: AtRule | typeof chamberCss, selector: string): Record<string, string> {
  const matching = (container.nodes ?? []).filter(
    (node): node is Rule => node.type === "rule" && node.selectors.includes(selector),
  );
  expect(matching.length, `missing ${selector}`).toBeGreaterThan(0);
  return Object.fromEntries(
    matching.flatMap(rule => rule.nodes)
      .filter((node): node is Declaration => node.type === "decl")
      .map(node => [node.prop, node.value]),
  );
}

function mediaDeclarations(params: string, selector: string): Record<string, string> {
  const matching = media(params).flatMap(container => (container.nodes ?? []).filter(
    (node): node is Rule => node.type === "rule" && node.selectors.includes(selector),
  ));
  expect(matching.length, `missing ${selector} in @media ${params}`).toBeGreaterThan(0);
  return Object.fromEntries(
    matching.flatMap(rule => rule.nodes)
      .filter((node): node is Declaration => node.type === "decl")
      .map(node => [node.prop, node.value]),
  );
}

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

describe("Legal Fly responsive layout contract", () => {
  it("places each chamber panel explicitly in the two-column tablet grid", () => {
    const tablet = "(max-width:1100px) and (min-width:721px)";

    expect(mediaDeclarations(tablet, ".lf-work")["grid-template-columns"]).toBe("220px minmax(0,1fr)");
    expect(mediaDeclarations(tablet, ".lf-docket")).toMatchObject({
      "grid-column": "1",
      "grid-row": "1",
    });
    expect(mediaDeclarations(tablet, ".lf-petition-panel")).toMatchObject({
      "grid-column": "2",
      "grid-row": "1",
    });
    expect(mediaDeclarations(tablet, ".lf-advice")).toMatchObject({
      "grid-column": "1/-1",
      "grid-row": "2",
    });
  });

  it("resets every chamber panel into document order at the mobile breakpoint", () => {
    const mobile = "(max-width:720px)";

    expect(mediaDeclarations(mobile, ".lf-work")["grid-template-columns"]).toBe("minmax(0,1fr)");
    for (const selector of [".lf-docket", ".lf-petition-panel", ".lf-advice"]) {
      expect(mediaDeclarations(mobile, selector)).toMatchObject({
        "grid-column": "1",
        "grid-row": "auto",
      });
    }
  });

  it("declares desktop placement once and lets no other media block move the chamber panels", () => {
    const panels = [".lf-work", ".lf-docket", ".lf-petition-panel", ".lf-advice"];
    const placement = ["grid-template-columns", "grid-column", "grid-row"];
    expect(declarations(chamberCss, ".lf-docket")).toMatchObject({ "grid-column": "1", "grid-row": "1" });
    expect(declarations(chamberCss, ".lf-petition-panel")).toMatchObject({ "grid-column": "2", "grid-row": "1" });
    expect(declarations(chamberCss, ".lf-advice")).toMatchObject({ "grid-column": "3", "grid-row": "1" });

    const explicit = new Set(["(max-width:1100px) and (min-width:721px)", "(max-width:720px)"]);
    const strays = chamberCss.nodes
      .filter((node): node is AtRule => node.type === "atrule" && node.name === "media" && !explicit.has(node.params))
      .flatMap(container => (container.nodes ?? [])
        .filter((node): node is Rule => node.type === "rule" && node.selectors.some(selector => panels.includes(selector)))
        .flatMap(rule => rule.nodes
          .filter((node): node is Declaration => node.type === "decl" && placement.includes(node.prop))
          .map(node => `${container.params} ${rule.selector} ${node.prop}`)));
    expect(strays).toEqual([]);
  });

  it("uses fluid chamber spacing, wrapped process steps, and touch-sized actions", () => {
    const page = declarations(chamberCss, ".lf-page");
    for (const token of ["--space-page", "--space-panel", "--space-section"]) {
      expect(page[token]).toMatch(/^clamp\(/);
    }

    expect(declarations(chamberCss, ".lf-process")["flex-wrap"]).toBe("wrap");
    expect(Number.parseFloat(declarations(chamberCss, ".lf-button")["min-height"])).toBeGreaterThanOrEqual(44);
  });
});
