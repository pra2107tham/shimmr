# Decision records

One file per decision that would be expensive to revisit or confusing to
rediscover. Numbered, immutable once accepted — a reversal is a *new* ADR that
supersedes the old one, not an edit.

| # | Decision | Status |
|---|---|---|
| [0001](0001-wrap-unmodified-upstream-binary.md) | Wrap the unmodified upstream binary; do not rebuild the C source | Accepted |
| [0002](0002-stdio-proxy-harness.md) | The harness is a stdio JSON-RPC proxy | Accepted |
| [0003](0003-name-shimmr.md) | Name the product Shimmr; defer the domain | Accepted, with known collisions |
| [0004](0004-local-free-connected-paid.md) | Local is free; crossing the machine boundary is paid | Accepted |
| [0005](0005-harness-in-go.md) | The harness is written in Go | Accepted |
| [0006](0006-engine-naming-and-attribution.md) | Do not name the engine in product or spec docs | Accepted |

## Template

```markdown
# NNNN — <decision, as a statement>

**Status:** Proposed | Accepted | Superseded by NNNN
**Date:** YYYY-MM-DD

## Context
What is true that forces a choice.

## Decision
What we are doing, stated plainly.

## Consequences
What this makes easy, what it makes hard, and what we accept.

## Alternatives considered
What we did not do, and why.
```
