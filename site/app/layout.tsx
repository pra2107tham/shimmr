import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Inter + JetBrains Mono: standard, widely-recognised faces rather than a
// display serif — the earlier Instrument Serif pairing read as "designed"
// in a way plain product UI shouldn't.
const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Shimmr — coming soon",
  description:
    "Shimmr is the context layer between your teams, your agents, and everything they run on — microservices, infra, databases, and more. Coming soon.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
