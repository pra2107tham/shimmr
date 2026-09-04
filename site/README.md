# site

The public "coming soon" page — a Next.js app, statically exported and
served from GitHub Pages, because this repository is private and this is the
one thing that needs to be reachable by people who aren't collaborators.

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

`GITHUB_PAGES_BASE_PATH=/shimmr npm run build` is what CI runs, because this
repo's Pages site serves under `/shimmr/`, not repo-root. Leave it unset for
local dev, or for a future deploy behind a custom domain that serves from
`/`.

## Deploy

Handled by `.github/workflows/pages.yml` on every push to `main` that
touches this directory. The reasoning is the same one behind
[ADR 0009](../docs/decisions/0009-serve-releases-from-object-storage.md):
this repository is private, so a raw GitHub URL 404s for anyone who isn't a
collaborator — releases solved that with object storage, this page solves it
with GitHub Pages.
