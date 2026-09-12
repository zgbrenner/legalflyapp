import Link from "next/link";
import { ClassifierPanel } from "@/components/ClassifierPanel";

export default function HomePage() {
  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="grid-fade pointer-events-none absolute inset-0 opacity-80" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(140,18,18,0.16),transparent_42%)]" />
        <div className="relative mx-auto flex min-h-[82vh] max-w-6xl flex-col justify-end px-4 pb-16 pt-20 md:px-6 md:pb-20 md:pt-24">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-blood">
            Open research · borrowed tissue · no soul included
          </p>
          <h1 className="mt-4 max-w-4xl font-display text-5xl font-semibold leading-[0.95] tracking-tight md:text-7xl">
            LEGALFLY
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-ink/80 md:text-xl">
            We cut a fruit fly&apos;s wiring diagram out of a dead connectome, scaled it into a
            dynamical system, and asked it to smell sensitive information in legal text.
          </p>
          <p className="mt-4 max-w-2xl text-base text-ink/60">
            Not a mind. Not legal advice. A reanimated adjacency matrix with a small trainable
            readout — Frankenstein engineering with citation requirements.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#inspect"
              className="bg-ink px-5 py-3 font-mono text-xs uppercase tracking-[0.18em] text-paper hover:bg-blood"
            >
              Feed it the text
            </a>
            <Link
              href="/benchmark"
              className="border border-ink/20 bg-paper/70 px-5 py-3 font-mono text-xs uppercase tracking-[0.18em] hover:border-blood hover:text-blood"
            >
              See what the corpse scored
            </Link>
          </div>
          <p className="mt-8 max-w-2xl text-sm text-ink/55">
            When hemibrain tissue is loaded: real Janelia edges (CC BY). When not: a synthetic demo
            stand-in. The UI will say which body you are operating on.
          </p>
        </div>
      </section>

      <section id="inspect" className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-14">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl font-semibold tracking-tight">
              Offer a specimen
            </h2>
            <p className="mt-2 max-w-2xl text-ink/65">
              Your passage is encoded, injected into the connectome reservoir, and read out by a
              thin trained layer. The visualization shows sampled activity in an abstract layout —
              not every synapse, and not a waking fly.
            </p>
          </div>
        </div>
        <ClassifierPanel />
      </section>
    </div>
  );
}
