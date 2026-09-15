// Shared MiniMind fact schema and boundary types.
//
// MiniMind runs only inside the visitor's browser (see workers/minimind.worker.ts
// and lib/minimind-browser.ts). No HTTP client for a language service exists in
// the web app: petition text never leaves the page except as a structured
// message to the same-origin worker.

export const FACT_OPTIONS: Record<string, readonly string[]> = {
  matter: ["damage", "debt", "property", "delivery", "boundary", "insult", "account", "charter", "official", "threat"],
  property: ["none", "crops", "animal", "tool", "goods", "payment", "money", "land", "document", "public place", "small item", "service", "clothing", "fence"],
  harm: ["none", "low", "moderate", "high"],
  proof: ["unclear", "witness", "admitted", "document"],
  intent: ["unclear", "careless", "deliberate", "unable"],
  relationship: ["neighbors", "trade", "official"],
  urgency: ["low", "ordinary", "high"],
  ability: ["able", "unable"],
};

export type StructuredFacts = Record<keyof typeof FACT_OPTIONS, string>;
export type MiniMindDraft = {
  facts: StructuredFacts;
  field_confidence: Record<string, number>;
  receipt: { answer_labels_available: false; requires_confirmation: true; input: string[]; output: string[] };
};
export type MiniMindNote = { text: string; action: string; selection_confidence: number; receipt: { alternative_actions_available: false; output_mode: string } };
