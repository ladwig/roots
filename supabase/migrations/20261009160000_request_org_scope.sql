-- 1. Request-level org scope: the app sends `x-org-id` on every org-scoped request.
--    When present, membership checks only pass for that org, so a person in several orgs only ever
--    sees the active one, even if a query forgets to filter. Spoofing it grants nothing:
--    membership (or platform admin) is still required. Requests without the header (admin pages,
--    org switcher) behave as before.
create function public.request_org() returns uuid
language sql stable set search_path = '' as $$
  select case when h ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then h::uuid end
  from (select current_setting('request.headers', true)::json ->> 'x-org-id' as h) s;
$$;

create or replace function public.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (public.request_org() is null or p_org = public.request_org())
    and (public.is_platform_admin()
      or exists (select 1 from public.org_members where org_id = p_org and user_id = (select auth.uid())));
$$;

create or replace function public.is_owner(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (public.request_org() is null or p_org = public.request_org())
    and (public.is_platform_admin() or exists (
      select 1 from public.org_members m join public.roles r on r.id = m.role_id
      where m.org_id = p_org and m.user_id = (select auth.uid()) and r.is_owner
    ));
$$;

create or replace function public.has_perm(p_org uuid, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (public.request_org() is null or p_org = public.request_org())
    and (public.is_platform_admin() or exists (
      select 1 from public.org_members m join public.roles r on r.id = m.role_id
      where m.org_id = p_org and m.user_id = (select auth.uid())
        and (r.is_owner
          or '*' = any (r.permissions)
          or p_perm = any (r.permissions)
          or split_part(p_perm, '.', 1) || '.*' = any (r.permissions))
    ));
$$;

-- 2. Modules are switched on/off per org by platform admins only.
drop policy "enable modules" on public.org_modules;
drop policy "disable modules" on public.org_modules;
create policy "admins enable modules" on public.org_modules for insert to authenticated
  with check (public.is_platform_admin());
create policy "admins disable modules" on public.org_modules for delete to authenticated
  using (public.is_platform_admin());
update public.roles set permissions = array_remove(permissions, 'org.modules.manage');

-- 3. Saved language per person (for emails and new devices).
alter table public.profiles add column locale text check (locale in ('de', 'en'));
grant update (locale) on public.profiles to authenticated;
