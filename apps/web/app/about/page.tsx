export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:px-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-blood">About the apparatus</p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">What this is</h1>
      <div className="prose-narrow mt-6 space-y-4 text-ink/75">
        <p>
          LegalFly is a computational experiment that treats a fruit-fly connectome as borrowed
          tissue. We take biological adjacency — real Janelia hemibrain edges when available —
          reanimate it as a dynamical reservoir, and ask whether that corpse of connectivity helps
          classify sensitive information in legal and compliance text.
        </p>
        <p>
          The fantastical part is real: millions of synapses, measured in a dead fly&apos;s brain,
          can be driven by text embeddings. The sober part is also real: this is linear algebra on a
          sparse graph, not a resurrected animal.
        </p>
      </div>

      <h2 className="mt-12 font-display text-3xl font-semibold">What this is not</h2>
      <ul className="mt-4 space-y-2 text-ink/75">
        <li>Not a conscious fly</li>
        <li>Not brain uploading</li>
        <li>Not legal advice</li>
        <li>Not evidence that flies understand language</li>
        <li>Not proof that biology must beat random wiring</li>
      </ul>

      <h2 className="mt-12 font-display text-3xl font-semibold">The Frankenstein bargain</h2>
      <div className="mt-6 border border-ink/15 bg-paper/80 p-5 font-mono text-sm leading-7">
        Legal text
        <br />↓
        <br />Encoder (no soul)
        <br />↓
        <br />Excised connectome (mostly fixed)
        <br />↓
        <br />Trainable readout (the only living lesson)
      </div>
      <p className="mt-4 text-ink/75">
        We train the small readout. The tissue topology stays mostly frozen — that is the point of
        the biology claim. Random controls ask whether the stolen wiring mattered, or whether any
        corpse of similar size would do.
      </p>
    </div>
  );
}
