"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlyMark } from "./FlyMark";
const links = [["/", "Chamber"], ["/#docket", "Docket"], ["/methodology", "Method"], ["/benchmark", "Benchmarks"]];
export function SiteHeader() {
  const path = usePathname();
  return <header className="site-header"><div className="site-header-inner">
    <Link href="/" className="wordmark" aria-label="The Legal Fly home"><FlyMark/><span>The Legal Fly<span className="wordmark-period">.</span></span></Link>
    <nav aria-label="Main navigation">{links.map(([href, label]) => <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>{label}</Link>)}</nav>
  </div></header>;
}
