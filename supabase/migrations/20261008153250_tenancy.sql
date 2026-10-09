-- Step 02: profiles, orgs, roles, members + permission helpers.

-- Profiles mirror auth.users so members can see each other's name/email.
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create function public.sync_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;
revoke execute on function public.sync_profile() from public, anon, authenticated;
create trigger sync_profile after insert or update of email on auth.users
  for each row execute function public.sync_profile();

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name text not null check (length(trim(name)) between 1 and 100),
  settings jsonb not null default '{}',
  created_at timestamptz not null, created_by uuid, updated_at timestamptz not null, updated_by uuid
);

-- A role is a named set of permission strings: exact ('events.manage'), module wildcard ('events.*') or '*'.
-- The owner role (one per org) implicitly has everything and can't be edited.
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  name text not null check (length(trim(name)) between 1 and 50),
  permissions text[] not null default '{}',
  is_owner boolean not null default false,
  created_at timestamptz not null, created_by uuid, updated_at timestamptz not null, updated_by uuid,
  unique (org_id, name),
  unique (id, org_id)
);
create unique index roles_one_owner on public.roles (org_id) where is_owner;

create table public.org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role_id uuid not null,
  created_at timestamptz not null, created_by uuid, updated_at timestamptz not null, updated_by uuid,
  unique (org_id, user_id),
  foreign key (role_id, org_id) references public.roles (id, org_id) -- role must belong to the same org
);
create index org_members_user on public.org_members (user_id);

select public.enable_audit('public.orgs');
select public.enable_audit('public.roles');
select public.enable_audit('public.org_members');

-- Permission helpers (security definer: they read membership without tripping RLS recursion).
create function public.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_members where org_id = p_org and user_id = (select auth.uid()));
$$;

create function public.is_owner(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.org_members m join public.roles r on r.id = m.role_id
    where m.org_id = p_org and m.user_id = (select auth.uid()) and r.is_owner
  );
$$;

create function public.has_perm(p_org uuid, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.org_members m join public.roles r on r.id = m.role_id
    where m.org_id = p_org and m.user_id = (select auth.uid())
      and (r.is_owner
        or '*' = any (r.permissions)
        or p_perm = any (r.permissions)
        or split_part(p_perm, '.', 1) || '.*' = any (r.permissions))
  );
$$;

create function public.shares_org(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.org_members a join public.org_members b on a.org_id = b.org_id
    where a.user_id = (select auth.uid()) and b.user_id = p_user
  );
$$;

-- Only owners may hand out or take away the owner role, and an org always keeps one owner.
-- Deleting a whole org is allowed (see guard_owner_allow_org_delete); there is no delete_org() for users yet.
create function public.guard_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  was_owner boolean := (select is_owner from public.roles where id = old.role_id);
  becomes_owner boolean := tg_op = 'UPDATE' and (select is_owner from public.roles where id = new.role_id);
begin
  if (was_owner or becomes_owner) and auth.uid() is not null and not public.is_owner(old.org_id) then
    raise exception 'Only owners can change who is an owner';
  end if;
  if was_owner and not becomes_owner and not exists (
    select 1 from public.org_members m join public.roles r on r.id = m.role_id
    where m.org_id = old.org_id and r.is_owner and m.id <> old.id
  ) then
    raise exception 'An organisation needs at least one owner';
  end if;
  return coalesce(new, old);
end $$;
create trigger guard_owner before update of role_id or delete on public.org_members
  for each row execute function public.guard_owner();

-- Creating an org seeds its roles and makes the caller owner.
create function public.create_org(p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_owner uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into public.orgs (name, slug) values (trim(p_name), lower(trim(p_slug))) returning id into v_org;
  insert into public.roles (org_id, name, is_owner) values (v_org, 'Owner', true) returning id into v_owner;
  insert into public.roles (org_id, name, permissions) values
    (v_org, 'Admin', '{*}'),
    (v_org, 'Member', '{}'),
    (v_org, 'Door staff', '{tickets.scan}');
  insert into public.org_members (org_id, user_id, role_id) values (v_org, auth.uid(), v_owner);
  return v_org;
end $$;

-- Grants: anon gets nothing; authenticated only the columns it may change.
revoke all on public.profiles, public.orgs, public.roles, public.org_members, public.audit_log from anon;
revoke insert, update, delete on public.audit_log from authenticated;
revoke update on public.profiles, public.orgs, public.roles, public.org_members from authenticated;
grant update (full_name) on public.profiles to authenticated;
grant update (name, settings) on public.orgs to authenticated;
grant update (name, permissions) on public.roles to authenticated;
grant update (role_id) on public.org_members to authenticated;
revoke insert on public.orgs, public.org_members, public.profiles from authenticated; -- via create_org / accept_invite only
revoke execute on function public.create_org(text, text) from public, anon;
revoke execute on function public.guard_owner() from public, anon, authenticated;

-- Policies
create policy "see self and co-members" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_org(id));
create policy "edit own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid()));

create policy "members see org" on public.orgs for select to authenticated
  using (public.is_member(id));
create policy "manage org settings" on public.orgs for update to authenticated
  using (public.has_perm(id, 'org.settings.manage'));

create policy "members see roles" on public.roles for select to authenticated
  using (public.is_member(org_id));
create policy "create roles" on public.roles for insert to authenticated
  with check (public.has_perm(org_id, 'org.roles.manage') and not is_owner);
create policy "edit roles" on public.roles for update to authenticated
  using (public.has_perm(org_id, 'org.roles.manage') and not is_owner);
create policy "delete roles" on public.roles for delete to authenticated
  using (public.has_perm(org_id, 'org.roles.manage') and not is_owner);

create policy "members see members" on public.org_members for select to authenticated
  using (public.is_member(org_id));
create policy "change member role" on public.org_members for update to authenticated
  using (public.has_perm(org_id, 'org.members.manage'))
  with check (public.has_perm(org_id, 'org.members.manage'));
create policy "remove member or leave" on public.org_members for delete to authenticated
  using (public.has_perm(org_id, 'org.members.manage') or user_id = (select auth.uid()));

create policy "view activity" on public.audit_log for select to authenticated
  using (public.has_perm(org_id, 'org.audit.view'));

insert into public.profiles (id, email, full_name)
select id, email, raw_user_meta_data ->> 'full_name' from auth.users
on conflict do nothing;
