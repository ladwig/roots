-- Customer portal: people (contacts) sign in to one org's portal with a magic link, no roots account.
-- Technical rows (like event deliveries): no audit trail, hard delete, only server code (service role) touches them.
create table public.portal_tokens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  contact_id uuid not null references public.contacts on delete cascade,
  token_hash text not null unique,
  kind text not null check (kind in ('login', 'session')),
  expires_at timestamptz not null,
  used_at timestamptz,                 -- login links work once
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index portal_tokens_expiry on public.portal_tokens (expires_at);
alter table public.portal_tokens enable row level security;
revoke all on public.portal_tokens from anon, authenticated;
-- no policies: only the service role (portal server code) reads and writes

-- Expired tokens go with the trash purge.
create or replace function public.purge_portal_tokens() returns int
language sql security definer set search_path = '' as $$
  with d as (delete from public.portal_tokens where expires_at < now() - interval '1 day' returning 1) select count(*)::int from d;
$$;
revoke execute on function public.purge_portal_tokens() from public, anon, authenticated;
grant execute on function public.purge_portal_tokens() to service_role;
