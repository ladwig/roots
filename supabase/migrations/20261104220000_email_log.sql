-- Every mail sendOrgEmail() sends outside the campaign/automation queue (shop, tickets, invoices, portal logins,
-- forms, letters, tests): who, subject, kind, the record it is about, sent or failed. No body. Kept 90 days
-- (the hourly worker deletes older rows). A log, written by the service role only: no audit columns on purpose.
create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  to_email text not null check (length(to_email) <= 1000),
  subject text not null default '' check (length(subject) <= 500),
  kind text not null check (length(kind) <= 60),          -- shop.confirmation, event.ticket, invoice, portal.login, test…
  entity text check (length(entity) <= 60),               -- the record it is about (shop_orders, events, documents, contacts…)
  entity_id uuid,
  status text not null check (status in ('sent', 'failed')),
  error text check (length(error) <= 500),
  created_at timestamptz not null default now()
);
create index email_log_org on public.email_log (org_id, created_at desc);
create index email_log_age on public.email_log (created_at);
alter table public.email_log enable row level security;
revoke all on public.email_log from anon, authenticated;
grant select on public.email_log to authenticated;
create policy "members view mail log" on public.email_log for select to authenticated
  using (public.module_enabled(org_id, 'email') and public.has_perm(org_id, 'email.view'));

-- One history for E-Mail → Versand: queued campaign/automation/workflow sends + the log above, newest first.
-- security_invoker: the tables' own RLS applies to whoever reads it.
create view public.email_history with (security_invoker = on) as
  select s.id, s.org_id, s.to_email, coalesce(c.subject, a.subject, '') as subject,
    case when s.campaign_id is not null then 'campaign' when s.automation_id is not null then 'automation' else 'workflow' end as kind,
    coalesce(c.name, a.name, w.name) as source,
    case when s.campaign_id is not null then 'email_campaigns' when s.automation_id is not null then 'email_automations' else 'workflows' end as entity,
    coalesce(s.campaign_id, s.automation_id, s.workflow_id) as entity_id,
    s.status, s.delivery, s.error, coalesce(s.sent_at, s.send_after) as at
  from public.email_sends s
  left join public.email_campaigns c on c.id = s.campaign_id
  left join public.email_automations a on a.id = s.automation_id
  left join public.workflows w on w.id = s.workflow_id
  union all
  select l.id, l.org_id, l.to_email, l.subject, l.kind, null, l.entity, l.entity_id, l.status, null, l.error, l.created_at
  from public.email_log l;
revoke all on public.email_history from anon;
grant select on public.email_history to authenticated;
