import React from "react";
import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LegalFlyVillage } from "@/components/LegalFlyVillage";
import type { MaleCNSFrame } from "@/components/MaleCNSMap";

const miniMind = vi.hoisted(() => {
  type State = {
    phase: "available" | "downloading" | "verifying" | "cached" | "loading" | "ready" | "unsupported" | "failed";
    source: "cache" | "download" | null;
    backend: "webgpu" | "wasm" | null;
    progress: { loaded: number; total: number; percent: number; file: string | null } | null;
    message: string;
  };
  let state: State;
  const listeners = new Set<(value: State) => void>();
  const client = {
    enable: vi.fn(async () => undefined),
    cancelDownload: vi.fn(async () => undefined),
    encodePetition: vi.fn(async () => ({})),
    verbalizeAdvice: vi.fn(async () => ({})),
    benchmarkMiniMind: vi.fn(async () => ({ rows: [], model_revision: "test" })),
    dispose: vi.fn(async () => undefined),
    subscribe: vi.fn((listener: (value: State) => void) => {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    }),
  };
  const available = (): State => ({ phase: "available", source: null, backend: null, progress: null, message: "MiniMind is optional and has not been enabled." });
  return {
    client,
    reset() {
      state = available();
      listeners.clear();
      client.enable.mockResolvedValue(undefined);
      client.cancelDownload.mockResolvedValue(undefined);
      client.dispose.mockResolvedValue(undefined);
      client.encodePetition.mockResolvedValue({});
      client.verbalizeAdvice.mockResolvedValue({});
      client.benchmarkMiniMind.mockResolvedValue({ rows: [], model_revision: "test" });
    },
    setInitial(next: State) { state = next; },
    emit(next: State) {
      state = next;
      act(() => listeners.forEach(listener => listener(next)));
    },
  };
});

vi.mock("@/lib/minimind-browser", () => ({ MiniMindBrowserClient: vi.fn(() => miniMind.client) }));

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
  miniMind.reset();
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  vi.stubGlobal("Worker", VillageWorker);
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
    fireEvent.click(screen.getByRole("button", { name: "Confirm these eight facts" }));
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
    worker.emit({ id: 1, type: "status", state: "idle" });
    fireEvent.click(screen.getByRole("button", { name: "Confirm these eight facts" }));
    fireEvent.click(screen.getByRole("button", { name: "Hear the case" }));
    worker.emit({ id: 2, type: "activity", activity: { ...anatomy, kind: "activity", step: 1, total_steps: 4 } });
    worker.emit({ id: 2, type: "status", state: "petition-ready" });
    expect(screen.getByText(/last computation stopped/i)).toBeDefined();
  });
});

describe("optional MiniMind status", () => {
  it("explains and enables the local language helper", () => {
    render(<LegalFlyVillage />);
    expect(screen.getByText(/runs only in this browser/i)).toBeDefined();
    expect(screen.getByText(/petition stays on this device/i)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Enable MiniMind" }));
    expect(miniMind.client.enable).toHaveBeenCalledOnce();
  });

  it("removes setup notice after cached MiniMind becomes ready", () => {
    miniMind.setInitial({ phase: "ready", source: "cache", backend: "wasm", progress: null, message: "Ready" });
    render(<LegalFlyVillage />);
    expect(screen.queryByRole("button", { name: "Enable MiniMind" })).toBeNull();
    expect(screen.getByText("MiniMind ready · runs on this device")).toBeDefined();
  });

  it("shows honest download progress and lets the visitor cancel", () => {
    miniMind.setInitial({ phase: "downloading", source: "download", backend: null, progress: { loaded: 125_829_120, total: 251_658_240, percent: 50, file: "model.q8.onnx" }, message: "Downloading" });
    render(<LegalFlyVillage />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50");
    expect(screen.getByText(/120 MB of 240 MB/i)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Cancel download" }));
    expect(miniMind.client.cancelDownload).toHaveBeenCalledOnce();
  });

  it("offers retry and a manual path after MiniMind fails", () => {
    miniMind.setInitial({ phase: "failed", source: "download", backend: null, progress: null, message: "Model could not start" });
    render(<LegalFlyVillage />);
    expect(screen.getByText(/current Chrome, Edge, or another Chromium browser/i)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Retry MiniMind" }));
    expect(miniMind.client.enable).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Continue with manual facts" }));
    expect(screen.getByText("Using manual facts.")).toBeDefined();
    expect(screen.getByRole("combobox", { name: "matter" })).toBeDefined();
  });

  it("guides the four steps and requires confirmation before hearing a case", () => {
    render(<LegalFlyVillage />); const worker = load();
    fireEvent.click(screen.getByRole("button", { name: "Continue with manual facts" }));
    const guide = screen.getByRole("list", { name: "Chamber steps" });
    expect(within(guide).getAllByRole("listitem")).toHaveLength(4);
    expect(within(guide).getByText(/Teach the fly/i).closest("li")?.getAttribute("aria-current")).toBe("step");
    fireEvent.click(screen.getByRole("button", { name: "Teach the ledger" }));
    worker.emit({ id: 2, type: "trained", modelSummary: { seed: 42 } });
    worker.emit({ id: 2, type: "status", state: "idle" });
    expect(screen.getByRole("button", { name: "Hear the case" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Confirm all eight choices before the fly can use them/i)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Confirm these eight facts" }));
    expect(screen.getByRole("button", { name: "Hear the case" }).hasAttribute("disabled")).toBe(false);
    fireEvent.change(screen.getByRole("combobox", { name: "harm" }), { target: { value: "high" } });
    expect(screen.getByRole("button", { name: "Hear the case" }).hasAttribute("disabled")).toBe(true);
  });

  it("releases the drafting button after an edit and discards the old draft", async () => {
    miniMind.setInitial({ phase: "ready", source: "cache", backend: "wasm", progress: null, message: "Ready" });
    let finish!: (value: Record<string, unknown>) => void;
    miniMind.client.encodePetition.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<LegalFlyVillage />); load();
    fireEvent.click(screen.getByRole("button", { name: "Draft facts with MiniMind" }));
    expect(screen.getByRole("button", { name: "Reading petition" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Petition narrative"), { target: { value: "New evidence" } });
    expect(screen.getByRole("button", { name: "Draft facts with MiniMind" }).hasAttribute("disabled")).toBe(false);
    await act(async () => finish({ facts, field_confidence: {}, receipt: { answer_labels_available: false, requires_confirmation: true, input: [], output: [] } }));
    expect(screen.queryByRole("button", { name: "Use these facts" })).toBeNull();
  });
});
