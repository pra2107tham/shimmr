# 0009 — Releases are served from object storage, Supabase now and R2 later

**Status:** Accepted
**Date:** 2026-09-03

## Context

v0.1.0 built correctly, published eleven correct assets, and could not be
installed by anyone. The repository is private, so GitHub release assets and
`raw.githubusercontent.com` both return 404 to everybody who is not us —
including the install command printed in the release notes.

Making the repository public would fix it in one click and is the wrong first
move: `docs/internal/ATTRIBUTION.md` and `packaging/engine.json` name the
embedded engine, which ADR 0006 permits internally and not otherwise. That
should be a deliberate decision, not a side effect of wanting a working
download link.

So artifacts move off the repository. The candidates differ on one axis that
matters more than the rest, because the archives are ~42 MB each:

| | Free tier | Egress |
|---|---|---|
| Cloudflare R2 | 10 GB stored | **none, ever** |
| Supabase Storage | 1 GB stored, 5 GB/month out | billed after |
| AWS S3 | 5 GB for a year | ~$0.09/GB |

5 GB a month is about 120 downloads of a single archive. R2 is where this ends
up. It is not where it starts, because adding a vendor to serve nobody buys
nothing, and Supabase is already in the stack with its secrets already in the
repository.

## Decision

**`ARTIFACT_HOST` picks the host, and the object layout is identical whichever
is chosen.**

- `supabase` — live. Uploads to a public Storage bucket, which the script
  creates if it does not exist, so a fresh project can be brought up from this
  repository alone.
- `r2` — a stub that **refuses loudly** and prints exactly which secrets and
  which call are missing.
- `none` — publishes nothing, successfully. The default.

The stub is deliberate. A half-configured integration that silently no-ops, or
one that fails only during a release, is worse than one that refuses on sight.

The layout mirrors GitHub's, so the installers need no special case:

```
install.sh
install.ps1
latest/download/shimmr-<os>-<arch>.<ext>      (+ .sha256)
download/<version>/shimmr-<os>-<arch>.<ext>   (+ .sha256)
```

`latest/` is overwritten every release. `download/<version>/` is written once,
so a link to a version keeps meaning that version.

The installers are published to the same bucket as the archives they fetch, so
the script and the thing it installs come from one place and cannot drift.

## Consequences

- The install command works for people who are not us, which it did not before.
- Moving to R2 is a bucket, five secrets, and one function body. Nothing else
  changes — not the layout, not the installers, not the release job.
- The GitHub release stays, as the record and the changelog. Its attached assets
  remain unreachable while the repository is private, so the release notes say
  which link to share.
- Supabase Storage egress is now a thing to watch. Roughly 120 downloads a month
  is the free ceiling; passing it is the signal to finish the R2 path, and a
  good problem to have.
