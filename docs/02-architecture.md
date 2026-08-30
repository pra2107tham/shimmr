# Architecture — the Shimmr harness

**Status:** design intent for v1. Confirmed buildable as drawn (upstream speaks
stdio JSON-RPC). Unresolved items are marked and tracked in `04-open-questions.md`.

---

## 1. The shape

Upstream is launched by every agent the same way — a `mcpServers` entry with a
`command` and `args`, speaking JSON-RPC over stdio. That makes the harness a
**stdio middleman**: the agent spawns `shimmr` instead of `codebase-memory-mcp`,
and `shimmr` spawns the engine as a child.

```
  agent (Claude Code / Cursor / Windsurf)
    │
    │  stdin/stdout — MCP JSON-RPC
    ▼
  shimmr harness  ─── reads ──▶  license file (~/.shimmr/license.json)
    │                └── writes ─▶  call log  (~/.shimmr/usage.db, SQLite)
    │
    │  stdin/stdout — MCP JSON-RPC (allowed calls only)
    ▼
  codebase-memory-mcp   (upstream binary, unmodified)
    │
    ▼
  ~/.cache/... — SQLite graph + bundled vector index   [never leaves the machine]
```

The harness is a **pipe with a policy in the middle**. It does not parse code,
does not touch the graph, and does not understand any tool's semantics. That is
what keeps it days-of-work sized (PRD §13) and what keeps it correct as upstream
evolves.

## 2. What the harness does to each message

Only two JSON-RPC methods need real handling. Everything else is forwarded byte-
for-byte.

| Method | Behaviour |
|---|---|
| `tools/list` | Forward, then **filter the response** to the licensed allow-list before returning it |
| `tools/call` | Check the tool name against the allow-list → forward, or return a branded refusal |
| everything else | Transparent passthrough (`initialize`, `ping`, notifications, …) |

### Why `tools/list` filtering matters more than call blocking

If the harness only blocks `tools/call`, the agent still *sees* every locked tool,
still spends context on their schemas, and will still try them — so the user's
experience of the free tier is an agent that repeatedly walks into walls. Filtering
`tools/list` means a Starter user's agent behaves like a coherent smaller product
rather than a broken larger one.

Call blocking remains necessary anyway: an agent may have cached a tool list, and
a client may call a tool it was never offered.

### The refusal

A blocked call returns a **successful JSON-RPC result whose content is the upgrade
message**, not a JSON-RPC error. Errors get surfaced to users as breakage and get
retried; a normal result that says "this tool needs the Team tier — see
<link>" is something the agent reads and reports. **[OPEN — Q4]** confirm this
renders well in Claude Code and Cursor specifically.

## 3. Hard constraints from upstream

These are not stylistic preferences. Violating any one of them breaks the product.

1. **Stdout is reserved for MCP JSON-RPC.** Every log line, banner, and debug
   message the harness emits goes to **stderr**. A single stray `print` to stdout
   corrupts the protocol stream and the agent drops the server.
2. **Do not rebuild the engine binary.** Upstream runs a per-account coordination
   daemon and rejects processes whose version/build/ABI/cache-root disagree. A
   rebranded rebuild is a different build and will collide with any upstream CBM on
   the same machine. See `decisions/0001`.
3. **The engine acts on its own.** `auto_index` on session start and a background
   git watcher are on by default, and the daemon outlives individual sessions. The
   harness sees *agent-initiated calls only* — the usage log is a log of agent
   traffic, not of everything the engine does. Say it that way in the dashboard.
4. **The engine serves a localhost HTTP UI** on `:9749` from inside the binary.
   Decide deliberately whether Shimmr exposes, rebrands, or disables it — it
   overlaps with the PRD §10 dashboard. **[OPEN — Q5]**
5. **Upstream owns `install` / `update` / `uninstall`**, which rewrite agent config
   files and PATH. Shimmr's installer must own that surface instead, or a customer
   self-updating will replace the gated setup with an ungated one.

## 4. Process lifecycle

- Agent spawns harness → harness reads license → harness spawns engine child.
- Harness proxies until stdin closes, then terminates the child and flushes the log.
- Child exit or crash is propagated to the agent honestly; the harness never
  fabricates a healthy response for a dead engine.
- License file missing or unreadable → **fall back to Starter**, log a warning to
  stderr, keep serving. The product must never become unusable because a file is
  absent; a paid customer with a corrupted license should degrade to free, not to
  broken.

## 5. State on disk

| Path | Owner | Contents |
|---|---|---|
| `~/.shimmr/license.json` | installer / account layer | org id, tier, seats, expiry, signature |
| `~/.shimmr/usage.db` | harness | per-call rows: timestamp, tool, allowed/blocked, project, duration |
| `~/.cache/codebase-memory-mcp/` | **upstream engine** | graph SQLite, vector index, daemon logs |

The harness owns `~/.shimmr/` and treats the engine's cache as opaque. Nothing in
`usage.db` contains code, file paths, query text, or repo names — only tool names
and counts. That constraint is what makes the §10 opt-in telemetry defensible
later, so it is enforced from the first commit rather than retrofitted.

## 6. Language choice — deferred, with a lean

**[OPEN — Q3]** Not decided. The lean is **Go**: single static binary matching the
engine's own distribution story, trivial cross-compilation for the three platforms
upstream supports, and no runtime for the customer to install — which matters for a
tool whose pitch is "it just runs locally." Node/TypeScript is the faster path to a
first prototype and has the best-tested MCP SDK; the cost is shipping a runtime
dependency or a bundler step.

Either satisfies v1. Decide before SPEC-001 implementation starts, not during.

## 7. What is explicitly *not* in the harness

Recorded so scope stays honest to PRD §13's "buildable by one person in days":

- No parsing, indexing, or graph logic — ever. That is upstream's job.
- No network calls in v1 at all. The §9 heartbeat is deliberately deferred to the
  license-file spec; v1 reads a local file and makes zero connections.
- No dashboard UI. v1 writes the log that the dashboard will later read.
- No account layer, signup, or seat management.
