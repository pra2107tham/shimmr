# Shimmr

A local-first context layer for AI coding agents. Gives Claude Code, Cursor,
Windsurf and Copilot structural and semantic understanding of a codebase over MCP —
with no code, file content, or query text ever leaving the machine.

A local indexing engine, a licensing harness, an account layer, and a usage
dashboard — packaged as one product that installs in a single command.

> **Status: v0.2.0 is released, and the backend is live.** `shimmr signup` →
> `shimmr init` → your agent talks to the engine through us, every call is
> metered, and usage reports live rather than only on `sync` ([ADR
> 0008](docs/decisions/0008-report-usage-as-it-happens.md)). A website now
> exists too — sign up, sign in with a magic link or Google/GitHub, and watch
> your own usage stream in as real charts over Realtime at `site/` ([ADR
> 0011](docs/decisions/0011-web-auth-and-dashboard.md)). A signed-in member of
> an org also sees that org's aggregate — never a per-member breakdown ([ADR
> 0013](docs/decisions/0013-org-dashboard-is-aggregate-only.md)).
> `shimmr signup`/`shimmr login`, run with no flags, open a browser to that
> same verified sign-in rather than trusting a stated `--email`
> ([ADR 0012](docs/decisions/0012-browser-based-cli-sign-in.md)). The site also
> has three pages worth a look beyond the dashboard: `/how-it-works`, `/use-it`,
> and `/security`.
> See [ADR 0004](docs/decisions/0004-local-free-connected-paid.md) and [ADR
> 0005](docs/decisions/0005-harness-in-go.md) for the product decisions
> behind the harness itself.

**The model in one line:** everything that runs on your machine is free, permanently.
Connecting it to the outside world — GitHub, OpenHands, automations, team sync — is
what you pay for. ([why](docs/decisions/0004-local-free-connected-paid.md))

See [`docs/product-overview.html`](docs/product-overview.html) for the visual version.


## Installing

```sh
curl -fsSL https://fpxntzwkiepnwsazmaxf.supabase.co/storage/v1/object/public/releases/install.sh | sh
shimmr signup
shimmr init
shimmr doctor
```

`shimmr signup` with no flags opens a browser to a verified sign-in — no
password, just a magic-link email. Scripted or headless instead:
`shimmr signup --email you@company.com --org "Your Co"` skips the browser
(and the verification).

This repository is private, so a `raw.githubusercontent.com` link 404s for
anyone who isn't a collaborator — the URL above is object storage, and it's
the one to actually share. See [ADR 0009](docs/decisions/0009-serve-releases-from-object-storage.md).

On Windows:

```powershell
irm https://fpxntzwkiepnwsazmaxf.supabase.co/storage/v1/object/public/releases/install.ps1 | iex
```

One archive, checksum-verified, containing the binary, the engine and the
licence notices. About 41 MB to download. See
[`packaging/README.md`](packaging/README.md) for how releases are cut and what
is not done yet.

## Running it

```bash
make build            # one static binary at bin/shimmr, no dependencies
                      # add ENDPOINT=https://<ref>.supabase.co/functions to
                      # point a release at the backend; empty = fully offline
make check            # gofmt, go vet, go test
make smoke            # end-to-end: gate, proxy, metering, privacy
make package-all      # release archives for all five platforms
make licenses         # everything we ship licences for
```

Then, as a user would:

```bash
shimmr signup --email you@company.com --org "Your Co" --team Platform
shimmr init --dry-run     # see exactly which agent config files would change
shimmr init               # apply, after confirming
shimmr doctor             # check the whole setup actually works here
shimmr stats              # what your agents used, and how much code we covered
shimmr sync --show        # print the exact payload that would ever be sent
```

`shimmr serve` is what the agent runs, not you. It refuses to start without an
account — that gate is the point of v1.

The engine binary is found via `engine_path` in `~/.shimmr/config.json`, the
`SHIMMR_ENGINE_PATH` environment variable, or next to the `shimmr` binary.

### What v0.1.0 does

| | |
|---|---|
| **Account gate** | No signup, no proxying. Email, org and team are captured before anything runs. |
| **Transparent proxy** | Newline-delimited JSON-RPC relayed both ways; unknown messages pass through untouched. |
| **Tool metering** | Every `tools/call` recorded with tool name, outcome and duration. |
| **Coverage** | Every index measured: files, lines and bytes, deduplicated per repository. |
| **Consent** | `shimmr init` names every file it wants to change, backs it up, and preserves every key it did not write. |
| **Privacy** | The log has no field that can hold code, a path, a repo name, a symbol or a tool argument. Repos appear only as a per-machine salted hash. Enforced by a test. |

Usage stays on the machine unless an `endpoint` is configured, and
`shimmr sync --show` prints the payload in full before anything is sent.

The backend is driven from this repo too — `make db-reset`, `make db-test`,
`make db-query`, `make deploy`. See [`supabase/README.md`](supabase/README.md).

The website — marketing page, sign up/sign in, and the usage dashboard — is
`site/`, a Next.js app deployed separately on Vercel. See
[`site/README.md`](site/README.md).

CI runs all of it on every push and pull request — unit tests with `-race` on
Linux, macOS and Windows, a cross-compile of all five targets with a check that
the binary is genuinely static, and the end-to-end smoke test.

## Read in this order

| Doc | What it is |
|---|---|
| [`docs/00-prd.md`](docs/00-prd.md) | The PRD as authored. Canonical intent, with an amendment log. **Internal only** |
| [`docs/01-engine-findings.md`](docs/01-engine-findings.md) | **Verified** facts about the engine, and where the PRD was wrong |
| [`docs/02-architecture.md`](docs/02-architecture.md) | How the harness works, and the constraints upstream imposes |
| [`docs/03-tiers-and-gating.md`](docs/03-tiers-and-gating.md) | Tool→tier map, built on the real tool list |
| [`docs/04-open-questions.md`](docs/04-open-questions.md) | Q1–Q3 answered; Q4–Q8 still open |
| [`docs/roadmap.md`](docs/roadmap.md) | Phases 0–6 with dependencies |
| [`docs/specs/`](docs/specs/) | SPEC-001 (ready to build), 002, 003 |
| [`docs/decisions/`](docs/decisions/) | ADRs — 0004 and 0005 carry the product decisions |
| [`docs/internal/prode-and-openhands.md`](docs/internal/prode-and-openhands.md) | Competitor research (ProdE) and a draft of what we would build on OpenHands. Notes, not decisions. **Internal only** |
| [`docs/product-overview.html`](docs/product-overview.html) | Visual overview: what it is, what's in it, the free/paid boundary |
| [`docs/user-journey.html`](docs/user-journey.html) | Nine moments from landing page to paid — what we offer at each, and where we lose people |
| [`supabase/README.md`](supabase/README.md) | The backend: schema, deploy steps, and what it does about security |

## The three things worth knowing before reading anything else

1. **The tool gate is not enforceable, so we don't use one.** The engine is MIT and
   installs in about two minutes; a locked tool stops only users who don't think to
   look. Hence ADR 0004 — local free, connected paid.
   ([findings §3.1](docs/01-engine-findings.md), [ADR 0004](docs/decisions/0004-local-free-connected-paid.md))

2. **Don't rebuild the engine binary.** The engine runs a per-account daemon that
   rejects mismatched builds, so a rebranded rebuild collides with any existing
   install. Wrap the unmodified artifact.
   ([ADR 0001](docs/decisions/0001-wrap-unmodified-upstream-binary.md))

3. **"Nothing leaves your machine" needs a test, not an assertion.** The harness can
   be built with zero egress, but the engine has a self-update path, a localhost UI,
   and a background watcher. Trust is the whole pitch, so the claim gets a
   reproducible egress test. ([SPEC-001 §6.8](docs/specs/SPEC-001-harness-mvp.md))

## Licensing

Shimmr embeds a third-party MIT-licensed indexing engine. Its licence text and
copyright notice ship with every release and are printed by `shimmr licenses` — that
is the licence's only requirement of us, and it is release-blocking.

MIT carries no advertising clause, so product and specification documents refer to
"the engine" rather than naming the project. See
[ADR 0006](docs/decisions/0006-engine-naming-and-attribution.md) for the policy and
`docs/internal/ATTRIBUTION.md` (internal) for identity and compliance detail.

The posture is that we don't advertise the engine — not that we deny it. A customer
who asks what Shimmr is built on gets an honest answer.
