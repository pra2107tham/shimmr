# site

The public face of Shimmr — a Next.js app deployed on Vercel, because this
repository is private and this is the one thing that needs to be reachable by
people who aren't collaborators.

The design is **"Terminal Ledger"**, from Claude Design — one fixed dark
theme (flat panels, hairline rules, a lime accent, Geist + Geist Mono), the
same way the previous "Light Warm" design was fixed. No toggle, no light
variant; this design doesn't have one.

Six parts:

- **The marketing page** (`/`) — hero, a terminal-style command preview, a
  free-vs-connected split, and three cards into the other marketing pages.
- **Three more marketing pages** — `/how-it-works`, `/use-it`, `/security` —
  sharing the same nav (`SiteNav.tsx`) and footer (`SiteFooter.tsx`) as the
  homepage. Diagram-led rather than paragraph-led, and consistent with [ADR
  0006](../docs/decisions/0006-engine-naming-and-attribution.md): what
  Shimmr does, never what it's built on.
- **Download** (`/download`) — the actual "get started" destination site-wide:
  the install one-liner for macOS/Linux and Windows, then `shimmr signup` /
  `init` / `doctor`. Signup and sign-in are one click further from here, not
  the first thing a new visitor is asked to do — installing the binary comes
  before creating an account, matching the CLI's own order of operations.
- **Sign up / sign in** (`/signup`, `/login`) — one tabbed card
  (`AuthForm.tsx`), Supabase Auth: a magic link, or Google/GitHub. The tabs
  are real navigation between the two routes (preserving `next`), not
  client-only state — every redirect and the CLI-pairing flow both still
  work switching between them. All three methods land on the same
  `/auth/callback` route, which exchanges whichever PKCE code comes back for
  a session the same way regardless of provider. Google and GitHub each only
  work once their OAuth app is turned on in **Supabase Auth → Providers** — a
  dashboard step this repo has no write access to, done once per provider.
  Google is live; until GitHub gets the same treatment, its button surfaces
  Supabase's own "provider not enabled" error.
- **Connect a device** (`/cli-auth`) — confirms a `shimmr login`/`shimmr
  signup` browser pairing (ADR 0012), showing the real machine name and an
  honest "expires in" estimate by reading `cli_poll` once on render — the
  same unauthenticated-by-code endpoint the CLI itself polls.
- **The dashboard** (`/dashboard`) — a signed-in person's own usage: totals,
  a calls-over-time chart with a real 7d/30d/90d range toggle and a
  top-tools chart (both update live over Realtime, same as the
  recent-activity feed below them, hand-rolled rather than a charting
  dependency), and their connected machines. A member of an org
  additionally sees that org's aggregate totals and tool breakdown — never
  which teammate made which call. See [ADR
  0011](../docs/decisions/0011-web-auth-and-dashboard.md) and [ADR
  0013](../docs/decisions/0013-org-dashboard-is-aggregate-only.md). The
  dashboard header also links back to `/download`, for adding a second
  machine to the same account.

The nav's sign-in/get-started links vs. the signed-in "dashboard" link
(`NavAuthLinks.tsx`) are decided client-side, from `supabase.auth.getUser()`
plus `onAuthStateChange` — not server-side from the request cookie. That
keeps the four marketing pages and `/download` statically generated
(`○` in the build output) instead of forcing them to render per-request just
to know whether to show "sign in".

## Develop

```bash
npm install
cp .env.example .env.local   # fill in NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

## Environment variables

Two, both meant to be public (see `.env.example` for why):

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Already in `.env.example` — this project's URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase dashboard → Project Settings → API → anon / publishable key |

Set both in **Vercel → Project Settings → Environment Variables** for the
deployed site, the same values as `.env.local`.

A third, `NEXT_PUBLIC_SITE_URL`, is optional — see the comment above it in
`.env.example`. It only needs setting if the deployed URL ever diverges from
`packaging/site_url`.

## Build

```bash
npm run build
```

A real Next.js server now, not a static export — the dashboard needs a
session cookie read per request, and `proxy.ts` needs to run on `/dashboard`
and `/cli-auth` to refresh it and gate access. Vercel runs this natively.

## SEO

- `app/seo.ts` — `pageMetadata()`, one call per page for title, description,
  canonical, robots, and Open Graph/Twitter fields. `SITE_URL` comes from
  `NEXT_PUBLIC_SITE_URL`, falling back to the same production URL already
  pinned in `packaging/site_url`.
- `app/robots.ts`, `app/sitemap.ts`, `app/manifest.ts` — file-convention
  routes, generated rather than static files. The sitemap lists only the
  fully-indexable pages (`/`, `/download`, `/how-it-works`, `/use-it`,
  `/security`); `/login`, `/signup`, `/cli-auth`, `/dashboard` carry
  `noIndex: true` in their `pageMetadata()` call instead — crawlable but
  excluded from the sitemap and marked `noindex`, not blocked in
  `robots.txt` (a `Disallow` would stop Google from ever seeing the
  `noindex` tag, which can leave a bare, contentless URL indexed instead of
  none at all). `robots.txt` only disallows `/dashboard`, `/cli-auth`, and
  `/auth/` — routes with no content to index regardless.
- `app/opengraph-image.tsx`, `app/twitter-image.tsx` — both render
  `brand-og-image.tsx`'s `renderBrandImage()`. It loads real Inter font data
  into `ImageResponse` rather than relying on `next/og`'s undocumented
  default fallback font, which has a genuine text-spacing bug on real
  English word pairs (invisible on placeholder text, so it's easy to miss).
- `page.tsx` carries one `SoftwareApplication` JSON-LD block, honest fields
  only — no `aggregateRating` or reviews, since the product has neither yet
  and fabricating either is exactly the kind of number CLAUDE.md rules out.

## Manual steps this repo cannot do for itself

All one-time, all live in dashboards this session has no write access to —
the same shape as the GitHub Pages source setting was before this became a
Vercel deploy.

1. **Vercel env vars**, above.
2. **Supabase Auth → URL Configuration**: add the deployed site's URL (and
   `http://localhost:3000` for local dev) to *Site URL* and *Additional
   Redirect URLs*, with `/auth/callback` on each. Without this, a magic-link
   email points nowhere Supabase will actually redirect to, and sign-in fails
   silently at the last step.
3. **Supabase Auth → Providers**: turn on Google and/or GitHub, each with its
   own OAuth app's client id and secret from that provider's own developer
   console. **Google is done.** Until GitHub gets the same treatment, its
   button on `/login` and `/signup` is visible but non-functional — Supabase
   rejects the sign-in attempt with a "provider not enabled" error, surfaced
   through the same error state the magic link uses.

## Deploy

Vercel, configured with this directory (`site/`) as the project root — not
run from this repo's CI. Same reasoning as
[ADR 0009](../docs/decisions/0009-serve-releases-from-object-storage.md):
this repository is private, so a raw GitHub URL 404s for anyone who isn't a
collaborator.

## Structure

```
app/
  page.tsx                  marketing page
  how-it-works/, use-it/, security/   the three other marketing pages
  download/                 install one-liners + the three commands; the site-wide
                             "get started" destination
  marketing.module.css       shared hero/section/card primitives for those three
  seo.ts                    pageMetadata() — title/description/canonical/robots/OG per page
  robots.ts, sitemap.ts, manifest.ts   generated, not static files
  opengraph-image.tsx, twitter-image.tsx, brand-og-image.tsx   generated share image
  SiteNav.tsx, SiteFooter.tsx         shared nav/footer, every marketing + auth page
                                       (the dashboard has its own header instead)
  NavAuthLinks.tsx           client-side sign-in/get-started vs. dashboard link,
                             so the marketing pages stay statically generated
  login/, signup/           auth pages (share AuthForm.tsx: one tabbed card,
                                        magic link + Google/GitHub OAuth)
  auth/callback/route.ts    exchanges whatever PKCE code comes back (magic link or OAuth) for a session
  auth/signout/route.ts     clears it
  cli-auth/                 confirms a shimmr login/signup browser pairing (ADR 0012),
                             reading cli_poll once on render for the machine name + expiry
  dashboard/
    page.tsx                server: fetches totals, installs, org (if any), and a
                             bounded window of raw usage_events for the client to chart
    DashboardLive.tsx        client: realtime feed + charts, folding new events into
                             one usageLog array (range toggle re-buckets it, no refetch)
    charts.tsx                CallsChart/ToolsChart + bucketDaily/topTools — dependency-free
  globals.css                design tokens for the one fixed "Terminal Ledger" theme
  loading.module.css         shared by the route-level loading.tsx fallbacks below
  LinkPending.tsx            a <Link>-child dot that appears only if that link's own
                             navigation takes a moment — see the file's own comment
lib/supabase/
  client.ts                 browser client (Client Components)
  server.ts                 server client (Server Components, Route Handlers)
proxy.ts                    refreshes the session and gates access — /dashboard and
                             /cli-auth only (see the matcher at the bottom of the file)
```

`proxy.ts`, not `middleware.ts` — Next.js 16 renamed the convention. See the
comment at the top of the file, and `AGENTS.md` in this directory (written
by `next dev` itself, not by anyone on this project) for why that kind of
thing is worth double-checking against current docs rather than memory.

`proxy.ts`'s matcher used to run on every route, on the theory that a
session refresh is cheap. It isn't — it's a network round trip to Supabase
Auth, paid on every navigation. Narrowed to just the two routes that
actually gate on a session; every marketing page, `/login` and `/signup`
now render with zero server-side auth check, which is what they always did
anyway (`NavAuthLinks.tsx` handles auth-aware nav client-side). `/dashboard`
and `/cli-auth` also got `loading.tsx` files, so navigating to either shows
an instant fallback instead of a frozen page while the real one — session
check, then a data fetch — resolves.
