import type { NextConfig } from "next";

// Static export: this ships as plain files, not a Node process. Everything
// on the page has to work with no server behind it. Vercel serves a
// statically-exported Next.js app directly, so this needs nothing beyond
// what `next build` already produces in out/.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
