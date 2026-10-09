-- Number ranges: the configured start value applies on first use; yearly reset only once a year has passed.
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
  if d.kind = 'invoice' and b.tax_number is null and b.vat_id is null then raise exception 'tax_id_missing'; end if;
  if d.recipient_name is null or d.recipient_address is null then raise exception 'recipient_missing'; end if;
  if not exists (select 1 from public.document_items where document_id = d.id) then raise exception 'items_missing'; end if;
  v_date := coalesce(d.issue_date, current_date);
  if d.kind = 'invoice' and d.service_from is null then raise exception 'service_date_missing'; end if;

  insert into public.number_ranges (org_id, kind, format) values (d.org_id, d.kind, case d.kind when 'invoice' then 'RE-{YYYY}-{NNNN}' else 'AN-{YYYY}-{NNNN}' end)
    on conflict (org_id, kind) do nothing;
  select * into r from public.number_ranges where org_id = d.org_id and kind = d.kind for update;
  v_year := extract(year from v_date);
  v_n := case when r.yearly_reset and r.year is not null and r.year <> v_year then 1 else r.next_number end; -- first use keeps the start value
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
