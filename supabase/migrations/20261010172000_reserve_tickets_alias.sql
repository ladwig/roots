-- Fix: the table alias "r" clashed with the loop variable r in reserve_tickets().
create or replace function public.reserve_tickets(p_order uuid, p_event uuid, p_items jsonb, p_minutes int, p_code text default null)
returns setof public.tickets
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  o record;
  r record;
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  select org_id into v_org from public.events where id = p_event and status = 'published' and deleted_at is null;
  if v_org is null then raise exception 'not_on_sale'; end if;
  perform 1 from public.ticket_types where event_id = p_event order by id for update;
  perform 1 from public.ticket_tiers tr join public.ticket_types tt on tt.id = tr.type_id where tt.event_id = p_event order by tr.id for update of tr;
  if p_code is not null then perform 1 from public.ticket_codes where event_id = p_event and code = upper(trim(p_code)) for update; end if;

  for r in select (i->>'type_id')::uuid as type_id, count(*)::int as n from jsonb_array_elements(p_items) i group by 1 loop
    select * into o from public.ticket_offer(p_event, p_code) x where x.type_id = r.type_id;
    if o.type_id is null or (o.sales_start is not null and o.sales_start > now()) or (o.sales_end is not null and o.sales_end < now()) then
      raise exception 'not_on_sale';
    end if;
    if o.remaining is not null and o.remaining < r.n then raise exception 'sold_out'; end if;
  end loop;
  -- Codes with a use limit count every ticket they apply to, across types.
  if p_code is not null and exists (select 1 from public.ticket_codes where event_id = p_event and code = upper(trim(p_code)) and max_uses is not null) then
    if (select count(*) from jsonb_array_elements(p_items) i join public.ticket_offer(p_event, p_code) x on x.type_id = (i->>'type_id')::uuid where x.code_applies)
       > coalesce((select min(x.remaining) from public.ticket_offer(p_event, p_code) x where x.code_applies), 2147483647) then
      raise exception 'sold_out';
    end if;
  end if;

  for r in select i, x.* from jsonb_array_elements(p_items) i join public.ticket_offer(p_event, p_code) x on x.type_id = (i->>'type_id')::uuid loop
    loop
      v_code := (select string_agg(substr(v_alphabet, 1 + (get_byte(b, n) % 32), 1), '')
                 from extensions.gen_random_bytes(10) b, generate_series(0, 9) n);
      exit when not exists (select 1 from public.tickets where code = v_code);
    end loop;
    return query insert into public.tickets (org_id, event_id, type_id, tier_id, code_id, price, order_id, code, holder_name, status, expires_at)
      values (v_org, p_event, r.type_id, r.tier_id, case when r.code_applies then r.code_id end, r.final_price, p_order, v_code,
              nullif(trim(r.i->>'holder_name'), ''), 'reserved', now() + make_interval(mins => p_minutes))
      returning *;
  end loop;
end $$;
