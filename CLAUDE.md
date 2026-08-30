# Working agreement — Shimmr

## What this repo is right now

Specs and decisions. **No implementation exists yet.** If you are asked to build,
check `docs/04-open-questions.md` first — Q1, Q2 and Q3 are blocking, and Q1 can
change what v1 even is.

## Ground rules

**Verify upstream claims; don't repeat them.** This project wraps
`DeusData/codebase-memory-mcp`. The PRD described it partly from memory and was
wrong in several places (see `docs/01-upstream-findings.md`). Anything about the
engine's tools, behaviour, or licence gets checked against the pinned commit or the
running binary. Facts that are not yet verified carry a `[VERIFY]` marker; never
quietly promote one to settled.

**Never edit `docs/00-prd.md` to match reality.** It is the record of intent as
authored. Corrections go in the findings doc, the specs, or a new ADR, and get a
row in its amendment log.

**Decisions are ADRs.** Anything expensive to revisit gets a file in
`docs/decisions/`. Reversals supersede; they don't overwrite.

## Constraints that will break the product if violated

1. **Stdout carries only MCP JSON-RPC.** All logging goes to stderr. One stray
   write to stdout corrupts the protocol stream and the agent drops the server.
2. **Never modify the upstream binary** — see ADR 0001. All Shimmr behaviour lives
   in the harness process.
3. **The usage log never records code, paths, repo names, symbol names, or tool
   arguments.** Tool names and counts only. This is enforced from the first commit
   because it is what makes the opt-in sharing feature defensible later; a schema
   that collects extra "just in case" cannot be walked back.
4. **Degrade to free, never to broken.** A missing, expired, or corrupt licence
   drops the user to Starter. An unwritable log stops logging, not proxying. A
   licensing problem must never take away a working code tool.
5. **No network calls in Phase 1.** At all. The heartbeat arrives in Phase 4.

## On the pitch

Shimmr is sold on trust. That has practical consequences in the code:

- Upgrade messages say a tool is *licensed differently* — never that it is missing,
  broken, or unsupported. Customers can and will find the MIT engine underneath.
- Claims about local-only behaviour are backed by an egress test, not an assertion.
- Metrics that reach a sales deck ship with their method visible.

Don't build DRM, obfuscation, or anti-tamper. It cannot work against an MIT engine,
and reaching for it means the product has been misunderstood.
