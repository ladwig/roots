-- Email (module "email"): campaigns (newsletters to tags / members), automations (a hub event + delay → one email
-- to the contact it is about; several steps on the same event = a sequence), and one queue (email_sends) that the
-- worker sends in batches through the org's email provider. Contacts can unsubscribe from campaigns + automations.
alter table public.contacts add column unsubscribed_at timestamptz;

create table public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  name text not null check (length(name) between 1 and 200),
  subject text not null default '' check (length(subject) <= 300),
  body text not null default '' check (length(body) <= 50000),
  audience jsonb not null default '{}',          -- { tags: [], members: "active" | null }
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent')),
  send_at timestamptz,
  recipients int not null default 0,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index email_campaigns_org on public.email_campaigns (org_id, created_at desc);
select public.enable_audit('public.email_campaigns');
select public.enable_soft_delete('public.email_campaigns', 'org_id', 'email.manage', 30);

create table public.email_automations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  name text not null check (length(name) between 1 and 200),
  event_type text not null check (event_type ~ '^[a-z_]+\.[a-z_]+$'),
  delay_minutes int not null default 0 check (delay_minutes between 0 and 525600),
  subject text not null check (length(subject) between 1 and 300),
  body text not null check (length(body) between 1 and 50000),
  active boolean not null default false,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index email_automations_trigger on public.email_automations (org_id, event_type) where active;
select public.enable_audit('public.email_automations');

-- The queue + log. Rendering happens at send time (placeholders from the contact + event payload).
create table public.email_sends (
  id uuid primary key default gen_random_uuid(),       -- also the unsubscribe token in the email's link
  org_id uuid not null references public.orgs on delete cascade,
  campaign_id uuid references public.email_campaigns on delete cascade,
  automation_id uuid references public.email_automations on delete cascade,
  contact_id uuid references public.contacts on delete set null,
  to_email text not null check (length(to_email) <= 320),
  vars jsonb not null default '{}',                    -- event payload for automations
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  send_after timestamptz not null default now(),
  sent_at timestamptz,
  error text check (length(error) <= 500),
  created_at timestamptz not null default now(),
  check ((campaign_id is null) <> (automation_id is null))
);
create unique index email_sends_campaign_once on public.email_sends (campaign_id, to_email) where campaign_id is not null;
create index email_sends_queue on public.email_sends (send_after) where status = 'queued';
create index email_sends_org on public.email_sends (org_id, created_at desc);

alter table public.email_campaigns enable row level security;
alter table public.email_automations enable row level security;
alter table public.email_sends enable row level security;
revoke all on public.email_campaigns, public.email_automations, public.email_sends from anon;
create policy "members view campaigns" on public.email_campaigns for select to authenticated
  using (public.module_enabled(org_id, 'email') and public.has_perm(org_id, 'email.view'));
create policy "managers add campaigns" on public.email_campaigns for insert to authenticated
  with check (public.module_enabled(org_id, 'email') and public.has_perm(org_id, 'email.manage'));
create policy "managers edit campaigns" on public.email_campaigns for update to authenticated
  using (public.module_enabled(org_id, 'email') and public.has_perm(org_id, 'email.manage'))
  with check (public.module_enabled(org_id, 'email') and public.has_perm(org_id, 'email.manage'));
create policy "members view automations" on public.email_automations for select to authenticated
  using (public.module_enabled(org_id, 'email') and public.has_perm(org_id, 'email.view'));
create policy "managers manage automations" on public.email_automations for all to authenticated
  using (public.module_enabled(org_id, 'email') and public.has_perm(org_id, 'email.manage'))
  with check (public.module_enabled(org_id, 'email') and public.has_perm(org_id, 'email.manage'));
create policy "members view sends" on public.email_sends for select to authenticated
  using (public.module_enabled(org_id, 'email') and public.has_perm(org_id, 'email.view'));
-- Sends are written by the app's server code (campaign queueing with the user's client, automations by trigger,
-- the worker with the service role).
create policy "managers queue sends" on public.email_sends for insert to authenticated
  with check (public.module_enabled(org_id, 'email') and public.has_perm(org_id, 'email.manage') and campaign_id is not null);

-- Automations: a new hub event about a contact queues one email per matching active automation (after its delay).
create function public.email_automations_queue() returns trigger
language plpgsql security definer set search_path = '' as $$
declare a record; v_contact uuid; v_email text;
begin
  if new.org_id is null or not public.module_enabled(new.org_id, 'email') then return null; end if;
  for a in select * from public.email_automations where org_id = new.org_id and event_type = new.type and active loop
    v_contact := case when new.payload->>'contact_id' ~ '^[0-9a-f-]{36}$' then (new.payload->>'contact_id')::uuid end;
    if v_contact is not null then
      select c.email into v_email from public.contacts c where c.id = v_contact and c.org_id = new.org_id and c.deleted_at is null and c.unsubscribed_at is null;
    else
      v_email := nullif(lower(new.payload->>'email'), '');
      select c.id into v_contact from public.contacts c where c.org_id = new.org_id and c.email = v_email and c.deleted_at is null;
      if exists (select 1 from public.contacts c where c.id = v_contact and c.unsubscribed_at is not null) then v_email := null; end if;
    end if;
    if v_email is not null then
      insert into public.email_sends (org_id, automation_id, contact_id, to_email, vars, send_after)
      values (new.org_id, a.id, v_contact, v_email, new.payload, now() + make_interval(mins => a.delay_minutes));
    end if;
  end loop;
  return null;
end $$;
revoke execute on function public.email_automations_queue() from public, anon, authenticated;
create trigger email_automations_queue after insert on public.hub_events for each row execute function public.email_automations_queue();

-- Worker: take a batch of due sends (lease by status), like claim_event_deliveries.
create function public.claim_email_sends(p_limit int default 50) returns setof public.email_sends
language sql security definer set search_path = '' as $$
  update public.email_sends s set status = 'sending'
  where s.id in (select id from public.email_sends where status = 'queued' and send_after <= now() order by send_after limit p_limit for update skip locked)
  returning s.*;
$$;
revoke execute on function public.claim_email_sends(int) from public, anon, authenticated;
grant execute on function public.claim_email_sends(int) to service_role;
