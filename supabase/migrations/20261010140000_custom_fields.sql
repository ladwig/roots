-- Custom fields (generic): orgs define extra fields per entity ('contacts', later 'events', 'tickets'…).
-- Definitions live here; values live in the entity's `custom jsonb` column ({ "<key>": value }).
-- Validation happens in src/lib/custom-fields.ts (forms, CSV import, API share it).
create table public.custom_fields (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  entity text not null check (entity in ('contacts')),
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null check (length(trim(label)) between 1 and 100),
  type text not null check (type in ('text', 'number', 'date', 'boolean', 'select', 'email', 'url')),
  options text[] not null default '{}' check (cardinality(options) <= 100),   -- for 'select'
  required boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  unique (org_id, entity, key)
);
select public.enable_audit('public.custom_fields');

alter table public.custom_fields enable row level security;
revoke all on public.custom_fields from anon;
-- Every member may read definitions (forms need them); org settings managers define them.
create policy "members see custom fields" on public.custom_fields for select to authenticated using (public.is_member(org_id));
create policy "settings managers add custom fields" on public.custom_fields for insert to authenticated
  with check (public.has_perm(org_id, 'org.settings.manage'));
create policy "settings managers edit custom fields" on public.custom_fields for update to authenticated
  using (public.has_perm(org_id, 'org.settings.manage')) with check (public.has_perm(org_id, 'org.settings.manage'));
create policy "settings managers delete custom fields" on public.custom_fields for delete to authenticated
  using (public.has_perm(org_id, 'org.settings.manage'));

alter table public.contacts add column custom jsonb not null default '{}'
  check (jsonb_typeof(custom) = 'object' and pg_column_size(custom) < 20000);

-- contact.created per single insert; one contacts.imported per bulk insert (CSV import), so an import of
-- 2,000 rows doesn't send 2,000 webhooks / Telegram messages.
drop trigger contacts_emit on public.contacts;
drop function public.contacts_emit();
create function public.contacts_emit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record; n int;
begin
  select count(*) into n from inserted;
  if n = 1 then
    select * into r from inserted;
    perform public.emit_event(r.org_id, 'contact.created', jsonb_build_object('contact_id', r.id,
      'name', nullif(trim(concat_ws(' ', r.first_name, r.last_name)), ''), 'company', r.company, 'email', r.email, 'tags', r.tags),
      'contacts', r.id::text);
  elsif n > 1 then
    for r in select org_id, count(*) as cnt from inserted group by org_id loop
      perform public.emit_event(r.org_id, 'contacts.imported', jsonb_build_object('count', r.cnt), 'contacts', null);
    end loop;
  end if;
  return null;
end $$;
revoke execute on function public.contacts_emit() from public, anon, authenticated;
create trigger contacts_emit after insert on public.contacts
  referencing new table as inserted for each statement execute function public.contacts_emit();
