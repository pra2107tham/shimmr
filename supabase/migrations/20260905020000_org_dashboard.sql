-- Org-level dashboard: an aggregate, not a window into anyone's individual
-- usage.
--
-- ADR 0011 deferred this deliberately: "org_totals and tool_usage stay
-- ungranted — an org-wide view is a real feature someone will want, but it
-- is a separate access-control decision (who may see whose numbers inside
-- one org)". This migration answers that decision narrowly rather than by
-- opening the individual-scoped RLS policies wider:
--
--   A signed-in person who belongs to an org may read that org's rolled-up
--   totals and its per-tool breakdown — never another org's, and never a
--   row identifying which teammate made which call. Both are exactly the
--   aggregate the org_totals/tool_usage views already computed for the
--   sales conversation this schema was built for; nothing new is derived.
--
-- Two SECURITY DEFINER functions, not a grant on the views themselves or a
-- widened RLS policy on users/usage_events. The views join across users,
-- installs and usage_events for the whole org, and none of those tables'
-- individual-scope policies ("own row", "own usage events", ...) let one
-- member read another's — widening them to make the views work for a
-- direct SELECT would leak exactly the per-person detail ADR 0011 held
-- back. A function that resolves the caller's own org_id from auth.uid(),
-- runs with elevated rights, and returns only the pre-aggregated view rows
-- for that one org keeps the individual policies untouched and returns
-- nothing a plain "select * from org_totals" as that person wouldn't be
-- safe to see anyway.
--
-- Guarded the same way as every migration since 0011: CI applies this to a
-- plain Postgres with no auth.uid(), where the guard means neither function
-- gets created at all — there is nothing for a person with no web session to
-- call.

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'uid'
  ) then

    execute '
      create or replace function public.my_org_totals()
      returns table (
        org_id       uuid,
        org_name     text,
        slug         text,
        people       bigint,
        installs     bigint,
        calls        bigint,
        repos        bigint,
        files        bigint,
        lines        bigint,
        last_seen_at timestamptz,
        created_at   timestamptz
      )
      language sql
      security definer
      stable
      set search_path = public
      as $fn$
        select o.org_id, o.org_name, o.slug, o.people, o.installs,
               o.calls, o.repos, o.files, o.lines, o.last_seen_at, o.created_at
        from org_totals o
        where o.org_id = (select u.org_id from users u where u.auth_user_id = auth.uid())
      $fn$;
    ';

    execute '
      create or replace function public.my_org_tool_usage()
      returns table (
        tool          text,
        calls         bigint,
        failed        bigint,
        installs      bigint,
        first_used_at timestamptz,
        last_used_at  timestamptz
      )
      language sql
      security definer
      stable
      set search_path = public
      as $fn$
        select t.tool, t.calls, t.failed, t.installs, t.first_used_at, t.last_used_at
        from tool_usage t
        where t.org_id = (select u.org_id from users u where u.auth_user_id = auth.uid())
        order by t.calls desc
      $fn$;
    ';

    -- Postgres grants EXECUTE on a new function to PUBLIC by default —
    -- unlike a table, which starts with no grants at all. Revoke that
    -- before granting only to authenticated, or anon would get it for free.
    execute 'revoke all on function public.my_org_totals() from public';
    execute 'revoke all on function public.my_org_tool_usage() from public';

    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute 'grant execute on function public.my_org_totals() to authenticated';
      execute 'grant execute on function public.my_org_tool_usage() to authenticated';
    end if;

    -- Comments too: `comment on function` resolves the signature immediately,
    -- so it belongs inside the same guard as the function it describes —
    -- neither exists at all on the plain Postgres CI runs against.
    execute $c$comment on function public.my_org_totals() is
      'The calling user''s own org, rolled up — empty if they belong to no org. '
      'SECURITY DEFINER so it can read across the org while every underlying '
      'table stays scoped to "own row" for a direct SELECT; see ADR 0011.'$c$;
    execute $c$comment on function public.my_org_tool_usage() is
      'Per-tool breakdown for the calling user''s own org — aggregate counts '
      'only, never which install or person made a given call.'$c$;

  end if;
end $$;
