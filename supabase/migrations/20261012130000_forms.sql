-- Forms (module "forms"): org-built forms over platform fields, public at /f/<slug>. A form's purpose decides what a
-- submission does: "contact" creates/updates a contact, "membership" waits for the board to accept it as a member.
-- Elements (ordered jsonb array) are validated in the app (src/forms/elements.ts); the DB keeps them as data.
create table public.forms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  title text not null check (length(title) between 1 and 200),
  slug text not null check (slug ~ '^[a-z0-9]([a-z0-9-]{0,78}[a-z0-9])?$'),
  purpose text not null default 'contact' check (purpose in ('contact', 'membership')),
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  intro text check (length(intro) <= 5000),
  success_text text check (length(success_text) <= 2000),
  elements jsonb not null default '[]' check (jsonb_typeof(elements) = 'array' and jsonb_array_length(elements) <= 100),
  settings jsonb not null default '{}',           -- { tags: [], type_id }
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
select public.enable_audit('public.forms');
select public.enable_soft_delete('public.forms', 'org_id', 'forms.manage', 30);
create unique index forms_org_slug on public.forms (org_id, slug) where deleted_at is null;

create table public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  form_id uuid not null references public.forms on delete cascade,
  data jsonb not null,                            -- { contact, custom, membership, consents }
  email text check (length(email) <= 320),
  status text not null default 'new' check (status in ('new', 'accepted', 'rejected')),
  contact_id uuid references public.contacts on delete set null,
  membership_id uuid references public.memberships on delete set null,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index form_submissions_form on public.form_submissions (form_id, created_at desc);
create index form_submissions_org on public.form_submissions (org_id, status);
select public.enable_audit('public.form_submissions');

alter table public.forms enable row level security;
alter table public.form_submissions enable row level security;
revoke all on public.forms, public.form_submissions from anon;
create policy "members view forms" on public.forms for select to authenticated
  using (public.module_enabled(org_id, 'forms') and public.has_perm(org_id, 'forms.view'));
create policy "managers add forms" on public.forms for insert to authenticated
  with check (public.module_enabled(org_id, 'forms') and public.has_perm(org_id, 'forms.manage'));
create policy "managers edit forms" on public.forms for update to authenticated
  using (public.module_enabled(org_id, 'forms') and public.has_perm(org_id, 'forms.manage'))
  with check (public.module_enabled(org_id, 'forms') and public.has_perm(org_id, 'forms.manage'));
-- Submissions arrive through the public server action (service role, after validation); people only read + decide.
create policy "members view submissions" on public.form_submissions for select to authenticated
  using (public.module_enabled(org_id, 'forms') and public.has_perm(org_id, 'forms.view'));
create policy "managers decide submissions" on public.form_submissions for update to authenticated
  using (public.module_enabled(org_id, 'forms') and public.has_perm(org_id, 'forms.manage'))
  with check (public.module_enabled(org_id, 'forms') and public.has_perm(org_id, 'forms.manage'));
create policy "managers delete submissions" on public.form_submissions for delete to authenticated
  using (public.module_enabled(org_id, 'forms') and public.has_perm(org_id, 'forms.manage'));
revoke update (org_id, form_id, data, email) on public.form_submissions from authenticated;

-- Public read: a published form of a live org with the module on, plus exactly what rendering it needs
-- (custom field definitions it uses, active membership types, SEPA creditor for the mandate text).
create function public.public_form(p_org uuid, p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', f.id, 'title', f.title, 'intro', f.intro, 'purpose', f.purpose, 'elements', f.elements, 'success_text', f.success_text,
    'custom_fields', coalesce((select jsonb_agg(jsonb_build_object('key', c.key, 'label', c.label, 'type', c.type, 'options', c.options))
      from public.custom_fields c where c.org_id = f.org_id and c.entity = 'contacts'
        and exists (select 1 from jsonb_array_elements(f.elements) e where e->>'field' = 'custom.' || c.key)), '[]'),
    'types', case when f.purpose = 'membership' then coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'fee_cents', t.fee_cents, 'interval', t.interval, 'entry_fee_cents', t.entry_fee_cents) order by t.name)
      from public.membership_types t where t.org_id = f.org_id and t.active), '[]') else '[]' end,
    'creditor', case when f.purpose = 'membership' then (select jsonb_build_object('name', s.creditor_name, 'id', s.creditor_id)
      from public.member_settings s where s.org_id = f.org_id) end
  )
  from public.forms f
  where f.org_id = p_org and f.slug = p_slug and f.status = 'published' and f.deleted_at is null
    and public.module_enabled(f.org_id, 'forms') and public.org_alive(f.org_id)
$$;
grant execute on function public.public_form(uuid, text) to anon, authenticated;

-- Event hub: form.submitted
create function public.form_submissions_emit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.emit_event(new.org_id, 'form.submitted', jsonb_build_object('submission_id', new.id, 'form_id', new.form_id,
    'form', (select title from public.forms where id = new.form_id), 'email', new.email,
    'name', nullif(trim(concat_ws(' ', new.data->'contact'->>'first_name', new.data->'contact'->>'last_name')), '')),
    'form_submissions', new.id::text);
  return null;
end $$;
revoke execute on function public.form_submissions_emit() from public, anon, authenticated;
create trigger form_submissions_emit after insert on public.form_submissions for each row execute function public.form_submissions_emit();
