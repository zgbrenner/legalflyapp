import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
export const metadata: Metadata = {
  title: { default: "The Legal Fly | A fly's wiring, an unusual assignment", template: "%s | The Legal Fly" },
  description: "A trained text classifier built around real fruit fly brain wiring. Try the experiment, inspect the activity, and compare it with scrambled wiring and standard text models.",
  metadataBase: new URL("https://thelegalfly.vercel.app"),
  openGraph: { title: "The Legal Fly", description: "Can a fly's brain wiring help spot sensitive text? An open, measured experiment.", type: "website" },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to content</a><SiteHeader/><main id="main-content">{children}</main><SiteFooter/></body></html>;
}
