-- SEPA creditor data belongs to the members module (orgs may use it without the invoices module).
alter table public.org_billing drop column sepa_creditor_id;

create table public.member_settings (
  id uuid not null default gen_random_uuid() unique, -- audit log needs an id
  org_id uuid primary key references public.orgs on delete cascade,
  creditor_name text check (length(creditor_name) <= 70),
  creditor_id text check (creditor_id ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{3}[A-Z0-9]{1,28}$'), -- Gläubiger-ID
  iban text check (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$'),
  bic text check (bic ~ '^[A-Z0-9]{8}([A-Z0-9]{3})?$'),
  due_day int not null default 15 check (due_day between 1 and 28), -- day of the period's first month dues fall due
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
select public.enable_audit('public.member_settings');
alter table public.member_settings enable row level security;
revoke all on public.member_settings from anon;
create policy "members view settings" on public.member_settings for select to authenticated
  using (public.module_enabled(org_id, 'members') and public.has_perm(org_id, 'members.view'));
create policy "managers edit settings" on public.member_settings for all to authenticated
  using (public.module_enabled(org_id, 'members') and public.has_perm(org_id, 'members.manage'))
  with check (public.module_enabled(org_id, 'members') and public.has_perm(org_id, 'members.manage'));
