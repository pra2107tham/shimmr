import type { MetadataRoute } from "next";
import { SITE_URL } from "./seo";

// Only the fully-indexable pages — the ones with `noIndex` unset in their
// own app/seo.ts call (login, signup, the dashboard, cli-auth) are left
// out on purpose. Listing a noindex page in the sitemap sends Google two
// contradictory signals at once ("index this" via the sitemap, "don't" via
// the meta tag), and Search Console calls it out as a warning rather than
// silently sorting it out.
const PAGES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/download", priority: 0.9, changeFrequency: "monthly" },
  { path: "/how-it-works", priority: 0.8, changeFrequency: "monthly" },
  { path: "/use-it", priority: 0.8, changeFrequency: "monthly" },
  { path: "/security", priority: 0.8, changeFrequency: "monthly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PAGES.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
