import type { NextConfig } from "next";

// Static export: this ships to GitHub Pages, which serves plain files, not a
// Node process. Everything on the page has to work with no server behind it.
//
// GITHUB_PAGES_BASE_PATH is set by .github/workflows/pages.yml, because this
// repository's Pages site is served under /shimmr/ (a project page, not a
// pra2107tham.github.io root page). Local dev and any future custom-domain
// deploy leave it unset, so the site serves from "/" by default.
const basePath = process.env.GITHUB_PAGES_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
