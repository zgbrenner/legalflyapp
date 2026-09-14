import Link from "next/link";

export default function ClassificationRetiredPage() {
  return <article className="page-width reading-page">
    <p className="section-label">Retired route</p>
    <h1>The old classifier has left the desk.</h1>
    <p>The active project is now The Legal Fly village-lawyer experiment. The previous server-side sensitive-information classifier is preserved in git history and supporting docs, but it is no longer part of the main application surface.</p>
    <p><Link href="/">Return to The Legal Fly</Link></p>
  </article>;
}
