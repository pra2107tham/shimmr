# Upstream findings — `DeusData/codebase-memory-mcp`

**Status:** verified 2026-08-30 against the public repo README + LICENSE on `main`.
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
| Repo | `https://github.com/DeusData/codebase-memory-mcp` |
| License | **MIT** — confirmed, `Copyright (c) 2025 DeusData` |
| Implementation | **Pure C**, single static binary, no language runtime |
| Transport | **stdio JSON-RPC** — "Stdout is reserved for MCP JSON-RPC", stderr for logs |
| Launch shape | standard `mcpServers: { command, args }` entry |
| Storage | SQLite under `~/.cache/codebase-memory-mcp` (`CBM_CACHE_DIR`) |
| Distribution | `install.sh` \| `install.ps1`, signed releases, SLSA 3, VirusTotal-scanned |

MIT is confirmed on `main`. **We still re-confirm on the exact pinned commit**
(PRD §13 is right to insist on this) and retain the DeusData copyright notice in
everything we redistribute.

## 2. The real tool surface

The PRD says "14 MCP tools" and names 11. The README's tables list **14**, the
README's prose claims **15**, and two further tool names appear elsewhere in the
document. The actual set:

**Indexing** — `index_repository`, `index_status`, `list_projects`, `delete_project`

**Querying** — `search_graph`, `trace_path` (alias `trace_call_path`),
`get_code_snippet`, `get_architecture`, `search_code`, `detect_changes`,
`query_graph` (read-only openCypher subset), `get_graph_schema`, `manage_adr`,
`ingest_traces`

**Named outside the tables** — `semantic_query`, `check_index_coverage`

That is 16 candidate names against a vendor claim of 15, so at least one is an
alias or not a distinct MCP tool. **[VERIFY-AT-FORK]** Do not guess: run the
binary and enumerate `tools/list` over stdio. The allow-list in
`docs/03-tiers-and-gating.md` is exactly as correct as that enumeration.

### Corrections to PRD §8

- PRD omits `delete_project`, `get_graph_schema`, `ingest_traces`,
  `check_index_coverage` entirely.
- PRD lists "semantic search" as an unnamed Team feature. It is a real tool,
  `semantic_query`, and the PRD's §7 "local vector index" is **correct** —
  bundled Nomic `nomic-embed-code` embeddings (768d int8) are compiled into the
  binary. No API key, no Ollama. This is a genuine asset for the local-only pitch.
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
developer already runs upstream CBM — plausible for exactly our early-adopter
audience — one of the two breaks. This is a direct threat to the PRD §12 metric
"under 10 minutes to first index, zero support ticket."

Mitigations, in preference order: wrap the **unmodified upstream binary** (PRD §13
already leans this way, and this finding is a strong second argument for it); set a
distinct `CBM_CACHE_DIR`; detect an existing CBM install during onboarding and say
something honest about it. **[VERIFY-AT-FORK]** — confirm whether a distinct cache
root alone is sufficient to avoid the barrier, or whether the build identity check
is independent of it.

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
- Disclosing that the engine is open and auditable (§11). Upstream publishes SLSA 3
  provenance, signed releases and VirusTotal scans — for a "nothing leaves your
  infra" pitch that supply chain is an asset to point at, not a liability to hide.

## 5. Sources

- <https://github.com/DeusData/codebase-memory-mcp> — README, LICENSE on `main`
- Preprint: *Codebase-Memory: Tree-Sitter-Based Knowledge Graphs for LLM Code
  Exploration via MCP*, arXiv:2603.27277
- Precedent for a public MIT fork: `win4r/codebase-memory-mcp-pro`
