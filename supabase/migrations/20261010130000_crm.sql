-- CRM: an org's contacts (members, customers, artists, partners…) with tags and notes.
-- Other modules (tickets, guest lists, newsletter) link to contacts.id later.
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  first_name text check (length(first_name) <= 100),
  last_name text check (length(last_name) <= 100),
  company text check (length(company) <= 200),
  email text check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and email = lower(email) and length(email) <= 320),
  phone text check (length(phone) <= 50),
  street text check (length(street) <= 200),
  postal_code text check (length(postal_code) <= 20),
  city text check (length(city) <= 100),
  country text check (country ~ '^[A-Z]{2}$'),
  birthday date,
  -- ponytail: tags as a text array (GIN, filter with @>); a tags table once tags need colors/descriptions.
  tags text[] not null default '{}' check (cardinality(tags) <= 50),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  check (coalesce(first_name, last_name, company, email) is not null)
);
create index contacts_org_name on public.contacts (org_id, last_name, first_name);
create index contacts_tags on public.contacts using gin (tags);
select public.enable_audit('public.contacts');
select public.enable_soft_delete('public.contacts', 'org_id', 'crm.manage', 30);
-- One live contact per email per org (a deleted contact's email can be used again).
create unique index contacts_org_email on public.contacts (org_id, email) where deleted_at is null and email is not null;

alter table public.contacts enable row level security;
revoke all on public.contacts from anon;
create policy "members view contacts" on public.contacts for select to authenticated
  using (public.module_enabled(org_id, 'crm') and public.has_perm(org_id, 'crm.view'));
create policy "managers create contacts" on public.contacts for insert to authenticated
  with check (public.module_enabled(org_id, 'crm') and public.has_perm(org_id, 'crm.manage'));
create policy "managers edit contacts" on public.contacts for update to authenticated
  using (public.module_enabled(org_id, 'crm') and public.has_perm(org_id, 'crm.manage'))
  with check (public.module_enabled(org_id, 'crm') and public.has_perm(org_id, 'crm.manage'));
-- no delete policy: soft_delete() / purge only

-- Notes on a contact (the contact's timeline). Hard delete; the change log keeps a copy.
create table public.contact_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  contact_id uuid not null references public.contacts on delete cascade,
  body text not null check (length(trim(body)) between 1 and 10000),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index contact_notes_contact on public.contact_notes (contact_id, created_at desc);
create index contact_notes_org on public.contact_notes (org_id);
select public.enable_audit('public.contact_notes');

alter table public.contact_notes enable row level security;
revoke all on public.contact_notes from anon;
create policy "members view notes" on public.contact_notes for select to authenticated
  using (public.module_enabled(org_id, 'crm') and public.has_perm(org_id, 'crm.view'));
-- The note's org must be the contact's org.
create policy "managers add notes" on public.contact_notes for insert to authenticated
  with check (public.module_enabled(org_id, 'crm') and public.has_perm(org_id, 'crm.manage')
    and exists (select 1 from public.contacts c where c.id = contact_id and c.org_id = contact_notes.org_id));
create policy "managers delete notes" on public.contact_notes for delete to authenticated
  using (public.module_enabled(org_id, 'crm') and public.has_perm(org_id, 'crm.manage'));

-- Event hub: contact.created → webhooks, Telegram, Zapier…
create function public.contacts_emit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.emit_event(new.org_id, 'contact.created', jsonb_build_object('contact_id', new.id,
    'name', nullif(trim(concat_ws(' ', new.first_name, new.last_name)), ''), 'company', new.company, 'email', new.email, 'tags', new.tags),
    'contacts', new.id::text);
  return null;
end $$;
revoke execute on function public.contacts_emit() from public, anon, authenticated;
create trigger contacts_emit after insert on public.contacts for each row execute function public.contacts_emit();
