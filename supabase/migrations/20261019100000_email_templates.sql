-- Email templates for the mails an event sends on its own (tickets, guest-list tickets, waiting-list offers). One
-- template covers all three: shared placeholders ({name}, {event}, {when}, {message}, {button} …), {message} and
-- {button} carry what the case is about. An org marks one as its default; an event can pick another. Neither set →
-- roots' built-in mail. Module "email"; without it the built-in mail is used.
create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  name text not null check (length(name) between 1 and 200),
  subject text not null check (length(subject) between 1 and 300),
  body text not null check (length(body) between 1 and 200000),
  format text not null default 'rich' check (format in ('text', 'rich', 'html')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  unique (id, org_id) -- target of events' (template, org) reference: an event can only use its own org's template
);
create unique index email_templates_one_default on public.email_templates (org_id) where is_default;
create index email_templates_org on public.email_templates (org_id, name);
select public.enable_audit('public.email_templates');

alter table public.email_templates enable row level security;
revoke all on public.email_templates from anon;
create policy "members view email templates" on public.email_templates for select to authenticated
  using (public.module_enabled(org_id, 'email') and public.has_perm(org_id, 'email.view'));
create policy "managers manage email templates" on public.email_templates for all to authenticated
  using (public.module_enabled(org_id, 'email') and public.has_perm(org_id, 'email.manage'))
  with check (public.module_enabled(org_id, 'email') and public.has_perm(org_id, 'email.manage'));

alter table public.events add column email_template_id uuid;
alter table public.events add constraint events_email_template_fk foreign key (email_template_id, org_id)
  references public.email_templates (id, org_id) on delete set null (email_template_id);
create index events_email_template on public.events (email_template_id) where email_template_id is not null;
