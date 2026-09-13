import React from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { TwinChamber } from "@/components/TwinChamber";
import { classifyTwin, recordedTwin } from "@/lib/api";
import { displayActivity, schematicPosition } from "@/lib/brain-layout";
vi.mock("next/dynamic",()=>({default:()=>()=> <div>Neural display</div>}));
vi.mock("@/lib/api",()=>({MAX_TEXT_CHARS:4000, classifyTwin:vi.fn(), recordedTwin:vi.fn()}));
beforeEach(()=>{
 vi.mocked(recordedTwin).mockRejectedValue(new Error("No fixture"));
 Object.defineProperty(window,"matchMedia",{writable:true,value:()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()})});
});
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe("the experiment",()=>{
 it("explains remote processing before submission and labels the input",()=>{
  render(<TwinChamber/>);
  expect(screen.getByLabelText("Your passage, or one of ours")).toBeDefined();
  expect(screen.getByText(/Your text is sent to a server/)).toBeDefined();
 });
 it("rejects blank passages without making a model request",async()=>{
  render(<TwinChamber/>);fireEvent.change(screen.getByLabelText("Your passage, or one of ours"),{target:{value:"   "}});
  fireEvent.click(screen.getByRole("button",{name:/Run the experiment/}));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent","Enter a passage to test.");
  expect(classifyTwin).not.toHaveBeenCalled();
 });
 it("shows API failure without presenting a fabricated prediction",async()=>{
  vi.mocked(classifyTwin).mockRejectedValue(new Error("The model is offline."));
  render(<TwinChamber/>);fireEvent.click(screen.getByRole("button",{name:/Run the experiment/}));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent","The model is offline.");
  await waitFor(()=>expect(screen.getByRole("button",{name:/Run the experiment/})).toBeDefined());
  expect(screen.queryByText("Live result")).toBeNull();
 });
 it("starts with activity paused for reduced motion",()=>{
  render(<TwinChamber/>);expect(screen.getByRole("button",{name:"Play activity"})).toBeDefined();
 });
});
describe("comparison display",()=>{
 it("uses a stable position for each ID regardless of topology",()=>{
  expect(schematicPosition("5813050791")).toEqual(schematicPosition("5813050791"));
  expect(schematicPosition("other")).not.toEqual(schematicPosition("5813050791"));
 });
 it("has one fixed bounded activity transfer function",()=>{
  expect(displayActivity(0)).toBe(0);expect(displayActivity(1)).toBe(1);expect(displayActivity(.01)).toBeCloseTo(.18);
 });
});
