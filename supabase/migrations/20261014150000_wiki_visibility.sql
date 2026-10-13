-- Who may read a wiki page: set on a page, inherited by its sub-pages (nearest page upward with a setting wins).
-- team = everyone with wiki.view (default), roles = only these roles (+ wiki.manage), later: members (member area),
-- public (public page). Writers (wiki.manage) always see everything so nothing gets lost.
alter table public.wiki_pages
  add column visibility text check (visibility in ('team', 'roles', 'members', 'public')), -- null = like the parent
  add column role_ids uuid[] not null default '{}';

-- Effective setting of a page: its own or the nearest ancestor's; top level without one = team.
create function public.wiki_access(p_page uuid) returns table (visibility text, role_ids uuid[], from_page uuid)
language sql stable security definer set search_path = '' as $$
  with recursive up as (
    select id, parent_id, visibility, role_ids, 0 as depth from public.wiki_pages where id = p_page
    union all
    select p.id, p.parent_id, p.visibility, p.role_ids, up.depth + 1 from public.wiki_pages p join up on p.id = up.parent_id where up.depth < 50)
  select coalesce((select u.visibility from up u where u.visibility is not null order by depth limit 1), 'team'),
         coalesce((select u.role_ids from up u where u.visibility is not null order by depth limit 1), '{}'),
         (select u.id from up u where u.visibility is not null order by depth limit 1);
$$;
revoke execute on function public.wiki_access(uuid) from public, anon;

create function public.wiki_readable(p_org uuid, p_page uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare a record;
begin
  if not public.module_enabled(p_org, 'wiki') then return false; end if;
  if public.has_perm(p_org, 'wiki.manage') then return true; end if;
  if not public.has_perm(p_org, 'wiki.view') then return false; end if;
  select * into a from public.wiki_access(p_page);
  return a.visibility <> 'roles' or exists (
    select 1 from public.org_members m where m.org_id = p_org and m.user_id = (select auth.uid()) and m.role_id = any (a.role_ids));
end $$;
revoke execute on function public.wiki_readable(uuid, uuid) from public, anon;

drop policy "read wiki" on public.wiki_pages;
create policy "read wiki" on public.wiki_pages for select to authenticated using (public.wiki_readable(org_id, id));
drop policy "read wiki versions" on public.wiki_page_versions;
create policy "read wiki versions" on public.wiki_page_versions for select to authenticated using (public.wiki_readable(org_id, page_id));
