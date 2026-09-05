import type { NextConfig } from "next";

// A real Next.js server now, not a static export: the dashboard needs
// per-request cookies (a signed-in session is different for every visitor)
// and proxy.ts needs to run on every request to refresh that session and
// gate /dashboard. Vercel runs this natively — nothing else to configure.
//
// The marketing homepage and the auth pages stay statically optimized on
// their own; only routes that actually read the session pay for being
// dynamic.
const nextConfig: NextConfig = {
  images: { unoptimized: true },
};

export default nextConfig;
