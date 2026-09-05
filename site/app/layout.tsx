import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Shimmr — coming soon",
  description:
    "Shimmr is a local-first tool that gives coding agents real understanding of a codebase — plus an account layer and usage metering. Coming soon.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
