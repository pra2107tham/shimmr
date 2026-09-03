-- Recent signups, newest first: who arrived, from which company if they named
-- one, and whether their machine has ever reported back.
--
-- The join to orgs is a LEFT join on purpose. An organisation is optional, and
-- an inner join here would silently hide every individual — which is exactly
-- the group we most want to see arriving.
select
  u.email,
  coalesce(o.name, '— no org —') as org,
  coalesce(u.team, '—')          as team,
  u.created_at::date             as signed_up,
  count(distinct i.id)           as machines,
  max(i.last_seen_at)::date      as last_seen
from users u
left join orgs o on o.id = u.org_id
left join installs i on i.user_id = u.id
group by u.email, o.name, u.team, u.created_at
order by u.created_at desc
limit 50;
