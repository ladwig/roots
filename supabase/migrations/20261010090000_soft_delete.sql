-- Soft delete (see AGENTS.md › Data lifecycle rules). enable_soft_delete() registers a table:
-- deleted rows get deleted_at/deleted_by, are hidden from normal reads (restrictive RLS), can't be edited,
-- are restored via restore_deleted() and purged by purge_deleted() after `purge_days`.
-- Unique constraints are the table's own business: make them partial (`where deleted_at is null`) unless
-- the value must stay reserved while in the trash (e.g. an org's address).

create table public.soft_delete_tables (
  table_name regclass primary key,
  org_column text not null default 'org_id',  -- column holding the org id ('id' for orgs)
  perm text,                                   -- permission to delete/restore/see trash; null = platform admins only
  purge_days int not null default 30 check (purge_days > 0)
);
alter table public.soft_delete_tables enable row level security; -- service role / definer functions only
revoke all on public.soft_delete_tables from anon, authenticated;

create function public.can_see_deleted(p_table regclass, p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or exists (
    select 1 from public.soft_delete_tables s where s.table_name = p_table and s.perm is not null and public.has_perm(p_org, s.perm)
  );
$$;

create function public.enable_soft_delete(p_table regclass, p_org_column text default 'org_id', p_perm text default null, p_purge_days int default 30)
returns void language plpgsql set search_path = '' as $$
begin
  insert into public.soft_delete_tables values (p_table, p_org_column, p_perm, p_purge_days)
  on conflict (table_name) do update set org_column = excluded.org_column, perm = excluded.perm, purge_days = excluded.purge_days;
  execute format('alter table %s add column if not exists deleted_at timestamptz, add column if not exists deleted_by uuid', p_table);
  execute format('create index if not exists %I on %s (deleted_at) where deleted_at is not null', replace(p_table::text, 'public.', '') || '_deleted', p_table);
  execute format('revoke update (deleted_at, deleted_by) on %s from authenticated', p_table);
  -- restrictive: ANDed with the table's normal policies
  execute format('create policy "hide deleted" on %s as restrictive for select to authenticated using (deleted_at is null or public.can_see_deleted(%L, %I))',
    p_table, p_table, p_org_column);
  execute format('create policy "deleted rows are read-only" on %s as restrictive for update to authenticated using (deleted_at is null) with check (true)', p_table);
end $$;
revoke execute on function public.enable_soft_delete(regclass, text, text, int) from public, anon, authenticated;

-- Move to / restore from the trash (permission checked here, per table).
create function public.soft_delete(p_table regclass, p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare cfg public.soft_delete_tables; v_org uuid; n int;
begin
  select * into cfg from public.soft_delete_tables where table_name = p_table;
  if cfg is null then raise exception 'not_allowed'; end if;
  execute format('select %I from %s where id = $1 and deleted_at is null', cfg.org_column, p_table) into v_org using p_id;
  if v_org is null then return false; end if;
  if not (public.is_platform_admin() or (cfg.perm is not null and public.has_perm(v_org, cfg.perm))) then raise exception 'not_allowed'; end if;
  execute format('update %s set deleted_at = now(), deleted_by = auth.uid() where id = $1 and deleted_at is null', p_table) using p_id;
  get diagnostics n = row_count;
  return n > 0;
end $$;

create function public.restore_deleted(p_table regclass, p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare cfg public.soft_delete_tables; v_org uuid; n int;
begin
  select * into cfg from public.soft_delete_tables where table_name = p_table;
  if cfg is null then raise exception 'not_allowed'; end if;
  execute format('select %I from %s where id = $1 and deleted_at is not null', cfg.org_column, p_table) into v_org using p_id;
  if v_org is null then return false; end if;
  if not (public.is_platform_admin() or (cfg.perm is not null and public.has_perm(v_org, cfg.perm))) then raise exception 'not_allowed'; end if;
  execute format('update %s set deleted_at = null, deleted_by = null where id = $1', p_table) using p_id;
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke execute on function public.soft_delete(regclass, uuid), public.restore_deleted(regclass, uuid) from public, anon;

-- Empty the trash (service role, from the cron worker).
create function public.purge_deleted() returns int
language plpgsql security definer set search_path = '' as $$
declare cfg public.soft_delete_tables; n int; total int := 0;
begin
  for cfg in select * from public.soft_delete_tables loop
    execute format('delete from %s where deleted_at < now() - make_interval(days => %s)', cfg.table_name, cfg.purge_days);
    get diagnostics n = row_count;
    total := total + n;
  end loop;
  return total;
end $$;
revoke execute on function public.purge_deleted() from public, anon, authenticated;
grant execute on function public.purge_deleted() to service_role;

-- Orgs: platform admins delete/restore; the address (slug) stays reserved until purged (unique stays full).
select public.enable_soft_delete('public.orgs', 'id', null, 30);

-- A deleted org is gone for its members: every permission check treats it as non-existent
-- (platform admins still see it, to inspect or restore).
create function public.org_alive(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.orgs where id = p_org and deleted_at is null);
$$;

create or replace function public.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (public.request_org() is null or p_org = public.request_org())
    and (public.is_platform_admin()
      or (public.org_alive(p_org) and exists (select 1 from public.org_members where org_id = p_org and user_id = (select auth.uid()))));
$$;

create or replace function public.is_owner(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (public.request_org() is null or p_org = public.request_org())
    and (public.is_platform_admin() or (public.org_alive(p_org) and exists (
      select 1 from public.org_members m join public.roles r on r.id = m.role_id
      where m.org_id = p_org and m.user_id = (select auth.uid()) and r.is_owner
    )));
$$;

create or replace function public.has_perm(p_org uuid, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (public.request_org() is null or p_org = public.request_org())
    and (public.is_platform_admin() or (public.org_alive(p_org) and exists (
      select 1 from public.org_members m join public.roles r on r.id = m.role_id
      where m.org_id = p_org and m.user_id = (select auth.uid())
        and (r.is_owner
          or '*' = any (r.permissions)
          or p_perm = any (r.permissions)
          or split_part(p_perm, '.', 1) || '.*' = any (r.permissions))
    )));
$$;

-- Event deliveries/notifications/routing for a deleted org: nothing new goes out.
create or replace function public.members_with_perm(p_org uuid, p_perm text) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.user_id from public.org_members m join public.roles r on r.id = m.role_id
  where m.org_id = p_org and public.org_alive(p_org) and (r.is_owner or '*' = any (r.permissions) or p_perm = any (r.permissions)
    or split_part(p_perm, '.', 1) || '.*' = any (r.permissions));
$$;
