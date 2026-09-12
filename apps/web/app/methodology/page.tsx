import Link from "next/link";

export default function MethodologyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:px-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-blood">Methodology</p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">
        How we borrow the dead
      </h1>

      <section className="mt-10 space-y-3 text-ink/75">
        <h2 className="font-display text-2xl font-semibold text-ink">Tissue source</h2>
        <p>
          Research mode uses Janelia <strong>hemibrain v1.2</strong> traced adjacencies (CC BY 4.0):
          real bodyIds, real synapse-count weights. We surgically keep a high-degree subgraph
          (~3k neurons) so the apparatus can run interactively. Demo mode uses a synthetic stand-in
          when hemibrain files are absent.
        </p>
        <p>
          UI layouts are abstract region clusters — <em>not</em> EM skeleton coordinates. Edges are
          biological; the 3D staging is theatrical anatomy.
        </p>
      </section>

      <section className="mt-10 space-y-3 text-ink/75">
        <h2 className="font-display text-2xl font-semibold text-ink">Reservoir equations</h2>
        <pre className="overflow-x-auto border border-ink/15 bg-mist/40 p-4 font-mono text-xs">
{`x(t+1) = (1 - λ) x(t) + λ tanh(W x(t) + Win u(t))
W  : hemibrain-derived sparse matrix (spectral-radius scaled)
Win: fixed projection into selected input neurons
f  : tanh
λ  : leak`}
        </pre>
      </section>

      <section className="mt-10 space-y-3 text-ink/75">
        <h2 className="font-display text-2xl font-semibold text-ink">Controls & honesty</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Random A: Erdős–Rényi-like sparse rewiring, matched size</li>
          <li>Random B: degree-preserving edge swaps</li>
          <li>Random C: fixed topology, randomized weights</li>
          <li>Linear / MLP baselines on the same encoder</li>
        </ul>
        <p>
          If random tissue beats biological tissue, we say so. The experiment is whether stolen
          biology helps — not whether we can force a gothic narrative to win.
        </p>
      </section>

      <section className="mt-10 space-y-3 text-ink/75">
        <h2 className="font-display text-2xl font-semibold text-ink">Reproducibility</h2>
        <pre className="overflow-x-auto border border-ink/15 bg-mist/40 p-4 font-mono text-xs">
{`make fetch-hemibrain
make build-hemibrain
make train-hemibrain`}
        </pre>
        <p>
          See also{" "}
          <Link href="/about" className="text-blood underline-offset-2 hover:underline">
            About
          </Link>{" "}
          and <code className="font-mono text-sm">docs/DATA_AND_LICENSING.md</code>.
        </p>
      </section>
    </div>
  );
}
