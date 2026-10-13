-- Page icon (an emoji, like Notion): shown in the tree, the header and outside the team.
alter table public.wiki_pages add column icon text check (char_length(icon) <= 16);

create or replace function public.wiki_outside_page(p_org uuid, p_page uuid, p_level text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when p.id is null or not public.module_enabled(p_org, 'wiki') or not public.wiki_open(p.id, p_level) then null else jsonb_build_object(
    'id', p.id, 'icon', p.icon, 'title', p.title, 'body', p.body, 'updated_at', p.updated_at,
    'children', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'icon', c.icon, 'title', c.title) order by c.position, c.title)
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
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'icon', p.icon, 'title', p.title, 'updated_at', p.updated_at) order by p.position, p.title), '[]')
  from public.wiki_pages p
  where p.org_id = p_org and p.deleted_at is null and public.module_enabled(p_org, 'wiki') and public.wiki_open(p.id, p_level) and public.wiki_has_content(p.id, p_level)
    and (p.parent_id is null or not exists (select 1 from public.wiki_pages q where q.id = p.parent_id and q.deleted_at is null and public.wiki_open(q.id, p_level)));
$$;
