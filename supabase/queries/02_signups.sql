-- Recent signups, newest first: who arrived, from which company, and whether
-- their machine has ever reported back.
select
  u.email,
  o.name                     as org,
  coalesce(u.team, '—')      as team,
  u.created_at::date         as signed_up,
  count(i.id)                as machines,
  max(i.last_seen_at)::date  as last_sync
from users u
join orgs o on o.id = u.org_id
left join installs i on i.user_id = u.id
group by u.email, o.name, u.team, u.created_at
order by u.created_at desc
limit 50;
