import Link from "next/link";
import { TwinChamber } from "@/components/TwinChamber";
import { FlyMark } from "@/components/FlyMark";
export default function HomePage() {
  return <div>
    <section className="page-width hero">
      <div className="hero-copy"><h1>Can a fly’s brain<br/>spot your <em>secrets?</em></h1>
        <p>We built a computer model from part of a fruit fly’s brain wiring, then trained a classifier to flag private information in text.</p>
        <p className="hero-secondary">Give it a passage. Watch the signals travel. Compare its answer with scrambled wiring and a standard text classifier.</p>
        <div className="hero-actions"><a className="button button-dark" href="#experiment">Try the experiment <span aria-hidden>↘</span></a><Link className="text-link" href="/benchmark">Read the results <span aria-hidden>↗</span></Link></div>
      </div>
      <div className="specimen-print" aria-hidden="true"><div className="print-corner tl"/><div className="print-corner tr"/><FlyMark className="hero-fly"/><div className="specimen-caption"><i>Drosophila melanogaster</i><span>Fruit fly · wiring preserved</span></div><span className="print-index">FIG. 01</span><div className="print-corner bl"/><div className="print-corner br"/></div>
    </section>
    <div className="page-width procedure-strip" aria-label="How the experiment works">
      <p><span>01</span>Text becomes electrical-style signals.</p><p><span>02</span>Signals pass through the fly’s wiring.</p><p><span>03</span>A trained classifier flags private details.</p>
    </div>
    <section id="experiment" className="page-width experiment-section"><TwinChamber/></section>
    <section className="page-width field-notes"><div><p className="section-label">A note on the experiment</p><h2>The wiring is real.<br/>The assignment is ours.</h2></div>
      <div><p>The fly did not learn to read. We trained the part of the computer model that turns its activity into an answer. The map contains connections from a real, reconstructed fly brain; the simulated signals are mathematics. The classifier can also use the original text features. The ablation experiment shows how much the wiring contributes.</p>
        <p>To find out whether the wiring helps, we compare it with scrambled connections and standard classifiers. The research benchmark gives every model the same MiniLM text features. A higher score alone does not prove that biology caused the improvement.</p>
        <Link href="/methodology" className="text-link">See what is biological, and what is not ↗</Link></div>
    </section>
  </div>;
}
