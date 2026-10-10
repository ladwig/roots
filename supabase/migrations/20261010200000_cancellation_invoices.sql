-- Stornorechnung: cancelling an issued invoice creates its own document (kind 'cancellation', own number range,
-- negative totals, source_id = the invoice). The invoice can only become 'cancelled' this way.
alter table public.documents drop constraint documents_kind_check;
alter table public.documents add constraint documents_kind_check check (kind in ('quote', 'invoice', 'cancellation'));
alter table public.number_ranges drop constraint number_ranges_kind_check;
alter table public.number_ranges add constraint number_ranges_kind_check check (kind in ('invoice', 'quote', 'cancellation'));

create or replace function public.documents_guard() returns trigger
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
    raise exception 'document_locked';
  end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' and current_setting('roots.cancelling', true) is distinct from 'on' then
    raise exception 'use_cancellation'; -- only cancel_invoice() (creates the Stornorechnung)
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

-- Issue: cancellations need the same seller tax data as invoices and get their own range (default ST-…).
create or replace function public.issue_document(p_id uuid) returns text
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
  if d.kind <> 'quote' and b.tax_number is null and b.vat_id is null then raise exception 'tax_id_missing'; end if;
  if d.recipient_name is null or d.recipient_address is null then raise exception 'recipient_missing'; end if;
  if not exists (select 1 from public.document_items where document_id = d.id) then raise exception 'items_missing'; end if;
  v_date := coalesce(d.issue_date, current_date);
  if d.kind <> 'quote' and d.service_from is null then raise exception 'service_date_missing'; end if;

  insert into public.number_ranges (org_id, kind, format)
    values (d.org_id, d.kind, case d.kind when 'invoice' then 'RE-{YYYY}-{NNNN}' when 'quote' then 'AN-{YYYY}-{NNNN}' else 'ST-{YYYY}-{NNNN}' end)
    on conflict (org_id, kind) do nothing;
  select * into r from public.number_ranges where org_id = d.org_id and kind = d.kind for update;
  v_year := extract(year from v_date);
  v_n := case when r.yearly_reset and r.year is not null and r.year <> v_year then 1 else r.next_number end;
  v_number := public.format_document_number(r.format, v_n, v_date);
  while exists (select 1 from public.documents where org_id = d.org_id and kind = d.kind and number = v_number) loop
    v_n := v_n + 1; v_number := public.format_document_number(r.format, v_n, v_date);
  end loop;
  update public.number_ranges set next_number = v_n + 1, year = v_year where org_id = d.org_id and kind = d.kind;

  perform set_config('roots.issuing', 'on', true);
  update public.documents set status = 'sent', number = v_number, issue_date = v_date, issued_at = now(),
    seller = to_jsonb(b) - 'created_at' - 'created_by' - 'updated_at' - 'updated_by' - 'org_id' - 'id'
    where id = d.id;
  perform set_config('roots.issuing', 'off', true);
  return v_number;
end $$;

-- Cancel an issued invoice: Stornorechnung with the same items and negative totals, then the invoice → cancelled.
create function public.cancel_invoice(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare d public.documents; v_id uuid;
begin
  select * into d from public.documents where id = p_id for update;
  if d.id is null or not public.module_enabled(d.org_id, 'invoices') or not public.has_perm(d.org_id, 'invoices.manage') then
    raise exception 'not_allowed';
  end if;
  if d.kind <> 'invoice' or d.status not in ('sent', 'paid') then raise exception 'invalid_status'; end if;
  insert into public.documents (org_id, kind, source_id, contact_id, recipient_name, recipient_address, recipient_email,
    recipient_vat_id, service_from, service_to, tax_mode, currency, net_total, tax_total, gross_total)
  values (d.org_id, 'cancellation', d.id, d.contact_id, d.recipient_name, d.recipient_address, d.recipient_email,
    d.recipient_vat_id, d.service_from, d.service_to, d.tax_mode, d.currency, -d.net_total, -d.tax_total, -d.gross_total)
  returning id into v_id;
  insert into public.document_items (org_id, document_id, position, title, description, quantity, unit, unit_price, tax_rate)
    select org_id, v_id, position, title, description, quantity, unit, unit_price, tax_rate from public.document_items where document_id = d.id;
  perform public.issue_document(v_id);
  perform set_config('roots.cancelling', 'on', true);
  update public.documents set status = 'cancelled' where id = d.id;
  perform set_config('roots.cancelling', 'off', true);
  return v_id;
end $$;
revoke execute on function public.cancel_invoice(uuid) from public, anon;

-- Event: Stornorechnung issued → invoice.cancelled.
create or replace function public.documents_emit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_type text;
begin
  v_type := case
    when old.status = 'draft' and new.status = 'sent' then case new.kind when 'cancellation' then 'invoice.cancelled' else new.kind || '.issued' end
    when new.kind = 'invoice' and new.status = 'paid' and old.status <> 'paid' then 'invoice.paid'
    when new.kind = 'quote' and new.status = 'accepted' and old.status <> 'accepted' then 'quote.accepted'
  end;
  if v_type is not null then
    perform public.emit_event(new.org_id, v_type, jsonb_build_object('document_id', new.id, 'number', new.number,
      'name', new.recipient_name, 'amount', new.gross_total, 'currency', new.currency), 'documents', new.id::text);
  end if;
  return null;
end $$;
