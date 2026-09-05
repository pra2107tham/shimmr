# 0013 — The org dashboard shows an aggregate, never a per-member breakdown

**Status:** Accepted
**Date:** 2026-09-05

## Context

ADR 0011 shipped the individual-scoped dashboard and named the exact
question it was leaving open: "how is my team doing" is real value, but
granting `org_totals`/`tool_usage` to `authenticated` scoped by `org_id`
was left ungranted on purpose, "a distinct decision (do org-mates see
each other's aggregate numbers? individual numbers?) that deserves its
own answer rather than riding in on this one."

That follow-up arrived — "add org level things" — without narrowing the
question itself. This decision narrows it.

## Decision

**A signed-in person who belongs to an org may read that org's rolled-up
totals and its per-tool breakdown. Nothing granted here ever identifies
which teammate made which call, or exposes another org's numbers.**

Two `SECURITY DEFINER` SQL functions, `my_org_totals()` and
`my_org_tool_usage()` (`supabase/migrations/20260905020000_org_dashboard.sql`),
resolve the caller's own `org_id` from `auth.uid()` and return only the
matching row(s) of the existing `org_totals`/`tool_usage` views — the same
aggregate those views already computed for the sales conversation this
schema was built for. Not a new derivation, and not a grant on the views
themselves: the views join across `users`/`installs`/`usage_events` for a
whole org, and every one of those tables' policies is scoped to "own row"
— widening them to make a direct `select * from org_totals` work as an
org member would have opened exactly the per-person visibility ADR 0011
held back. A function that computes the org_id server-side, runs with
elevated rights, and hands back only the pre-aggregated rows keeps the
individual policies exactly as they were.

`EXECUTE` is revoked from `PUBLIC` and granted only to `authenticated` —
Postgres grants a new function to `PUBLIC` by default, unlike a table,
so this needed to be explicit or `anon` would have gotten it for free.

Guarded the same way as every migration since ADR 0011: on CI's plain
Postgres, `auth.uid()` doesn't exist, so neither function is created —
there is no session for either to resolve an org from.

## Consequences

- The dashboard can show "your org has 5 people, 9,310 calls, these are
  the top tools" without a new privacy surface — no field here can say
  who ran what, the same guarantee the individual usage log already
  makes for a single person.
- This is deliberately narrower than a per-member table. Someone will
  eventually ask "which of us is actually using this" by name — that is
  a new, harder decision (an org admin role, most likely, since "any
  member sees every other member's usage" is not obviously what anyone
  signing up for a team plan expects) and gets its own ADR when it's
  asked for, not a quiet widening of this one.
- An org-less person (the common case for someone trying Shimmr alone)
  gets zero rows from both functions, not an error — the dashboard hides
  the whole panel rather than showing an empty one.
- Verified against the same stand-in `auth` schema and fixtures as ADR
  0011 (Ann and Bob in Acme Inc, Cat alone in Beta Labs): as Ann or Bob,
  `my_org_totals()` returned Acme's one row with both of their calls
  summed and neither name attached; as Cat, only Beta Labs' row, never
  Acme's; as `anon`, permission denied outright. Full commands and
  output are in the migration's commit message.

## Alternatives considered

- **Grant the views directly, scoped by a new RLS policy on
  `usage_events`/`users` keyed to "same org."** Rejected — this is the
  option ADR 0011 already flagged as leaking individual detail. Any
  policy that lets one org member read another's row to compute an
  aggregate client-side also lets them read it to *not* compute an
  aggregate.
- **A per-member table (name + their own call count) alongside the
  aggregate.** More useful for an admin, and exactly the harder question
  this decision defers. Nothing here forecloses adding it later behind
  its own access check (likely "is this person an org admin," a role
  that doesn't exist yet either).
- **Materialize the org aggregate into a column on `users` or a
  denormalized table, updated by trigger.** Unnecessary complexity for
  numbers `org_totals`/`tool_usage` already compute on read at a scale
  this product is nowhere near yet.
