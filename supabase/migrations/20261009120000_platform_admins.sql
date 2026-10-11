-- Platform admins (superadmins): pass every org permission check, manage all orgs and users.
-- Their actions are still audited under their own user id.

create table public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users on delete cascade,
  created_at timestamptz not null default now(), created_by uuid, updated_at timestamptz not null default now(), updated_by uuid
);
alter table public.platform_admins enable row level security;
select public.enable_audit('public.platform_admins');
revoke all on public.platform_admins from anon;
revoke update on public.platform_admins from authenticated;

create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()));
$$;
revoke execute on function public.is_platform_admin() from public, anon;

create policy "admins see admins, users see themselves" on public.platform_admins for select to authenticated
  using (public.is_platform_admin() or user_id = (select auth.uid()));
create policy "admins grant admin" on public.platform_admins for insert to authenticated
  with check (public.is_platform_admin());
create policy "admins revoke admin (not themselves)" on public.platform_admins for delete to authenticated
  using (public.is_platform_admin() and user_id <> (select auth.uid()));

-- Org helpers: platform admins count as owner of every org.
create or replace function public.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin()
    or exists (select 1 from public.org_members where org_id = p_org and user_id = (select auth.uid()));
$$;

create or replace function public.is_owner(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or exists (
    select 1 from public.org_members m join public.roles r on r.id = m.role_id
    where m.org_id = p_org and m.user_id = (select auth.uid()) and r.is_owner
  );
$$;

create or replace function public.has_perm(p_org uuid, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or exists (
    select 1 from public.org_members m join public.roles r on r.id = m.role_id
    where m.org_id = p_org and m.user_id = (select auth.uid())
      and (r.is_owner
        or '*' = any (r.permissions)
        or p_perm = any (r.permissions)
        or split_part(p_perm, '.', 1) || '.*' = any (r.permissions))
  );
$$;

create or replace function public.shares_org(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or exists (
    select 1 from public.org_members a join public.org_members b on a.org_id = b.org_id
    where a.user_id = (select auth.uid()) and b.user_id = p_user
  );
$$;

-- Admin-only writes the normal policies don't allow.
drop policy "edit own profile" on public.profiles;
create policy "edit own profile (admins: any)" on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.is_platform_admin());

grant insert on public.org_members to authenticated;
create policy "admins add members directly" on public.org_members for insert to authenticated
  with check (public.is_platform_admin());

create policy "admins delete orgs" on public.orgs for delete to authenticated
  using (public.is_platform_admin());

-- The org address (subdomain) is changed by platform admins only.
grant update (slug) on public.orgs to authenticated;
create function public.guard_org_slug() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.slug is distinct from old.slug and auth.uid() is not null and not public.is_platform_admin() then
    raise exception 'slug_admin_only';
  end if;
  return new;
end $$;
revoke execute on function public.guard_org_slug() from public, anon, authenticated;
create trigger guard_org_slug before update of slug on public.orgs
  for each row execute function public.guard_org_slug();

-- Platform-level changes (org_id null) are visible to admins.
create policy "admins see all activity" on public.audit_log for select to authenticated
  using (public.is_platform_admin());

-- One creation path for orgs: create_org (caller becomes owner) and admin_create_org (admin picks the owner).
create function public.seed_org(p_name text, p_slug text, p_owner uuid, p_role_names text[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_owner uuid;
begin
  insert into public.orgs (name, slug) values (trim(p_name), lower(trim(p_slug))) returning id into v_org;
  insert into public.roles (org_id, name, is_owner) values (v_org, p_role_names[1], true) returning id into v_owner;
  insert into public.roles (org_id, name, permissions) values
    (v_org, p_role_names[2], '{*}'),
    (v_org, p_role_names[3], '{}'),
    (v_org, p_role_names[4], '{tickets.scan}');
  if p_owner is not null then
    insert into public.org_members (org_id, user_id, role_id) values (v_org, p_owner, v_owner);
  end if;
  return v_org;
end $$;
revoke execute on function public.seed_org(text, text, uuid, text[]) from public, anon, authenticated;

create or replace function public.create_org(
  p_name text, p_slug text, p_role_names text[] default '{Owner,Admin,Member,Door staff}'
) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  return public.seed_org(p_name, p_slug, auth.uid(), p_role_names);
end $$;

create function public.admin_create_org(
  p_name text, p_slug text, p_owner uuid, p_role_names text[] default '{Owner,Admin,Member,Door staff}'
) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'not_allowed'; end if;
  return public.seed_org(p_name, p_slug, p_owner, p_role_names);
end $$;
revoke execute on function public.admin_create_org(text, text, uuid, text[]) from public, anon;

-- All users with auth details (admins only; empty for everyone else). Filterable/pageable via PostgREST.
create function public.admin_users()
returns table (
  id uuid, email text, full_name text, created_at timestamptz, last_sign_in_at timestamptz,
  confirmed boolean, is_platform_admin boolean, org_count int
)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email::text, p.full_name, u.created_at, u.last_sign_in_at,
    u.email_confirmed_at is not null,
    exists (select 1 from public.platform_admins a where a.user_id = u.id),
    (select count(*) from public.org_members m where m.user_id = u.id)::int
  from auth.users u
  left join public.profiles p on p.id = u.id
  where public.is_platform_admin();
$$;
revoke execute on function public.admin_users() from public, anon;

create function public.admin_delete_user(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'not_allowed'; end if;
  if p_user = auth.uid() then raise exception 'cannot_delete_self'; end if;
  delete from auth.users where id = p_user; -- memberships cascade; blocked if they're an org's last owner
end $$;
revoke execute on function public.admin_delete_user(uuid) from public, anon;
