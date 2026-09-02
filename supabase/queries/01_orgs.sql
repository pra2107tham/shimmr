-- Who is using Shimmr, busiest first.
-- This is the query a sales conversation actually starts from.
select
  org_name,
  people,
  installs,
  calls,
  repos,
  files,
  lines,
  last_seen_at::date as last_seen
from org_totals
order by calls desc, org_name;
