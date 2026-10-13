-- Member pages only through the server (service role, after the member-area session was checked): anon and
-- signed-in callers get 'public' pages only, whatever level they ask for.
create or replace function public.wiki_open(p_page uuid, p_level text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select visibility from public.wiki_access(p_page)) = any (
    case when p_level = 'members' and (select auth.role()) = 'service_role' then array['public', 'members'] else array['public'] end);
$$;
