# Shimmr — Product Requirements Document

**Status:** canonical statement of intent, as authored 2026-08-30.
**Amendments:** this document is preserved as written. Where later verification
contradicts it, the correction lives in `01-upstream-findings.md` and the specs —
it is *not* silently edited here. Amendment log at the bottom.

Local-first context layer for AI coding agents, sold to early-stage startups.

---

## 1. What it is

Shimmr is a rebranded, license-gated product built on a forked open-source engine
(`codebase-memory-mcp`, MIT licensed — tree-sitter parsing, a local graph +
semantic index, 14 MCP tools). It gives AI coding agents (Claude Code, Cursor,
Windsurf, Copilot) structural and semantic understanding of a codebase over MCP,
with a tier-aware license harness in front of it and a branded setup, dashboard,
and account layer around it. No code, file content, or query text ever leaves the
customer's machine, under any tier.

We are not competing on indexing technology — that's already solved, by this engine
and several close competitors. We're competing on trust, setup, and the product
experience wrapped around it.

## 2. Vision

Shimmr's endpoint is broader than code: **a context bridge between everything an AI
agent can't natively see** — the codebase (via the graph and MCP), documentation,
communication channels, GitHub issues and PRs — unified into one layer any agent
can query, while staying entirely under the customer's own control. Fragmented
context (code in one place, decisions in Slack, specs in Notion, history in closed
PRs) is why agents keep guessing. Shimmr's job is to close that gap without asking
a startup to send any of it to a third party.

v1 deliberately covers only the codebase slice of that vision — see §5 vs. §6 for
exactly where the line sits today.

## 3. Target customer

Early-stage startup engineering teams (roughly 5–50 engineers), no dedicated
platform/DevOps hire, already using an AI coding agent daily, and explicitly
sensitive about where their code goes.

---

## 4. What we're building now

- Fork `codebase-memory-mcp` at a pinned commit; confirm the LICENSE file on that
  exact commit.
- The **Shimmr harness**: a thin local process sitting between the agent and the
  forked binary. Reads a local license file (org, tier, tool allow-list), forwards
  or blocks each MCP tool call accordingly, returns a branded "upgrade to unlock"
  message instead of a raw error, and logs every call to a local SQLite file.
- Minimal rebrand of what's trivially swappable today — README, CLI banner,
  install-script domain — without touching the C source itself.

**Acceptance criteria**: point Claude Code or Cursor at the harness, call an
allowed tool successfully, call a disallowed tool and get the branded upgrade
message, and see both logged locally.

## 5. What we're building next

- Turn the local call log into the real usage dashboard (local-only: calls by tool,
  repos indexed, graph size, estimated tokens saved).
- The signed-JSON license file format, plus a first (manual, not yet self-serve)
  way to issue one.
- The real installer, hosted on Shimmr's own domain.
- Self-serve signup and org/seat management — the account layer that makes this
  feel like a product, not a cloned repo.
- The opt-in, off-by-default anonymized-telemetry toggle (aggregate counts only —
  never code, file names, or query text) — the only legitimate source of
  cross-customer proof numbers for sales.
- **First step toward the wider vision**: pull GitHub issue and PR context in as an
  additional MCP source alongside the code graph — the most tractable non-code
  piece, since it's one well-documented API rather than N different chat/doc
  platforms.
- First 3–5 design-partner startups on the Team tier.

## 6. Future scope

- The full context-bridge vision: documentation systems (Notion, Confluence) and
  communication channels (Slack, Discord) as additional queryable sources, unified
  behind the same local-only guarantee.
- Cross-repo / Enterprise tier: unlimited seats, team-shared sync across a whole
  engineering org.
- Case studies built from opted-in customers' real dashboard numbers.
- Revisit the hybrid or open-core alternatives (from the earlier comparison) only
  if adoption data shows the strict-local pitch is capping deal size — not a
  default assumption, a fallback if the data says so.

---

## 7. Architecture

```
   AI coding agent (Claude Code, Cursor, ...)
              │  MCP tool call
              ▼
   ┌──────────────────────────────┐
   │       Shimmr harness         │   ← ours: license check, tool
   │  (thin local proxy process)  │     allow-list per tier, call
   └───────────────┬──────────────┘     metering, branded errors
                   │ forwards allowed calls only
                   ▼
   ┌──────────────────────────────┐
   │ codebase-memory-mcp binary   │   ← upstream, unmodified,
   │ (forked, MIT license)        │     MIT notice retained
   └──────────────────────────────┘
                   │
                   ▼
         local SQLite graph + local vector index
         (never leaves the machine)
```

The harness is the entire product. The engine underneath is not ours, and we say
so — see §11 on disclosure.

## 8. Feature tiers

| Tier | Tools unlocked | Who it's for |
|---|---|---|
| **Starter** (free) | `search_graph`, `trace_path`, `get_code_snippet`, `index_repository`, `list_projects`, `index_status` | Trial, individual devs, adoption hook |
| **Team** (paid) | + `get_architecture`, `search_code`, `detect_changes`, `manage_adr`, semantic search | Teams who've felt the value and want depth |
| **Enterprise** (custom) | + cross-repo intelligence, `query_graph` (Cypher), team-shared sync, unlimited seats, GitHub/PR context | Startups scaling past one repo/one team |

## 9. Licensing & access control (the harness)

- A signed JSON **license file** (org id, tier, seat count, expiry) is issued at
  signup and dropped locally by the installer.
- The harness reads it at startup, builds the tool allow-list for that tier, and
  rejects disallowed calls with a branded upgrade message.
- Every allowed call increments a local counter (per tool, per repo) — the data
  source for §10.
- A **heartbeat**, once every 24h, sends only `{org_id, tier,
  license_valid_check}` to confirm the license hasn't been revoked. No code, paths,
  query text, or repo names — ever. This is the only network call the harness makes
  on its own.

## 10. Usage dashboard & proof metrics

- Fully local dashboard showing calls by tool, repos indexed, graph size, estimated
  tokens saved.
- Separate, off-by-default toggle: "share anonymized usage counts with Shimmr."
  Same aggregate shape, never code or query content. The only source of
  cross-customer numbers for sales decks, and only with visible, explicit opt-in.

## 11. Branding & distribution

- Own installer, own domain, own signed binary — customers never touch the upstream
  install script.
- Org/seat management (signup, invite teammates, license status) is the account
  layer the upstream tool doesn't have.
- **Disclosure**: say plainly that the core engine is built on an open, auditable
  project. For a "nothing leaves your infra" pitch, "you can read every line" is a
  selling point, not something to hide.

## 12. Success metrics

- Time from download to first successful index (target: under 10 minutes, zero
  support ticket).
- Starter → Team conversion rate.
- Opt-in rate on the anonymized-sharing toggle.
- Number of customers willing to be named as a reference or share a dashboard
  screenshot.

## 13. Risks & open questions

- **License terms**: MIT confirmed for `codebase-memory-mcp` — verify the LICENSE
  file on the exact commit you fork; keep the copyright notice in redistributed
  copies.
- **Solo/small-team bandwidth**: the harness is scoped to be buildable by one
  person in days — anything bigger belongs in a later phase.
- **Binary vs. source fork**: wrapping the existing signed binary is far faster
  than recompiling the C source with custom branding. Revisit only if you need to
  change engine behaviour, not just gate access.
- **Heartbeat honesty**: the 24h license check must never silently grow past
  `{org_id, tier, valid}` — that scope creep is exactly the trust break the pitch
  depends on avoiding.

## 14. Naming — decision record

Name: **Shimmr**. Chosen for easy pronunciation over thematic fit, per current
direction — an evocative, invented-feeling word (in the spirit of Wispr Flow,
Granola) rather than a literal compound like the earlier "Quietgraph" draft.

Known collisions, worth weighing before you buy anything:

- `shimmr.ai` is already live — an AI-powered book-advertising startup. Different
  vertical, but the same "AI startup" framing raises real confusion risk, and it
  takes the exact TLD (`.ai`) a dev tool would naturally want.
- `shimmr.app` is already live — an unrelated meditation/sound app.
- The full spelling, **Shimmer**, is separately the name of a live blockchain
  network (IOTA Foundation's staging network, `shimmer.network`) — lower confusion
  risk since it's a different industry and different spelling, but shared search
  results either way.

Net: `.ai` and `.app` are gone for this exact spelling. Worth checking `.dev` /
`.io` / a short suffix (`shimmr.dev`, `getshimmr.com`) before committing — this is
a search-based read, not a verified WHOIS check.

*Domain selection is explicitly deferred — not a v1 blocker.*

---

## Amendment log

| # | PRD section | Amendment | Where |
|---|---|---|---|
| A1 | §1, §8 | "14 MCP tools" and the named tool list are incomplete; real surface is ~15–16 and includes `delete_project`, `get_graph_schema`, `semantic_query`, `check_index_coverage`, `ingest_traces` | `01-upstream-findings.md` §2 |
| A2 | §8 | Tier gating is a packaging convention, not enforcement — upstream is MIT and installable in ~2 min. Paid tier must rest on what we add, not on withheld upstream tools | `01-upstream-findings.md` §3.1, `04-open-questions.md` Q1 |
| A3 | §4, §11 | A rebranded *rebuild* collides with upstream's per-account daemon admission barrier. Strengthens the case for wrapping the unmodified binary | `01-upstream-findings.md` §3.2, `decisions/0001` |
| A4 | §9 | "The only network call the harness makes" is true of the harness but not yet of the shipped product (engine has self-update, localhost UI, background watcher). Needs an egress test before it becomes a public claim | `01-upstream-findings.md` §3.3, `specs/SPEC-001` §6 |
| A5 | §8 | `get_graph_schema` is documented upstream as "run this first" — gating it breaks the free-tier agent workflow | `03-tiers-and-gating.md` |
| A6 | §8, §4 | **Tier table superseded.** Everything local is free permanently; the paywall moves to connected features (GitHub, OpenHands, automations, team sync). The harness still ships first, with its gate open | `decisions/0004` |
| A7 | §5, §6 | GitHub/PR context and agent-runtime bridges (OpenHands) are promoted from "next/future" to **the first paid feature** — the thing Phase 5 exists to ship | `decisions/0004`, `roadmap.md` |
