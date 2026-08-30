# SPEC-003 — Usage log → dashboard

**Phase:** 3 · **Status:** Draft
**Depends on:** SPEC-001's log schema
**Implements:** PRD §10, §12

---

## 1. Goal

Turn SPEC-001's `usage.db` into something a customer looks at and a founder can
cite: calls by tool, repos indexed, graph size, estimated tokens saved. Local-only
by default, with a separate opt-in for sharing aggregates.

## 2. Scope

**In:** a local read-only view over `usage.db` plus engine-reported graph stats; the
tokens-saved calculation; the off-by-default sharing toggle.
**Out:** any hosted dashboard; any automatic upload; anything that reads code.

## 3. Surfaces

Two candidates, decide during the phase:
- **`shimmr stats`** — a CLI table. Days of work, no new attack surface, matches
  the audience.
- **A local web view.** Better for the screenshot PRD §12 wants customers to
  share. Note upstream already serves its own UI on `:9749` (Q5) — do not
  accidentally build a worse version of a graph explorer. This dashboard is about
  *usage*, which upstream's UI does not show.

Recommendation: CLI first, web view only once a design partner asks for it.

## 4. Metrics

| Metric | Source | Notes |
|---|---|---|
| Calls by tool | `usage.db` | direct |
| Blocked calls by tool | `usage.db` | doubles as the upgrade-intent signal |
| Repos indexed | engine (`list_projects`) | not from our log — see below |
| Graph size | engine (`list_projects`) | node/edge counts |
| Tokens saved | computed | see §5 |

**Honesty note carried from `02-architecture.md` §3:** the harness only sees
agent-initiated calls. Upstream's background watcher, auto-index, and shared daemon
do work we never observe. The dashboard must be labelled as *agent tool calls*, not
implied to be total engine activity.

## 5. Tokens saved — must be defensible

This number ends up in a sales deck (PRD §12), so the method is published with it:

```
tokens_saved ≈ (baseline_tokens − actual_tokens_returned)
```

with `baseline_tokens` = an estimate of what naive file-reading exploration would
have consumed for the same question, and the estimation method **stated on the
dashboard itself**. Upstream's preprint (arXiv:2603.27277) reports ~10× fewer
tokens across 31 repos and is a citable external anchor.

Do not ship a number we cannot show the working for. A customer who asks "how did
you calculate that?" and gets a shrug has learned something about the whole product.

## 6. The sharing toggle

- **Off by default. Always.**
- Explicit, visible opt-in — never bundled into an install prompt or a ToS accept.
- Payload is aggregate counts only: tool names and call counts. Never code, file
  names, paths, repo names, or query text.
- The exact payload is **printed for the user to inspect before the first send**,
  and `shimmr stats --shared-payload` shows it any time.
- Revocable, and revocation stops sending immediately.

PRD §13's heartbeat-honesty risk applies here doubly. If this payload ever grows
past aggregate counts, the trust pitch is gone and does not come back.

## 7. Acceptance criteria (draft)

1. `shimmr stats` renders calls by tool from a seeded `usage.db`.
2. Blocked calls appear separately from allowed ones.
3. Repo and graph figures come from the engine, and the view degrades gracefully
   when the engine is unreachable.
4. The tokens-saved method is visible in the output, not just the number.
5. With sharing off (default), a network monitor shows **zero** egress.
6. With sharing on, the payload sent matches `--shared-payload` byte-for-byte, and
   contains no path, repo name, or query text.

## 8. Open items

- `[DECIDE]` Q8 — the exact baseline formula.
- `[DECIDE]` Per-repo counters (deferred from SPEC-001 §4) need a non-identifying
  representation before they exist at all.
- `[OPEN]` CLI vs. web view.
