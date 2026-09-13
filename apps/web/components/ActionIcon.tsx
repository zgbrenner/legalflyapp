export function DownloadIcon({ className = "action-icon" }: { className?: string }) {
  return <svg viewBox="0 0 18 18" className={className} aria-hidden="true" fill="none">
    <path d="M9 2.5v8.2m0 0 3.1-3.1M9 10.7 5.9 7.6M3.3 13.5v1.7h11.4v-1.7" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}

export function ExternalIcon({ className = "action-icon" }: { className?: string }) {
  return <svg viewBox="0 0 18 18" className={className} aria-hidden="true" fill="none">
    <path d="M7 4.2H4.8a1.6 1.6 0 0 0-1.6 1.6v7.4a1.6 1.6 0 0 0 1.6 1.6h7.4a1.6 1.6 0 0 0 1.6-1.6V11M10 3.2h4.8V8M14.6 3.4 8.2 9.8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
