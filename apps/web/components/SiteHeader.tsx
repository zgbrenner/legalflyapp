import Link from "next/link";
import { DEMO_MODE } from "@/lib/api";

const links = [
  { href: "/", label: "Specimen" },
  { href: "/benchmark", label: "Autopsy" },
  { href: "/compare", label: "Twin" },
  { href: "/ablate", label: "Destroy" },
  { href: "/methodology", label: "Method" },
  { href: "/about", label: "About" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
        <Link href="/" className="group flex items-baseline gap-2">
          <span className="font-display text-xl font-semibold tracking-tight md:text-2xl">
            LegalFly
          </span>
          <span className="hidden text-xs uppercase tracking-[0.18em] text-ink/55 sm:inline">
            borrowed wiring · legal text
          </span>
        </Link>
        <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm font-medium">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-ink/70 transition hover:text-blood"
            >
              {link.label}
            </Link>
          ))}
          <span
            className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
              DEMO_MODE
                ? "border-accent/40 bg-accentsoft text-accent"
                : "border-blood/50 bg-blood/10 text-blood"
            }`}
          >
            {DEMO_MODE ? "Demo Connectome" : "Hemibrain Tissue"}
          </span>
        </nav>
      </div>
    </header>
  );
}
