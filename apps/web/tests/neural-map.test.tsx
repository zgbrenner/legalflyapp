import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MaleCNSMap } from "@/components/MaleCNSMap";

const frame = {
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
});
