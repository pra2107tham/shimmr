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
