-- Guest lists sit on top of the event's capacity: guest tickets no longer take shop seats, so an org can overbook
-- with its guest list (the shop still sells out at the capacity). Members let in at the door still count.
create or replace function public.event_left(p_event uuid, p_token text default null) returns int
language sql stable security definer set search_path = '' as $$
  select case when e.capacity is null then null else greatest(e.capacity
    - (select count(*) from public.tickets k where k.event_id = e.id and k.guest_entry_id is null and public.ticket_live(k))::int
    - (select coalesce(sum(w.quantity), 0) from public.event_waitlist w
       where w.event_id = e.id and w.status = 'offered' and w.offered_until > now() and w.token is distinct from p_token)::int, 0) end
  from public.events e where e.id = p_event;
$$;

-- Admin view: guest-list types aren't capped by the event's capacity any more.
create or replace function public.ticket_availability(p_event uuid) returns table (type_id uuid, remaining int)
language sql stable security definer set search_path = '' as $$
  select t.id, nullif(least(
    coalesce(greatest(t.quota - (select count(*) from public.tickets k where k.type_id = t.id and public.ticket_live(k))::int, 0), 2147483647),
    case when t.guest_list_id is null then coalesce(public.event_left(p_event), 2147483647) else 2147483647 end), 2147483647)
  from public.ticket_types t where t.event_id = p_event and t.active;
$$;
