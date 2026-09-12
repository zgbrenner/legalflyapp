import Link from "next/link";
import { ClassifierPanel } from "@/components/ClassifierPanel";

export default function HomePage() {
  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="grid-fade pointer-events-none absolute inset-0" />
        <div className="relative mx-auto flex min-h-[78vh] max-w-6xl flex-col justify-end px-4 pb-16 pt-20 md:px-6 md:pb-20 md:pt-24">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent">Open research experiment</p>
          <h1 className="mt-4 max-w-4xl font-display text-5xl font-semibold leading-[0.95] tracking-tight md:text-7xl">
            LEGALFLY
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-ink/75 md:text-xl">
            A fruit fly has ~140,000 neurons. Can its brain wiring detect sensitive information?
            Let&apos;s find out.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#inspect"
              className="bg-ink px-5 py-3 font-mono text-xs uppercase tracking-[0.18em] text-paper hover:bg-accent"
            >
              Let the fly read it
            </a>
            <Link
              href="/benchmark"
              className="border border-ink/20 bg-paper/70 px-5 py-3 font-mono text-xs uppercase tracking-[0.18em] hover:border-accent hover:text-accent"
            >
              View the experiment
            </Link>
          </div>
          <p className="mt-8 max-w-2xl text-sm text-ink/55">
            LegalFly does not simulate consciousness and does not provide legal advice. It uses
            fruit-fly neural connectivity as a computational reservoir.
          </p>
        </div>
      </section>

      <section id="inspect" className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-14">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl font-semibold tracking-tight">Inspect a passage</h2>
            <p className="mt-2 max-w-2xl text-ink/65">
              Text is encoded, projected into a connectome-derived reservoir, then classified by a
              small trainable readout. The visualization shows sampled activity — not every synapse.
            </p>
          </div>
        </div>
        <ClassifierPanel />
      </section>
    </div>
  );
}