-- Member check-in at the door. Every member (contact) gets a member code (QR on the card / in the portal). The door
-- scanner looks it up (or the person by name) and shows status, pause, overdue dues and visits; "admit" issues a used,
-- free ticket of the event's member ticket type (created on first use, hidden from the shop), so capacity and reports
-- stay ticket-based. Emits membership.checked_in for workflows (trial visits, DJ vouchers, …).

-- 12 characters (tickets have 10), same alphabet without look-alikes: the length tells the scanner what it is.
create function public.new_member_code() returns text
language sql volatile set search_path = '' as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, n) % 32), 1), '')
  from extensions.gen_random_bytes(12) b, generate_series(0, 11) n;
$$;

alter table public.contacts add column member_code text unique check (member_code ~ '^[A-HJ-NP-Z2-9]{12}$');
alter table public.ticket_types add column for_members boolean not null default false;
create unique index ticket_types_members on public.ticket_types (event_id) where for_members;

-- A membership gives its person a code (kept when they rejoin).
create function public.memberships_member_code() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.contacts set member_code = public.new_member_code() where id = new.contact_id and member_code is null;
  return null;
end $$;
revoke execute on function public.memberships_member_code() from public, anon, authenticated;
create trigger memberships_member_code after insert on public.memberships for each row execute function public.memberships_member_code();

update public.contacts c set member_code = public.new_member_code()
  where c.member_code is null and exists (select 1 from public.memberships m where m.contact_id = c.id);

-- New code (lost card): the old one stops working.
create function public.reset_member_code(p_contact uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_code text := public.new_member_code();
begin
  select org_id into v_org from public.contacts where id = p_contact and deleted_at is null;
  if v_org is null or not public.has_perm(v_org, 'members.manage') then raise exception 'not_allowed'; end if;
  update public.contacts set member_code = v_code where id = p_contact;
  return v_code;
end $$;
revoke execute on function public.reset_member_code(uuid) from public, anon;

-- Look up (p_admit false) or let in (p_admit true) a member by code or contact id.
-- result: invalid (unknown) | not_member | member (looked up) | ok (let in now) | already (in since checked_in_at) | full
create function public.member_door(p_event uuid, p_code text, p_contact uuid default null, p_admit boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_title text; v_today date := (now() at time zone 'Europe/Berlin')::date;
  c record; m record; v_info jsonb; v_in timestamptz; v_type uuid; v_order uuid; v_ticket uuid; v_code text;
begin
  select org_id, title into v_org, v_title from public.events where id = p_event and deleted_at is null;
  if v_org is null or not public.module_enabled(v_org, 'tickets') or not public.module_enabled(v_org, 'members')
     or not public.has_perm(v_org, 'tickets.scan') then
    raise exception 'not_allowed';
  end if;
  select id, first_name, last_name, company, email into c from public.contacts
    where org_id = v_org and deleted_at is null
      and (member_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) or id = p_contact)
    limit 1;
  if c.id is null then return jsonb_build_object('result', 'invalid'); end if;
  -- The current membership, else the latest one.
  select x.id, x.member_no, x.starts_on, x.ends_on, x.paused_from, x.paused_until, y.name as type_name into m
    from public.memberships x join public.membership_types y on y.id = x.type_id
    where x.contact_id = c.id and x.org_id = v_org and x.deleted_at is null
    order by (x.starts_on <= v_today and (x.ends_on is null or x.ends_on >= v_today)) desc, x.starts_on desc
    limit 1;

  perform pg_advisory_xact_lock(hashtext(p_event::text || c.id::text)); -- two scanners, one person
  select k.checked_in_at into v_in from public.tickets k join public.ticket_types y on y.id = k.type_id
    where k.event_id = p_event and k.contact_id = c.id and y.for_members and k.status = 'used' limit 1;

  v_info := jsonb_build_object(
    'contact_id', c.id,
    'name', coalesce(nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''), c.company, c.email),
    'membership_id', m.id, 'member_no', m.member_no, 'type', m.type_name,
    'state', case when m.id is null then 'none' when m.starts_on > v_today then 'upcoming'
                  when m.ends_on < v_today then 'ended' else 'active' end,
    'ends_on', m.ends_on,
    'paused', m.paused_from is not null and m.paused_from <= v_today and (m.paused_until is null or m.paused_until >= v_today),
    'paused_until', m.paused_until,
    'overdue_count', (select count(*) from public.member_dues d where d.membership_id = m.id and d.status = 'open' and d.due_on < v_today),
    'overdue_cents', (select coalesce(sum(d.amount_cents), 0) from public.member_dues d where d.membership_id = m.id and d.status = 'open' and d.due_on < v_today),
    'visits', (select count(*) from public.tickets k join public.ticket_types y on y.id = k.type_id
               where k.contact_id = c.id and k.org_id = v_org and y.for_members and k.status = 'used'),
    'last_visit', (select max(k.checked_in_at) from public.tickets k join public.ticket_types y on y.id = k.type_id
                   where k.contact_id = c.id and k.org_id = v_org and y.for_members and k.status = 'used'),
    'checked_in_at', v_in);

  if m.id is null then return v_info || jsonb_build_object('result', 'not_member'); end if;
  if v_in is not null then return v_info || jsonb_build_object('result', 'already'); end if;
  if not p_admit then return v_info || jsonb_build_object('result', 'member'); end if;
  if public.event_left(p_event) = 0 then return v_info || jsonb_build_object('result', 'full'); end if;

  insert into public.ticket_types (org_id, event_id, name, price, active, for_members)
    values (v_org, p_event, 'Mitglieder', 0, false, true) on conflict do nothing;
  select id into v_type from public.ticket_types where event_id = p_event and for_members;
  -- One free, paid order per visit keeps tickets ↔ orders consistent (like guest-list tickets).
  insert into public.pay_orders (org_id, source_module, source_id, amount_total, status, paid_at, fulfilled_at, customer_name, customer_email, metadata)
    values (v_org, 'members', m.id::text, 0, 'paid', now(), now(), v_info->>'name', c.email, jsonb_build_object('door', true))
    returning id into v_order;
  loop
    v_code := (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, n) % 32), 1), '')
               from extensions.gen_random_bytes(10) b, generate_series(0, 9) n);
    exit when not exists (select 1 from public.tickets where code = v_code);
  end loop;
  insert into public.tickets (org_id, event_id, type_id, order_id, contact_id, code, holder_name, status, price, checked_in_at, checked_in_by)
    values (v_org, p_event, v_type, v_order, c.id, v_code, v_info->>'name', 'used', 0, now(), auth.uid())
    returning id into v_ticket;
  perform public.emit_event(v_org, 'membership.checked_in', jsonb_build_object('contact_id', c.id, 'membership_id', m.id,
    'event_id', p_event, 'name', v_info->>'name', 'number', m.member_no, 'title', v_title, 'visits', (v_info->>'visits')::int + 1),
    'tickets', v_ticket::text);
  return v_info || jsonb_build_object('result', 'ok', 'checked_in_at', now(), 'visits', (v_info->>'visits')::int + 1);
end $$;
revoke execute on function public.member_door(uuid, text, uuid, boolean) from public, anon;
