-- Outside the team: empty pages (no text and no released sub-pages with text) aren't listed, e.g. a fresh
-- "Neue Seite" under a public page. And one link for everything: /wiki/<id> in the App forwards visitors without
-- access to the public page or the member area when the page is released there (wiki_outside_target).

create function public.wiki_has_content(p_page uuid, p_level text) returns boolean
language sql stable security definer set search_path = '' as $$
  with recursive down as (
    select id, body, 0 as depth from public.wiki_pages where id = p_page and deleted_at is null
    union all
    select c.id, c.body, d.depth + 1 from public.wiki_pages c join down d on c.parent_id = d.id where c.deleted_at is null and d.depth < 20)
  select exists (select 1 from down where length(trim(body)) > 0 and (depth = 0 or public.wiki_open(id, p_level)));
$$;
revoke execute on function public.wiki_has_content(uuid, text) from public, anon, authenticated;

create or replace function public.wiki_outside_page(p_org uuid, p_page uuid, p_level text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when p.id is null or not public.module_enabled(p_org, 'wiki') or not public.wiki_open(p.id, p_level) then null else jsonb_build_object(
    'id', p.id, 'title', p.title, 'body', p.body, 'updated_at', p.updated_at,
    'children', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title) order by c.position, c.title)
      from public.wiki_pages c where c.parent_id = p.id and c.deleted_at is null and public.wiki_open(c.id, p_level) and public.wiki_has_content(c.id, p_level)), '[]'),
    'path', coalesce((with recursive up as (
        select q.id, q.parent_id, q.title, 1 as depth from public.wiki_pages q where q.id = p.parent_id and q.deleted_at is null
        union all select q.id, q.parent_id, q.title, up.depth + 1 from public.wiki_pages q join up on q.id = up.parent_id where q.deleted_at is null and up.depth < 50)
      select jsonb_agg(jsonb_build_object('id', id, 'title', title) order by depth desc) from up where public.wiki_open(id, p_level)), '[]')) end
  from (select * from public.wiki_pages where id = p_page and org_id = p_org and deleted_at is null) p
  right join (select 1) one on true;
$$;

create or replace function public.wiki_outside_index(p_org uuid, p_level text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'updated_at', p.updated_at) order by p.position, p.title), '[]')
  from public.wiki_pages p
  where p.org_id = p_org and p.deleted_at is null and public.module_enabled(p_org, 'wiki') and public.wiki_open(p.id, p_level) and public.wiki_has_content(p.id, p_level)
    and (p.parent_id is null or not exists (select 1 from public.wiki_pages q where q.id = p.parent_id and q.deleted_at is null and public.wiki_open(q.id, p_level)));
$$;

-- Where a page lives outside the App: { slug, level } when released publicly or for members, else null.
create function public.wiki_outside_target(p_page uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('slug', o.slug, 'level', a.visibility)
  from public.wiki_pages p join public.orgs o on o.id = p.org_id cross join lateral public.wiki_access(p.id) a
  where p.id = p_page and p.deleted_at is null and public.module_enabled(p.org_id, 'wiki') and a.visibility in ('public', 'members');
$$;
revoke execute on function public.wiki_outside_target(uuid) from public;
grant execute on function public.wiki_outside_target(uuid) to anon, authenticated;
