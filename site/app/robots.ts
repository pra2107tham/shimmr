import type { MetadataRoute } from "next";
import { SITE_URL } from "./seo";

// Only what a crawler genuinely cannot do anything with: /dashboard needs
// a session it doesn't have (a fetch just bounces to /login anyway), /cli-
// auth is a one-time device-pairing link with no standing content, and
// /auth/* are route handlers (redirects), not pages.
//
// /login and /signup are deliberately *not* disallowed here even though
// they're real pages nobody should find in search results — that's what
// their own `noindex` (app/seo.ts) is for. Disallowing a page in
// robots.txt stops Google from ever fetching it, which means it can't see
// a noindex tag either; the well-known result is Google sometimes still
// shows the bare URL as "no information is available for this page"
// instead of leaving it out entirely. Letting it crawl but telling it not
// to index is the version that actually stays out of results.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/cli-auth", "/auth/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
