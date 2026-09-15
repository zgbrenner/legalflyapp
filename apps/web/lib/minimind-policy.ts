export function authoredMiniMindNotes(
  facts: Record<string, string>,
  action: string,
): string[] {
  const subject = facts.property !== "none" ? facts.property : "the matter";
  const notes: Record<string, string[]> = {
    "let-rest": ["Let the matter rest unless the facts change.", "No further step is advised on the present account."],
    "seek-small-reparation": [`First speak with the other party. Record the harm to ${subject}. Seek modest reparation if it continues.`, `Document the harm to ${subject}, then ask for a small reparation.`],
    "seek-full-reparation": [`Preserve the account of harm to ${subject}. Seek full reparation under the fictional charter.`, `Record the loss involving ${subject} and request full reparation.`],
    "request-return": [`Ask for the return of ${subject}. Record the request and any reply.`, `Request that ${subject} be returned before taking a further step.`],
    "find-witness": ["Find a witness before pressing the petition further.", "Write down the disputed account and seek someone who observed it."],
    "sworn-account": ["Request a sworn account under the fictional village charter.", "Ask each party for a sworn account within the fictional charter."],
    "propose-settlement": ["Put a practical settlement to both parties and record what each accepts.", "Propose terms both parties can keep, then write them into the ledger."],
    "refer-higher": ["Refer the petition to a higher authority. The fly offers no final judgment.", "Place the matter before a higher authority under the fictional charter."],
    abstain: ["The fly declines to advise on the present facts.", "The account is too uncertain for this fly to recommend a next step."],
  };
  // Own-property lookup only: inherited members such as "constructor" or
  // "toString" must never be treated as an authored action.
  return Object.hasOwn(notes, action) ? notes[action] : [];
}
