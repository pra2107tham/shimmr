# 0003 — Name the product Shimmr; defer the domain

**Status:** Accepted, with known collisions
**Date:** 2026-08-30

## Context

Preserved from PRD §14. "Shimmr" was chosen for pronounceability over thematic
fit — an invented-feeling word in the spirit of Wispr Flow or Granola, rather than
a literal compound like the earlier "Quietgraph" draft.

A search-based read (**not** a WHOIS check) found:

- `shimmr.ai` — live, an AI book-advertising startup with some press. Different
  vertical, but the same "AI startup" framing, and it holds the TLD a dev tool
  would naturally want.
- `shimmr.app` — live, an unrelated meditation/sound app.
- `shimmer.network` — IOTA Foundation's staging network. Different industry and
  spelling; low confusion risk, shared search results.

## Decision

Proceed under the name **Shimmr** for all internal work, docs, and code. **Defer
domain selection entirely** — the user has explicitly ruled it out of scope for now,
and nothing in v1 depends on it.

## Consequences

**Easy:** work proceeds; no decision is blocked on a purchase.

**Hard:** `.ai` and `.app` are gone for this exact spelling, so the eventual choice
is likely `.dev`, `.io`, or a prefixed `.com`. SEO for the bare name will be
contested from day one.

**Accepted:** a rename later is cheap while the only artifacts are docs, a harness
binary name, and an MCP server key. It gets expensive once an installer, a signed
binary, and customer configs exist — so **the real deadline for this decision is
Phase 2**, not Phase 1.

**Before committing money:** verify availability properly (WHOIS + trademark
search, not a search-engine read), and check the USPTO/EUIPO classes the
book-advertising `shimmr.ai` may already hold.

## Alternatives considered

- **Quietgraph** — thematically apt, clearly available-feeling, less memorable;
  set aside for pronounceability.
- **Renaming now to dodge the collisions** — premature. The collisions are real but
  in different verticals, and v1 has no public surface for them to collide with.
