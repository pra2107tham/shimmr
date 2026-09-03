# 0008 — Usage reports as it happens, not when someone remembers to sync

**Status:** Accepted
**Date:** 2026-09-03
**Amends:** the network constraint in `CLAUDE.md`, which said `shimmr sync` was
the only thing that talks to a server

## Context

Usage reached the backend only when a person typed `shimmr sync`. Nobody types
`shimmr sync`. The result was a product that claimed to measure adoption and in
practice recorded one signup row and nothing else — the numbers a decision
would rest on did not exist.

The obvious fix, sending as the agent works, changes the trust posture. Until
now every byte that left the machine left because someone asked for it, and
`sync --show` could print the whole payload beforehand. Continuous reporting
removes that moment of consent. That is the real cost of this decision, and it
is worth being explicit that we are paying it.

What makes it payable is that the payload does not change. The same `Event` the
local log already holds is what goes out, and that struct has no field capable
of holding source code, a file path, a repository name, a symbol name, or a
tool argument. There is nothing new being collected — only the same thing,
sooner and without asking.

## Decision

**`shimmr serve` reports usage while the agent works.** Events are batched and
posted to `/v1/events`; nothing else about them changes.

Four properties hold, and each is enforced by a test rather than by intent:

1. **A build with no endpoint reports nothing.** This is unchanged and remains
   the guarantee the privacy story rests on.
2. **Reporting never blocks the proxy.** Recording is a non-blocking send onto a
   bounded queue; overflow is dropped and counted, never waited on. A metric is
   not worth a stall in somebody's editor.
3. **Reporting never breaks the proxy.** Every network failure is swallowed and
   retried later. The local log is the durable record; the reporter is a
   courier on top of it.
4. **It can be turned off three ways** — the config flag, `SHIMMR_NO_REPORT`,
   or a build with no endpoint — and `serve` prints which state it is in every
   time it starts.

Every event carries a client-generated id, and the server dedupes on
`(install, id)`. That is what makes a retry safe, and it is why the client can
forget what it has sent rather than keeping a ledger.

`shimmr sync` stays. It is how an offline or opted-out machine still reports,
and `sync --show` remains the way to see exactly what a payload looks like.

## Consequences

- The backend now has usage without anyone doing anything, which was the point.
- `serve` announces on stderr, every start, that it is reporting and where.
  Somebody who dislikes it finds out from us rather than from `tcpdump`.
- Two write paths reach the same numbers, so the server reads **one source per
  install** — live events where they exist, the latest snapshot otherwise — and
  never adds the two together.
- We give up "nothing leaves without an explicit command". If that turns out to
  matter to the people we want as customers, the honest reversal is an opt-in
  prompt at `shimmr init`, not a quieter default.
