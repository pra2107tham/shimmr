-- Which tools agents actually reach for, across every customer.
-- Tells us what the product is really used for, and what to build next.
select
  entry->>'tool'                    as tool,
  sum((entry->>'calls')::bigint)    as calls,
  count(distinct c.install_id)      as installs_using
from install_current c
cross join lateral jsonb_array_elements(c.by_tool) as entry
group by entry->>'tool'
order by calls desc;
