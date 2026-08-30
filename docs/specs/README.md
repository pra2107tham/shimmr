# Specs

One spec per buildable unit. A spec is not a design doc — it exists to be
implemented against and then tested against, so every one carries **acceptance
criteria that a person can execute and get a yes or no from.**

| # | Spec | Phase | Status |
|---|---|---|---|
| [SPEC-001](SPEC-001-harness-mvp.md) | Shimmr harness MVP | 1 | Ready to build (after Q1–Q3) |
| [SPEC-002](SPEC-002-license-file.md) | Signed licence file + issuance | 2 | Draft |
| [SPEC-003](SPEC-003-usage-log.md) | Usage log schema + dashboard | 3 | Draft |

## Rules

- **Acceptance criteria are executable.** "Works correctly" is not a criterion;
  "call `get_architecture` on a Starter licence and receive the upgrade message,
  and see one row with `allowed=0` in `usage.db`" is.
- **Unverified assumptions are marked `[VERIFY]`** and must be resolved before the
  spec is called done. Never let one become a silent load-bearing fact.
- Specs may be edited freely while in Draft. Once building starts, changes to
  scope go in the changelog at the bottom.

## Template

```markdown
# SPEC-NNN — <name>

**Phase:** N · **Status:** Draft | Ready | Building | Done
**Depends on:** …

## 1. Goal — one paragraph, what and why
## 2. Scope — in / explicitly out
## 3. Behaviour — the actual specification
## 4. Data — schemas, formats, paths
## 5. Failure modes — what happens when things go wrong
## 6. Acceptance criteria — executable checks
## 7. Open items — `[VERIFY]` markers and unknowns
```
