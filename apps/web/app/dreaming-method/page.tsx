import Link from "next/link";

export default function DreamingMethodRetiredPage() {
  return <article className="page-width reading-page">
    <p className="section-label">Retired route</p>
    <h1>Legal Dreaming is archived.</h1>
    <p>This route remains only to avoid broken links. The current method is the MaleCNS village-lawyer experiment, not the earlier hemibrain dreaming prototype.</p>
    <p><Link href="/methodology">Read the current method</Link></p>
  </article>;
}
