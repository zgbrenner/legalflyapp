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

describe("inference integrity",()=>{
 it("does not display old-science API output as a current live result",async()=>{
  vi.mocked(classifyTwin).mockResolvedValue({tissue:{science_version:"old"},twin:{science_version:"old"}} as any);
  render(<TwinChamber/>);fireEvent.click(screen.getByRole("button",{name:/Run the experiment/}));
  expect((await screen.findByRole("alert")).textContent).toMatch(/older model/);
  expect(screen.queryByText("Live result")).toBeNull();
 });
 it("lets the user cancel a pending request",async()=>{
  vi.mocked(classifyTwin).mockImplementation((_text,_sim,signal)=>new Promise((_resolve,reject)=>signal?.addEventListener("abort",()=>reject(new DOMException("Cancelled","AbortError")))));
  render(<TwinChamber/>);fireEvent.click(screen.getByRole("button",{name:/Run the experiment/}));
  fireEvent.click(await screen.findByRole("button",{name:"Cancel request"}));
  await waitFor(()=>expect(screen.getByRole("button",{name:/Run the experiment/})).toBeDefined());
  expect(vi.mocked(classifyTwin).mock.calls[0][2]?.aborted).toBe(true);
  expect(screen.queryByText("Live result")).toBeNull();
 });
});


describe("known synthetic examples",()=>{
 it("shows a planted-identifier miss instead of treating agreement as success",async()=>{
  const model={science_version:"2.0-directed-controls",labels:[{name:"NONE",confidence:.8}],contains_sensitive:false,simulation:{},inference_time_sec:.01,encoder_name:"hashing-384",demo_mode:false,anatomical_edges:true};
  vi.mocked(classifyTwin).mockResolvedValue({tissue:model,twin:{...model,anatomical_edges:false},baseline:model,agree_on_sensitive:true} as any);
  render(<TwinChamber/>);fireEvent.click(screen.getByRole("button",{name:"A private number"}));
  expect(await screen.findByText(/Known example: SSN/)).toBeDefined();
  expect(screen.getByText(/The fly missed the expected label/)).toBeDefined();
 });
});
