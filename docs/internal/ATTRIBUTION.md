# Engine attribution — INTERNAL, NOT FOR DISTRIBUTION

> **Do not copy this file's contents into product docs, the website, decks, or any
> customer-facing material.** Naming policy is [ADR 0006](../decisions/0006-engine-naming-and-attribution.md).
> This file exists because we cannot honour a copyright notice we refuse to write
> down, and because engineering needs to know what it is pinning.

## Identity

| Field | Value |
|---|---|
| Project | `codebase-memory-mcp` |
| Author / copyright holder | DeusData |
| Repository | `https://github.com/DeusData/codebase-memory-mcp` |
| Licence | MIT |
| Copyright line | `Copyright (c) 2025 DeusData` |
| Pinned commit | **[VERIFY-AT-FORK]** — record the SHA here in Phase 0 |
| Artifact SHA-256 | **[VERIFY-AT-FORK]** — record per platform in Phase 0 |

## What MIT actually requires of us

One thing:

> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.

We redistribute the engine binary, so we ship its copyright line and the full MIT
text alongside it. That is the whole obligation.

MIT has **no advertising clause**. It does not require us to name the project in our
documentation, marketing, product name, or UI, and it does not restrict us from
selling the result. We may charge for Shimmr without naming the engine.

We must not remove or alter the notice, and we must not claim the engine's copyright
as ours.

## What ships, concretely

Every release installs, next to the binary:

```
<install-root>/
  LICENSES/
    engine-MIT.txt      # full MIT text + "Copyright (c) 2025 DeusData"
    shimmr.txt          # our own licence
```

And `shimmr licenses` prints them. Both are release-blocking for v1 — not a follow-up
task. A release that ships the binary without the notice is a licence violation, and
it is the one compliance failure here that is genuinely easy to avoid.

## Where the name may and may not appear

| Surface | Name allowed? |
|---|---|
| `LICENSES/engine-MIT.txt`, `shimmr licenses` | **Required** |
| This file, and `00-prd.md` (historical record) | Yes — internal only |
| Specs, architecture, tiers, roadmap, README, product overview | **No** — say "the engine" |
| Website, decks, sales conversations, support replies | **No** |
| Answering a customer who asks directly what it's built on | Yes — answer honestly, point at `shimmr licenses` |

The last row matters. We do not advertise the engine; we also do not deny it. See
ADR 0006's consequences.

## Leaked identifiers to clean up

The engine's own name reaches the customer through paths and configuration even when
no document mentions it — its cache directory under `~/.cache/`, its `CBM_*`
environment variables, its `.cbmignore` files. Tracked as **Q9** in
`../04-open-questions.md`.
