import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MaleCNSMap, type MaleCNSFrame } from "@/components/MaleCNSMap";

const frame: MaleCNSFrame = {
  step: 2,
  total_steps: 4,
  sampled: true,
  total_neurons: 165122,
  coordinate_count: 140024,
  points: [
    { index: 7, body_id: 10007, coordinate: [37124, 22258, 36274], activation: 0.42, magnitude: 0.42, active: true, roles: ["input"] },
    { index: 9, body_id: 10009, coordinate: [50100, 57400, 100200], activation: -0.18, magnitude: 0.18, active: true, roles: ["vnc"] },
  ],
};

afterEach(cleanup);

describe("MaleCNS anatomical activity map", () => {
  it("exposes real neuron identity, source coordinate, and signed activation without hover", () => {
    render(<MaleCNSMap frame={frame} active />);
    expect(screen.getByRole("img", { name: /actual sampled MaleCNS activity/i })).toBeDefined();
    expect(screen.getByText("Body 10007", { selector: "strong" })).toBeDefined();
    expect(screen.getByText(/37124, 22258, 36274/)).toBeDefined();
    expect(screen.getByText(/\+0.42000/)).toBeDefined();
    expect(screen.getByText(/140,024 mapped coordinates/)).toBeDefined();
  });

  it("allows keyboard-equivalent selection of another displayed neuron", () => {
    render(<MaleCNSMap frame={frame} active={false} />);
    fireEvent.change(screen.getByLabelText("Inspect displayed neuron"), { target: { value: "9" } });
    expect(screen.getByText("Body 10009", { selector: "strong" })).toBeDefined();
    expect(screen.getByText(/VNC/)).toBeDefined();
    expect(screen.getByText(/-0.18000/)).toBeDefined();
  });

  it("redraws on container resize without repeatedly resetting the canvas backing size", () => {
    let resize = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect = disconnect; });
    vi.stubGlobal("CanvasRenderingContext2D", class {});
    const context = { setTransform() {}, clearRect: vi.fn(), fillRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {} };
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as any);
    const width = vi.spyOn(HTMLCanvasElement.prototype, "width", "set");
    const { unmount } = render(<MaleCNSMap frame={frame} active={false} />);
    width.mockClear();
    context.clearRect.mockClear();
    resize(); resize();
    expect(context.clearRect).toHaveBeenCalledTimes(4);
    expect(width).not.toHaveBeenCalled();
    unmount();
    expect(disconnect).toHaveBeenCalled();
    getContext.mockRestore(); width.mockRestore(); vi.unstubAllGlobals();
  });
});
