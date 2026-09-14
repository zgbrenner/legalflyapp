import Link from "next/link";

export default function BenchmarkPage() {
  return <article className="page-width reading-page">
    <p className="section-label">Benchmarks</p>
    <h1>Run the held-out docket<br />from the chamber.</h1>
    <p>The benchmark is intentionally visitor-local for this release. Train the ledger on the homepage, open &quot;Inspect the apparatus,&quot; and run the held-out benchmark there. The worker reports exact matches, abstentions, forced-choice coverage, and per-case outputs.</p>
    <p>The benchmark uses the same authored 32 teaching and 16 held-out split as the app. The ground truth is the fictional village charter, not real law and not historical doctrine.</p>
    <p>The current seed-42 full-data run produced 13/16 exact for biological MaleCNS with one abstention, 11/16 for shuffled wiring with five abstentions, 14/16 for the facts-only learner, 7/16 for MiniMind alone, and 9/16 for the charter rules. The shuffled graph preserves degree sequences and the global weight multiset but can introduce parallel pairs and self-connections.</p>
    <p><Link href="/#docket">Bring a dispute</Link> / <Link href="/methodology">Read the method</Link></p>
  </article>;
}
