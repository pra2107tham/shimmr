-- Live per-call usage, and organisations that are optional.
--
-- Two changes, both driven by how people actually use this:
--
--   1. Usage arrived only when someone typed `shimmr sync`. Nobody types
--      `shimmr sync`. Events now stream while the agent works, so the numbers
--      exist without asking anyone to do anything.
--
--   2. An individual trying Shimmr should not have to invent a company name.
--      An org is now optional; supply one and you join it, leave it out and
--      you are simply a person with an account.
--
-- The rule from the first migration is unchanged and applies here too: no
-- column may hold source code, file paths, repository names, symbol names, or
-- tool arguments. The client has no field for them and this schema has no
-- column for them.

-- ---------------------------------------------------------------- orgs are optional

alter table users alter column org_id drop not null;

comment on column users.org_id is
  'The organisation this person belongs to. Null is normal: an individual can '
  'use Shimmr without naming a company, and may join one later.';

-- Snapshots inherit the same truth. Without this, `shimmr sync` from an
-- org-less install would fail a not-null constraint — the manual path has to
-- keep working for exactly the people most likely to be trying Shimmr alone.
alter table usage_snapshots alter column org_id drop not null;

-- ---------------------------------------------------------------- usage_events

-- One row per tool call, written as the agent works rather than at sync time.
--
-- usage_snapshots still exists and `shimmr sync` still writes to it. Snapshots
-- are cumulative totals; these are the individual calls behind them. Keeping
-- both means the manual path keeps working for anyone offline or opted out.
create table if not exists usage_events (
  id          bigint generated always as identity primary key,

  -- Client-generated, unique per event. This is what makes a retry safe: a
  -- flush that half-succeeded can be sent again without double counting.
  event_id    text not null,

  install_id  text not null references installs(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  org_id      uuid references orgs(id) on delete cascade,

  -- 'tool_call' or 'index'.
  kind        text not null,
  tool        text,
  ok          boolean not null default true,
  dur_ms      integer,

  -- Coverage, present only on an index event. repo is a per-machine salted
  -- hash: two customers indexing the same public repository produce different
  -- values, so nothing here can be correlated across accounts.
  repo        text,
  files       integer,
  lines       bigint,
  bytes       bigint,
  nodes       integer,
  edges       integer,

  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),

  constraint usage_events_kind_known
    check (kind in ('tool_call', 'index')),
  constraint usage_events_counts_non_negative
    check (
      (dur_ms is null or dur_ms >= 0) and
      (files  is null or files  >= 0) and
      (lines  is null or lines  >= 0) and
      (bytes  is null or bytes  >= 0) and
      (nodes  is null or nodes  >= 0) and
      (edges  is null or edges  >= 0)
    )
);

-- Idempotency: the same event from the same machine lands once, however many
-- times the client retries.
create unique index if not exists usage_events_dedupe
  on usage_events(install_id, event_id);

create index if not exists usage_events_org_idx
  on usage_events(org_id, occurred_at desc);
create index if not exists usage_events_install_idx
  on usage_events(install_id, occurred_at desc);
create index if not exists usage_events_tool_idx
  on usage_events(tool, occurred_at desc) where kind = 'tool_call';

comment on table usage_events is
  'One row per tool call or index, reported live. Tool names and counts only.';
comment on column usage_events.event_id is
  'Client-generated id. Unique per install, so retries are idempotent.';
comment on column usage_events.repo is
  'Per-machine salted hash of the repository path. Never a name or a path.';

-- ---------------------------------------------------------------- views

-- What the live stream says, per install. Coverage counts the most recent
-- index of each repository, so re-indexing does not inflate the totals —
-- the same rule `shimmr stats` applies locally.
create or replace view install_live as
with latest_index as (
  select distinct on (install_id, repo)
    install_id, user_id, org_id, repo, files, lines, bytes, nodes, edges
  from usage_events
  where kind = 'index'
  order by install_id, repo, occurred_at desc, id desc
),
coverage as (
  select install_id,
         count(*)::bigint            as repos,
         coalesce(sum(files), 0)::bigint as files,
         coalesce(sum(lines), 0)::bigint as lines,
         coalesce(sum(bytes), 0)::bigint as bytes,
         coalesce(sum(nodes), 0)::bigint as nodes,
         coalesce(sum(edges), 0)::bigint as edges
  from latest_index
  group by install_id
),
calls as (
  select install_id,
         count(*)::bigint                                  as calls,
         count(*) filter (where not ok)::bigint            as failed,
         min(occurred_at)                                  as first_seen_at,
         max(occurred_at)                                  as last_seen_at
  from usage_events
  where kind = 'tool_call'
  group by install_id
)
select
  i.id                              as install_id,
  i.user_id,
  u.org_id,
  (c.install_id is not null or v.install_id is not null) as reporting_live,
  coalesce(c.calls, 0)              as calls,
  coalesce(c.failed, 0)             as failed,
  coalesce(v.repos, 0)              as repos,
  coalesce(v.files, 0)              as files,
  coalesce(v.lines, 0)              as lines,
  coalesce(v.bytes, 0)              as bytes,
  coalesce(v.nodes, 0)              as nodes,
  coalesce(v.edges, 0)              as edges,
  c.first_seen_at,
  c.last_seen_at
from installs i
join users u on u.id = i.user_id
left join coverage v on v.install_id = i.id
left join calls    c on c.install_id = i.id;

comment on view install_live is
  'Per install, rolled up from the live event stream rather than from syncs.';

-- Which tools are actually being used, per org. This is the question a product
-- decision rests on, so it gets a view rather than a bespoke query each time.
create or replace view tool_usage as
select
  e.org_id,
  e.tool,
  count(*)::bigint                       as calls,
  count(*) filter (where not e.ok)::bigint as failed,
  count(distinct e.install_id)::bigint   as installs,
  min(e.occurred_at)                     as first_used_at,
  max(e.occurred_at)                     as last_used_at
from usage_events e
where e.kind = 'tool_call' and e.tool is not null
group by e.org_id, e.tool;

comment on view tool_usage is
  'Per org and tool: how many calls, how many failed, how many machines.';

-- The best picture available for each install: the live stream when it is
-- reporting, its most recent sync when it is not.
--
-- Both paths have to count. Live reporting is the default now, but a machine
-- that is offline, opted out, or on an older build still syncs, and dropping
-- those installs from the headline view would understate real usage. Reading
-- one source per install rather than adding the two together is what keeps a
-- machine that does both from being counted twice.
create or replace view install_rollup as
select
  l.install_id,
  l.user_id,
  l.org_id,
  case when l.reporting_live then 'live' else 'sync' end as source,
  case when l.reporting_live then l.calls else coalesce(s.calls, 0)::bigint end as calls,
  case when l.reporting_live then l.repos else coalesce(s.repos, 0)::bigint end as repos,
  case when l.reporting_live then l.files else coalesce(s.files, 0)::bigint end as files,
  case when l.reporting_live then l.lines else coalesce(s.lines, 0)::bigint end as lines,
  case when l.reporting_live then l.last_seen_at else s.sent_at end as last_seen_at
from install_live l
left join install_current s on s.install_id = l.install_id;

comment on view install_rollup is
  'One row per install: live events where they exist, the latest sync otherwise.';

-- People without an org are not in here at all — by definition they belong to
-- no organisation. Count them with:
--   select count(*) from users where org_id is null;
create or replace view org_totals as
select
  o.id                                   as org_id,
  o.name                                 as org_name,
  o.slug,
  count(distinct u.id)                   as people,
  count(distinct r.install_id)           as installs,
  coalesce(sum(r.calls), 0)::bigint      as calls,
  coalesce(sum(r.repos), 0)::bigint      as repos,
  coalesce(sum(r.files), 0)::bigint      as files,
  coalesce(sum(r.lines), 0)::bigint      as lines,
  max(r.last_seen_at)                    as last_seen_at,
  o.created_at
from orgs o
left join users u on u.org_id = o.id
left join install_rollup r on r.user_id = u.id
group by o.id, o.name, o.slug, o.created_at;

-- ---------------------------------------------------------------- security

alter table usage_events enable row level security;

alter view install_live   set (security_invoker = on);
alter view install_rollup set (security_invoker = on);
alter view tool_usage   set (security_invoker = on);
alter view org_totals   set (security_invoker = on);

-- Same posture as the first migration: deny by default, no policies, only the
-- Edge Functions reach these tables. Guarded so the migration also applies to
-- a plain Postgres, which is how CI tests the schema without Supabase.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on usage_events from anon;
    revoke all on install_live, install_rollup, tool_usage from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on usage_events from authenticated;
    revoke all on install_live, install_rollup, tool_usage from authenticated;
  end if;
end $$;
