-- Website builder (module "sites": Puck pages) removed from main for now; it lives in branch feature/website-builder,
-- whose migration 20261012250100_restore_website_builder recreates all of this when merged.
-- The migrations that created it stay (they are applied); this drops what they made.
delete from public.soft_delete_tables where table_name::text = 'public.site_pages';
drop function if exists public.public_site(uuid, text);
drop function if exists public.public_site_extras(uuid);
drop table if exists public.site_pages;
drop table if exists public.sites;

-- Image writes without the website's folder (orgs/<org>/site/…) again.
create or replace function public.can_write_image(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case (storage.foldername(p_name))[1]
    when 'users' then (storage.foldername(p_name))[2] = (select auth.uid())::text
    when 'orgs' then (storage.foldername(p_name))[2] ~ '^[0-9a-f-]{36}$'
      and public.has_perm(((storage.foldername(p_name))[2])::uuid,
        case when (storage.foldername(p_name))[3] = 'events' then 'events.manage' else 'org.settings.manage' end)
    else false
  end
$$;
