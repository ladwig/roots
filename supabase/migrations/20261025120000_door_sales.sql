-- Door sales (Abendkasse): staff at the door sell tickets (any shop type, any price) and free amounts, paid in cash,
-- by QR code (the org's online provider) or on a card terminal. Settings per event in events.door:
-- { methods: ["cash","qr","terminal"], reader_id: "<provider reader id>", cash_account_id: "<cash_accounts.id>" }.
alter table public.events add column door jsonb not null default '{}'
  check (jsonb_typeof(door) = 'object');

-- Door tickets: reserved like shop tickets until the order is paid, but at the price the door charged and without
-- the capacity check (the door may overbook; the screen warns). Service role only (the server checks tickets.scan).
create function public.door_reserve_tickets(p_order uuid, p_event uuid, p_items jsonb, p_minutes int)
returns int
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; r record; v_code text; v_n int := 0;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  select org_id into v_org from public.events where id = p_event and deleted_at is null;
  if v_org is null then raise exception 'not_on_sale'; end if;
  for r in select (i->>'type_id')::uuid as type_id, (i->>'price')::int as price, nullif(trim(i->>'holder_name'), '') as holder
           from jsonb_array_elements(p_items) i loop
    if r.price is null or r.price < 0 or not exists (select 1 from public.ticket_types t where t.id = r.type_id and t.event_id = p_event
        and t.guest_list_id is null and not t.for_members) then
      raise exception 'not_on_sale';
    end if;
    loop
      v_code := (select string_agg(substr(v_alphabet, 1 + (get_byte(b, n) % 32), 1), '')
                 from extensions.gen_random_bytes(10) b, generate_series(0, 9) n);
      exit when not exists (select 1 from public.tickets where code = v_code);
    end loop;
    insert into public.tickets (org_id, event_id, type_id, price, order_id, code, holder_name, status, expires_at)
      values (v_org, p_event, r.type_id, r.price, p_order, v_code, r.holder, 'reserved', now() + make_interval(mins => p_minutes));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.door_reserve_tickets(uuid, uuid, jsonb, int) from public, anon, authenticated;
grant execute on function public.door_reserve_tickets(uuid, uuid, jsonb, int) to service_role;
