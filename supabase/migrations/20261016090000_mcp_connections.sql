-- AI connectors (Claude via MCP, OAuth by Supabase Auth's OAuth 2.1 server): one row per person + OAuth client =
-- which org the connection works in and how much it may do ('me' = the person's own rights, 'read' = only *.view).
-- The MCP route only accepts a token whose (user, client_id) has a row here, so deleting the row cuts the
-- connection off at once (even while its access token is still valid). Data access itself runs with the person's
-- own session + x-org-id, so RLS applies exactly as in the App.
create table public.mcp_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  client_id text not null check (length(client_id) between 1 and 200),
  client_name text not null default '' check (length(client_name) <= 200),
  access text not null default 'me' check (access in ('me', 'read')),
  last_used_at timestamptz,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  unique (user_id, client_id)
);
create index mcp_connections_org on public.mcp_connections (org_id);
select public.enable_audit('public.mcp_connections');

alter table public.mcp_connections enable row level security;
revoke all on public.mcp_connections from anon;
-- Everyone manages their own connections (only for orgs they belong to); org admins see and remove the org's.
create policy "own connections" on public.mcp_connections for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_member(org_id));
create policy "org connections" on public.mcp_connections for select to authenticated
  using (public.has_perm(org_id, 'org.integrations.manage'));
create policy "remove org connections" on public.mcp_connections for delete to authenticated
  using (public.has_perm(org_id, 'org.integrations.manage'));
