export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-ink/10">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-ink/60 md:flex-row md:items-end md:justify-between md:px-6">
        <div>
          <p className="font-display text-base text-ink">LegalFly</p>
          <p className="mt-1 max-w-xl">
            A stolen wiring diagram, reanimated as math. Does not restore consciousness. Does not
            provide legal advice. Hemibrain edges: CC BY (Janelia FlyEM). Demo graphs: project MIT.
          </p>
        </div>
        <p className="font-mono text-xs uppercase tracking-wider">
          Submitted text is not saved by default
        </p>
      </div>
    </footer>
  );
}
