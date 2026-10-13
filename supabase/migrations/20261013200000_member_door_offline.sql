-- Member check-in, round two:
-- * the member number works at the door too (typed or on a QR), besides the card code
-- * a full event no longer blocks: the door sees `full` and decides
-- * member_door_list(): the event's member list for scanners that check offline (same rows as the lookup)

-- One row per person with a membership in the org: what the door sees. Internal; callers check permissions.
create function public.member_door_rows(p_org uuid, p_event uuid, p_contact uuid default null) returns setof jsonb
language sql stable security definer set search_path = '' as $$
  with t as (select (now() at time zone 'Europe/Berlin')::date as d),
  cur as (
    select distinct on (x.contact_id) x.id, x.contact_id, x.member_no, x.starts_on, x.ends_on, x.paused_from, x.paused_until, y.name as type_name
    from public.memberships x join public.membership_types y on y.id = x.type_id cross join t
    where x.org_id = p_org and x.deleted_at is null and (p_contact is null or x.contact_id = p_contact)
    order by x.contact_id, (x.starts_on <= t.d and (x.ends_on is null or x.ends_on >= t.d)) desc, x.starts_on desc),
  v as (
    select k.contact_id, count(*) as n, max(k.checked_in_at) as last_visit, max(k.checked_in_at) filter (where k.event_id = p_event) as here
    from public.tickets k join public.ticket_types y on y.id = k.type_id
    where k.org_id = p_org and y.for_members and k.status = 'used' and (p_contact is null or k.contact_id = p_contact)
    group by 1),
  d as (
    select u.membership_id, count(*) as n, sum(u.amount_cents) as cents
    from public.member_dues u cross join t
    where u.org_id = p_org and u.status = 'open' and u.due_on < t.d
    group by 1)
  select jsonb_build_object(
    'contact_id', c.id, 'code', c.member_code,
    'number', nullif(upper(regexp_replace(coalesce(cur.member_no, ''), '[^A-Za-z0-9]', '', 'g')), ''),
    'name', coalesce(nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''), c.company, c.email),
    'membership_id', cur.id, 'member_no', cur.member_no, 'type', cur.type_name,
    'state', case when cur.starts_on > t.d then 'upcoming' when cur.ends_on < t.d then 'ended' else 'active' end,
    'ends_on', cur.ends_on,
    'paused', coalesce(cur.paused_from <= t.d and (cur.paused_until is null or cur.paused_until >= t.d), false),
    'paused_until', cur.paused_until,
    'overdue_count', coalesce(d.n, 0), 'overdue_cents', coalesce(d.cents, 0),
    'visits', coalesce(v.n, 0), 'last_visit', v.last_visit, 'checked_in_at', v.here)
  from cur join public.contacts c on c.id = cur.contact_id and c.deleted_at is null cross join t
  left join v on v.contact_id = c.id left join d on d.membership_id = cur.id;
$$;
revoke execute on function public.member_door_rows(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.member_door(p_event uuid, p_code text, p_contact uuid default null, p_admit boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_title text; v_q text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  c record; v_info jsonb; v_type uuid; v_order uuid; v_ticket uuid; v_code text;
begin
  select org_id, title into v_org, v_title from public.events where id = p_event and deleted_at is null;
  if v_org is null or not public.module_enabled(v_org, 'tickets') or not public.module_enabled(v_org, 'members')
     or not public.has_perm(v_org, 'tickets.scan') then
    raise exception 'not_allowed';
  end if;
  -- Card code, else member number (rejoining keeps it), else the picked person.
  select x.id, x.first_name, x.last_name, x.company, x.email into c from public.contacts x
    where x.org_id = v_org and x.deleted_at is null
      and (x.id = p_contact or (v_q <> '' and (x.member_code = v_q or exists (
        select 1 from public.memberships m where m.contact_id = x.id and m.org_id = v_org and m.deleted_at is null
          and upper(regexp_replace(coalesce(m.member_no, ''), '[^A-Za-z0-9]', '', 'g')) = v_q))))
    order by (x.member_code = v_q) desc nulls last
    limit 1;
  if c.id is null then return jsonb_build_object('result', 'invalid'); end if;

  perform pg_advisory_xact_lock(hashtext(p_event::text || c.id::text)); -- two scanners, one person
  select r into v_info from public.member_door_rows(v_org, p_event, c.id) r;
  if v_info is null then
    return jsonb_build_object('result', 'not_member', 'contact_id', c.id,
      'name', coalesce(nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''), c.company, c.email));
  end if;
  v_info := v_info || jsonb_build_object('full', coalesce(public.event_left(p_event) = 0, false));
  if v_info->>'checked_in_at' is not null then return v_info || jsonb_build_object('result', 'already'); end if;
  if not p_admit then return v_info || jsonb_build_object('result', 'member'); end if;

  insert into public.ticket_types (org_id, event_id, name, price, active, for_members)
    values (v_org, p_event, 'Mitglieder', 0, false, true) on conflict do nothing;
  select id into v_type from public.ticket_types where event_id = p_event and for_members;
  -- One free, paid order per visit keeps tickets ↔ orders consistent (like guest-list tickets).
  insert into public.pay_orders (org_id, source_module, source_id, amount_total, status, paid_at, fulfilled_at, customer_name, customer_email, metadata)
    values (v_org, 'members', v_info->>'membership_id', 0, 'paid', now(), now(), v_info->>'name', c.email, jsonb_build_object('door', true))
    returning id into v_order;
  loop
    v_code := (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, n) % 32), 1), '')
               from extensions.gen_random_bytes(10) b, generate_series(0, 9) n);
    exit when not exists (select 1 from public.tickets where code = v_code);
  end loop;
  insert into public.tickets (org_id, event_id, type_id, order_id, contact_id, code, holder_name, status, price, checked_in_at, checked_in_by)
    values (v_org, p_event, v_type, v_order, c.id, v_code, v_info->>'name', 'used', 0, now(), auth.uid())
    returning id into v_ticket;
  perform public.emit_event(v_org, 'membership.checked_in', jsonb_build_object('contact_id', c.id, 'membership_id', v_info->>'membership_id',
    'event_id', p_event, 'name', v_info->>'name', 'number', v_info->>'member_no', 'title', v_title, 'visits', (v_info->>'visits')::int + 1),
    'tickets', v_ticket::text);
  return v_info || jsonb_build_object('result', 'ok', 'checked_in_at', now(), 'visits', (v_info->>'visits')::int + 1);
end $$;

-- Offline scanning: every member of the event's org with what the door sees (codes included, like the ticket list).
create function public.member_door_list(p_event uuid) returns setof jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  select org_id into v_org from public.events where id = p_event and deleted_at is null;
  if v_org is null or not public.module_enabled(v_org, 'tickets') or not public.module_enabled(v_org, 'members')
     or not public.has_perm(v_org, 'tickets.scan') then
    raise exception 'not_allowed';
  end if;
  return query select r from public.member_door_rows(v_org, p_event) r;
end $$;
revoke execute on function public.member_door_list(uuid) from public, anon;
