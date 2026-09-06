# ProdE, and what we would build on OpenHands

**Status: research notes and a draft. Nothing here is a decision.** Anything
that turns into one gets an ADR in `docs/decisions/`; anything that turns into
a commitment gets a spec. This file is meant to be edited as we learn more,
and it carries an amendment log at the bottom so corrections are visible
rather than silent.

Researched 2026-09-06.

## How these facts were gathered, and how far to trust them

`prode.ai` is blocked by this environment's network egress proxy, so nothing
here was read from their own site directly. Their product claims below came
from search-engine snapshots of their pages, which are second-hand and may be
stale. The one ProdE source read at first hand is their MCP server's public
repository, and the facts drawn from it are marked accordingly.

OpenHands facts were read from the repository itself (README and LICENSE at
`main`), which is first-hand.

Per the working agreement: unverified claims carry a `[VERIFY]` marker and do
not get promoted to settled without someone checking them.

## 1. What ProdE is

ProdE is built by CuriousBox AI. It is, in their framing, a code intelligence
or context layer over a team's repositories, which both people and AI coding
agents query. Their current homepage title reads "Software Planning for
Agentic Development" — a positioning shift toward specs and planning rather
than search alone. `[VERIFY]` — title read from a search snapshot, not the page.

It is worth being blunt about this: **ProdE is the closest thing to a direct
competitor we have found.** The overlap with Shimmr is not partial. Both sit
between a coding agent and a repository, both expose their understanding over
MCP, both meter usage against an account, and both sell to engineering teams.

### 1.1 What they ship (from search snapshots — `[VERIFY]` throughout)

- **A knowledge/context layer** built over connected repositories, kept
  current as code changes rather than re-trained or manually synced.
- **Symbol-level intelligence** — functions, classes and APIs mapped across
  repos, explicitly pitched at legacy and complex codebases.
- **Auto-generated documentation** — file-level docs, feature summaries, API
  reference, architecture diagrams and a glossary, generated from code so it
  does not drift.
- **Plain-English Q&A** grounded in actual code, spanning services, APIs and
  data flows.
- **Cross-repository queries** — one question answered across several
  codebases at once.
- **A VS Code extension** that puts the knowledge layer in the editor.
- **Spec and plan delivery to agents over MCP**, so an agent works from an
  approved plan with stated boundaries.

### 1.2 Their MCP server (first-hand — read from the public repo)

`github.com/CuriousBox-AI/ProdE-mcp` exposes exactly three tools:

| Tool | What it does |
|---|---|
| `get_all_repositories` | Lists the repositories in your knowledge layer |
| `ask_specific_codebase` | Asks a question about one repository |
| `ask_all_codebases` | Asks a question across all of them |

Authentication is a bearer token issued from the ProdE dashboard's MCP
settings. Transports vary by client: streamable-HTTP as the primary, SSE for
Windsurf, a command form for Augment Code, and **stdio for OpenHands, marked
local-only**.

Documented clients: Cursor, Cline, VS Code with GitHub Copilot, Windsurf,
Augment Code, RooCode, Gemini CLI, and OpenHands.

Two things are worth noticing here. First, their entire agent-facing surface
is three tools, and all the intelligence sits server-side behind
`ask_*` — the agent asks a question and receives prose. Second, **they already
treat OpenHands as a first-class client.** That is a signal about where this
category is going, and it is the direct reason for section 3.

### 1.3 Claims they make that we should not repeat as fact

- A Leena AI case study: ProdE as the backbone for navigating 40+
  microservices and 5M+ lines of code, "2,450+ hours saved in 3 months",
  "10x+ direct ROI". `[VERIFY]` — this is their marketing claim, sourced from
  a snapshot. We have not seen the method.
- Benchmark claims of outscoring Claude Code by 40%, Google Code Wiki by 38%
  and DeepWiki by 15% on codebase documentation. `[VERIFY]` — no method seen.

We do not cite either of these anywhere customer-facing. That is not caution
for its own sake: our own rule is that a number ships with its method visible,
and borrowing someone else's unmethodful number is worse than publishing one
of our own.

### 1.4 Where we actually differ

This matters more than the feature overlap, because it is the only part that
is defensible.

| | ProdE | Shimmr |
|---|---|---|
| Where understanding is computed | Server-side, on their infrastructure | On the user's machine |
| What the agent gets back | Prose answers from `ask_*` | Tools the agent drives itself |
| What we can see | Their service sees the code it indexes | Tool names and counts only; no code, paths, names or arguments |
| Free tier | `[VERIFY]` — not established | Everything local, forever (ADR 0004) |
| What breaks if the vendor goes away | The knowledge layer | Nothing local; the account layer only |

The privacy posture is the sharp end of it. Constraint 4 in `CLAUDE.md` — the
usage log never records code, paths, repo names, symbol names or tool
arguments — is not a feature we chose for tidiness. Against a competitor whose
model requires shipping the code to their service, it is the product.

## 2. What OpenHands is (first-hand)

Read from the repository at `main`, 2026-09-06.

- **Licence: MIT.** "The MIT License (MIT)", "Copyright © 2025 OpenHands
  contributors". Verified by reading `LICENSE` directly.
- The current README describes **OpenHands Agent Canvas**: "The self-hosted
  developer control center for coding agents and automations." It runs
  OpenHands' own agent, or Claude Code, Codex, Gemini, or any ACP-compatible
  agent, across local, remote and cloud infrastructure.
- **Agent Server** — a REST API for running multiple agents on one machine.
- **Automation Server** — runs agents on a schedule or in response to events.
- **TypeScript client** — browser-compatible access to the Agent Server API.
- Run modes: Docker (`ghcr.io/openhands/agent-canvas`, GUI on port 8000),
  a CLI (`npm install -g @openhands/agent-canvas`), or hosted OpenHands
  Cloud / Enterprise.
- Documented integrations: Slack, GitHub, Linear, Notion, Datadog.
- Agents are configured with **microagents** — markdown files with YAML
  frontmatter (`name`, `trigger_type`, `keywords`, and an optional
  `mcp_location` pointing at an MCP server whose tools get appended to the
  microagent's content). `[VERIFY]` — from search snapshots of their docs and
  issues, not read first-hand; `docs.all-hands.dev` is egress-blocked here.
- **MCP servers are configured in `config.toml`** (e.g. an `shttp_servers`
  field for streamable HTTP). `[VERIFY]` — same provenance caveat.
- The repository is reachable at both `All-Hands-AI/OpenHands` and
  `OpenHands/OpenHands`. `[VERIFY]` — likely an org rename with a redirect;
  worth pinning the canonical one before we depend on it.

The licence being MIT puts OpenHands in the same legal category as the engine
we already embed, which means the posture we already worked out applies
directly — see section 4.

## 3. Draft: what we would build on OpenHands

The gap OpenHands fills is that Shimmr today gives an agent *understanding*
but has no agent of its own. Someone has to bring Cursor or Claude Code.
OpenHands is an MIT-licensed agent, runtime and scheduler we could stand
behind our own tools — which turns "we make your agent smarter" into "we can
also be the agent", without building a runtime ourselves.

Everything below is a draft. The tier splits follow ADR 0004 (local is free;
crossing the machine boundary is paid) but none of them is decided.

### 3.1 Local, and free under ADR 0004

1. **Repo Q&A** — an OpenHands agent whose only tools are our local graph and
   semantic search. Answers a question about the repository from the index on
   disk. This is the direct answer to ProdE's `ask_specific_codebase`, except
   the index never leaves the machine.
2. **Onboarding walkthrough** — the same agent pointed at "explain this
   codebase to someone who has never seen it", producing a guided tour rather
   than a single answer. This is where ProdE's legacy-codebase pitch actually
   bites, and it is a good demo.
3. **Documentation generation** — an agent run that walks the graph and writes
   architecture notes, an API reference and a glossary into the repository, as
   files the team owns and reviews. Ours are committed artefacts, not a hosted
   wiki that disappears with the subscription.
4. **Coverage-aware answers** — we already measure what fraction of the
   repository is indexed. An agent that knows its own blind spots and says so
   is worth more than one that confidently answers from a partial index, and
   nothing stops us doing this because the coverage number is already local.

### 3.2 Connected, and paid under ADR 0004

5. **Issue and PR context** — OpenHands' GitHub integration supplies the
   issue or PR, our layer supplies the code understanding, and the agent works
   the two together.
6. **Scheduled automations** — the Automation Server on a cron: regenerate
   docs after a merge, re-index on a schedule, flag drift between docs and
   code.
7. **Spec-bounded execution** — the closest analogue to ProdE's planning
   pitch. An approved plan defines what the agent may touch; we enforce the
   tool boundary and meter what it did.
8. **Team visibility** — agent runs flow through the same account and the same
   usage log the CLI already writes to, so per-seat metering needs no second
   system.

### 3.3 The four hard problems, named now rather than discovered later

These are the reasons this section is a draft and not a plan.

1. **An agent needs a model, and that breaks the clean "free = local" line.**
   Every local feature above calls an LLM. OpenHands is bring-your-own-model,
   so the honest framing is that the user's own key makes the user's own
   network call and nothing crosses *our* boundary — which keeps ADR 0004
   intact by the letter. But "runs entirely on your machine, nothing leaves
   it" stops being true of the *feature* even while it stays true of *us*,
   and our whole pitch is built on that sentence. This needs an ADR before
   any of section 3.1 is built, not after.
2. **The usage log cannot absorb an agent's telemetry as-is.** Constraint 4
   permits tool names and counts, nothing else. An agent run generates
   prompts, file edits, diffs and command output — all of it exactly what the
   schema is designed to have no column for. The rule does not bend for this:
   either agent runs report the same impoverished shape everything else does,
   or they report nothing. A schema that collects "just in case" cannot be
   walked back, and it is the thing that makes the opt-in sharing feature
   defensible later.
3. **Q11 gets worse, not better.** Nothing verifies an email address today,
   so anyone can attach a machine to anyone's account. That is already the
   blocker for charging per seat. An agent that can execute code and reach
   GitHub on a connected tier makes an unverified account a materially
   larger problem than an unverified account that can only count tool calls.
   Q11 closes before section 3.2, not alongside it.
4. **We would be embedding a second MIT project.** ADR 0001, 0006 and 0007
   exist because of the first one, and their lessons transfer directly: do
   not fork it, do not rebuild it for a release, pin what we ship, and ship
   the licence notice (`shimmr licenses` already exists and the release
   workflow already fails without it — it would need to carry OpenHands too).
   Whether we bundle OpenHands or merely support it as a client the user
   installs is itself an ADR, and the cheaper answer is probably the second.

### 3.4 The cheapest useful first step

Nothing in section 3 requires bundling anything. ProdE's own docs list
OpenHands as an MCP client over stdio — which is exactly the transport we
already speak. **Verifying that Shimmr works as an MCP server inside OpenHands
today is a smoke test, not a project**, and it would tell us whether any of
this is worth planning before we spend a decision on it.

If that works, the second step is a microagent that names our tools, which is
a markdown file rather than a feature.

## 4. What to check next

- [ ] Does Shimmr already work as an MCP server inside OpenHands over stdio?
- [ ] Pin the canonical OpenHands repository path and a commit.
- [ ] Read the microagent and `config.toml` MCP formats first-hand rather than
      from snapshots, and drop the `[VERIFY]` markers in section 2.
- [ ] Get ProdE's pricing and free-tier shape, from their own pages.
- [ ] Confirm whether ProdE's `ask_*` tools return prose or structured
      results — it changes how directly comparable the two products are.
- [ ] Decide, in an ADR, whether an LLM call made with the user's own key
      counts as "local" for ADR 0004's purposes. This blocks section 3.1.

## Amendment log

| Date | Change |
|---|---|
| 2026-09-06 | Created. ProdE claims from search snapshots (`prode.ai` egress-blocked); ProdE MCP tool list read first-hand from their public repo; OpenHands licence and README read first-hand at `main`. |
