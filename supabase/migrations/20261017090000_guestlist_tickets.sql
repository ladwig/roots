-- Every guest list of an event gets tickets automatically: its own hidden ticket type ("Gästeliste: <name>", free,
-- not in the shop, like the members' type), so every entry has a QR code, counts against the event's capacity and is
-- scanned like a ticket. Permanent lists (no event) stay name lists. Renaming the list renames the type; moving it to
-- another event voids its tickets there and issues them for the new event; removing the event ends the tickets.
alter table public.ticket_types add column guest_list_id uuid unique references public.guest_lists on delete set null;

-- Guest tickets carry the buyer-page token like shop orders, so the same ticket email (PDF + link) works for them.
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
      values (l.org_id, 'guestlists', l.id::text, 0, 'paid', now(), now(), e.name, e.email, jsonb_build_object('guest_entry', e.id, 'list', l.name, 'ticket_token', encode(extensions.gen_random_bytes(18), 'hex')))
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

create function public.guest_lists_own_type() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_type uuid;
begin
  select id into v_type from public.ticket_types where guest_list_id = new.id;
  if new.event_id is null then
    if v_type is not null then
      update public.tickets set status = 'void' where type_id = v_type and status in ('valid', 'reserved');
      update public.guest_lists set ticket_type_id = null where id = new.id and ticket_type_id = v_type;
    end if;
    return null;
  end if;
  if v_type is null then
    -- Lists linked to a ticket type of their own choice (older lists, API) keep it.
    if new.ticket_type_id is not null then return null; end if;
    insert into public.ticket_types (org_id, event_id, name, price, active, guest_list_id)
      values (new.org_id, new.event_id, left('Gästeliste: ' || new.name, 120), 0, false, new.id) returning id into v_type;
    update public.guest_lists set ticket_type_id = v_type where id = new.id;
  else
    update public.ticket_types set name = left('Gästeliste: ' || new.name, 120) where id = v_type and name is distinct from left('Gästeliste: ' || new.name, 120);
    if tg_op = 'UPDATE' and old.event_id is distinct from new.event_id then
      update public.tickets set status = 'void' where type_id = v_type and status in ('valid', 'reserved');
      update public.ticket_types set event_id = new.event_id where id = v_type;
    end if;
    update public.guest_lists set ticket_type_id = v_type where id = new.id and ticket_type_id is distinct from v_type;
  end if;
  perform public.guest_sync_tickets(new.id);
  return null;
end $$;
revoke execute on function public.guest_lists_own_type() from public, anon, authenticated;
create trigger guest_lists_own_type after insert or update of event_id, name on public.guest_lists
  for each row when (pg_trigger_depth() < 2) execute function public.guest_lists_own_type();

-- Existing event lists without tickets get theirs now.
do $$ declare l record; begin
  for l in select id from public.guest_lists where event_id is not null and ticket_type_id is null and deleted_at is null loop
    update public.guest_lists set name = name where id = l.id;
  end loop;
end $$;

-- Guest orders until now never get an email (only new entries from now on are mailed).
update public.pay_orders set metadata = metadata || jsonb_build_object('mailed_at', now())
  where source_module = 'guestlists' and metadata->>'mailed_at' is null;
