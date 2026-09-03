-- Which tools agents actually reach for, across every customer.
-- Tells us what the product is really used for, and what to build next.
--
-- Reads the live event stream, which is where usage arrives now. Machines that
-- only ever sync appear in the second query instead — their snapshots carry
-- per-tool counts but no individual calls, so the two cannot be summed without
-- inventing precision that is not there.
select
  tool,
  sum(calls)              as calls,
  sum(failed)             as failed,
  sum(installs)           as installs_using,
  max(last_used_at)::date as last_used
from tool_usage
group by tool
order by calls desc;

-- Machines that report only by sync, for comparison. If this is empty, every
-- install is reporting live and the query above is the whole picture.
select
  entry->>'tool'                 as tool,
  sum((entry->>'calls')::bigint) as calls,
  count(distinct c.install_id)   as installs_using
from install_current c
join install_rollup r on r.install_id = c.install_id and r.source = 'sync'
cross join lateral jsonb_array_elements(c.by_tool) as entry
group by entry->>'tool'
order by calls desc;
