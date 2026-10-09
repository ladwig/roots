-- Step 04: modules switched on per org. Module definitions (requires, permissions, nav) live in code: src/modules/*.

create table public.org_modules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  module_key text not null check (module_key ~ '^[a-z][a-z0-9_]*$'),
  created_at timestamptz not null, created_by uuid, updated_at timestamptz not null, updated_by uuid,
  unique (org_id, module_key)
);
alter table public.org_modules enable row level security;
select public.enable_audit('public.org_modules');

revoke all on public.org_modules from anon;
revoke update on public.org_modules from authenticated;

create policy "members see modules" on public.org_modules for select to authenticated
  using (public.is_member(org_id));
create policy "enable modules" on public.org_modules for insert to authenticated
  with check (public.has_perm(org_id, 'org.modules.manage'));
create policy "disable modules" on public.org_modules for delete to authenticated
  using (public.has_perm(org_id, 'org.modules.manage'));

-- Use in module table policies: using (module_enabled(org_id, 'events') and has_perm(org_id, 'events.view'))
create function public.module_enabled(p_org uuid, p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_modules where org_id = p_org and module_key = p_key);
$$;
