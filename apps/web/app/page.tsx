import Link from "next/link";
import { TwinChamber } from "@/components/TwinChamber";

export default function HomePage() {
  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="grid-fade pointer-events-none absolute inset-0 opacity-80" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(140,18,18,0.16),transparent_42%)]" />
        <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-16 md:px-6 md:pb-12 md:pt-20">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-blood">
            Open research · borrowed tissue · no soul included
          </p>
          <h1 className="mt-4 max-w-4xl font-display text-5xl font-semibold leading-[0.95] tracking-tight md:text-7xl">
            LEGALFLY
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-ink/80 md:text-xl">
            We cut a fruit fly&apos;s wiring out of a dead connectome and ask whether stolen biology
            classifies sensitive legal text better than a random twin.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#twin"
              className="bg-ink px-5 py-3 font-mono text-xs uppercase tracking-[0.18em] text-paper hover:bg-blood"
            >
              Stimulate the twins
            </a>
            <Link
              href="/benchmark"
              className="border border-ink/20 bg-paper/70 px-5 py-3 font-mono text-xs uppercase tracking-[0.18em] hover:border-blood hover:text-blood"
            >
              See measured scores
            </Link>
          </div>
        </div>
      </section>

      <section id="twin" className="mx-auto max-w-6xl px-4 pb-16 md:px-6 md:pb-20">
        <TwinChamber />
        <p className="mt-8 max-w-3xl text-sm text-ink/55">
          Not a mind. Not legal advice. When hemibrain tissue is loaded: real Janelia edges (CC BY).
          When not: a synthetic demo stand-in. The UI names which body you are operating on.
        </p>
      </section>
    </div>
  );
}
