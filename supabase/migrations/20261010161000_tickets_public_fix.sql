-- anon can't read events.deleted_at, so the "published event" check moves into a definer helper.
create function public.ticket_event_public(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events e where e.id = p_event and e.status = 'published' and e.deleted_at is null
    and public.tickets_public(e.org_id));
$$;
grant execute on function public.ticket_event_public(uuid) to anon, authenticated;
drop policy "public sees ticket types" on public.ticket_types;
create policy "public sees ticket types" on public.ticket_types for select to anon
  using (active and public.ticket_event_public(event_id));
