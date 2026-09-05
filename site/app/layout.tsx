import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SITE_URL, pageMetadata } from "./seo";
import "./globals.css";

// Geist + Geist Mono — the "Terminal Ledger" design's type pair. Confirmed
// available in next/font/google's own font-data.json rather than assumed.
const sans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const mono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// The fallback every page's own metadata (app/seo.ts) narrows from. Setting
// metadataBase here is what lets a relative canonical/OG image resolve to
// an absolute URL everywhere else — without it Next warns and falls back
// to localhost, which is wrong the moment this is deployed.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "Shimmr",
  icons: { icon: "/icon.svg" },
  ...pageMetadata({
    title: "Shimmr — coming soon",
    description:
      "Shimmr is a local-first tool that gives coding agents real understanding of a codebase — plus an account layer and usage metering. Coming soon.",
    path: "/",
  }),
};

// Matches the fixed dark "Terminal Ledger" palette (globals.css) — a
// mobile browser's own chrome (status bar, address bar) picks this up
// instead of defaulting to white.
export const viewport: Viewport = {
  themeColor: "#08090a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
