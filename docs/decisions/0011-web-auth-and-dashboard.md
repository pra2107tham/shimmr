# 0011 — Web auth is Supabase Auth; the dashboard reads through RLS scoped to one person

**Status:** Accepted
**Date:** 2026-09-04

## Context

Every account in this system has, until now, been reached one way: an email
address and an unverified claim to it. `shimmr signup` upserts `users` by
email; `shimmr login` looks a person up by email and attaches a new machine.
Q11 (`docs/04-open-questions.md`) named exactly this, and named exactly when
it stops being survivable — the moment "an org's usage is shown to that org,
because then one person's numbers are visible to whoever claims their
address." A per-user dashboard on the public website is that moment. Shipping
one on the existing trust model would mean: know someone's email, see their
usage.

Q11's own recommendation was option 1, an emailed one-time code, noting
"Supabase Auth already does this, so it is mostly wiring." Option 2, a magic
link, was passed over only because it "needs somewhere to land the click,
which means a website we do not have yet." `site/` now exists.

Separately, `installs.token_hash` — the CLI's own credential — is a machine
credential by design: revocable per device, never sent as a raw value after
issuance, meaningless outside a request the CLI itself makes. It is the
wrong shape for a browser session, and reusing it for the website would not
have closed Q11 — it would have moved the same hole to a form field.

## Decision

**The website authenticates through Supabase Auth (magic link). A database
trigger links that identity to the existing `users` row by email. RLS grants
a signed-in person read access to their own rows only — not their org's, not
anyone else's.**

Concretely:

- `users` gains `auth_user_id uuid unique`, set by a trigger on `auth.users`
  insert. The trigger upserts on email exactly the way `signup` already does:
  a person with a CLI-created row who later signs in on the website gets
  linked to that same row, not a duplicate one. A person with no prior CLI
  account gets a fresh row, same as a first `shimmr signup` would produce.
- The CLI is untouched. `shimmr signup` and `shimmr login` still work exactly
  as before, are still unauthenticated in the sense Q11 describes for that
  surface, and remain the way a machine gets an install token regardless of
  whether the person has ever visited the website.
- RLS policies scope `users`, `installs`, `usage_snapshots`, and
  `usage_events` to `auth_user_id = auth.uid()` (directly on `users`, via a
  subquery on the others). `org_totals` and `tool_usage` are deliberately
  **not** granted — an org-wide view is a real feature someone will want, but
  it is a separate access-control question (who inside one org may see whose
  numbers) and does not have to block a working per-person dashboard today.
- `usage_events` joins the `supabase_realtime` publication. The dashboard
  subscribes to inserts filtered to its own `user_id`; Realtime enforces the
  same RLS policy the REST path does, so a subscription cannot see what a
  `select` could not.
- Every piece of this is guarded behind `auth.uid()` / `auth.users` /
  `supabase_realtime` existing, the same defensive pattern every migration
  before this one uses for `anon`/`authenticated`. CI applies migrations to a
  plain Postgres with none of those, and has to keep passing.

## Consequences

- Q11 is answered for the web tier. It is **not** answered for the CLI's own
  `signup`/`login` — that remains open, and remains lower-stakes than it was,
  because the thing Q11 warned about (usage shown back to an unverified
  claimant) now requires the Supabase Auth email round-trip regardless of
  what the CLI will accept.
- CI cannot exercise the RLS policies it applies — a plain Postgres has no
  `auth.uid()`, so the guarded blocks correctly create nothing there, and the
  schema test asserts exactly that rather than a fixed policy count. The
  policies were verified by hand instead, against a Postgres with a
  stand-in `auth` schema (`auth.users`, and `auth.uid()` reading the JWT
  `sub` claim the same way Supabase's real one does):

  ```
  -- Ann signed in, Bob signed in with the email his CLI account already used,
  -- Zoe signed in fresh. Each queried as themselves:
  as Ann  -> sees only her own row, her own install, her own event
  as Bob  -> sees only his own row (the CLI-created one, now linked), his own event
  as anon -> permission denied outright
  as authenticated with a JWT sub matching nobody -> zero rows, not an error
  ```

  The exact setup and commands are in this change's commit message. Anyone
  can reproduce them against a local Postgres in a few minutes; a real
  `supabase start` stack proves the same thing without the stand-in schema.
- Signing in on the website and running the CLI are two doors to one account,
  as long as the same email is used at both. The dashboard says so and gives
  the exact command.
- No change to how the Edge Functions authenticate. They use the service
  role key, which bypasses RLS by design; this decision only touches what
  `authenticated` (a signed-in browser session) can read directly.

## Alternatives considered

- **Reuse `installs` tokens for web login.** Rejected in Context, above — it
  is a machine credential, not a session credential, and using it as one
  would not have verified an email address at all.
- **A custom one-time-code endpoint, rather than Supabase Auth.** Q11 already
  named this as more work for no benefit: Supabase Auth's magic link is the
  same email-round-trip guarantee, already built, already wired to the
  project this backend runs on.
- **Grant `org_totals` to `authenticated` too, scoped by `org_id`.** Tempting
  — "how is my team doing" is real dashboard value — but it is a distinct
  decision (do org-mates see each other's aggregate numbers? individual
  numbers?) that deserves its own answer rather than riding in on this one.
  Left ungranted; worth a follow-up once someone actually asks for it.
