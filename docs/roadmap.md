# Roadmap

Restates PRD §4–6 as sequenced work with dependencies. The PRD is the intent; this
is the order.

---

## Phase 0 — Verify (hours, before any code)

Cheap checks that would each invalidate real work if skipped.

- [ ] Pin an upstream commit; re-confirm LICENSE **on that commit**; record the SHA.
- [ ] Run the binary, enumerate `tools/list`, write down the **exact** tool names
      and count. Resolves the 15-vs-16 discrepancy in `01-upstream-findings.md` §2.
- [ ] Install upstream alongside a second copy and find out what the daemon
      admission barrier actually does (Q7).
- [ ] Decide Q1, Q2, Q3.

## Phase 1 — The harness (PRD §4) — `specs/SPEC-001`

The one thing that must exist. Buildable in days by one person.

- stdio proxy, transparent passthrough, `tools/list` filtering, `tools/call` gating
- branded upgrade message
- local SQLite call log
- egress test proving the local-only claim

**Done when:** SPEC-001's acceptance criteria pass against both Claude Code and
Cursor.

## Phase 2 — Licence + install (PRD §5) — `specs/SPEC-002`

- signed JSON licence file, verification at startup
- manual issuance path (a script and a keypair, not a product)
- Shimmr installer that owns agent config, replacing upstream's `install`
- **depends on:** Phase 1

## Phase 3 — Dashboard (PRD §5, §10) — `specs/SPEC-003`

- read the Phase 1 log, render calls by tool, repos indexed, graph size, tokens
  saved (Q8's formula)
- off-by-default anonymized sharing toggle
- **depends on:** Phase 1 log schema

## Phase 4 — Account layer (PRD §5)

- self-serve signup, org/seat management, licence issuance and status
- the 24h heartbeat (PRD §9) — first time the product makes a network call at all
- **depends on:** Phase 2 licence format

## Phase 5 — First non-code source (PRD §5)

- GitHub issues + PRs as an additional MCP source alongside the graph
- the first thing that is *Shimmr's own product*, not a wrapper
- **strategically the most important phase** if Q1 lands on (b)/(c), because it is
  the first defensible paid feature

## Phase 6 — Design partners (PRD §5)

- 3–5 startups on Team
- measure PRD §12: time-to-first-index, conversion, opt-in rate, referenceability

## Later (PRD §6)

Notion/Confluence/Slack sources · cross-repo Enterprise tier · case studies from
opted-in numbers · revisit open-core only if adoption data demands it.

---

## The honest critical path

Phases 1–4 are packaging. **Phase 5 is the first phase that builds something
nobody else has.** If runway is short, the question worth asking early is whether
to pull Phase 5 forward — a local-only bridge between an agent, a code graph, and
a team's GitHub history is a product; a licence gate in front of an MIT binary is
a wrapper. Q1 is where that gets decided.
