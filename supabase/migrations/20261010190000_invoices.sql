-- Quotes & invoices (German rules, § 14 UStG): org legal data, number ranges (assigned gap-free on issue),
-- documents with items. Issued documents are frozen (GoBD): only status changes, corrections via cancellation.

-- Seller data printed on documents (snapshot copied into each document when it is issued).
create table public.org_billing (
  org_id uuid primary key references public.orgs on delete cascade,
  legal_name text check (length(legal_name) <= 200),
  street text check (length(street) <= 200),
  postal_code text check (length(postal_code) <= 20),
  city text check (length(city) <= 100),
  country text not null default 'DE' check (country ~ '^[A-Z]{2}$'),
  email text check (length(email) <= 320),
  phone text check (length(phone) <= 50),
  website text check (length(website) <= 200),
  tax_number text check (length(tax_number) <= 50),          -- Steuernummer
  vat_id text check (vat_id ~ '^[A-Z]{2}[A-Z0-9]{2,13}$'),     -- USt-IdNr
  tax_mode text not null default 'standard' check (tax_mode in ('standard', 'small_business')), -- § 19 UStG
  register text check (length(register) <= 200),             -- e.g. "Amtsgericht Köln, VR 12345"
  representatives text check (length(representatives) <= 300), -- Vorstand / Geschäftsführung / Inhaber:in
  bank_name text check (length(bank_name) <= 100),
  iban text check (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$'),
  bic text check (bic ~ '^[A-Z0-9]{8}([A-Z0-9]{3})?$'),
  payment_days int not null default 14 check (payment_days between 0 and 365),
  quote_days int not null default 30 check (quote_days between 1 and 365),
  invoice_intro text check (length(invoice_intro) <= 5000),
  invoice_outro text check (length(invoice_outro) <= 5000),
  quote_intro text check (length(quote_intro) <= 5000),
  quote_outro text check (length(quote_outro) <= 5000),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
select public.enable_audit('public.org_billing');

-- Number ranges: format tokens {YYYY} {YY} {MM} and {N…} (zero-padded to the number of Ns).
create table public.number_ranges (
  org_id uuid not null references public.orgs on delete cascade,
  kind text not null check (kind in ('invoice', 'quote')),
  format text not null check (format ~ '\{N+\}' and length(format) <= 60),
  next_number int not null default 1 check (next_number >= 1),
  yearly_reset boolean not null default true,
  year int,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  primary key (org_id, kind)
);
select public.enable_audit('public.number_ranges');

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  kind text not null check (kind in ('quote', 'invoice')),
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined', 'paid', 'cancelled')),
  number text check (length(number) <= 60),
  contact_id uuid references public.contacts on delete set null,
  source_id uuid references public.documents on delete set null,        -- invoice made from this quote / cancelled invoice
  title text check (length(title) <= 200),                              -- "Rechnung", "Angebot", or own wording
  recipient_name text check (length(recipient_name) <= 200),
  recipient_address text check (length(recipient_address) <= 500),       -- multi-line
  recipient_email text check (length(recipient_email) <= 320),
  recipient_vat_id text check (length(recipient_vat_id) <= 20),
  issue_date date,
  service_from date,                                                   -- Leistungsdatum / -zeitraum
  service_to date check (service_to >= service_from),
  due_date date,
  valid_until date,
  intro text check (length(intro) <= 5000),
  outro text check (length(outro) <= 5000),
  tax_mode text not null default 'standard' check (tax_mode in ('standard', 'small_business')),
  currency text not null default 'eur' check (currency ~ '^[a-z]{3}$'),
  net_total int not null default 0,
  tax_total int not null default 0,
  gross_total int not null default 0,
  seller jsonb,                                                        -- org_billing snapshot at issue
  issued_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  notes text check (length(notes) <= 5000),                            -- internal, never printed
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  check ((status = 'draft') = (number is null))
);
create unique index documents_number on public.documents (org_id, kind, number) where number is not null;
create index documents_org on public.documents (org_id, kind, created_at desc);
create index documents_contact on public.documents (contact_id);
create index documents_source on public.documents (source_id);
select public.enable_audit('public.documents');

create table public.document_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  document_id uuid not null references public.documents on delete cascade,
  position int not null,
  title text not null check (length(trim(title)) between 1 and 300),
  description text check (length(description) <= 5000),
  quantity numeric(12, 3) not null default 1 check (quantity > 0),
  unit text not null check (length(unit) <= 30),
  unit_price int not null check (unit_price >= 0),                     -- net cents
  tax_rate numeric(4, 2) not null default 0 check (tax_rate >= 0 and tax_rate <= 99),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index document_items_doc on public.document_items (document_id, position);
create index document_items_org on public.document_items (org_id);
select public.enable_audit('public.document_items');

-- RLS: invoices module + invoices.view / invoices.manage.
alter table public.org_billing enable row level security;
alter table public.number_ranges enable row level security;
alter table public.documents enable row level security;
alter table public.document_items enable row level security;
revoke all on public.org_billing, public.number_ranges, public.documents, public.document_items from anon;

create policy "view billing" on public.org_billing for select to authenticated
  using (public.module_enabled(org_id, 'invoices') and public.has_perm(org_id, 'invoices.view'));
create policy "manage billing" on public.org_billing for all to authenticated
  using (public.module_enabled(org_id, 'invoices') and public.has_perm(org_id, 'invoices.manage'))
  with check (public.module_enabled(org_id, 'invoices') and public.has_perm(org_id, 'invoices.manage'));
create policy "view ranges" on public.number_ranges for select to authenticated
  using (public.module_enabled(org_id, 'invoices') and public.has_perm(org_id, 'invoices.view'));
create policy "manage ranges" on public.number_ranges for all to authenticated
  using (public.module_enabled(org_id, 'invoices') and public.has_perm(org_id, 'invoices.manage'))
  with check (public.module_enabled(org_id, 'invoices') and public.has_perm(org_id, 'invoices.manage'));
create policy "view documents" on public.documents for select to authenticated
  using (public.module_enabled(org_id, 'invoices') and public.has_perm(org_id, 'invoices.view'));
create policy "create documents" on public.documents for insert to authenticated
  with check (public.module_enabled(org_id, 'invoices') and public.has_perm(org_id, 'invoices.manage') and status = 'draft');
create policy "edit documents" on public.documents for update to authenticated
  using (public.module_enabled(org_id, 'invoices') and public.has_perm(org_id, 'invoices.manage'))
  with check (public.module_enabled(org_id, 'invoices') and public.has_perm(org_id, 'invoices.manage'));
create policy "delete drafts" on public.documents for delete to authenticated
  using (public.module_enabled(org_id, 'invoices') and public.has_perm(org_id, 'invoices.manage') and status = 'draft');
create policy "view items" on public.document_items for select to authenticated
  using (public.module_enabled(org_id, 'invoices') and public.has_perm(org_id, 'invoices.view'));
create policy "manage draft items" on public.document_items for all to authenticated
  using (public.module_enabled(org_id, 'invoices') and public.has_perm(org_id, 'invoices.manage')
    and exists (select 1 from public.documents d where d.id = document_id and d.status = 'draft'))
  with check (public.module_enabled(org_id, 'invoices') and public.has_perm(org_id, 'invoices.manage')
    and exists (select 1 from public.documents d where d.id = document_id and d.status = 'draft' and d.org_id = document_items.org_id));

-- Frozen after issue: content can't change, numbers can't be set by hand, only these status moves are allowed.
create function public.documents_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status <> 'draft' and (
    (new.kind, new.number, new.contact_id, new.title, new.recipient_name, new.recipient_address, new.recipient_email,
     new.recipient_vat_id, new.issue_date, new.service_from, new.service_to, new.due_date, new.valid_until, new.intro,
     new.outro, new.tax_mode, new.currency, new.net_total, new.tax_total, new.gross_total, new.seller, new.issued_at)
    is distinct from
    (old.kind, old.number, old.contact_id, old.title, old.recipient_name, old.recipient_address, old.recipient_email,
     old.recipient_vat_id, old.issue_date, old.service_from, old.service_to, old.due_date, old.valid_until, old.intro,
     old.outro, old.tax_mode, old.currency, old.net_total, old.tax_total, old.gross_total, old.seller, old.issued_at)
  ) then raise exception 'document_locked'; end if;
  if old.status = 'draft' and new.status <> 'draft' and current_setting('roots.issuing', true) is distinct from 'on' then
    raise exception 'document_locked'; -- only issue_document() leaves draft (assigns the number)
  end if;
  if old.status <> new.status and not (
    (old.status = 'draft') or
    (new.kind = 'invoice' and old.status = 'sent' and new.status in ('paid', 'cancelled')) or
    (new.kind = 'invoice' and old.status = 'paid' and new.status in ('sent', 'cancelled')) or
    (new.kind = 'quote' and old.status = 'sent' and new.status in ('accepted', 'declined')) or
    (new.kind = 'quote' and old.status in ('accepted', 'declined') and new.status = 'sent')
  ) then raise exception 'invalid_status'; end if;
  if new.status = 'paid' and old.status <> 'paid' then new.paid_at := now(); end if;
  if new.status <> 'paid' then new.paid_at := null; end if;
  if new.status = 'cancelled' then new.cancelled_at := now(); end if;
  return new;
end $$;
create trigger documents_guard before update on public.documents for each row execute function public.documents_guard();

-- Next number of a range, formatted. Locks the range row → gap-free, no duplicates.
create function public.format_document_number(p_format text, p_n int, p_date date) returns text
language plpgsql immutable set search_path = '' as $$
declare v text := p_format; m text;
begin
  v := replace(replace(replace(v, '{YYYY}', to_char(p_date, 'YYYY')), '{YY}', to_char(p_date, 'YY')), '{MM}', to_char(p_date, 'MM'));
  m := substring(v from '\{(N+)\}');
  return replace(v, '{' || m || '}', lpad(p_n::text, greatest(length(m), length(p_n::text)), '0'));
end $$;

-- Issue a draft: checks § 14 essentials, assigns the number, freezes the seller data. Raises short codes.
create function public.issue_document(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare d public.documents; b public.org_billing; r public.number_ranges; v_year int; v_n int; v_number text; v_date date;
begin
  select * into d from public.documents where id = p_id for update;
  if d.id is null or not public.module_enabled(d.org_id, 'invoices') or not public.has_perm(d.org_id, 'invoices.manage') then
    raise exception 'not_allowed';
  end if;
  if d.status <> 'draft' then raise exception 'document_locked'; end if;
  select * into b from public.org_billing where org_id = d.org_id;
  if b.org_id is null or b.legal_name is null or b.street is null or b.postal_code is null or b.city is null then
    raise exception 'billing_incomplete';
  end if;
  if d.kind = 'invoice' and b.tax_number is null and b.vat_id is null then raise exception 'tax_id_missing'; end if;
  if d.recipient_name is null or d.recipient_address is null then raise exception 'recipient_missing'; end if;
  if not exists (select 1 from public.document_items where document_id = d.id) then raise exception 'items_missing'; end if;
  v_date := coalesce(d.issue_date, current_date);
  if d.kind = 'invoice' and d.service_from is null then raise exception 'service_date_missing'; end if;

  insert into public.number_ranges (org_id, kind, format) values (d.org_id, d.kind, case d.kind when 'invoice' then 'RE-{YYYY}-{NNNN}' else 'AN-{YYYY}-{NNNN}' end)
    on conflict (org_id, kind) do nothing;
  select * into r from public.number_ranges where org_id = d.org_id and kind = d.kind for update;
  v_year := extract(year from v_date);
  v_n := case when r.yearly_reset and r.year is distinct from v_year then 1 else r.next_number end;
  v_number := public.format_document_number(r.format, v_n, v_date);
  while exists (select 1 from public.documents where org_id = d.org_id and kind = d.kind and number = v_number) loop
    v_n := v_n + 1; v_number := public.format_document_number(r.format, v_n, v_date);
  end loop;
  update public.number_ranges set next_number = v_n + 1, year = v_year where org_id = d.org_id and kind = d.kind;

  perform set_config('roots.issuing', 'on', true);
  update public.documents set status = 'sent', number = v_number, issue_date = v_date, issued_at = now(),
    seller = to_jsonb(b) - 'created_at' - 'created_by' - 'updated_at' - 'updated_by' - 'org_id'
    where id = d.id;
  perform set_config('roots.issuing', 'off', true);
  return v_number;
end $$;
revoke execute on function public.issue_document(uuid) from public, anon;

-- Event hub: invoice issued / paid, quote accepted.
create function public.documents_emit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_type text;
begin
  v_type := case
    when old.status = 'draft' and new.status = 'sent' then new.kind || '.issued'
    when new.kind = 'invoice' and new.status = 'paid' and old.status <> 'paid' then 'invoice.paid'
    when new.kind = 'quote' and new.status = 'accepted' and old.status <> 'accepted' then 'quote.accepted'
  end;
  if v_type is not null then
    perform public.emit_event(new.org_id, v_type, jsonb_build_object('document_id', new.id, 'number', new.number,
      'name', new.recipient_name, 'amount', new.gross_total, 'currency', new.currency), 'documents', new.id::text);
  end if;
  return null;
end $$;
revoke execute on function public.documents_emit() from public, anon, authenticated;
create trigger documents_emit after update on public.documents for each row execute function public.documents_emit();
