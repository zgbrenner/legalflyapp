import Link from "next/link";

export default function AboutPage() {
  return <article className="page-width reading-page">
    <p className="section-label">About the apparatus</p>
    <h1>The Legal Fly.</h1>
    <p>The Legal Fly is a small, local-first experiment. Fictional villagers describe ordinary disputes. A constrained language clerk may propose visible facts, a user confirms them, and a fixed fruit-fly connectome produces activity for an artificial readout.</p>
    <p>The narrow question is whether this biological wiring helps on the village charter task compared with the same learner using facts alone, shuffled wiring, frozen MiniMind representations, or the charter rules.</p>
    <h2>The specimen is a map.</h2>
    <p>No animal is being stimulated. The application uses the released MaleCNS v1.0 wiring diagram and continuous leaky-tanh dynamics. It does not simulate a complete fly, consciousness, legal understanding, or biological learning.</p>
    <h2>The clerk cannot decide.</h2>
    <p>MiniMind may map petition text to eight declared fields, but those fields remain visible and require confirmation. After the fly acts, MiniMind receives only that selected action, the confirmed fields, and a confidence band. It cannot substitute another recommendation.</p>
    <h2>The fly is allowed to lose.</h2>
    <p>The held-out benchmark counts abstentions and publishes each model&apos;s answer. In the current measured run, the facts-only control beats the biological graph on exact accuracy. That result stays visible.</p>
    <h2>Fiction, not legal advice.</h2>
    <p>The charter, disputes, and recommendations are authored for this toy task. Do not use the application for real legal matters or confidential material.</p>
    <p><Link href="/methodology" className="text-link">Read the method</Link> or <Link href="/benchmark" className="text-link">inspect the measurements</Link>.</p>
  </article>;
}
