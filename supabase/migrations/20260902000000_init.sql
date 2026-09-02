-- Shimmr backend: who signed up, and what their agents used.
--
-- Three tables and one rule: nothing here may hold source code, file paths,
-- repository names, symbol names, or tool arguments. The client already
-- guarantees that on the way out; this schema has no column to put it in.

-- ---------------------------------------------------------------- orgs

create table if not exists orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- slug is the identity: "Acme Inc" and "acme  inc" are the same company.
  slug        text not null unique,
  created_at  timestamptz not null default now()
);

comment on table orgs is 'One row per customer organisation.';

-- ---------------------------------------------------------------- users

create table if not exists users (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  org_id      uuid not null references orgs(id) on delete cascade,
  team        text,
  created_at  timestamptz not null default now()
);

create index if not exists users_org_idx on users(org_id);

comment on table users is
  'One row per person. Email is stored lowercased so a reinstall finds the same person.';

-- ---------------------------------------------------------------- installs

-- A person may run Shimmr on a laptop and a desktop. Each install has its own
-- id and its own token, so one machine can be revoked without touching the
-- other.
create table if not exists installs (
  -- The client-generated user_id from ~/.shimmr/config.json.
  id            text primary key,
  user_id       uuid not null references users(id) on delete cascade,
  -- SHA-256 of the token, never the token. A dump of this table hands nobody
  -- a working credential.
  token_hash    text not null unique,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  revoked_at    timestamptz
);

create index if not exists installs_user_idx on installs(user_id);
create index if not exists installs_token_idx on installs(token_hash) where revoked_at is null;

comment on column installs.token_hash is
  'SHA-256 hex of the install token. The raw token is never stored.';

-- ---------------------------------------------------------------- usage

-- Each sync sends cumulative totals, so a row is a snapshot rather than a
-- delta. The latest row per install is the current picture; the history shows
-- growth over time.
create table if not exists usage_snapshots (
  id           bigint generated always as identity primary key,
  install_id   text not null references installs(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  org_id       uuid not null references orgs(id) on delete cascade,

  calls        integer not null default 0,
  repos        integer not null default 0,
  files        integer not null default 0,
  lines        bigint  not null default 0,
  by_tool      jsonb   not null default '[]'::jsonb,

  sent_at      timestamptz not null,
  received_at  timestamptz not null default now(),

  constraint usage_counts_non_negative
    check (calls >= 0 and repos >= 0 and files >= 0 and lines >= 0)
);

create index if not exists usage_org_idx on usage_snapshots(org_id, received_at desc);
create index if not exists usage_install_idx on usage_snapshots(install_id, received_at desc);

comment on table usage_snapshots is
  'Cumulative totals as of each sync. Tool names and counts only.';

-- ---------------------------------------------------------------- views

-- The current picture: one row per install, its most recent snapshot.
create or replace view install_current as
select distinct on (s.install_id)
  s.install_id,
  s.user_id,
  s.org_id,
  s.calls,
  s.repos,
  s.files,
  s.lines,
  s.by_tool,
  s.sent_at
from usage_snapshots s
order by s.install_id, s.received_at desc;

-- What a sales conversation actually needs: per org, how many people, how much
-- code we covered, how many questions we answered.
create or replace view org_totals as
select
  o.id                                as org_id,
  o.name                              as org_name,
  o.slug,
  count(distinct u.id)                as people,
  count(distinct c.install_id)        as installs,
  coalesce(sum(c.calls), 0)::bigint   as calls,
  coalesce(sum(c.repos), 0)::bigint   as repos,
  coalesce(sum(c.files), 0)::bigint   as files,
  coalesce(sum(c.lines), 0)::bigint   as lines,
  max(c.sent_at)                      as last_seen_at,
  o.created_at
from orgs o
left join users u on u.org_id = o.id
left join install_current c on c.user_id = u.id
group by o.id, o.name, o.slug, o.created_at;

-- ---------------------------------------------------------------- security

-- Deny by default. Nothing reaches these tables except the Edge Functions,
-- which use the service role key and do their own token check. When a
-- dashboard arrives it gets explicit read policies; until then, no policy
-- means no access.
alter table orgs             enable row level security;
alter table users            enable row level security;
alter table installs         enable row level security;
alter table usage_snapshots  enable row level security;

-- Views inherit the RLS of their base tables under invoker rights.
alter view install_current set (security_invoker = on);
alter view org_totals      set (security_invoker = on);

-- The anon and authenticated roles get nothing at all for now. Being explicit
-- here means a future `grant` has to be a deliberate act.
revoke all on orgs, users, installs, usage_snapshots from anon, authenticated;
revoke all on install_current, org_totals from anon, authenticated;
