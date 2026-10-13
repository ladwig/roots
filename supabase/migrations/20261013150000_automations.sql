-- Automations (module `automations`): workflows drawn on a canvas, stored as JSON (`graph` = { nodes, edges }).
-- A hub event of the trigger's type starts one run per active workflow (DB trigger below); the minute worker
-- walks the graph (src/automations/engine.ts), executes actions and parks runs on "wait" nodes until resume_at.
-- `trigger_type` is denormalised from the graph's trigger node so starting runs is one indexed lookup.

create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  name text not null check (length(trim(name)) between 1 and 200),
  description text check (length(description) <= 2000),
  active boolean not null default false,
  trigger_type text check (length(trigger_type) <= 100),
  graph jsonb not null default '{"nodes": [], "edges": []}' check (jsonb_typeof(graph) = 'object' and pg_column_size(graph) < 500000),
  deleted_at timestamptz, deleted_by uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index workflows_trigger on public.workflows (org_id, trigger_type) where active and deleted_at is null;
select public.enable_audit('public.workflows');
select public.enable_soft_delete('public.workflows', 'org_id', 'automations.manage', 30);

-- One run per (workflow, event). `node_id` = where the run stands; `context` = trigger payload + collected data.
create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  workflow_id uuid not null references public.workflows on delete cascade,
  event_id bigint references public.hub_events on delete set null,
  contact_id uuid references public.contacts on delete set null,
  status text not null default 'queued' check (status in ('queued', 'running', 'waiting', 'done', 'failed', 'cancelled')),
  node_id text,
  resume_at timestamptz not null default now(),
  context jsonb not null default '{}',
  log jsonb not null default '[]',                                  -- [{ at, node, type, ok, note }]
  error text check (length(error) <= 2000),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  unique (workflow_id, event_id)
);
create index workflow_runs_due on public.workflow_runs (resume_at) where status in ('queued', 'waiting');
create index workflow_runs_workflow on public.workflow_runs (workflow_id, created_at desc);
create index workflow_runs_contact on public.workflow_runs (contact_id);
select public.enable_audit('public.workflow_runs');

alter table public.workflows enable row level security;
alter table public.workflow_runs enable row level security;
revoke all on public.workflows, public.workflow_runs from anon;
create policy "see workflows" on public.workflows for select to authenticated
  using (public.module_enabled(org_id, 'automations') and public.has_perm(org_id, 'automations.view'));
create policy "manage workflows" on public.workflows for all to authenticated
  using (public.module_enabled(org_id, 'automations') and public.has_perm(org_id, 'automations.manage'))
  with check (public.module_enabled(org_id, 'automations') and public.has_perm(org_id, 'automations.manage'));
create policy "see runs" on public.workflow_runs for select to authenticated
  using (public.module_enabled(org_id, 'automations') and public.has_perm(org_id, 'automations.view'));
-- Cancelling a waiting run (status only); runs are written by the worker with the service role.
create policy "cancel runs" on public.workflow_runs for update to authenticated
  using (public.module_enabled(org_id, 'automations') and public.has_perm(org_id, 'automations.manage'))
  with check (public.module_enabled(org_id, 'automations') and public.has_perm(org_id, 'automations.manage') and status = 'cancelled');
revoke update on public.workflow_runs from authenticated;
grant update (status) on public.workflow_runs to authenticated;

-- "Send email" nodes go through the email queue (unsubscribe link, delivery feedback, rendering): a send then
-- comes from a campaign, an email automation or a workflow node.
alter table public.email_sends add column workflow_id uuid references public.workflows on delete cascade,
  add column workflow_node text check (length(workflow_node) <= 64);
alter table public.email_sends drop constraint email_sends_check;
alter table public.email_sends add constraint email_sends_source check (num_nonnulls(campaign_id, automation_id, workflow_id) = 1);

-- New hub event → one queued run per active workflow with that trigger. Events of workflows themselves never
-- start workflows (no loops).
create function public.workflow_runs_start() returns trigger
language plpgsql security definer set search_path = '' as $$
declare w record; v_contact uuid;
begin
  if new.org_id is null or new.type like 'workflow.%' or not public.module_enabled(new.org_id, 'automations') then return null; end if;
  v_contact := case when new.payload->>'contact_id' ~ '^[0-9a-f-]{36}$' then (new.payload->>'contact_id')::uuid end;
  if v_contact is null and nullif(new.payload->>'email', '') is not null then
    select c.id into v_contact from public.contacts c where c.org_id = new.org_id and c.email = lower(new.payload->>'email') and c.deleted_at is null;
  end if;
  for w in select id from public.workflows where org_id = new.org_id and trigger_type = new.type and active and deleted_at is null loop
    insert into public.workflow_runs (org_id, workflow_id, event_id, contact_id, context)
    values (new.org_id, w.id, new.id, v_contact, jsonb_build_object('event', new.type, 'payload', new.payload))
    on conflict (workflow_id, event_id) do nothing;
  end loop;
  return null;
end $$;
revoke execute on function public.workflow_runs_start() from public, anon, authenticated;
create trigger workflow_runs_start after insert on public.hub_events for each row execute function public.workflow_runs_start();

-- Worker: lease due runs (queued, or waiting and due, or stuck in running), like claim_email_sends.
create function public.claim_workflow_runs(p_limit int default 25) returns setof public.workflow_runs
language sql security definer set search_path = '' as $$
  update public.workflow_runs r set status = 'running'
  where r.id in (select id from public.workflow_runs
    where (status in ('queued', 'waiting') and resume_at <= now()) or (status = 'running' and updated_at < now() - interval '10 minutes') -- crashed worker
    order by resume_at limit p_limit for update skip locked)
  returning r.*;
$$;
revoke execute on function public.claim_workflow_runs(int) from public, anon, authenticated;
grant execute on function public.claim_workflow_runs(int) to service_role;

create or replace function public.default_module_keys() returns text[]
language sql immutable set search_path = '' as $$
  select array['crm', 'payments', 'events', 'tickets', 'guestlists', 'invoices', 'shifts', 'members', 'forms', 'email', 'hr', 'courses', 'automations']
$$;
insert into public.org_modules (org_id, module_key) select id, 'automations' from public.orgs on conflict do nothing;
