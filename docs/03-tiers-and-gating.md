# Tiers & gating

**Status:** proposed revision of PRD §8, built on the verified tool list rather
than the remembered one. Needs a decision on Q1 before it is final.

---

## 1. What gating can and cannot do

Read `01-upstream-findings.md` §3.1 first. In short: the engine is MIT and
installable in about two minutes, so a locked tool is **a packaging convention an
honest customer respects**, not a control that stops anyone. Every choice below is
made with that understood.

The practical consequence: **do not put a tool in a paid tier if a free user
hitting that wall would rationally respond by installing upstream instead.** A wall
that converts is one where the paid thing is something upstream cannot give.

## 2. Proposed allocation

Changes from PRD §8 are marked. `[V]` = **[VERIFY-AT-FORK]**, the tool name must be
confirmed against a real `tools/list` before it ships in an allow-list.

### Starter (free) — 8 surfaces

| Tool | Note |
|---|---|
| `index_repository` | as PRD |
| `index_status` | as PRD |
| `list_projects` | as PRD |
| `delete_project` | **added** — a user must be able to clean up what they indexed |
| `get_graph_schema` | **added** — upstream documents it as "run this first"; gating it breaks the free workflow |
| `search_graph` | as PRD |
| `trace_path` | as PRD (alias `trace_call_path` must be gated identically) |
| `get_code_snippet` | as PRD |

This is a genuinely useful product on its own. That is intentional: the free tier's
job is adoption, and a crippled free tier converts worse than a good one when the
alternative is two minutes of typing.

### Team (paid) — adds 6

| Tool | Note |
|---|---|
| `get_architecture` | as PRD |
| `search_code` | as PRD |
| `semantic_query` | **named** — this is the PRD's unnamed "semantic search" |
| `detect_changes` | as PRD |
| `manage_adr` | as PRD |
| `check_index_coverage` `[V]` | **added** — verification tier, fits "depth" |

### Enterprise (custom) — adds 2, plus everything we build

| Tool | Note |
|---|---|
| `query_graph` | as PRD — Cypher |
| `ingest_traces` `[V]` | **added** — runtime trace ingestion is an ops-maturity feature |
| *cross-repo intelligence* | Shimmr-built |
| *team-shared sync, unlimited seats* | Shimmr-built |
| *GitHub issue/PR context* | Shimmr-built |

## 3. Where the paid value actually sits

The Enterprise rows in italics are the honest ones — nobody can get those by
installing upstream. The same logic should eventually apply to Team. Q1 asks
whether Team should stop withholding upstream tools altogether and instead sell:

- org and seat management, license status, teammate invites
- the usage dashboard and token-savings reporting
- GitHub issue/PR context as a second MCP source
- a support relationship and a signed, attested supply chain

That would make the whole upstream tool surface free in Shimmr and put the paywall
entirely around things we build. It is a real strategic option, not a rhetorical
one, and it should be decided deliberately.

## 4. Gating mechanics

- The allow-list is derived from the license `tier` field at startup, and is a
  **static map from tier → tool names** held in the harness. No dynamic policy, no
  server round-trip.
- Aliases gate together. `trace_path` and `trace_call_path` are one decision.
- **Unknown tool names default to allowed.** When upstream adds a tool we have not
  classified, a Starter user gets it rather than hitting a wall for a tool our docs
  never mentioned. Fail open, and log the unknown name to stderr so we notice.
- `tools/list` is filtered to the allow-list; `tools/call` is checked independently.

## 5. The upgrade message

One message, parameterised by tool and tier. It must:

- name the tool that was blocked and the tier that unlocks it,
- be a normal tool result, not a protocol error (see architecture §2),
- point at a URL,
- **not** pretend the tool is broken, missing, or unsupported.

Draft:

> `get_architecture` is available on the Shimmr Team tier. Your current licence is
> Starter. See https://<domain>/upgrade — your existing indexes and settings carry
> over.

Honesty note: the message says the tool is *licensed differently*, never that it
does not exist. Given the customer can trivially discover the engine underneath,
an evasive message costs exactly the trust the whole product is sold on.
