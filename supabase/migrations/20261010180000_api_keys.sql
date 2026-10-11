-- Public API keys per org. The key itself is shown once; only its SHA-256 hash is stored.
-- A key carries a subset of permissions (same strings as roles: "events.view", "crm.manage", …).
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  prefix text not null check (prefix ~ '^roots_[a-z0-9]{6}$'),     -- shown in lists to recognise the key
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  permissions text[] not null default '{}' check (cardinality(permissions) between 1 and 50),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index api_keys_org on public.api_keys (org_id, created_at desc);
select public.enable_audit('public.api_keys');

alter table public.api_keys enable row level security;
revoke all on public.api_keys from anon;
-- Hash readable by managers is harmless (one-way), but keep it to the server anyway.
revoke select (key_hash) on public.api_keys from authenticated;
create policy "integration managers see keys" on public.api_keys for select to authenticated
  using (public.has_perm(org_id, 'org.integrations.manage'));
create policy "integration managers add keys" on public.api_keys for insert to authenticated
  with check (public.has_perm(org_id, 'org.integrations.manage'));
create policy "integration managers revoke keys" on public.api_keys for update to authenticated
  using (public.has_perm(org_id, 'org.integrations.manage')) with check (public.has_perm(org_id, 'org.integrations.manage'));

-- Server-only lookup for the API: hash → org + permissions (+ enabled modules), touching last_used_at.
create function public.api_key_auth(p_hash text)
returns table (key_id uuid, org_id uuid, permissions text[], modules text[])
language plpgsql security definer set search_path = '' as $$
declare k public.api_keys;
begin
  select * into k from public.api_keys where key_hash = p_hash and revoked_at is null;
  if k.id is null or not public.org_alive(k.org_id) then return; end if;
  update public.api_keys set last_used_at = now() where id = k.id and (last_used_at is null or last_used_at < now() - interval '1 minute');
  return query select k.id, k.org_id, k.permissions,
    coalesce((select array_agg(module_key) from public.org_modules m where m.org_id = k.org_id), '{}');
end $$;
revoke execute on function public.api_key_auth(text) from public, anon, authenticated;
grant execute on function public.api_key_auth(text) to service_role;
