# site

The public face of Shimmr — a Next.js app deployed on Vercel, because this
repository is private and this is the one thing that needs to be reachable by
people who aren't collaborators.

Three parts:

- **The marketing page** (`/`) — "Light Warm" from Claude Design (fixed, no
  theme switcher; a deliberate choice among the three variants designed, not
  an oversight).
- **Sign up / sign in** (`/signup`, `/login`) — Supabase Auth, magic link.
  One email, no password.
- **The dashboard** (`/dashboard`) — a signed-in person's own usage: totals,
  recent tool calls streamed in live over Supabase Realtime, and their
  connected machines. See [ADR 0011](../docs/decisions/0011-web-auth-and-dashboard.md).

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

## Two manual steps this repo cannot do for itself

Both are one-time, both live in dashboards this session has no write access
to — the same shape as the GitHub Pages source setting was before this
became a Vercel deploy.

1. **Vercel env vars**, above.
2. **Supabase Auth → URL Configuration**: add the deployed site's URL (and
   `http://localhost:3000` for local dev) to *Site URL* and *Additional
   Redirect URLs*, with `/auth/callback` on each. Without this, a magic-link
   email points nowhere Supabase will actually redirect to, and sign-in fails
   silently at the last step.

## Deploy

Vercel, configured with this directory (`site/`) as the project root — not
run from this repo's CI. Same reasoning as
[ADR 0009](../docs/decisions/0009-serve-releases-from-object-storage.md):
this repository is private, so a raw GitHub URL 404s for anyone who isn't a
collaborator.

## Structure

```
app/
  page.tsx                 marketing page
  login/, signup/          auth pages (share AuthForm.tsx)
  auth/callback/route.ts   exchanges the magic-link code for a session
  auth/signout/route.ts    clears it
  dashboard/                the dashboard: page.tsx (server) + DashboardLive.tsx (client, realtime)
lib/supabase/
  client.ts                browser client (Client Components)
  server.ts                server client (Server Components, Route Handlers)
proxy.ts                   refreshes the session every request; gates /dashboard
```

`proxy.ts`, not `middleware.ts` — Next.js 16 renamed the convention. See the
comment at the top of the file, and `AGENTS.md` in this directory (written
by `next dev` itself, not by anyone on this project) for why that kind of
thing is worth double-checking against current docs rather than memory.
