# 0012 — `shimmr login`/`shimmr signup` open a browser by default; `--email` becomes the explicit fallback

**Status:** Accepted
**Date:** 2026-09-05

## Context

ADR 0011 closed Q11 for the website: a person's usage is only ever shown to
that person, verified by a Supabase Auth session they actually signed into.
It said plainly that the other half — `shimmr signup`/`shimmr login`
attaching a machine to an account on nothing but a stated `--email` — stayed
open, and stayed lower-stakes only because the dashboard no longer trusted
it directly.

That is still the loudest gap in this project's own trust model. Every CLI
tool this one is compared against — `gh`, `vercel`, the Supabase CLI itself
— solved exactly this problem the same way: the terminal opens a browser,
the browser is where a real identity check happens, and the terminal only
ever receives the result of that check, never the identity claim itself.
Nothing about this needed inventing; it needed wiring, the same way ADR
0011 called using Supabase Auth "mostly wiring rather than building."

## Decision

**`shimmr login` and `shimmr signup`, run with no `--email`, open a browser
to a short-lived pairing code on the website. `--email` still exists,
still works exactly as before, and is now the explicit unverified fallback
rather than the only path.**

The flow, concretely:

1. The CLI generates its own install id and token — exactly what it always
   generated at this point — and posts them to a new function, `cli_start`,
   which returns a short, human-readable code (`K3F9-72QP`) good for ten
   minutes.
2. The CLI opens `{site}/cli-auth?code=...` in a browser (and prints the
   URL and the code regardless, for a machine with no display, an SSH
   session, or a browser that just doesn't open) and polls a second
   function, `cli_poll`, every couple of seconds.
3. The website's `/cli-auth` page requires a real signed-in session — the
   same magic-link sign-in the dashboard already uses — and shows the same
   code for the person to visually confirm before approving, the same
   device-code confirmation step `gh auth login` uses and for the same
   reason: approving a code silently, with no chance to notice it doesn't
   match, is a phishable step.
4. Confirming calls `cli_claim`, the one function in this whole flow that
   checks anything real: it verifies the caller's Supabase Auth JWT
   (`authClient.auth.getUser(jwt)`, the standard way to check a session
   server-side when the platform's own `verify_jwt` is off — see
   `config.toml`), resolves that session to the `public.users` row ADR
   0011's trigger already links it to, and only then creates the `installs`
   row — same table, same shape, same `token_hash`, as `signup`/`login`
   have always produced.
5. `cli_poll` sees the code is claimed, returns email/org/team, and the CLI
   writes `~/.shimmr/config.json` exactly as it always has.

**`usage` and `events` do not change at all.** They authenticate an install
token the same way regardless of which door it came through.

## Consequences

- Q11 is fully closeable now, for both surfaces — closing it is still a
  separate step (removing or restricting `--email`), not this one, but
  nothing about the backend blocks it anymore.
- A pairing code is a real credential for a ten-minute window: whoever
  holds it can attach a machine to whichever account confirms it. It is
  short, single-use, expires, and is shown on both screens for a person to
  compare — the same shape a device code has anywhere else this pattern is
  used, and the reason confirmation is an explicit click rather than
  automatic on page load.
- `cli_claim`'s write is atomic against a concurrent claim: the pairing
  row's `pending -> claimed` update is conditioned on still being pending
  and unexpired, in the same statement that reads back what it needs,
  so two near-simultaneous confirmations of one code cannot both create an
  install under different accounts.
- `--email` is not removed. Scripted signups, CI, and design partners
  already relying on it keep working, unverified, exactly as documented.
  Deprecating it further is a decision for whenever "counted per seat" or
  "charged for" actually applies to the CLI path — the same threshold Q11
  always named — not a side effect of this change.
- Three new functions means three new `verify_jwt = false` entries in
  `config.toml`. Getting that list wrong is precisely how `login` and
  `events` went live answering every request with 401 the first time —
  every place that enumerates the function list (`Makefile`, `ci.yml`,
  `deploy.yml`) was updated together with this change, not after.

## Alternatives considered

- **A one-time code emailed on `login`, typed back into the terminal.** Q11's
  original option 1. Verifies the same thing with no browser at all, which
  matters for a genuinely headless machine — but typing a code by hand is a
  worse experience than a confirmed click for the common case, and `--email`
  already covers the truly headless one, unverified, exactly as it does
  today. Worth adding as a third path later if a design partner actually
  needs verified headless sign-in; not needed to ship this.
- **Removing `--email` entirely.** Rejected for now — see Consequences. It
  is the right eventual direction, not a free side effect of adding the
  better path beside it.
- **Full OAuth 2.0 Device Authorization Grant (RFC 8628).** The shape this
  borrows from, but the RFC's machinery (registered clients, scopes, a
  standards-compliant token endpoint) solves problems this project does not
  have — one client, one backend, one trust boundary. A pairing code and
  three small functions get the same user-facing guarantee without a
  spec's worth of surface area to maintain.
