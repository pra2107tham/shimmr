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
| Licence | MIT — re-confirmed on the pinned commit, not just on `main` |
| Copyright line | `Copyright (c) 2025 DeusData` |
| Pinned release | `v0.10.8`, cut from `46ae198fc11cda80e817acbc5f5908d7c2de7032` (2026-08-18) — **this is what we ship** |
| Commit first read for findings | `5fbab7bb7332bd06aaa880653ddfb2696e648f90` (2026-09-01), 246 commits ahead of the release |
| Artifact SHA-256 | Recorded per platform in `packaging/engine.json` |

## What we bundle, and why those assets

`packaging/engine.json` pins one published upstream asset per platform, with its
SHA-256 as published on the release. Packaging downloads that asset, verifies the
archive against the pin, and lifts the engine binary out of it. A mismatch stops
the release; there is no fallback path that ships an unverified binary.

We bundle the project's **own** published artifacts, never a binary we built. The
engine refuses to run two differing builds for one OS account ([ADR 0007](../decisions/0007-do-not-override-the-cache-root.md)),
so a self-built bundle would fail to start for anyone who already runs the engine
directly.

| Platform | Asset |
|---|---|
| macOS arm64 / amd64 | `codebase-memory-mcp-darwin-<arch>.tar.gz` |
| Linux amd64 / arm64 | `codebase-memory-mcp-linux-<arch>-portable.tar.gz` |
| Windows amd64 | `codebase-memory-mcp-windows-amd64.zip` |

Linux takes the `-portable` asset: upstream's build script documents `STATIC=1` as a
"fully static portable build", and their own installer resolves the portable asset on
Linux. Static is what survives being installed across arbitrary distributions. macOS
and Windows publish no portable variant. The `-ui-` assets are byte-identical
aliases, not separate builds.

Each archive holds four files: the binary, `LICENSE`, an installer we do not use, and
`THIRD_PARTY_NOTICES.md`.

### Bumping the engine

1. Update `version` and every `url` / `sha256` in `packaging/engine.json`.
2. Update the pinned release row above.
3. Re-check the licence on the new tag — `LICENSES/engine-MIT.txt` must still match
   upstream's `LICENSE`. Packaging enforces this and will refuse to build if it
   drifts, but knowing before the release job fails is better.
4. Re-check the tool count against the new binary, not against `main`. The two
   diverge, and §2 of `../01-engine-findings.md` records what it cost to learn
   that: we published 15 as 17 because we read source from a commit we do not
   ship.

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
    engine-MIT.txt          # full MIT text + "Copyright (c) 2025 DeusData"
    engine-third-party.md   # notices for what the engine itself bundles
    shimmr.txt              # our own licence
```

`shimmr licenses` prints the first and third in full — they are compiled into the
binary, so no `cp` can lose them — and names the third-party file, which is generated
at packaging time and can only travel as a file.

`engine-third-party.md` is the engine's own `THIRD_PARTY_NOTICES.md`, taken out of its
release archive. The engine vendors libraries with their own attribution terms; we
redistribute those libraries when we redistribute the binary, so their notices are as
release-blocking as the MIT text itself.

All of this is release-blocking for v1 — not a follow-up task. Packaging refuses to
build an archive that is missing any of it. A release that ships the binary without
the notices is a licence violation, and it is the one compliance failure here that is
genuinely easy to avoid.

## Where the name may and may not appear

| Surface | Name allowed? |
|---|---|
| `LICENSES/`, `shimmr licenses` | **Required** |
| This file, `packaging/engine.json`, `00-prd.md` (historical record) | Yes — internal only |
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
