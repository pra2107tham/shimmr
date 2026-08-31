# 0004 — Local is free; crossing the machine boundary is paid

**Status:** Accepted
**Date:** 2026-08-31
**Supersedes:** the tier table in `00-prd.md` §8 (recorded as amendment A6)
**Resolves:** Q1, Q2 in `04-open-questions.md`

## Context

Q1 asked whether the paywall should withhold upstream tools. `01-engine-findings.md`
§3.1 established that it cannot meaningfully do so: the engine is MIT, publicly
downloadable, and installs in about two minutes with an installer that auto-configures
~45 agent clients. A wall in front of `get_architecture` stops only users who never
search the tool name, and teaches the ones who do that Shimmr's value is artificial
scarcity — on a product sold on trust.

## Decision

**Everything that runs entirely on the customer's machine is free, permanently and
without an account.** That includes the full code graph, all engine tools, semantic
search, the local dashboard, the usage log, and one-command setup.

**Everything that connects the machine to an outside system is paid.** GitHub issues
and PRs as agent context, OpenHands and other agent runtimes, scheduled and triggered
automations, and team/org sync with seats.

The harness is still built first, exactly as specified in SPEC-001, with its gate
open. It is the seam every paid feature attaches to; building it now keeps this
decision reversible at near-zero cost.

## Consequences

**Easy:** the free tier becomes the best local code-graph setup a small team can get,
which is the adoption hook PRD §3 actually needs. No customer ever hits a wall for
something they could have downloaded free, so the trust pitch survives contact with a
curious CTO. The privacy boundary and the price list become the same line, which is
unusually easy to explain and to hold ourselves to.

**Hard:** there is no revenue until Phase 5 ships. The roadmap's "plumbing first"
ordering is now a financing question, not just a sequencing one.

**Accepted:** that v1 has no paying customers by construction. In exchange, v1 can be
given away freely to build the install base that Phase 5 monetises.

**Consequence for the specs:** the tier map in `03-tiers-and-gating.md` §2 no longer
gates upstream tools. The allow-list machinery stays in SPEC-001 — it is needed for
the connected features later — but ships permissive.

## Alternatives considered

- **Keep PRD §8's three tiers of withheld tools.** Rejected: unenforceable, and the
  failure mode damages the one thing the product sells.
- **Withhold nothing, ever, and monetise support only.** Rejected: support contracts
  do not scale for a team this size, and the connected features are genuinely more
  valuable than a phone number.
