import Link from "next/link";
import { FlyMark } from "./FlyMark";
import { ExternalIcon } from "./ActionIcon";
export function SiteFooter() {
  return <footer className="site-footer"><div className="page-width footer-inner">
    <div className="footer-brand"><FlyMark/><div><p>The Legal Fly.</p><span>Can a fruit fly make a good lawyer?</span></div></div>
    <p>A computer experiment, not a living fly.<br/>Not legal advice or a confidentiality guarantee.</p>
    <div><Link href="/methodology">Data &amp; method</Link><a href="https://github.com/zgbrenner/legalflyapp" target="_blank" rel="noreferrer"><span className="with-icon">Source code <ExternalIcon/></span></a></div>
  </div><div className="page-width footer-credit">MaleCNS v1.0 connectivity: Janelia FlyEM, CC BY 4.0. Code and fictional village charter: MIT. Illustrative chamber, measured model activity.</div></footer>;
}
