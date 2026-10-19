-- Own domains for an org's public pages (tickets.club.de → the org's site), connected through the Vercel Domains API.
-- One domain per org. pending = waiting for the DNS records (and Vercel's TXT check if the domain was used elsewhere);
-- active = resolving to us with a certificate. `records` = what the org has to enter at its DNS provider (from Vercel).
create table public.org_domains (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references public.orgs on delete cascade,
  domain text not null unique check (domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$' and length(domain) <= 253),
  status text not null default 'pending' check (status in ('pending', 'active')),
  records jsonb not null default '[]',          -- [{ type: "CNAME" | "A" | "TXT", name, value }]
  problem text check (length(problem) <= 300),  -- why it isn't live yet, in short (from the last check)
  checked_at timestamptz,
  active_at timestamptz,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index org_domains_pending on public.org_domains (checked_at) where status = 'pending';
select public.enable_audit('public.org_domains');

alter table public.org_domains enable row level security;
revoke all on public.org_domains from anon;
create policy "settings managers see the domain" on public.org_domains for select to authenticated
  using (public.has_perm(org_id, 'org.settings.manage'));
-- Writes only by the server (service role) after Vercel answered: the row must match what Vercel knows.

-- The proxy asks which org a host belongs to (anonymous, before any session): only live domains of live orgs.
create function public.site_for_host(p_host text) returns text
language sql stable security definer set search_path = '' as $$
  select o.slug from public.org_domains d join public.orgs o on o.id = d.org_id
  where d.domain = lower(p_host) and d.status = 'active' and o.deleted_at is null
$$;
revoke execute on function public.site_for_host(text) from public;
grant execute on function public.site_for_host(text) to anon, authenticated;
