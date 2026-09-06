-- The per-day companion to public_totals(): the same conservative
-- tokens-saved estimate, but bucketed by day, so the homepage can draw a
-- short trend line under the headline number instead of a flat one.
--
-- Same posture and the same reasoning as public_totals()
-- (20260906000000_public_tokens_saved.sql, ADR 0014): SECURITY DEFINER so
-- it can read across every install while the invoker-rights views stay
-- exactly as gated as they are, EXECUTE revoked from public and granted
-- to anon/authenticated explicitly, and the grant guarded so CI can apply
-- this to a plain Postgres that has neither role.
--
-- Two things differ from public_totals(), and both matter.
--
-- First, the source. public_totals() reads install_rollup, which counts a
-- synced install and a live-reporting one alike. A day bucket cannot come
-- from there — a sync carries cumulative totals with no per-day shape, so
-- there is nothing to bucket. This reads usage_events directly, which
-- means it covers live-reporting installs only. The daily series is
-- therefore a *subset* of the headline total and will not sum to it. The
-- homepage labels it as its own thing for exactly that reason; do not
-- present the two as the same population.
--
-- Second, the floor. A grand total across everyone says nothing about any
-- one person. A *daily* series across two or three installs starts to say
-- when somebody works — which days they were at the keyboard and which
-- they were not. That is a different disclosure from "N tokens saved in
-- total", and it is the kind that cannot be walked back once it has been
-- public. So the series is withheld entirely until enough separate
-- installs are reporting that no single day's number belongs to an
-- identifiable machine. Below the floor this returns zero rows and the
-- homepage draws no graph at all, which is the intended behaviour: no
-- graph is correct, a made-up one is not.
create or replace function public.public_daily(days integer default 4)
returns table (
  day          date,
  calls        bigint,
  lines        bigint,
  tokens_saved bigint
)
language sql
security definer
stable
set search_path = public
as $$
  with
  -- Clamped rather than trusted: this is callable by anon, and an
  -- unbounded `days` is a free full-table scan for anyone who asks.
  window_days as (
    select least(greatest(coalesce(days, 4), 1), 31) as n
  ),
  -- The floor, as described above. Counted over the same window the
  -- series covers, so it reflects who is actually reporting now rather
  -- than everyone who ever has.
  eligible as (
    select count(distinct e.install_id) >= 3 as ok
    from usage_events e, window_days w
    where e.occurred_at >= current_date - (w.n - 1)
  ),
  -- Every day in the window, including the ones with no events at all —
  -- a left join off this is what keeps a quiet day as a zero in the line
  -- rather than a gap the chart would silently close up.
  span as (
    select generate_series(current_date - (w.n - 1), current_date, interval '1 day')::date as day
    from window_days w
  ),
  per_day as (
    select
      s.day,
      coalesce(count(*) filter (where e.kind = 'tool_call'), 0)::bigint as calls,
      coalesce(sum(e.lines) filter (where e.kind = 'index'), 0)::bigint as lines
    from span s
    left join usage_events e on e.occurred_at >= s.day
                            and e.occurred_at <  s.day + 1
    group by s.day
  )
  select
    p.day,
    p.calls,
    p.lines,
    -- Same formula as internal/usage.EstimateTokensSaved,
    -- public.public_totals() and site/lib/tokensSaved.ts, applied per day.
    -- Applying the cap per day rather than once over the whole window is
    -- deliberate: each day is capped by what that day actually indexed, so
    -- a single day can never claim more than reading that day's code would
    -- have cost. It also means these rows do not add up to the headline
    -- figure, which is the second reason the two are labelled separately.
    case
      when p.lines > 0 then least(p.calls * 12000, p.lines * 10)
      else p.calls * 12000
    end::bigint as tokens_saved
  from per_day p, eligible el
  where el.ok
  order by p.day
$$;

revoke all on function public.public_daily(integer) from public;

comment on function public.public_daily(integer) is
  'Tokens saved per day across every live-reporting install, for the last '
  'N days (default 4, clamped to 1..31). No per-user, per-org or '
  'per-install breakdown. Returns zero rows until at least 3 separate '
  'installs are reporting in the window, so a daily series can never '
  'describe one identifiable machine. Live events only, so it does not '
  'sum to public_totals() — see the comment above the function.';

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.public_daily(integer) to anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.public_daily(integer) to authenticated;
  end if;
end $$;
