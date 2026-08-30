# Shimmr

A local-first context layer for AI coding agents. Gives Claude Code, Cursor,
Windsurf and Copilot structural and semantic understanding of a codebase over MCP —
with no code, file content, or query text ever leaving the machine.

Built on [`DeusData/codebase-memory-mcp`](https://github.com/DeusData/codebase-memory-mcp)
(MIT), wrapped in a licensing harness, an account layer, and a usage dashboard.

> **Status: pre-implementation.** This repo currently contains specs and decisions
> only. No harness code exists yet. Start with `docs/04-open-questions.md` — three
> decisions are blocking.

## Read in this order

| Doc | What it is |
|---|---|
| [`docs/00-prd.md`](docs/00-prd.md) | The PRD as authored. Canonical intent, with an amendment log |
| [`docs/01-upstream-findings.md`](docs/01-upstream-findings.md) | **Verified** facts about the upstream engine, and where the PRD was wrong |
| [`docs/02-architecture.md`](docs/02-architecture.md) | How the harness works, and the constraints upstream imposes |
| [`docs/03-tiers-and-gating.md`](docs/03-tiers-and-gating.md) | Tool→tier map, built on the real tool list |
| [`docs/04-open-questions.md`](docs/04-open-questions.md) | **Decisions needed.** Q1–Q3 block implementation |
| [`docs/roadmap.md`](docs/roadmap.md) | Phases 0–6 with dependencies |
| [`docs/specs/`](docs/specs/) | SPEC-001 (ready to build), 002, 003 |
| [`docs/decisions/`](docs/decisions/) | ADRs |

## The three things worth knowing before reading anything else

1. **The tool gate is not enforceable.** The engine is MIT and installs in about
   two minutes, so a locked tool stops only users who don't think to look. The paid
   tier has to rest on what we add, not on what we withhold.
   ([findings §3.1](docs/01-upstream-findings.md), [Q1](docs/04-open-questions.md))

2. **Don't rebuild the engine binary.** Upstream runs a per-account daemon that
   rejects mismatched builds, so a rebranded rebuild collides with any existing
   install. Wrap the unmodified artifact.
   ([ADR 0001](docs/decisions/0001-wrap-unmodified-upstream-binary.md))

3. **"Nothing leaves your machine" needs a test, not an assertion.** The harness can
   be built with zero egress, but the engine has a self-update path, a localhost UI,
   and a background watcher. Trust is the whole pitch, so the claim gets a
   reproducible egress test. ([SPEC-001 §6.8](docs/specs/SPEC-001-harness-mvp.md))

## Licensing

The upstream engine is MIT, © 2025 DeusData. Its licence and copyright notice are
retained in everything redistributed. Per PRD §11, that the core engine is open and
auditable is disclosed plainly — for a "nothing leaves your infra" pitch it is a
selling point.
