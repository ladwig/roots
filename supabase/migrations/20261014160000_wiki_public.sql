-- Wiki pages outside the team: 'members' = in the member area (contacts with a membership, no app account),
-- 'public' = on the org's public pages. Both include the team; public includes members. Read through these definer
-- functions only (anon/portal never read wiki_pages directly). Sub-pages inherit like inside the App.

-- Readable at a level? ('public' → only public pages; 'members' → members + public pages)
create function public.wiki_open(p_page uuid, p_level text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select visibility from public.wiki_access(p_page)) = any (case p_level when 'public' then array['public'] else array['public', 'members'] end);
$$;
revoke execute on function public.wiki_open(uuid, text) from public, anon, authenticated;

-- One page for a level: title, Markdown, its readable sub-pages and the readable path above it.
create function public.wiki_outside_page(p_org uuid, p_page uuid, p_level text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when p.id is null or not public.module_enabled(p_org, 'wiki') or not public.wiki_open(p.id, p_level) then null else jsonb_build_object(
    'id', p.id, 'title', p.title, 'body', p.body, 'updated_at', p.updated_at,
    'children', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title) order by c.position, c.title)
      from public.wiki_pages c where c.parent_id = p.id and c.deleted_at is null and public.wiki_open(c.id, p_level)), '[]'),
    'path', coalesce((with recursive up as (
        select q.id, q.parent_id, q.title, 1 as depth from public.wiki_pages q where q.id = p.parent_id and q.deleted_at is null
        union all select q.id, q.parent_id, q.title, up.depth + 1 from public.wiki_pages q join up on q.id = up.parent_id where q.deleted_at is null and up.depth < 50)
      select jsonb_agg(jsonb_build_object('id', id, 'title', title) order by depth desc) from up where public.wiki_open(id, p_level)), '[]')) end
  from (select * from public.wiki_pages where id = p_page and org_id = p_org and deleted_at is null) p
  right join (select 1) one on true;
$$;
revoke execute on function public.wiki_outside_page(uuid, uuid, text) from public;
grant execute on function public.wiki_outside_page(uuid, uuid, text) to anon, authenticated;

-- Start pages for a level: readable pages whose parent isn't readable at that level (tops of the released trees).
create function public.wiki_outside_index(p_org uuid, p_level text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'updated_at', p.updated_at) order by p.position, p.title), '[]')
  from public.wiki_pages p
  where p.org_id = p_org and p.deleted_at is null and public.module_enabled(p_org, 'wiki') and public.wiki_open(p.id, p_level)
    and (p.parent_id is null or not exists (select 1 from public.wiki_pages q where q.id = p.parent_id and q.deleted_at is null and public.wiki_open(q.id, p_level)));
$$;
revoke execute on function public.wiki_outside_index(uuid, text) from public;
grant execute on function public.wiki_outside_index(uuid, text) to anon, authenticated;

-- A file inside a page released at that level (for the public/member file route).
create function public.wiki_outside_file(p_org uuid, p_file uuid, p_level text) returns text
language sql stable security definer set search_path = '' as $$
  select f.path from public.files f
  where f.id = p_file and f.org_id = p_org and f.deleted_at is null and f.entity = 'wiki_pages'
    and public.module_enabled(p_org, 'wiki') and public.wiki_open(f.entity_id, p_level);
$$;
revoke execute on function public.wiki_outside_file(uuid, uuid, text) from public, anon, authenticated;
