# SPEC-001 — Shimmr harness MVP

**Phase:** 1 · **Status:** Ready to build — Q1–Q3 decided (ADR 0004, 0005)
**Depends on:** Phase 0 verification (pinned commit, real tool list, coexistence test)
**Implements:** PRD §4, §7, §9 (partially — no network in v1)

---

## 1. Goal

A single local process that an AI coding agent launches in place of the engine
binary, which forwards MCP traffic to the real engine, enforces a
tier-based tool allow-list, returns a branded upgrade message for anything blocked,
and records every agent-initiated call to a local SQLite file. This is PRD §4 in
full, and it is the seam every later phase attaches to.

## 2. Scope

**In:**
- stdio JSON-RPC proxy, agent ↔ engine
- `tools/list` response filtering
- `tools/call` allow-list enforcement + branded refusal
- local SQLite call log
- tier read from a **plaintext** local config file
- an egress test proving no network traffic

**Explicitly out** (later phases, listed so scope does not drift):
- signature verification on the licence — SPEC-002
- the 24h heartbeat, or **any** network call at all — Phase 4
- dashboard UI — SPEC-003
- installer, signup, seats — Phases 2 and 4
- any change to the engine binary — forbidden by `decisions/0001`

## 3. Behaviour

### 3.1 Startup

1. Read `~/.shimmr/config.json`. If absent or unparseable → tier = `starter`, warn
   on **stderr**, continue.
2. Build the allow-list from the tier map in `../03-tiers-and-gating.md` §2.
3. Locate the engine binary (config path, else `SHIMMR_ENGINE_PATH`, else a
   bundled default). If not found → exit non-zero with a clear stderr message.
4. Spawn the engine as a child, wiring its stdin/stdout to the proxy and letting
   its stderr pass through.
5. Open `~/.shimmr/usage.db`, creating the schema if needed.

### 3.2 Message handling

| Direction | Method | Behaviour |
|---|---|---|
| → engine | `tools/call` | If tool ∈ allow-list: forward, log `allowed=1`. Else: **do not forward**, synthesise the refusal result, log `allowed=0`. |
| ← agent | `tools/list` result | Remove entries not in the allow-list before relaying. |
| both | everything else | Relay unchanged. |

**Tier map** comes from `03-tiers-and-gating.md` §2 and is the single source of
truth. Aliases (`trace_path` / `trace_call_path`) gate as one.

> **Per ADR 0004 the shipped v1 allow-list contains every engine tool.** The gating
> code is still built and still tested (criteria 3 and 5 use a deliberately
> restricted test config), because the connected features in Phase 5 need exactly
> this machinery. What ships to customers is permissive.

**Unknown tool names are allowed and logged.** If upstream adds a tool we have not
classified, a free user gets it rather than hitting a wall for something our docs
never mention. Fail open. Write the unknown name to stderr so we notice.

### 3.3 The refusal

Returned as a **successful JSON-RPC result** whose content is the message — not a
JSON-RPC error. Rationale in `../02-architecture.md` §2. `[VERIFY]` — Q4, check
rendering in Claude Code and Cursor.

```
`{tool}` is available on the Shimmr {required_tier} tier.
Your current licence is {current_tier}.

See https://{domain}/upgrade — your existing indexes and settings carry over.
```

The message must never claim the tool is missing, broken, or unsupported. A
customer who discovers the MIT engine underneath and finds we lied about *why* a
tool was unavailable is a customer lost on exactly the axis we sell on.

### 3.4 Shutdown

Agent closes stdin → terminate the child, flush and close the log, exit 0.
Engine dies unexpectedly → relay the failure honestly and exit non-zero. Never
fabricate a healthy response for a dead engine.

## 4. Data

### `~/.shimmr/config.json` (v1, plaintext — SPEC-002 replaces this)

```json
{
  "org_id": "local-dev",
  "tier": "starter",
  "engine_path": "/usr/local/lib/shimmr/shimmr-engine"
}
```

### `~/.shimmr/usage.db`

```sql
CREATE TABLE IF NOT EXISTS calls (
  id          INTEGER PRIMARY KEY,
  ts          INTEGER NOT NULL,   -- unix epoch, UTC
  tool        TEXT    NOT NULL,   -- tool name only
  allowed     INTEGER NOT NULL,   -- 1 forwarded, 0 refused
  tier        TEXT    NOT NULL,   -- tier in effect at call time
  duration_ms INTEGER,            -- NULL when refused
  error       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_calls_ts   ON calls(ts);
CREATE INDEX IF NOT EXISTS idx_calls_tool ON calls(tool);
```

**Privacy invariant — enforced from the first commit, not retrofitted:** no column
holds code, file paths, query text, repo names, or symbol names. Tool arguments are
**never** logged. This is what makes PRD §10's opt-in sharing defensible later; a
schema that collects more "just in case" destroys that option permanently.

> PRD §9 asks for a per-repo counter. Repo identity is a path, and paths are
> identifying. Deferred to SPEC-003, which must find a non-identifying form (a
> salted local hash, or a local-only column excluded from any shared payload)
> before the feature exists at all.

## 5. Failure modes

| Condition | Behaviour |
|---|---|
| No config file | Starter tier, stderr warning, continue |
| Malformed config | Starter tier, stderr warning, continue |
| Unknown tier string | Starter tier, stderr warning, continue |
| Engine binary missing | Exit non-zero, clear message — cannot proceed |
| Engine crashes mid-session | Relay honestly, exit non-zero |
| `usage.db` unwritable | **Continue proxying**, warn on stderr, do not log |
| Unknown tool name | Allow, log, warn on stderr |

The governing principle: **a licensing or telemetry problem must never take away a
working code tool.** Degrade to free, or degrade to unlogged — never to broken.

## 6. Acceptance criteria

Executable, in order. PRD §4's stated criteria are 4–6.

1. **Passthrough** — with an all-tools-allowed config, an agent's full session
   against the harness behaves identically to one against the engine directly.
2. **Protocol hygiene** — with `SHIMMR_LOG_LEVEL=debug`, stdout still contains
   *only* JSON-RPC. Verify by piping stdout to a strict JSON-lines parser.
3. **List filtering** — on a Starter config, `/mcp` in Claude Code shows exactly
   the 8 Starter tools; Team tools are absent, not greyed out.
4. **Allowed call** — `search_graph` on Starter succeeds and returns real results
   from the engine.
5. **Blocked call** — `get_architecture` on Starter returns the branded upgrade
   message naming the tool and the tier; the engine never receives the call
   (confirm from engine stderr or its own logs).
6. **Both logged** — `usage.db` has one row `allowed=1` for #4 and one row
   `allowed=0` for #5, with correct tool names and timestamps.
7. **No arguments logged** — dump every row of `usage.db` after a session that
   indexed a real repo and searched for a distinctive symbol. Neither the repo
   path nor the symbol appears anywhere in the file. `grep` the raw `.db`.
8. **No egress** — run a full session under a network monitor with the engine's
   `:9749` UI disabled. **Zero** outbound connections from the harness. Record the
   method and the result; this is the evidence behind the PRD's central claim, and
   it must exist as a reproducible test rather than an assertion.
9. **Two clients** — criteria 3–6 pass under both Claude Code and Cursor.
10. **Degradation** — delete the config mid-install: harness runs as Starter.
    Make `usage.db` read-only: harness still proxies.
11. **Licence notice ships** — the install tree contains `LICENSES/engine-MIT.txt`
    with the engine's full MIT text and copyright line, and `shimmr licenses` prints
    it. This is the one MIT obligation we carry (ADR 0006) and it is
    release-blocking, not a follow-up.

## 7. Open items

- `[VERIFY]` The exact tool list and count — Phase 0. The allow-list is only as
  correct as this enumeration.
- `[VERIFY]` Q4 — refusal rendering in Claude Code and Cursor.
- `[VERIFY]` Q7 — coexistence with an existing upstream install.
- `[OPEN]` Whether `tools/list` filtering should be advertised to the user at
  startup ("Starter: 8 of 16 tools active") on stderr. Leans yes — it is honest,
  and it makes the upgrade path legible without a wall.

## Changelog

| Date | Change |
|---|---|
| 2026-08-30 | Initial spec |
| 2026-08-31 | Q1–Q3 decided. Shipped allow-list is permissive (ADR 0004); language is Go (ADR 0005). Gating code and its tests are unchanged. |
