# Engine findings

**Status:** verified 2026-08-30 against the engine's public repository README and
LICENSE on `main`.

> Per [ADR 0006](decisions/0006-engine-naming-and-attribution.md) this document does
> not name the upstream project. Identity, the copyright line, and our licence
> obligations live in `internal/ATTRIBUTION.md`.
**Why this doc exists:** the PRD makes several claims about the upstream engine from
memory. Some are right, some are wrong, and three of them change what we should
build. This is the ground truth the specs are written against.

> ⚠️ Everything here was read from the public README on `main`, not from a running
> binary. Anything marked **[VERIFY-AT-FORK]** must be re-checked empirically
> against the exact commit we pin before it goes into a spec or a sales claim.

---

## 1. Identity

| Field | Value |
|---|---|
| License | **MIT** — confirmed (copyright line in `internal/ATTRIBUTION.md`) |
| Implementation | **Pure C**, single static binary, no language runtime |
| Transport | **stdio JSON-RPC** — "Stdout is reserved for MCP JSON-RPC", stderr for logs |
| Launch shape | standard `mcpServers: { command, args }` entry |
| Storage | SQLite under a vendor-named cache dir, overridable by env var (see Q9) |
| Distribution | `install.sh` \| `install.ps1`, signed releases, SLSA 3, VirusTotal-scanned |

MIT is confirmed on `main`. **We still re-confirm on the exact pinned commit** (PRD
§13 is right to insist on this) and ship the copyright notice with everything we
redistribute — see `internal/ATTRIBUTION.md` for what that means concretely.

MIT carries no advertising clause, so nothing obliges us to name the project in our
own documentation or marketing. ADR 0006 says we don't.

## 2. The real tool surface

**Verified from source at the pinned commit**, not from README prose: the table
`static const tool_def_t TOOLS[]` in `src/mcp/mcp.c` is the registry that
`tools/list` is built from.

**17 tools:**

| | | |
|---|---|---|
| `index_repository` | `search_graph` | `query_graph` |
| `trace_path` | `get_code_snippet` | `get_file_outline` |
| `get_graph_schema` | `compare_graphs` | `get_architecture` |
| `search_code` | `list_projects` | `delete_project` |
| `index_status` | `check_index_coverage` | `detect_changes` |
| `manage_adr` | `ingest_traces` | |

Every earlier count was wrong, including the vendor's own README, which says 15.

### Three things this corrects

**`semantic_query` is not a tool.** It is a *property of `search_graph`'s input
schema* — an array of keywords that triggers vector cosine search alongside the
BM25 and regex modes. Our tier map listed it as a separately gateable tool; it
cannot be gated, because gating it would mean rewriting `search_graph`'s
arguments. Semantic search is reached through `search_graph`, full stop.

**`get_file_outline` and `compare_graphs` exist** and had never appeared in any
of our documents.

**`trace_call_path` is not a callable alias.** It is the internal C handler name
(`handle_trace_call_path`) behind the `trace_path` tool. Nothing needs to gate
it, and nothing should expect it to appear in `tools/list`.

### The engine already filters its own tools

`tools/list` is rendered by `cbm_mcp_tools_list_page(srv->tool_profile, …)`, and
the profile comes from a process-level flag:

```
--tool-profile=analysis     # allowlisted inspection tools only
--tool-profile=scout        # a further-restricted surface
```

`cbm_mcp_tool_profile_t` is `ALL | ANALYSIS | SCOUT`, and a restricted profile
also refuses the hidden tools at call time, not just in the listing. Unknown
values fail closed.

This matters for us: **the seam our harness occupies already exists inside the
engine.** Under ADR 0004 we do not gate anything, so there is no conflict today.
But if tool restriction is ever wanted, passing a profile flag is cheaper and
more honest than filtering the listing in the proxy — and if we ever do both,
the two must not disagree about what is available.

### The MCP surface is wider than tools

The server implements `initialize`, `ping`, `tools/list`, `tools/call`,
`prompts/list`, `prompts/get`, `resources/list`, `resources/templates/list`,
and `notifications/cancelled`.

Two **prompts** are published — `explore_codebase` and `review_change_impact` —
which are MCP prompts, not tools. Our proxy relays all of these untouched, which
is correct, but note that prompt invocations are not metered: `shimmr stats`
counts tool calls, and a user who works entirely through prompts would appear
less active than they are.

### Confirmed correct in our implementation

`index_repository` declares `"required":["repo_path"]`, which is the first key
`extractRepoPath` looks for. **The coverage measurement works against the real
engine** — this was the guess most likely to have silently recorded nothing.

### Corrections to PRD §8

- PRD omits `delete_project`, `get_graph_schema`, `ingest_traces`,
  `check_index_coverage`, `get_file_outline` and `compare_graphs` entirely.
- PRD lists "semantic search" as an unnamed Team feature. The capability is
  real and the PRD's §7 "local vector index" is **correct** — bundled Nomic
  `nomic-embed-code` embeddings are compiled into the binary, no API key. But it
  is not a separate tool, so it was never separately gateable. See §2.
- `get_graph_schema` is documented as **"Run this first."** Gating it, as the PRD's
  tier split implicitly does, breaks the vendor's own recommended agent workflow
  for every free user. See §3 of the tiers doc.

## 3. Three findings that change the plan

### 3.1 The tool gate is not enforceable — and that is a strategy question, not a bug

The engine is MIT, publicly downloadable, and installs with one `curl | bash` that
**auto-configures Claude Code, Cursor, and ~45 other client surfaces**. A user who
hits our branded "upgrade to unlock" wall can have all 16 tools, free and legally,
in about two minutes.

So tier gating is a **packaging convention for honest customers, not access
control**. It will hold for a startup that wants a vendor relationship and an
invoice. It will not hold for anyone who reads the upgrade message and thinks to
search the tool name.

This does not kill the product. It does mean the paid tier cannot be *withheld
upstream tools*. It has to be things upstream genuinely does not have: the org and
seat account layer, the dashboard, GitHub/PR context, cross-repo sync, a support
relationship, and our own signed supply chain. See `docs/04-open-questions.md` Q1 —
this is the first decision to make and it reshapes §8 of the PRD.

### 3.2 A rebranded build cannot coexist with upstream on the same machine

From the README: all active CBM processes share one per-account coordination
daemon, and **"must run the exact same version, executable build, coordination ABI,
and canonical cache root."** Conflicting processes fail at a crash-safe admission
barrier before doing any work.

A Shimmr-branded rebuild is a *different executable build*. So on a machine where a
developer already runs the engine directly — plausible for exactly our early-adopter
audience — one of the two breaks. This is a direct threat to the PRD §12 metric
"under 10 minutes to first index, zero support ticket."

**Phase 0 tested this and half of it was wrong.** Two instances of the *same*
build, run concurrently: sharing a cache root, both start; with different cache
roots, one fails outright with `reason: "cache_root"`. So a distinct cache root
does not avoid the barrier — it *is* a barrier, on its own, even when the builds
match. See [ADR 0007](decisions/0007-do-not-override-the-cache-root.md); Shimmr
never sets `CBM_CACHE_DIR`.

What remains true: wrap the **unmodified upstream binary** (PRD §13 leans this
way already), and detect an existing engine install during onboarding so a
version mismatch is explained rather than experienced. That detection is now the
whole mitigation, tracked as Q10.

### 3.3 The "only network call" claim in PRD §9 is not yet true

PRD §9 says the 24h heartbeat "is the only network call the harness makes on its
own." That is a claim about *the harness*, and it can be made true by construction.
But the product the customer installs is harness + engine, and the engine has at
least three independent network-adjacent behaviours:

- a self-update path (`update` prints an install-script command to run),
- a built-in HTTP UI on `localhost:9749`, served from the binary,
- a background git watcher and auto-index-on-session-start, both on by default.

The localhost UI and the watcher are local-only and fine, but they mean the product
does things on its own that our call log will not capture. Since **trust is the
entire pitch**, the claim we publish must be about the whole product and must be
backed by an actual egress test, not by reading a README. See SPEC-001 §6.

## 4. What the PRD got right

- MIT license, tree-sitter parsing, local SQLite graph, local vector index.
- stdio is the transport, so the §7 thin-proxy architecture **is buildable as
  drawn** — a stdio middleman is the natural shape here.
- "Wrap the binary rather than recompile the C source" is the right instinct, and
  finding 3.2 strengthens it.
- Disclosing that the engine is open and auditable (§11). The engine publishes SLSA 3
  provenance, signed releases and VirusTotal scans. That supply chain is real and
  useful to us in a security review, though under ADR 0006 we present it as *our*
  verified supply chain rather than by naming its origin.

## 5. Sources

- The engine's public repository — README and LICENSE on `main` (URL in `internal/ATTRIBUTION.md`)
- The engine's benchmark preprint, arXiv:2603.27277 — cited for the ~10× token figure.
  **Note:** citing it publicly names the engine. Use the number only with our own
  measurement behind it (see Q8), or not at all.
- A third-party public MIT fork of the engine exists, establishing precedent for
  redistribution under the licence.
