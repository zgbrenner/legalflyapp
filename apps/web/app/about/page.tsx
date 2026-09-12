export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:px-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">About</p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">What this is</h1>
      <div className="prose-narrow mt-6 space-y-4 text-ink/75">
        <p>
          LegalFly is a computational experiment testing whether biological neural topology —
          specifically connectivity inspired by Drosophila connectomes — provides useful inductive
          structure for low-parameter text classification in a legal/compliance setting.
        </p>
        <p>
          Task #1 is sensitive-information detection: given a short passage, detect whether
          sensitive categories appear (email, phone, SSN, credentials, and related labels).
        </p>
      </div>

      <h2 className="mt-12 font-display text-3xl font-semibold">What this is not</h2>
      <ul className="mt-4 space-y-2 text-ink/75">
        <li>Not a conscious fly</li>
        <li>Not brain uploading</li>
        <li>Not legal advice</li>
        <li>Not evidence that flies understand language</li>
        <li>Not an artificial general intelligence</li>
      </ul>

      <h2 className="mt-12 font-display text-3xl font-semibold">Reservoir computing, briefly</h2>
      <div className="mt-6 border border-ink/15 bg-paper/80 p-5 font-mono text-sm leading-7">
        Text
        <br />↓
        <br />Encoder
        <br />↓
        <br />Fly network (mostly fixed)
        <br />↓
        <br />Readout (trainable)
      </div>
      <p className="mt-4 text-ink/75">
        A reservoir is a high-dimensional dynamical system. Only a small readout is trained. Here,
        the reservoir&apos;s sparse wiring comes from a connectome-derived graph (or a matched random
        control). Dynamics are a simple leaky nonlinear map — a computational abstraction, not a
        biophysically exact neuron model.
      </p>
    </div>
  );
}