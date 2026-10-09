-- Step 05: integrations. Secrets live in Supabase Vault; tables only hold the vault id.

create table public.org_integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  provider text not null check (provider ~ '^[a-z][a-z0-9_]*$'),
  status text not null default 'connected' check (status in ('connected', 'error', 'revoked')),
  config jsonb not null default '{}',   -- non-secret settings: account id, scopes, …
  secret_id uuid,                        -- vault.secrets.id
  expires_at timestamptz,
  last_error text,
  created_at timestamptz not null, created_by uuid, updated_at timestamptz not null, updated_by uuid,
  unique (org_id, provider)
);
alter table public.org_integrations enable row level security;
select public.enable_audit('public.org_integrations');

revoke all on public.org_integrations from anon;
revoke insert, update, delete on public.org_integrations from authenticated; -- writes via functions below

create policy "managers see integrations" on public.org_integrations for select to authenticated
  using (public.has_perm(org_id, 'org.integrations.manage'));

create function public.save_integration(
  p_org uuid, p_provider text, p_config jsonb, p_secret text default null, p_expires_at timestamptz default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_secret uuid;
  v_id uuid;
begin
  if not (public.has_perm(p_org, 'org.integrations.manage') or auth.role() = 'service_role') then
    raise exception 'Not allowed to manage integrations';
  end if;
  select secret_id into v_secret from public.org_integrations where org_id = p_org and provider = p_provider;
  if p_secret is not null then
    if v_secret is null then
      v_secret := vault.create_secret(p_secret, 'integration:' || p_org || ':' || p_provider);
    else
      perform vault.update_secret(v_secret, p_secret);
    end if;
  end if;
  insert into public.org_integrations (org_id, provider, config, secret_id, expires_at)
  values (p_org, p_provider, coalesce(p_config, '{}'), v_secret, p_expires_at)
  on conflict (org_id, provider) do update
    set config = excluded.config, secret_id = excluded.secret_id, expires_at = excluded.expires_at,
        status = 'connected', last_error = null
  returning id into v_id;
  return v_id;
end $$;

create function public.delete_integration(p_org uuid, p_provider text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_secret uuid;
begin
  if not (public.has_perm(p_org, 'org.integrations.manage') or auth.role() = 'service_role') then
    raise exception 'Not allowed to manage integrations';
  end if;
  delete from public.org_integrations where org_id = p_org and provider = p_provider returning secret_id into v_secret;
  delete from vault.secrets where id = v_secret;
end $$;

-- Server-only: callable with the secret key, never by users.
create function public.get_integration_secret(p_org uuid, p_provider text) returns text
language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret from public.org_integrations i
  join vault.decrypted_secrets s on s.id = i.secret_id
  where i.org_id = p_org and i.provider = p_provider;
$$;

revoke execute on function public.save_integration(uuid, text, jsonb, text, timestamptz) from public, anon;
revoke execute on function public.delete_integration(uuid, text) from public, anon;
revoke execute on function public.get_integration_secret(uuid, text) from public, anon, authenticated;
grant execute on function public.get_integration_secret(uuid, text) to service_role;

-- Webhook inbox: every incoming event once (unique per provider), processed after insert. Server-only.
create table public.integration_events (
  id bigint generated always as identity primary key,
  provider text not null,
  external_id text not null,
  org_id uuid references public.orgs on delete set null,
  type text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts int not null default 0,
  error text,
  unique (provider, external_id)
);
create index integration_events_unprocessed on public.integration_events (received_at) where processed_at is null;
alter table public.integration_events enable row level security;
revoke all on public.integration_events from anon, authenticated;
