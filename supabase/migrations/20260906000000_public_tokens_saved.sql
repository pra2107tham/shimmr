-- A public, no-login-required aggregate for the homepage's live counter:
-- total tool calls, total lines covered, and the same conservative
-- tokens-saved estimate `shimmr stats` prints locally — summed across
-- every install that has ever reported in, not scoped to one person or
-- one org.
--
-- Every view and function before this one is either fully closed (deny by
-- default, migration 1) or scoped by auth.uid() to "your own row" or
-- "your own org" (20260905000000, 20260905020000). This is the first one
-- meant to be read by someone who has never signed in at all — the
-- marketing site, signed out.
--
-- That is safe specifically *because* it is one row with no breakdown:
-- a grand total of calls and lines across everyone tells nobody anything
-- about any one person, install, or org — unlike org_totals (identifies
-- one org) or install_rollup (identifies one machine), both of which stay
-- exactly as gated as they already were. Nothing here widens either.
--
-- A SECURITY DEFINER function, not a plain view — tried the plain view
-- first (select the sums straight from install_rollup, granted to anon)
-- and it does not work: install_rollup and install_live are themselves
-- `security_invoker = on` (deliberately, so a signed-in person's own RLS
-- policy is what scopes their dashboard). A view that queries them does
-- not override that — Postgres still checks the *original calling role's*
-- grants when it evaluates an invoker-rights view, no matter what the
-- outer view's own security_invoker setting is, so anon got "permission
-- denied for view install_live" even from behind a non-invoker outer
-- view. Verified by hand against a real Postgres with anon/authenticated
-- roles before writing it this way. A SECURITY DEFINER function has no
-- such gap — the whole function body runs as its owner throughout, same
-- as my_org_totals()/my_org_tool_usage() already rely on.
create or replace function public.public_totals()
returns table (
  installs     bigint,
  calls        bigint,
  lines        bigint,
  tokens_saved bigint
)
language sql
security definer
stable
set search_path = public
as $$
  select
    count(distinct install_id)::bigint as installs,
    coalesce(sum(calls), 0)::bigint    as calls,
    coalesce(sum(lines), 0)::bigint    as lines,
    -- Same formula as internal/usage.EstimateTokensSaved (its MethodText is
    -- what `shimmr stats --method` prints) and site/lib/tokensSaved.ts. All
    -- three have to move together — change the constants in one without
    -- the other two and this number stops matching what the CLI tells the
    -- person who actually made the calls.
    case
      when coalesce(sum(lines), 0) > 0
        then least(coalesce(sum(calls), 0) * 12000, coalesce(sum(lines), 0) * 10)
      else coalesce(sum(calls), 0) * 12000
    end::bigint as tokens_saved
  from install_rollup
$$;

-- Postgres grants EXECUTE on a new function to PUBLIC by default — unlike
-- a table, which starts with no grants at all. Revoke that before
-- granting to anon/authenticated specifically, same reason
-- my_org_totals() does.
revoke all on function public.public_totals() from public;

comment on function public.public_totals() is
  'One row, no per-user or per-org breakdown: totals across every install '
  'that has ever reported in. Granted to anon — this is what the homepage '
  'shows to a signed-out visitor. SECURITY DEFINER so it can read across '
  'every install while install_rollup/install_live stay security_invoker '
  '= on underneath it; see the comment above this function for why a '
  'plain view over those does not work for anon.';

-- Guarded the same way as every other role grant in this schema: CI
-- applies this migration to a plain Postgres where neither role exists,
-- and the guard means the grant simply does not run there. Unlike
-- my_org_totals()/my_org_tool_usage(), this function does not reference
-- auth.uid() at all, so it does not need to be guarded behind auth.uid()
-- existing too — it is exactly as available as install_rollup itself.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.public_totals() to anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.public_totals() to authenticated;
  end if;
end $$;
