-- Guest list tickets in one place: syncTickets() calls this. Runs per list one at a time (row lock), issues per entry
-- with "on conflict do nothing" (unique live ticket per entry), so a concurrent run never drops other entries' tickets.
-- Missing = no live ticket for the entry (tickets.guest_entry_id), not entries.ticket_id, which is only repaired here.
create or replace function public.guest_sync_tickets(p_list uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare l public.guest_lists; e record; v_order uuid; v_code text; v_ticket uuid; v_n int := 0;
begin
  select * into l from public.guest_lists where id = p_list and deleted_at is null for update;
  if l.id is null or l.ticket_type_id is null or l.event_id is null then return 0; end if;
  update public.tickets t set holder_name = g.name from public.guest_entries g
    where g.list_id = l.id and t.guest_entry_id = g.id and t.status <> 'void' and t.holder_name is distinct from g.name;
  update public.guest_entries g set ticket_id = t.id from public.tickets t
    where g.list_id = l.id and t.guest_entry_id = g.id and t.status <> 'void' and g.ticket_id is distinct from t.id;
  for e in select g.id, g.name, g.email from public.guest_entries g
    where g.list_id = l.id and not exists (select 1 from public.tickets t where t.guest_entry_id = g.id and t.status <> 'void')
    order by g.created_at
  loop
    -- One free, paid order per entry keeps tickets ↔ orders consistent (refunds, buyer page, API).
    insert into public.pay_orders (org_id, source_module, source_id, amount_total, status, paid_at, fulfilled_at, customer_name, customer_email, metadata)
      values (l.org_id, 'guestlists', l.id::text, 0, 'paid', now(), now(), e.name, e.email, jsonb_build_object('guest_entry', e.id, 'list', l.name))
      returning id into v_order;
    loop
      v_code := (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, n) % 32), 1), '')
                 from extensions.gen_random_bytes(10) b, generate_series(0, 9) n);
      exit when not exists (select 1 from public.tickets where code = v_code);
    end loop;
    v_ticket := null;
    insert into public.tickets (org_id, event_id, type_id, order_id, code, holder_name, status, price, guest_entry_id)
      values (l.org_id, l.event_id, l.ticket_type_id, v_order, v_code, e.name, 'valid', 0, e.id)
      on conflict (guest_entry_id) where guest_entry_id is not null and status <> 'void' do nothing
      returning id into v_ticket;
    if v_ticket is null then -- issued meanwhile by an older app version outside this lock: drop our order, keep theirs
      update public.pay_orders set status = 'cancelled' where id = v_order;
      select id into v_ticket from public.tickets where guest_entry_id = e.id and status <> 'void';
    else v_n := v_n + 1;
    end if;
    update public.guest_entries set ticket_id = v_ticket where id = e.id;
  end loop;
  return v_n;
end $$;
revoke execute on function public.guest_sync_tickets(uuid) from public, anon, authenticated;
