-- Coverage over time: how much code we were helping with, week by week.
-- Uses the last snapshot per install per week so re-syncs do not inflate it.
with weekly as (
  select distinct on (install_id, date_trunc('week', received_at))
    date_trunc('week', received_at)::date as week,
    install_id,
    calls,
    files,
    lines
  from usage_snapshots
  order by install_id, date_trunc('week', received_at), received_at desc, id desc
)
select
  week,
  count(distinct install_id) as active_installs,
  sum(calls)                 as calls,
  sum(files)                 as files,
  sum(lines)                 as lines
from weekly
group by week
order by week desc;
