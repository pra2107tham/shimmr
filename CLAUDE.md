# Working agreement — Shimmr

## What this repo is right now

A working product plus the specs and decisions behind it.

`shimmr` is a Go binary that sits between an AI coding agent and a third-party
indexing engine: it gates on an account, proxies MCP over stdio, and meters
every call. There is a Supabase backend, a release installer, and CI that runs
unit tests on three platforms, schema tests against real Postgres, and an
end-to-end smoke test.

```bash
make build      # one static binary, no dependencies
make check      # gofmt, vet, tests
make smoke      # end to end against a stand-in engine
make package    # a release archive
```

**Nobody outside this repo has used it yet.** Every bug found so far was found
by running it. Treat "it passes CI" and "it works for a person" as different
claims.

The product decisions are settled and recorded: everything local is free, the
paywall sits at connected features (ADR 0004); the harness is Go (ADR 0005).
`docs/04-open-questions.md` holds what is still open — Q4, Q5, Q6, Q8 and Q9.

## Ground rules

**Verify upstream claims; don't repeat them.** This project wraps a third-party
MIT-licensed engine. The PRD described it from memory and was wrong in several
places; so was the engine's own README, which undercounts its tools. Anything
about the engine's tools, behaviour, or licence gets checked against the pinned
commit or the running binary. Facts that are not yet verified carry a `[VERIFY]`
marker; never quietly promote one to settled.

**Never edit `docs/00-prd.md` to match reality.** It is the record of intent as
authored. Corrections go in the findings doc, the specs, or a new ADR, and get a
row in its amendment log.

**Decisions are ADRs.** Anything expensive to revisit gets a file in
`docs/decisions/`. Reversals supersede; they don't overwrite. ADR 0007 exists
because a mitigation we had assumed for two open questions turned out, when
tested, to cause the failure it was meant to prevent.

## Constraints that will break the product if violated

1. **Stdout carries only MCP JSON-RPC.** All logging goes to stderr. One stray
   write to stdout corrupts the protocol stream and the agent drops the server.
2. **Never modify the engine binary, and never rebuild it for a release** — ADR
   0001 and ADR 0007. Two differing builds refuse to run together for one OS
   account, so a self-built engine breaks Shimmr for anyone who already runs
   the engine directly. Releases bundle the published artifact, pinned by
   checksum in `packaging/engine.json`.
3. **Never set `CBM_CACHE_DIR`** — ADR 0007. One canonical cache root per OS
   account. A differing root is not isolation; it is a startup failure.
4. **The usage log never records code, paths, repo names, symbol names, or tool
   arguments.** Tool names and counts only, with repositories as a per-machine
   salted hash. This is what makes the opt-in sharing feature defensible later;
   a schema that collects extra "just in case" cannot be walked back. Enforced
   by tests in `internal/usage` and by a grep in the smoke test.
5. **Degrade to free, never to broken.** A missing or corrupt config drops the
   user to the free tier. An unwritable log stops logging, not proxying. An
   account problem must never take away a working code tool.
6. **The licence notice ships with every release.** `shimmr licenses` prints
   the engine's MIT text and copyright line, embedded in the binary rather than
   read from disk. This is the one legal obligation the MIT licence places on
   us, and the release workflow fails without it.
7. **No network call happens unless an endpoint is configured.** `shimmr sync`
   is the only thing that talks to a server, it sends aggregate counts only,
   and `--show` prints the exact payload first. A build with no endpoint baked
   in talks to nobody at all.

## On the pitch

Shimmr is sold on trust. That has practical consequences in the code:

- Never tell a customer a tool is missing, broken, or unsupported when it is
  simply not enabled for them.
- Claims about local-only behaviour are backed by a test, not an assertion.
- Metrics that reach a sales deck ship with their method visible. `shimmr stats
  --method` exists for this. Counting markdown as "code covered" inflated our
  own figure by a third before it was caught — a number that falls apart when a
  customer checks it discredits every number beside it.
- We do not name the embedded engine in product or specification documents
  (ADR 0006), and we do not deny it either. If someone asks what Shimmr is
  built on, the answer is honest and points at `shimmr licenses`.

Don't build DRM, obfuscation, or anti-tamper. It cannot work against an MIT
engine, and reaching for it means the product has been misunderstood.
