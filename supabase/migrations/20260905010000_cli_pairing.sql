-- Browser-based CLI sign-in: `shimmr login`/`shimmr signup` open a browser
-- instead of trusting a bare --email flag. This is the CLI half of Q11 —
-- ADR 0011 closed it for the website; this closes it for the terminal too.
--
-- The shape is the standard device-pairing flow (the same idea as `gh auth
-- login`): the CLI generates its own install id and token exactly as it
-- always has, registers a short-lived pairing code, opens
-- {site}/cli-auth?code=..., and polls until the website confirms it. The
-- website's confirm step is where the real check happens — a signed-in
-- Supabase Auth session, not a stated address — same verified identity the
-- dashboard already relies on.
--
-- Nothing about usage/events authentication changes. The install this
-- creates has a token_hash in `installs` exactly like signup/login always
-- produced; `usage` and `events` keep authenticating it exactly as before.

create table if not exists cli_pairings (
  -- Short, unguessable, single-use. Not a UUID on purpose — it is typed
  -- into a URL and shown on two screens for the person to compare, so it
  -- wants to be short enough to read at a glance and confirm by eye.
  code          text primary key,

  -- What the CLI already generated for this install, exactly as
  -- signup/login receive today. Stored here only until claimed, at which
  -- point they move into `installs` the same way signup/login write them.
  install_id    text not null,
  token_hash    text not null,

  status        text not null default 'pending'
                  check (status in ('pending', 'claimed')),
  claimed_by    uuid references users(id) on delete cascade,

  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '10 minutes'),
  claimed_at    timestamptz,

  constraint cli_pairings_claimed_consistency
    check (
      (status = 'pending'  and claimed_by is null and claimed_at is null) or
      (status = 'claimed'  and claimed_by is not null and claimed_at is not null)
    )
);

comment on table cli_pairings is
  'Short-lived codes linking a waiting CLI process to the browser tab where '
  'someone confirms their identity. Rows are cheap and disposable — nothing '
  'here is read again once claimed or expired.';
comment on column cli_pairings.code is
  'Shown in the terminal and on the confirm page, so the person can check '
  'both screens agree before approving — the same shape as a device code.';

create index if not exists cli_pairings_expires_idx on cli_pairings(expires_at);

-- ---------------------------------------------------------------- security

-- Only the Edge Functions reach this table, using the service role key —
-- the same posture every other table in this schema has. The claim step's
-- real authentication is verifying the caller's Supabase Auth JWT inside
-- the function itself (see supabase/functions/cli_claim), not a Postgres
-- policy, because the row being written (an install for a person who may
-- not have queried anything yet) has no RLS-friendly shape to check against.
alter table cli_pairings enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on cli_pairings from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on cli_pairings from authenticated;
  end if;
end $$;
