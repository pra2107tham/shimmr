-- Schema tests. Run against a database that has the migration applied:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/*.sql
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/schema_test.sql
--
-- Every check raises on failure, so a non-zero exit means something is wrong.
-- Plain SQL on purpose: no extension, no framework, runs anywhere Postgres does.

\set ON_ERROR_STOP on

begin;

-- ------------------------------------------------------------------ helpers

create or replace function assert(condition boolean, what text)
returns void language plpgsql as $$
begin
  if condition is not true then
    raise exception 'FAILED: %', what;
  end if;
  raise notice '  ok — %', what;
end $$;

-- ------------------------------------------------------------------ fixtures

insert into orgs (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Acme Inc',  'acme-inc'),
  ('22222222-2222-2222-2222-222222222222', 'Beta Labs', 'beta-labs');

insert into users (id, email, org_id, team) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ann@acme.dev',  '11111111-1111-1111-1111-111111111111', 'Platform'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bob@acme.dev',  '11111111-1111-1111-1111-111111111111', null),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'cat@beta.dev',  '22222222-2222-2222-2222-222222222222', null);

-- Ann runs two machines; that must not be counted as two people.
insert into installs (id, user_id, token_hash) values
  ('ann-laptop',  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'hash-ann-laptop'),
  ('ann-desktop', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'hash-ann-desktop'),
  ('bob-laptop',  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'hash-bob-laptop'),
  ('cat-laptop',  'cccccccc-cccc-cccc-cccc-cccccccccccc', 'hash-cat-laptop');

-- ------------------------------------------------- uniqueness and identity

do $$
begin
  begin
    insert into orgs (name, slug) values ('Acme, Inc.', 'acme-inc');
    raise exception 'FAILED: two orgs got the same slug';
  exception when unique_violation then
    raise notice '  ok — one slug means one org';
  end;

  begin
    insert into users (email, org_id)
    values ('ann@acme.dev', '22222222-2222-2222-2222-222222222222');
    raise exception 'FAILED: the same email was allowed twice';
  exception when unique_violation then
    raise notice '  ok — one email means one person';
  end;

  begin
    insert into installs (id, user_id, token_hash)
    values ('someone-else', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'hash-ann-laptop');
    raise exception 'FAILED: a token hash was reused across installs';
  exception when unique_violation then
    raise notice '  ok — a token belongs to exactly one install';
  end;
end $$;

-- ------------------------------------------------------- count constraints

do $$
begin
  begin
    insert into usage_snapshots (install_id, user_id, org_id, calls, sent_at)
    values ('ann-laptop', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '11111111-1111-1111-1111-111111111111', -1, now());
    raise exception 'FAILED: a negative call count was accepted';
  exception when check_violation then
    raise notice '  ok — counts cannot go negative';
  end;
end $$;

-- --------------------------------------------------- snapshots, not deltas

-- Three syncs from Ann's laptop with growing totals. Only the newest counts.
insert into usage_snapshots
  (install_id, user_id, org_id, calls, repos, files, lines, by_tool, sent_at, received_at)
values
  ('ann-laptop', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   10, 1, 100, 1000, '[{"tool":"search_graph","calls":10}]', now() - interval '2 days', now() - interval '2 days'),
  ('ann-laptop', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   25, 1, 100, 1000, '[{"tool":"search_graph","calls":25}]', now() - interval '1 day', now() - interval '1 day'),
  ('ann-laptop', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   40, 2, 250, 5000, '[{"tool":"search_graph","calls":40}]', now(), now()),
  ('ann-desktop', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   5, 1, 50, 500, '[]', now(), now()),
  ('bob-laptop', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111',
   7, 1, 30, 300, '[]', now(), now()),
  ('cat-laptop', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222',
   3, 1, 10, 100, '[]', now(), now());

select assert(
  (select count(*) from install_current) = 4,
  'install_current has one row per install, not per sync');

select assert(
  (select calls from install_current where install_id = 'ann-laptop') = 40,
  'install_current keeps the newest snapshot, not the first');

select assert(
  (select lines from install_current where install_id = 'ann-laptop') = 5000,
  'coverage follows the newest snapshot too');

-- Two rows written in the same statement share received_at. The id tie-break
-- must still pick one deterministically.
insert into usage_snapshots
  (install_id, user_id, org_id, calls, repos, files, lines, sent_at, received_at)
values
  ('bob-laptop', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111',
   90, 1, 30, 300, now(), '2030-01-01T00:00:00Z'),
  ('bob-laptop', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111',
   91, 1, 30, 300, now(), '2030-01-01T00:00:00Z');

select assert(
  (select calls from install_current where install_id = 'bob-laptop') = 91,
  'a tie on received_at is broken by id, not left to chance');

-- ------------------------------------------------------------ org rollups

select assert(
  (select people from org_totals where slug = 'acme-inc') = 2,
  'org_totals counts people, so two machines are still one person');

select assert(
  (select installs from org_totals where slug = 'acme-inc') = 3,
  'org_totals counts installs separately from people');

-- Nobody here has reported live yet, so every install falls back to its latest
-- snapshot: Ann's laptop 40 + Ann's desktop 5 + Bob's laptop 91.
select assert(
  (select calls from org_totals where slug = 'acme-inc') = 136,
  'org_totals falls back to the latest snapshot when nothing reported live');

-- 5000 + 500 + 300, again from the current snapshot of each install.
select assert(
  (select lines from org_totals where slug = 'acme-inc') = 5800,
  'org_totals sums lines the same way');

select assert(
  (select bool_and(source = 'sync') from install_rollup
   where install_id in ('ann-laptop', 'ann-desktop', 'bob-laptop')),
  'an install with no events is reported from its sync');

-- An org with nobody in it must appear with zeros, not vanish.
insert into orgs (name, slug) values ('Empty Co', 'empty-co');
select assert(
  (select calls from org_totals where slug = 'empty-co') = 0,
  'an org with no usage still shows up, with zeros');

-- ------------------------------------------------------- live events

-- Ann's laptop starts reporting live. The moment it does, the rollup must
-- prefer those events over her older snapshot — otherwise a machine that
-- upgraded would keep showing stale numbers forever.
insert into usage_events
  (event_id, install_id, user_id, org_id, kind, tool, ok, dur_ms, occurred_at)
values
  ('e1', 'ann-laptop', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111', 'tool_call', 'search_graph', true, 120, now()),
  ('e2', 'ann-laptop', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111', 'tool_call', 'search_graph', true, 95, now()),
  ('e3', 'ann-laptop', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111', 'tool_call', 'trace_path', false, 4000, now());

select assert(
  (select calls from install_live where install_id = 'ann-laptop') = 3,
  'install_live counts tool calls');
select assert(
  (select failed from install_live where install_id = 'ann-laptop') = 1,
  'install_live counts failures separately');
select assert(
  (select source from install_rollup where install_id = 'ann-laptop') = 'live',
  'an install that reports live is read from its events, not its snapshot');
select assert(
  (select calls from install_rollup where install_id = 'ann-laptop') = 3,
  'the live count replaces the snapshot count rather than adding to it');

-- The whole point of event_id: a client that retries a half-delivered flush
-- must not double count. Same install, same event_id, ignored.
insert into usage_events
  (event_id, install_id, user_id, org_id, kind, tool, ok, occurred_at)
values
  ('e1', 'ann-laptop', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111', 'tool_call', 'search_graph', true, now())
on conflict (install_id, event_id) do nothing;

select assert(
  (select calls from install_live where install_id = 'ann-laptop') = 3,
  'a replayed event is ignored, so retries cannot inflate the count');

-- The same event_id from a different machine is a different event.
insert into usage_events
  (event_id, install_id, user_id, org_id, kind, tool, ok, occurred_at)
values
  ('e1', 'ann-desktop', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111', 'tool_call', 'search_code', true, now())
on conflict (install_id, event_id) do nothing;

select assert(
  (select calls from install_live where install_id = 'ann-desktop') = 1,
  'dedupe is per install, so two machines may use the same event id');

-- Coverage counts the latest index of each repo, so re-indexing the same
-- repository does not inflate the figure — the rule `shimmr stats` applies
-- locally has to hold on the server too.
insert into usage_events
  (event_id, install_id, user_id, org_id, kind, repo, files, lines, bytes, nodes, edges, occurred_at)
values
  ('i1', 'ann-laptop', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111', 'index', 'hash-repo-a',
   100, 1000, 10000, 500, 900, '2030-01-01T00:00:00Z'),
  ('i2', 'ann-laptop', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111', 'index', 'hash-repo-a',
   120, 1200, 12000, 600, 1100, '2030-01-02T00:00:00Z'),
  ('i3', 'ann-laptop', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111', 'index', 'hash-repo-b',
   50, 500, 5000, 200, 300, '2030-01-02T00:00:00Z');

select assert(
  (select repos from install_live where install_id = 'ann-laptop') = 2,
  'two indexes of one repo are still one repo');
select assert(
  (select lines from install_live where install_id = 'ann-laptop') = 1700,
  're-indexing replaces the earlier measurement rather than adding to it');

-- tool_usage is the view a product decision rests on, so it gets a test.
select assert(
  (select calls from tool_usage
   where org_id = '11111111-1111-1111-1111-111111111111' and tool = 'search_graph') = 2,
  'tool_usage counts calls per tool');
select assert(
  (select failed from tool_usage
   where org_id = '11111111-1111-1111-1111-111111111111' and tool = 'trace_path') = 1,
  'tool_usage counts failures per tool');

-- Only two kinds exist. A typo in the client must be rejected, not stored.
do $$
begin
  begin
    insert into usage_events (event_id, install_id, user_id, kind, occurred_at)
    values ('bad', 'ann-laptop', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'nonsense', now());
    raise exception 'FAILED: an unknown event kind was accepted';
  exception when check_violation then
    raise notice '   ok — an unknown event kind is rejected';
  end;
end $$;

-- ------------------------------------------------------- orgs are optional

-- An individual with no company. This must be an ordinary, supported state.
insert into users (id, email, org_id)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'solo@example.com', null);
insert into installs (id, user_id, token_hash)
values ('solo-laptop', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'hash-solo');
insert into usage_events
  (event_id, install_id, user_id, org_id, kind, tool, ok, occurred_at)
values
  ('s1', 'solo-laptop', 'dddddddd-dddd-dddd-dddd-dddddddddddd', null,
   'tool_call', 'search_graph', true, now());

select assert(
  (select count(*) from users where org_id is null) = 1,
  'a person may exist without an organisation');
select assert(
  (select calls from install_live where install_id = 'solo-laptop') = 1,
  'usage is recorded for someone with no organisation');
select assert(
  (select org_id from install_live where install_id = 'solo-laptop') is null,
  'their usage is attached to no org, rather than to a placeholder one');
select assert(
  not exists (select 1 from org_totals o
              join install_rollup r on r.org_id = o.org_id
              where r.install_id = 'solo-laptop'),
  'an org-less install is in no org total');

-- Joining an org later must work, and must move their usage with them.
update users set org_id = '11111111-1111-1111-1111-111111111111'
where email = 'solo@example.com';

select assert(
  (select people from org_totals where slug = 'acme-inc') = 3,
  'someone who joins an org later is counted in it');

-- ---------------------------------------------------------------- cascades

delete from orgs where slug = 'beta-labs';

select assert(
  (select count(*) from users where email = 'cat@beta.dev') = 0,
  'deleting an org removes its people');
select assert(
  (select count(*) from installs where id = 'cat-laptop') = 0,
  'deleting an org removes their machines');
select assert(
  (select count(*) from usage_snapshots where install_id = 'cat-laptop') = 0,
  'deleting an org removes their usage');

-- ---------------------------------------------------------------------- RLS

do $$
declare
  unprotected text;
begin
  select string_agg(c.relname, ', ')
    into unprotected
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname in ('orgs', 'users', 'installs', 'usage_snapshots')
    and c.relrowsecurity is false;

  if unprotected is not null then
    raise exception 'FAILED: row level security is off for %', unprotected;
  end if;
  raise notice '  ok — row level security is on for every table';
end $$;

do $$
declare
  policy_count int;
begin
  select count(*) into policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename in ('orgs', 'users', 'installs', 'usage_snapshots');

  -- No policies is the intended state: only the service role gets through.
  -- When a dashboard adds policies, this check should be updated deliberately
  -- rather than silently.
  if policy_count <> 0 then
    raise exception 'FAILED: % unexpected RLS policies exist — was that deliberate?', policy_count;
  end if;
  raise notice '  ok — no RLS policies, so only the service role reaches the data';
end $$;

rollback;
