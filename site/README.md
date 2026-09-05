# site

The public face of Shimmr — a Next.js app deployed on Vercel, because this
repository is private and this is the one thing that needs to be reachable by
people who aren't collaborators.

Five parts:

- **The marketing page** (`/`) — "Light Warm" from Claude Design, with a real
  dark palette from the same design study's dark variant under
  `prefers-color-scheme` (no manual toggle — the system preference already
  tells us). Fonts are Inter + JetBrains Mono, not the Instrument Serif +
  IBM Plex pairing the original export used.
- **Three more marketing pages** — `/how-it-works`, `/use-it`, `/security` —
  sharing the same nav (`SiteNav.tsx`) and footer (`SiteFooter.tsx`) as the
  homepage. Diagram-led rather than paragraph-led, and consistent with [ADR
  0006](../docs/decisions/0006-engine-naming-and-attribution.md): what
  Shimmr does, never what it's built on.
- **Sign up / sign in** (`/signup`, `/login`) — Supabase Auth: a magic link,
  or Google/GitHub. All three land on the same `/auth/callback` route, which
  exchanges whichever PKCE code comes back for a session the same way
  regardless of provider. Google and GitHub only work once their OAuth apps
  are turned on in **Supabase Auth → Providers** — a dashboard step this
  repo has no write access to; until then, clicking either button surfaces
  Supabase's own "provider not enabled" error.
- **The dashboard** (`/dashboard`) — a signed-in person's own usage: totals,
  a 14-day calls chart and a top-tools chart (both update live over Realtime,
  same as the recent-activity feed below them, hand-rolled rather than a
  charting dependency), and their connected machines. A member of an org
  additionally sees that org's aggregate totals and tool breakdown — never
  which teammate made which call. See [ADR
  0011](../docs/decisions/0011-web-auth-and-dashboard.md) and [ADR
  0013](../docs/decisions/0013-org-dashboard-is-aggregate-only.md).

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

## Build

```bash
npm run build
```

A real Next.js server now, not a static export — the dashboard needs a
session cookie read per request, and `proxy.ts` needs to run on every
request to refresh it and gate `/dashboard`. Vercel runs this natively.

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
   console. Until this is done, the buttons on `/login` and `/signup` are
   visible but non-functional — Supabase rejects the sign-in attempt with a
   "provider not enabled" error, surfaced through the same error state the
   magic link uses.

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
  SiteNav.tsx, SiteFooter.tsx         shared nav/footer, every page
  login/, signup/           auth pages (share AuthForm.tsx: magic link + Google/GitHub OAuth)
  auth/callback/route.ts    exchanges whatever PKCE code comes back (magic link or OAuth) for a session
  auth/signout/route.ts     clears it
  cli-auth/                 confirms a shimmr login/signup browser pairing (ADR 0012)
  dashboard/
    page.tsx                server: fetches totals, installs, org (if any), and events for the charts/feed
    DashboardLive.tsx        client: realtime feed + charts, folding new events in live
    charts.tsx                CallsChart/ToolsChart — dependency-free, CSS-sized bars
  globals.css                design tokens: light on :root, dark under prefers-color-scheme
lib/supabase/
  client.ts                 browser client (Client Components)
  server.ts                 server client (Server Components, Route Handlers)
proxy.ts                    refreshes the session every request; gates /dashboard and /cli-auth
```

`proxy.ts`, not `middleware.ts` — Next.js 16 renamed the convention. See the
comment at the top of the file, and `AGENTS.md` in this directory (written
by `next dev` itself, not by anyone on this project) for why that kind of
thing is worth double-checking against current docs rather than memory.
