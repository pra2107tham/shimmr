# Shimmr

A local-first context layer for AI coding agents. Gives Claude Code, Cursor,
Windsurf and Copilot structural and semantic understanding of a codebase over MCP —
with no code, file content, or query text ever leaving the machine.

A local indexing engine, a licensing harness, an account layer, and a usage
dashboard — packaged as one product that installs in a single command.

> **Status: pre-implementation.** Specs and decisions only; no harness code yet.
> The three blocking product decisions are made — see
> [ADR 0004](docs/decisions/0004-local-free-connected-paid.md) and
> [ADR 0005](docs/decisions/0005-harness-in-go.md). Next up is Phase 0 verification,
> then SPEC-001.

**The model in one line:** everything that runs on your machine is free, permanently.
Connecting it to the outside world — GitHub, OpenHands, automations, team sync — is
what you pay for. ([why](docs/decisions/0004-local-free-connected-paid.md))

See [`docs/product-overview.html`](docs/product-overview.html) for the visual version.

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
| [`docs/product-overview.html`](docs/product-overview.html) | Visual overview: what it is, what's in it, the user experience |

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
