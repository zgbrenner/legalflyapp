import Link from "next/link";
import { FlyMark } from "./FlyMark";
export function SiteFooter() {
  return <footer className="site-footer"><div className="page-width footer-inner">
    <div className="footer-brand"><FlyMark/><div><p>The Legal Fly.</p><span>A second life for a wiring diagram.</span></div></div>
    <p>A computer experiment, not a living fly.<br/>Not legal advice or a confidentiality guarantee.</p>
    <div><Link href="/methodology">Data &amp; method</Link><a href="https://github.com/zgbrenner/legalflyapp" target="_blank" rel="noreferrer">Source code ↗</a></div>
  </div><div className="page-width footer-credit">Hemibrain v1.2 connectivity: Janelia FlyEM, CC BY 4.0. Code: MIT. Illustrative layouts, measured model activity.</div></footer>;
}
