-- What happened recently, from the live stream: calls per day, how many
-- machines were involved, and how many of those calls failed.
--
-- A rising failure rate is the first sign something is wrong in the field, and
-- it is the number nobody thinks to look at until a customer complains.
select
  occurred_at::date                                       as day,
  count(*) filter (where kind = 'tool_call')              as calls,
  count(*) filter (where kind = 'tool_call' and not ok)    as failed,
  round(
    100.0 * count(*) filter (where kind = 'tool_call' and not ok)
    / nullif(count(*) filter (where kind = 'tool_call'), 0),
    1
  )                                                        as failure_pct,
  count(distinct install_id)                               as machines,
  count(*) filter (where kind = 'index')                   as indexes
from usage_events
where occurred_at > now() - interval '30 days'
group by occurred_at::date
order by day desc;
