-- Numbers for the door's stats bar, in one call: per ticket type expected (valid + used) vs. checked in, what's left
-- to sell; guests let in from permanent lists; tickets sold at the door; seats left in the event. A guest counts as
-- in when their ticket was scanned OR they were ticked off on the list. Service role only (the server checks tickets.scan).
create function public.door_stats(p_event uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with t as (
    select k.type_id, k.status, coalesce(o.metadata->>'door', '') = 'true' as door,
      k.guest_entry_id is not null and exists (select 1 from public.guest_checkins c where c.entry_id = k.guest_entry_id and c.event_id = p_event) as listed_in
    from public.tickets k left join public.pay_orders o on o.id = k.order_id
    where k.event_id = p_event and k.status in ('valid', 'used')
  ), a as (select * from public.ticket_availability(p_event))
  select jsonb_build_object(
    'types', coalesce((
      select jsonb_agg(jsonb_build_object('id', y.id, 'name', y.name,
          'kind', case when y.guest_list_id is not null then 'guests' when y.for_members then 'members' else 'shop' end,
          'expected', (select count(*) from t where t.type_id = y.id),
          'checked_in', (select count(*) from t where t.type_id = y.id and (t.status = 'used' or t.listed_in)),
          'left', (select a.remaining from a where a.type_id = y.id))
        order by y.position, y.created_at)
      from public.ticket_types y
      where y.event_id = p_event and (y.active or exists (select 1 from t where t.type_id = y.id))), '[]'::jsonb),
    'permanent_in', (select count(*) from public.guest_checkins c join public.guest_entries g on g.id = c.entry_id
                     join public.guest_lists l on l.id = g.list_id where c.event_id = p_event and l.event_id is null),
    'door_in', (select count(*) from t where t.door and t.status = 'used'),
    'left', public.event_left(p_event));
$$;
revoke execute on function public.door_stats(uuid) from public, anon, authenticated;
grant execute on function public.door_stats(uuid) to service_role;
