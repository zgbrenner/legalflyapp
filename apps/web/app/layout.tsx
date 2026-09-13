import type { Metadata } from "next";
import "./globals.css";
import "./legal-dreaming-refine.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
export const metadata: Metadata = {
  title: { default: "Legal Dreaming | The Legal Fly", template: "%s | The Legal Fly" },
  description: "Teach a network built from measured fruit fly wiring a set of legal patterns, remove the text, and observe learned replay. A browser-local experiment, not a simulation of consciousness.",
  metadataBase: new URL("https://thelegalfly.vercel.app"),
  openGraph: { title: "The Legal Fly", description: "The law, after hours. A measured experiment in legal associations and fruit fly wiring.", type: "website" },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to content</a><SiteHeader/><main id="main-content">{children}</main><SiteFooter/></body></html>;
}
