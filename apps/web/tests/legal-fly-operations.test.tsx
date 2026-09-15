import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LegalFlyVillage } from "@/components/LegalFlyVillage";

class WorkerMock {
  static instance: WorkerMock;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { WorkerMock.instance = this; }
  emit(data: unknown) { this.onmessage?.({ data } as MessageEvent); }
}

const facts = { matter: "damage", property: "crops", harm: "moderate", proof: "witness", intent: "careless", relationship: "neighbors", urgency: "ordinary", ability: "able" };
const petitions = [
  { id: "goat", split: "teach", family: "animals", title: "The goat", villager: "Els", prop: "cabbage", petition: "A goat ate cabbages.", facts, label: "seek-small-reparation" },
  { id: "pan", split: "holdout", family: "loans", title: "The pan", villager: "Pieter", prop: "pan", petition: "A pan was not returned.", facts: { ...facts, matter: "property" }, label: "request-return" },
];

beforeEach(() => {
  vi.stubGlobal("Worker", WorkerMock as unknown as typeof Worker);
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("Legal Fly operation ownership", () => {
  it("cancels a live consultation before switching petitioners and ignores its stale advice", () => {
    render(<LegalFlyVillage />);
    const mock = WorkerMock.instance;
    act(() => {
      mock.emit({ id: 1, type: "cases", cases: petitions, actions: [["seek-small-reparation", "Seek small reparation."], ["request-return", "Request return of property."]] });
      mock.emit({ id: 1, type: "loaded", graph: { neurons: 165122 } });
      mock.emit({ id: 1, type: "trained", modelSummary: { seed: 42 } });
      mock.emit({ id: 1, type: "status", state: "petition-ready" });
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm these eight facts" }));
    fireEvent.click(screen.getByRole("button", { name: "Hear the case" }));
    fireEvent.click(screen.getByRole("button", { name: /Pieter The pan/ }));
    expect(mock.postMessage).toHaveBeenLastCalledWith({ id: 3, type: "cancel", silent: true });
    act(() => mock.emit({ id: 2, type: "advice", result: { case: petitions[0], advice: { action: "seek-small-reparation", confidence: .8 }, recommendation: "Old advice" } }));
    expect(screen.queryByText("Old advice")).toBeNull();
  });
});
