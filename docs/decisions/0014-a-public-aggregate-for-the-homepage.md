# 0014 — A public, signed-out-readable aggregate for the homepage counter

**Status:** Accepted
**Date:** 2026-09-06

## Context

Q8 (`docs/04-open-questions.md`) asks what "estimated tokens saved" actually
means, and warns against publishing anything that isn't a number we measured
ourselves and can show the working for. `internal/usage.EstimateTokensSaved`
already answers that for one person, printed by `shimmr stats` and explained
in full by `shimmr stats --method` — a deliberately conservative formula
(12,000 tokens per call, capped at indexed-lines × 10), explicit that it is
an estimate of order of magnitude, not a measurement.

The ask this time was different: show that same number, live, on the
homepage — a total across every person who has ever run Shimmr, visible to
someone who hasn't signed in and may never install it. Every table and view
in this schema before now is either fully closed (deny by default,
migration `20260902000000`) or scoped by `auth.uid()` to one person's own
row or one org's own totals (`20260905000000`, `20260905020000`). Nothing
was readable by `anon` at all.

## Decision

**`public.public_totals()` — a `SECURITY DEFINER` SQL function, granted
`EXECUTE` to `anon` and `authenticated` — returns one row: total installs,
total calls, total lines, and `tokens_saved` computed with the exact same
formula as `EstimateTokensSaved`. No per-user, per-install, or per-org
breakdown; it cannot be filtered or drilled into.**

This is safe specifically *because* it is one unscoped row. A grand total
of calls and lines across everyone tells nobody anything about any one
person, install, or org — unlike `org_totals` (identifies one org) or
`install_rollup` (identifies one machine), both of which stay exactly as
gated as they already were. Nothing here widens either of those; this is
a new, narrower thing sitting beside them.

### Why a function, not a plain view

The first attempt was a plain view — `select sum(calls), sum(lines) from
install_rollup`, granted `select` to `anon`. It doesn't work. Verified
against a real Postgres with `anon`/`authenticated` roles created by hand:

```
set role anon;
select * from public_totals;   -- as a plain view over install_rollup
ERROR:  permission denied for view install_live
```

`install_rollup` and `install_live` are `security_invoker = on`
(`20260903000000`), deliberately — that's what makes a signed-in person's
own RLS policy the thing scoping their dashboard. Setting the *outer* view
to `security_invoker = off` does not override that: Postgres still checks
the original calling role's own grants when it evaluates an invoker-rights
view, no matter what the view sitting on top of it declares. `anon` has,
and should keep, zero grants on `installs`/`usage_events`/
`usage_snapshots`, so the chain fails exactly where it should — just not
at the layer this decision needs it to stop.

A `SECURITY DEFINER` function has no such gap: the entire function body
runs as its owner throughout, the same guarantee
`my_org_totals()`/`my_org_tool_usage()` (`20260905020000`) already rely on.
Re-verified the same way once rewritten as a function:

```
set role anon;
select * from public_totals();
 installs | calls | lines | tokens_saved
----------+-------+-------+--------------
        1 |     2 |   500 |         5000

select * from usage_events;
ERROR:  permission denied for table usage_events
select * from install_rollup;
ERROR:  permission denied for view install_rollup
```

`anon` reads the aggregate and nothing else. `tokens_saved = 5000` matches
the formula by hand: 2 calls × 12,000 = 24,000, capped at 500 lines × 10 =
5,000.

## Consequences

- The homepage can show a live, honest "tokens saved" counter without a
  new privacy surface — no field here can identify who made a call, same
  guarantee the individual and org views already make.
- **Three places now compute this formula, and they have to move
  together:** `internal/usage.EstimateTokensSaved` (Go, `MethodText` is
  what `shimmr stats --method` prints), `public.public_totals()` (SQL,
  this migration), and `site/lib/tokensSaved.ts` (TypeScript, the per-user
  dashboard tile). Changing the constants in one without the other two
  means the homepage counter, the CLI, and a signed-in person's own
  dashboard disagree with each other — worse than any one of them being
  wrong alone. Each carries a comment pointing at the other two.
- Still an estimate, not a measurement, everywhere it appears — the
  homepage copy and the dashboard tile both say so and link to how it's
  calculated, the same posture `stats --method` already takes. This
  decision changes *who can read the number*, not what the number means;
  Q8 is not resolved by this and stays open.
- `public_totals()` has no `where` clause and takes no arguments — there
  is no version of this function that returns a subset. If a future
  feature needs a scoped public number (e.g., "trending repos"), that is
  a new, separate decision, not a parameter added here.

## Alternatives considered

- **A plain view over `install_rollup`.** Tried first; does not work,
  above.
- **Grant `anon` direct `select` on `install_rollup` and compute the sum
  in the site's own query.** Rejected outright — that grant would let
  `anon` read every install's individual row, not just a sum. The whole
  point is that a signed-out visitor should not be able to construct the
  per-install detail that lets them.
- **Cache the total in a column somewhere, updated by trigger or cron.**
  Unnecessary at a scale this product is nowhere near yet — `stable`
  marks the function safely cacheable within one transaction, and a
  straight `sum()` over the current data is cheap enough to compute on
  every read for now. Revisit if and when it isn't.
