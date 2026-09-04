-- The web dashboard: real auth for the browser, and read access to match.
--
-- Every table so far denies anon and authenticated completely — deliberately,
-- per the comment left in the first migration: "When a dashboard arrives it
-- gets explicit read policies; until then, no policy means no access." This
-- is that moment.
--
-- What this is not: a change to how the CLI authenticates. `shimmr signup`
-- and `shimmr login` are untouched, still unauthenticated in the sense Q11
-- describes, and still upsert `users` by email exactly as before. This
-- migration adds a second, better-verified way to reach the *same* row: sign
-- in on the website, and Supabase Auth's own email link proves the address
-- before anything is created or shown. See ADR 0011.
--
-- Guarded throughout, the same way earlier migrations guard `anon` and
-- `authenticated`: CI applies every migration to a plain Postgres with no
-- `auth` schema at all, so anything that depends on Supabase Auth existing
-- has to no-op cleanly there rather than fail the run.

-- ---------------------------------------------------------------- the link

-- Nullable and unconstrained by a foreign key to auth.users on purpose: a
-- person who has only ever used the CLI has a users row with no web account
-- yet, and this migration has to apply on a Postgres that has no auth.users
-- to reference in the first place. The trigger below is what keeps this
-- column correct on a real Supabase project; nothing here depends on a
-- foreign key to enforce that.
alter table users add column if not exists auth_user_id uuid unique;

comment on column users.auth_user_id is
  'Set once this person signs in on the website. Null means CLI-only so far '
  '— that is the normal state for anyone who has not visited the dashboard.';

create index if not exists users_auth_user_idx on users(auth_user_id)
  where auth_user_id is not null;

-- Links a Supabase Auth identity to the existing per-email row the CLI may
-- already have created, or creates one fresh. Runs as the table owner
-- (security definer) because the authenticating session that fires this
-- trigger has no privileges on public.users yet — it is mid-signup.
--
-- on conflict (email) mirrors exactly what `signup`'s upsert already does:
-- the CLI's "a reinstall finds the same person" guarantee and the website's
-- "verifying your email finds the same person" guarantee are the same rule,
-- applied at two different doors.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (email, auth_user_id)
  values (lower(new.email), new.id)
  on conflict (email) do update set auth_user_id = excluded.auth_user_id;
  return new;
end;
$$;

comment on function public.handle_new_auth_user() is
  'Keeps public.users.auth_user_id in sync with auth.users. Fires on every '
  'new Supabase Auth signup; see the trigger on auth.users, created below '
  'only when that table exists.';

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'auth' and table_name = 'users'
  ) then
    execute '
      drop trigger if exists on_auth_user_created on auth.users;
      create trigger on_auth_user_created
        after insert on auth.users
        for each row execute function public.handle_new_auth_user()
    ';
  end if;
end $$;

-- ---------------------------------------------------------------- read access

-- Individual scope only, deliberately: a signed-in person can read their own
-- row and their own usage, not their org-mates'. org_totals and tool_usage
-- stay ungranted — an org-wide view is a real feature someone will want, but
-- it is a separate access-control decision (who may see whose numbers inside
-- one org) and does not need to block a working per-person dashboard today.
--
-- Every policy is built with `execute` inside a guard on auth.uid() existing,
-- not written as plain DDL. A plain `create policy ... using (auth.uid())`
-- would fail to parse on a Postgres with no auth schema even inside a `do`
-- block guarded the usual way, because CREATE POLICY resolves the function in
-- its USING clause immediately. Building the statement as a string and only
-- executing it once auth.uid() is confirmed to exist sidesteps that.
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'uid'
  ) then

    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      grant select on users, installs, usage_snapshots, usage_events to authenticated;
      grant select on install_current, install_live, install_rollup to authenticated;
    end if;

    execute 'create policy "own row" on users
      for select using (auth_user_id = auth.uid())';

    execute 'create policy "own installs" on installs
      for select using (
        user_id in (select id from users where auth_user_id = auth.uid())
      )';

    execute 'create policy "own usage snapshots" on usage_snapshots
      for select using (
        user_id in (select id from users where auth_user_id = auth.uid())
      )';

    execute 'create policy "own usage events" on usage_events
      for select using (
        user_id in (select id from users where auth_user_id = auth.uid())
      )';

  end if;
end $$;

-- ---------------------------------------------------------------- realtime

-- The dashboard's live feed subscribes to inserts on usage_events. Supabase
-- Realtime's postgres_changes respects the RLS policy above: a signed-in
-- user's subscription only ever receives rows their own "own usage events"
-- policy would let them select. Guarded the same way — the publication does
-- not exist outside a real Supabase project.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table usage_events';
  end if;
end $$;
