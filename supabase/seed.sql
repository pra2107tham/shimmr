-- Local development data. Applied automatically by `supabase db reset`.
-- Never runs against a linked project.
--
-- Two orgs, three people, one of whom has two machines — enough shape to make
-- the views say something interesting.

insert into orgs (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Acme Inc',  'acme-inc'),
  ('22222222-2222-2222-2222-222222222222', 'Beta Labs', 'beta-labs')
on conflict (slug) do nothing;

insert into users (id, email, org_id, team) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ann@acme.dev', '11111111-1111-1111-1111-111111111111', 'Platform'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bob@acme.dev', '11111111-1111-1111-1111-111111111111', 'Product'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'cat@beta.dev', '22222222-2222-2222-2222-222222222222', null)
on conflict (email) do nothing;

insert into installs (id, user_id, token_hash) values
  ('seed-ann-laptop',  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'seed-hash-ann-laptop'),
  ('seed-ann-desktop', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'seed-hash-ann-desktop'),
  ('seed-bob-laptop',  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'seed-hash-bob-laptop'),
  ('seed-cat-laptop',  'cccccccc-cccc-cccc-cccc-cccccccccccc', 'seed-hash-cat-laptop')
on conflict (id) do nothing;

-- A fortnight of growth so the history is worth querying.
insert into usage_snapshots
  (install_id, user_id, org_id, calls, repos, files, lines, by_tool, sent_at, received_at)
select
  i.id,
  i.user_id,
  u.org_id,
  (d * 12 + i.seq * 5)::int,
  1 + (i.seq % 2),
  (d * 40 + 200)::int,
  (d * 900 + 4000)::bigint,
  jsonb_build_array(
    jsonb_build_object('tool', 'search_graph',    'calls', d * 5),
    jsonb_build_object('tool', 'get_code_snippet','calls', d * 4),
    jsonb_build_object('tool', 'trace_path',      'calls', d * 3)
  ),
  now() - make_interval(days => 14 - d),
  now() - make_interval(days => 14 - d)
from generate_series(1, 14) as d
cross join (values
  ('seed-ann-laptop',  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 1),
  ('seed-ann-desktop', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 2),
  ('seed-bob-laptop',  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 3),
  ('seed-cat-laptop',  'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 4)
) as i(id, user_id, seq)
join users u on u.id = i.user_id;

-- ---------------------------------------------------------------- live events
--
-- Two of the seeded machines report live, which is what `shimmr serve` does
-- now, and two still only sync. Both states are real, so the seed shows both:
-- anyone opening this database should see straight away that install_rollup
-- picks one source per install rather than adding the two together.
insert into usage_events
  (event_id, install_id, user_id, org_id, kind, tool, ok, dur_ms, occurred_at)
select
  'seed-' || i.id || '-' || d || '-' || n,
  i.id,
  i.user_id,
  u.org_id,
  'tool_call',
  (array['search_graph', 'get_code_snippet', 'trace_path', 'search_code'])[1 + (n % 4)],
  -- Roughly one call in twenty fails, so the failure-rate query has something
  -- to show and a real regression has something to stand out against.
  (n % 20) <> 0,
  40 + (n * 7) % 400,
  now() - make_interval(days => 14 - d, hours => n)
from generate_series(1, 14) as d
cross join generate_series(1, 6) as n
cross join (values
  ('seed-ann-laptop', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid),
  ('seed-bob-laptop', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid)
) as i(id, user_id)
join users u on u.id = i.user_id
on conflict (install_id, event_id) do nothing;

-- Coverage, as an index event rather than a snapshot.
insert into usage_events
  (event_id, install_id, user_id, org_id, kind, repo, files, lines, bytes, nodes, edges, occurred_at)
select
  'seed-index-' || i.id,
  i.id,
  i.user_id,
  u.org_id,
  'index',
  -- A per-machine salted hash is what the client sends; these are stand-ins of
  -- the same shape, because nothing else may ever appear in this column.
  encode(sha256(i.id::bytea), 'hex'),
  420, 61000, 2200000, 19000, 52000,
  now() - interval '13 days'
from (values
  ('seed-ann-laptop', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid),
  ('seed-bob-laptop', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid)
) as i(id, user_id)
join users u on u.id = i.user_id
on conflict (install_id, event_id) do nothing;

-- ------------------------------------------------------- somebody with no org
--
-- An individual trying Shimmr on their own. This is a supported state, not an
-- edge case, and the seed says so — a query that inner-joins orgs will drop
-- this person, which is precisely the mistake worth catching early.
insert into users (id, email, org_id)
values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'solo@example.com', null)
on conflict (email) do nothing;

insert into installs (id, user_id, token_hash, last_seen_at)
values ('seed-solo-laptop', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        encode(sha256('seed-solo-token'::bytea), 'hex'), now())
on conflict (id) do nothing;

insert into usage_events
  (event_id, install_id, user_id, org_id, kind, tool, ok, dur_ms, occurred_at)
select
  'seed-solo-' || n,
  'seed-solo-laptop',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  null,
  'tool_call',
  (array['search_graph', 'get_code_snippet'])[1 + (n % 2)],
  true,
  60 + n,
  now() - make_interval(hours => n)
from generate_series(1, 12) as n
on conflict (install_id, event_id) do nothing;
