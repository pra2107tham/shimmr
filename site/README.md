# site

The public "coming soon" page — a Next.js app, statically exported and
deployed on Vercel, because this repository is private and this is the one
thing that needs to be reachable by people who aren't collaborators.

This implements the "Light Warm" design from Claude Design (fixed — no theme
switcher, no dark mode; that's a deliberate choice among the three variants
designed, not an oversight).

## Develop

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Static export (`output: "export"` in `next.config.ts`) writes to `out/`.
There is no server — everything on the page has to work as plain files.

## Deploy

Vercel, configured with this directory (`site/`) as the project root — not
run from this repo's CI. Same reasoning as
[ADR 0009](../docs/decisions/0009-serve-releases-from-object-storage.md):
this repository is private, so a raw GitHub URL 404s for anyone who isn't a
collaborator — releases solved that with object storage, this page solves it
by deploying somewhere world-reachable instead.
