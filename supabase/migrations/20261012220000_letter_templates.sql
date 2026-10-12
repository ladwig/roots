-- Letter templates (Dateien → Vorlagen): a title + rich-text body with {placeholders} from the contact, membership,
-- org and the template's own extra fields (`fields`: [{ key, label, type: text|date|textarea }]). Filled in the app,
-- downloaded as PDF, saved to the contact's files or sent by email. org_id null = a roots default every org sees;
-- orgs copy a default to change it, or build their own. Validated in the app (src/letters/model.ts).
create table public.letter_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.orgs on delete cascade,
  name text not null check (length(name) between 1 and 120),
  title text not null default '' check (length(title) <= 200),
  body text not null default '' check (length(body) <= 100000),
  fields jsonb not null default '[]' check (jsonb_typeof(fields) = 'array' and jsonb_array_length(fields) <= 20),
  letterhead boolean not null default true,         -- logo, sender line and footer from the invoice settings
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index letter_templates_org on public.letter_templates (org_id);
select public.enable_audit('public.letter_templates');
select public.enable_soft_delete('public.letter_templates', 'org_id', 'org.files.manage', 30);

alter table public.letter_templates enable row level security;
revoke all on public.letter_templates from anon;
create policy "members view templates" on public.letter_templates for select to authenticated
  using (org_id is null or public.has_perm(org_id, 'org.files.view'));
-- Defaults (org_id null) are maintained by migrations only.
create policy "managers add templates" on public.letter_templates for insert to authenticated
  with check (org_id is not null and public.has_perm(org_id, 'org.files.manage'));
create policy "managers edit templates" on public.letter_templates for update to authenticated
  using (org_id is not null and public.has_perm(org_id, 'org.files.manage'))
  with check (org_id is not null and public.has_perm(org_id, 'org.files.manage'));
revoke update (org_id) on public.letter_templates from authenticated;

-- ponytail: defaults are German only; give them a language once orgs can pick theirs.
insert into public.letter_templates (name, title, body, fields) values
(
  'Mitgliedsbescheinigung', 'Mitgliedsbescheinigung',
  '<p>Hiermit bestätigen wir, dass <strong>{name}</strong> seit dem {member_since} Mitglied im {org} ist.</p><p>Mitgliedsnummer: {member_number}<br>Mitgliedsart: {member_type}</p><p>Mit freundlichen Grüßen</p><p>{org}<br>Der Vorstand</p>',
  '[]'
),
(
  'Teilnahmebestätigung', 'Teilnahmebestätigung',
  '<p>Hiermit bestätigen wir, dass <strong>{name}</strong> am {event_date} an der Veranstaltung „{event}“ teilgenommen hat.</p><p>Mit freundlichen Grüßen</p><p>{org}</p>',
  '[{"key": "event", "label": "Veranstaltung", "type": "text"}, {"key": "event_date", "label": "Datum der Veranstaltung", "type": "date"}]'
),
(
  'Kündigungsbestätigung', 'Bestätigung Ihrer Kündigung',
  '<p>Guten Tag {name},</p><p>wir bestätigen den Eingang Ihrer Kündigung. Ihre Mitgliedschaft im {org} endet zum {member_until}.</p><p>Vielen Dank, dass Sie dabei waren.</p><p>Mit freundlichen Grüßen</p><p>{org}</p>',
  '[]'
),
(
  'Brief', '{subject}',
  '<p>Guten Tag {name},</p><p>{text}</p><p>Mit freundlichen Grüßen</p><p>{org}</p>',
  '[{"key": "subject", "label": "Betreff", "type": "text"}, {"key": "text", "label": "Text", "type": "textarea"}]'
);
