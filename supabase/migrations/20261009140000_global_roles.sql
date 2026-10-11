-- Roles become platform-wide: platform admins define them (names in de/en), orgs only assign them.
-- roles.org_id stays nullable (null = global) so org-specific roles can be added later.

-- 1. Loosen per-org structure
alter table public.org_members drop constraint org_members_role_id_org_id_fkey;
alter table public.invites drop constraint invites_role_id_org_id_fkey;
drop index public.org_members_role;
drop index public.invites_role;
alter table public.roles drop constraint roles_id_org_id_key;
alter table public.roles drop constraint roles_org_id_name_key;
alter table public.roles drop constraint roles_name_check;
drop index public.roles_one_owner;
alter table public.roles alter column org_id drop not null;

-- 2. Names in every language: {"de": "...", "en": "..."}
alter table public.roles alter column name type jsonb using jsonb_build_object('de', name, 'en', name);
alter table public.roles add constraint roles_name_check
  check (jsonb_typeof(name) = 'object' and length(trim(name ->> 'de')) between 1 and 50);
create unique index roles_unique_name on public.roles (coalesce(org_id, '00000000-0000-0000-0000-000000000000'), (name ->> 'de'));
create unique index roles_one_owner on public.roles (coalesce(org_id, '00000000-0000-0000-0000-000000000000')) where is_owner;

-- 3. Global roles
insert into public.roles (org_id, name, permissions, is_owner) values
  (null, '{"de": "Inhaber", "en": "Owner"}', '{}', true),
  (null, '{"de": "Admin", "en": "Admin"}', '{*}', false),
  (null, '{"de": "Mitglied", "en": "Member"}', '{}', false),
  (null, '{"de": "Einlass", "en": "Door staff"}', '{tickets.scan}', false);

-- 4. Move existing members/invites from org roles to the matching global role, then drop org roles
create function pg_temp.global_role(r public.roles) returns uuid language sql as $$
  select id from public.roles g where g.org_id is null and g.name ->> 'en' = case
    when r.is_owner then 'Owner'
    when '*' = any (r.permissions) then 'Admin'
    when r.permissions = '{tickets.scan}' then 'Door staff'
    else 'Member' end;
$$;
update public.org_members m set role_id = pg_temp.global_role(r) from public.roles r where r.id = m.role_id and r.org_id is not null;
update public.invites i set role_id = pg_temp.global_role(r) from public.roles r where r.id = i.role_id and r.org_id is not null;
delete from public.roles where org_id is not null;
update public.roles set permissions = array_remove(permissions, 'org.roles.manage');

-- 5. References + "role must be global or belong to the same org"
alter table public.org_members add constraint org_members_role_id_fkey foreign key (role_id) references public.roles;
alter table public.invites add constraint invites_role_id_fkey foreign key (role_id) references public.roles on delete cascade;
create index org_members_role on public.org_members (role_id);
create index invites_role on public.invites (role_id);

create function public.check_role_scope() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.roles where id = new.role_id and (org_id is null or org_id = new.org_id)) then
    raise exception 'invalid_role';
  end if;
  return new;
end $$;
revoke execute on function public.check_role_scope() from public, anon, authenticated;
create trigger check_role_scope before insert or update of role_id on public.org_members
  for each row execute function public.check_role_scope();
create trigger check_role_scope before insert or update of role_id on public.invites
  for each row execute function public.check_role_scope();

-- 6. Only platform admins write roles
drop policy "members see roles" on public.roles;
drop policy "create roles" on public.roles;
drop policy "edit roles" on public.roles;
drop policy "delete roles" on public.roles;
create policy "everyone sees global roles, members see their org's" on public.roles for select to authenticated
  using (org_id is null or public.is_member(org_id));
create policy "admins create roles" on public.roles for insert to authenticated
  with check (public.is_platform_admin() and not is_owner);
create policy "admins edit roles" on public.roles for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "admins delete roles" on public.roles for delete to authenticated
  using (public.is_platform_admin() and not is_owner);

-- 7. Org creation no longer seeds roles; the creator/owner gets the global owner role
drop function public.create_org(text, text, text[]);
drop function public.admin_create_org(text, text, uuid, text[]);
drop function public.seed_org(text, text, uuid, text[]);

create function public.seed_org(p_name text, p_slug text, p_owner uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  insert into public.orgs (name, slug) values (trim(p_name), lower(trim(p_slug))) returning id into v_org;
  if p_owner is not null then
    insert into public.org_members (org_id, user_id, role_id)
    values (v_org, p_owner, (select id from public.roles where org_id is null and is_owner));
  end if;
  return v_org;
end $$;
revoke execute on function public.seed_org(text, text, uuid) from public, anon, authenticated;

create function public.create_org(p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  return public.seed_org(p_name, p_slug, auth.uid());
end $$;
revoke execute on function public.create_org(text, text) from public, anon;

create function public.admin_create_org(p_name text, p_slug text, p_owner uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'not_allowed'; end if;
  return public.seed_org(p_name, p_slug, p_owner);
end $$;
revoke execute on function public.admin_create_org(text, text, uuid) from public, anon;

-- 8. Invite preview returns the role name in all languages
drop function public.invite_info(text);
create function public.invite_info(p_token text)
returns table (org_name text, email text, role_name jsonb, valid boolean)
language sql stable security definer set search_path = '' as $$
  select o.name, i.email, r.name, i.accepted_at is null and i.expires_at > now()
  from public.invites i
  join public.orgs o on o.id = i.org_id
  join public.roles r on r.id = i.role_id
  where i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;
grant execute on function public.invite_info(text) to anon, authenticated;
