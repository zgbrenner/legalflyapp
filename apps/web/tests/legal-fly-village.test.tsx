import React from "react";
import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LegalFlyVillage } from "@/components/LegalFlyVillage";
import { checkMiniMind, encodePetition, getMiniMindConfiguration } from "@/lib/minimind";
import type { MaleCNSFrame } from "@/components/MaleCNSMap";

vi.mock("@/lib/minimind", async original => ({ ...await original<typeof import("@/lib/minimind")>(), checkMiniMind: vi.fn(), encodePetition: vi.fn(), getMiniMindConfiguration: vi.fn() }));

// Only the asynchronous worker/optional service boundaries are replaced. The map is real.
class VillageWorker {
  static instance: VillageWorker;
  onmessage: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { VillageWorker.instance = this; }
  emit(data: unknown) { act(() => this.onmessage?.({ data } as MessageEvent)); }
}
const facts = { matter: "damage", property: "crops", harm: "moderate", proof: "witness", intent: "careless", relationship: "neighbors", urgency: "ordinary", ability: "able" };
const petition = { id: "goat", split: "teach", family: "animals", title: "The goat", villager: "Els", prop: "cabbage", petition: "A goat ate cabbages.", facts };
const anatomy: MaleCNSFrame = { kind: "anatomy", step: 0, total_steps: 0, sampled: true, total_neurons: 165122, coordinate_count: 140024, points: [{ index: 7, body_id: 10007, coordinate: [37124, 22258, 36274], activation: 0, magnitude: 0, active: false, roles: ["input"] }] };
function load() {
  const worker = VillageWorker.instance;
  worker.emit({ id: 1, type: "cases", cases: [petition], actions: [] });
  worker.emit({ id: 1, type: "loaded", graph: { neurons: 165122 } });
  worker.emit({ id: 1, type: "status", state: "idle" });
  return worker;
}
beforeEach(() => {
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  vi.stubGlobal("Worker", VillageWorker);
  vi.stubEnv("NEXT_PUBLIC_MINIMIND_URL", "");
  vi.mocked(checkMiniMind).mockRejectedValue(new Error("connection refused"));
  vi.mocked(getMiniMindConfiguration).mockReturnValue({ status: "not-configured", url: null, message: "Optional MiniMind is not configured." });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("village workbench regressions", () => {
  it("does not cancel or invalidate graph loading when the tab becomes hidden", () => {
    render(<LegalFlyVillage />);
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    fireEvent(document, new Event("visibilitychange"));
    expect(VillageWorker.instance.postMessage).toHaveBeenCalledTimes(1);
    load();
    expect(screen.getByRole("button", { name: "Teach the ledger" }).hasAttribute("disabled")).toBe(false);
  });
  it("keeps loading and failure status while selecting or editing petitions", async () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<LegalFlyVillage />);
      VillageWorker.instance.emit({ id: 1, type: "cases", cases: [petition], actions: [] });
      fireEvent.click(screen.getByRole("button", { name: /Els The goat/ }));
      fireEvent.change(screen.getByRole("textbox", { name: "Petition narrative" }), { target: { value: "Edited petition" } });
      await act(async () => vi.advanceTimersByTime(1000));
      expect(container.querySelector(".lf-docket .lf-panel-head strong")?.textContent).toBe("Opening the office");
      VillageWorker.instance.emit({ id: 1, type: "error", message: "Graph unavailable" });
      VillageWorker.instance.emit({ id: 1, type: "status", state: "idle" });
      fireEvent.click(screen.getByRole("button", { name: /Els The goat/ }));
      await act(async () => vi.advanceTimersByTime(1000));
      expect(container.querySelector(".lf-docket .lf-panel-head strong")?.textContent).toBe("Proceedings stopped");
    } finally { vi.useRealTimers(); }
  });
  it("keeps the hero artwork bounded independently of the workbench", () => {
    const style = document.createElement("style");
    style.textContent = readFileSync("app/globals.css", "utf8");
    document.head.append(style);
    try {
      const { container } = render(<LegalFlyVillage />);
      const hero = container.querySelector(".lf-hero")!;
      expect(parseFloat(getComputedStyle(hero).minHeight)).toBeLessThanOrEqual(560);
      expect(getComputedStyle(container.querySelector(".lf-chamber-art")!).backgroundImage).toContain("chamber.webp");
    } finally { style.remove(); }
  });
  it("offers brain access beside petition controls without returning to the hero", () => {
    const { container } = render(<LegalFlyVillage />); load();
    const panel = within(container.querySelector(".lf-petition-panel") as HTMLElement);
    expect(panel.getByRole("button", { name: "Teach the ledger" }).hasAttribute("disabled")).toBe(false);
    const inspect = panel.getByRole("button", { name: /brain/i });
    expect(inspect.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(inspect);
    fireEvent.click(inspect);
    expect(inspect.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(inspect.getAttribute("aria-controls")!)?.getAttribute("hidden")).toBeNull();
    expect(screen.getByRole("region", { name: "Brain visualization and controls" })).toBeDefined();
  });
  it("does not fabricate a map from graph counts when no anatomy frame arrived", () => {
    render(<LegalFlyVillage />); load();
    expect(screen.queryByLabelText("Inspect displayed neuron")).toBeNull();
  });
  it("keeps teaching progress separate from neural update frames", () => {
    render(<LegalFlyVillage />); const worker = load();
    worker.emit({ id: 1, type: "cases", cases: Array.from({ length: 32 }, (_, index) => ({ ...petition, id: String(index) })), actions: [] });
    fireEvent.click(screen.getByRole("button", { name: "Teach the ledger" }));
    expect(screen.getByText(/0\/32/)).toBeDefined();
    worker.emit({ id: 2, type: "progress", current: 12, total: 32, title: "Teaching petition" });
    worker.emit({ id: 2, type: "activity", activity: { ...anatomy, kind: "activity", step: 1, total_steps: 4 } });
    expect(screen.getByText(/12\/32 Teaching petition/)).toBeDefined();
  });
  it("uses narrative and fact edits as the active custom petition sent to the worker", () => {
    render(<LegalFlyVillage />); const worker = load();
    worker.emit({ id: 1, type: "trained", modelSummary: { seed: 42 } });
    fireEvent.change(screen.getByRole("textbox", { name: "Petition narrative" }), { target: { value: "My changed petition" } });
    expect((screen.getByRole("textbox", { name: "Petition narrative" }) as HTMLTextAreaElement).value).toBe("My changed petition");
    fireEvent.change(screen.getByRole("combobox", { name: "harm" }), { target: { value: "high" } });
    expect((screen.getByRole("combobox", { name: "harm" }) as HTMLSelectElement).value).toBe("high");
    fireEvent.click(screen.getByRole("button", { name: "Hear the case" }));
    expect(worker.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: "hear", case: expect.objectContaining({ id: "custom", petition: "My changed petition", facts: { ...facts, harm: "high" } }) }));
  });
  it("offers a full reload after worker failure rather than retrying a dead worker", () => {
    render(<LegalFlyVillage />);
    VillageWorker.instance.emit({ id: 1, type: "error", message: "Graph unavailable" });
    expect(screen.getByRole("button", { name: "Reload chamber" }).hasAttribute("disabled")).toBe(false);
  });
  it("renders worker anatomy while idle and retains it across petitioner changes and model reset", () => {
    render(<LegalFlyVillage />); const worker = load();
    worker.emit({ id: 1, type: "activity", activity: anatomy });
    expect(screen.getByRole("region", { name: "Brain visualization and controls" })).toBeDefined();
    expect(screen.getByText("Body 10007", { selector: "strong" })).toBeDefined();
    expect(screen.getByText(/anatomy only/i)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Els The goat/ }));
    expect(screen.getByText("Body 10007", { selector: "strong" })).toBeDefined();
    worker.emit({ type: "model-reset" });
    expect(screen.getByText("Body 10007", { selector: "strong" })).toBeDefined();
  });
  it("marks a stopped computation separately from idle anatomy", () => {
    render(<LegalFlyVillage />); const worker = load();
    worker.emit({ id: 1, type: "trained", modelSummary: { seed: 42 } });
    fireEvent.click(screen.getByRole("button", { name: "Hear the case" }));
    worker.emit({ id: 2, type: "activity", activity: { ...anatomy, kind: "activity", step: 1, total_steps: 4 } });
    worker.emit({ id: 2, type: "status", state: "petition-ready" });
    expect(screen.getByText(/last computation stopped/i)).toBeDefined();
  });
});

describe("optional MiniMind status", () => {
  it("releases the drafting button after an edit and discards the old draft", async () => {
    vi.mocked(getMiniMindConfiguration).mockReturnValue({ status: "configured", url: "http://127.0.0.1:8123", message: "Local service" });
    vi.mocked(checkMiniMind).mockResolvedValue({ ready: true, status: "ready", message: "Ready", model: "jingyaogong/minimind-3", model_revision: "f92512d4cd6142fa9acc0d6022375049a8974bf6", mode: "frozen-embedding-readouts", load_seconds: 1 });
    let finish!: (value: Awaited<ReturnType<typeof encodePetition>>) => void;
    vi.mocked(encodePetition).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<LegalFlyVillage />); load();
    fireEvent.click(await screen.findByRole("button", { name: "Draft facts with MiniMind" }));
    expect(screen.getByRole("button", { name: "Reading petition" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Petition narrative"), { target: { value: "New evidence" } });
    expect(screen.getByRole("button", { name: "Draft facts with MiniMind" }).hasAttribute("disabled")).toBe(false);
    await act(async () => finish({ facts, field_confidence: {}, receipt: { answer_labels_available: false, requires_confirmation: true, input: [], output: [] } }));
    expect(screen.queryByRole("button", { name: "Use these facts" })).toBeNull();
  });
  it("does not call an unconfigured optional service an outage or automatically probe it", () => {
    render(<LegalFlyVillage />);
    expect(screen.getByText(/Language clerk: not configured/i)).toBeDefined();
    expect(checkMiniMind).not.toHaveBeenCalled();
    expect(screen.queryByText(/not running|offline/i)).toBeNull();
  });
  it("reports a failed explicitly requested local check as unreachable", async () => {
    render(<LegalFlyVillage />);
    fireEvent.click(screen.getByRole("button", { name: "Check local MiniMind" }));
    expect(await screen.findByText(/Language clerk: unreachable/i)).toBeDefined();
    expect(screen.getByText(/Manual facts and authored counsel notes still work/)).toBeDefined();
  });
  it("distinguishes a responding but unready configured service from an outage", async () => {
    vi.stubEnv("NEXT_PUBLIC_MINIMIND_URL", "http://127.0.0.1:8123");
    vi.mocked(getMiniMindConfiguration).mockReturnValue({ status: "configured", url: "http://127.0.0.1:8123", message: "Local service" });
    vi.mocked(checkMiniMind).mockResolvedValue({ ready: false, model: "jingyaogong/minimind-3", model_revision: "f92512d4cd6142fa9acc0d6022375049a8974bf6", mode: "frozen-embedding-readouts", load_seconds: null, status: "not-ready", message: "The adapter is reachable but its model is not ready." });
    render(<LegalFlyVillage />);
    expect(await screen.findByText(/Language clerk: not ready/i)).toBeDefined();
  });
});
