import type { Metadata } from "next";

// Shared SEO plumbing — one place for the site's canonical URL and the
// metadata shape every page builds from, so eight pages don't each get a
// slightly different idea of what a title, a canonical link, or a social
// preview should look like.

// Falls back to the same URL already committed at packaging/site_url —
// what shimmr login/signup's browser flow points at (ADR 0012). Keeping
// one canonical default here means a domain change is one env var away
// from being consistent everywhere, rather than two files agreeing by
// coincidence. Override with NEXT_PUBLIC_SITE_URL if the two ever diverge.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://shimmr-ten.vercel.app").replace(/\/+$/, "");

export const SITE_NAME = "Shimmr";

type PageMetadataInput = {
  /** Full title, e.g. "How it works — Shimmr" — used verbatim for
   * <title>, og:title, and twitter:title alike. */
  title: string;
  description: string;
  /** Path from the site root, e.g. "/how-it-works". "/" for the homepage. */
  path: string;
  /** Set for anything transactional or behind auth — a signed-in
   * dashboard, an auth form, a one-time device-pairing link. None of
   * these are worth a search result, and a crawler can't render the
   * ones that require a session anyway. */
  noIndex?: boolean;
};

export function pageMetadata({ title, description, path, noIndex = false }: PageMetadataInput): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: path,
      siteName: SITE_NAME,
      type: "website" as const,
    },
    twitter: {
      card: "summary_large_image" as const,
      title,
      description,
    },
  };
}
