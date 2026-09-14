import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
export const metadata: Metadata = {
  title: { default: "The Legal Fly", template: "%s | The Legal Fly" },
  description: "A local-first village-lawyer experiment using the official MaleCNS fruit fly connectome and a constrained MiniMind language clerk.",
  metadataBase: new URL("https://thelegalfly.vercel.app"),
  openGraph: { title: "The Legal Fly", description: "Can a fruit fly make a good lawyer?", type: "website" },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to content</a><SiteHeader/><main id="main-content">{children}</main><SiteFooter/></body></html>;
}
