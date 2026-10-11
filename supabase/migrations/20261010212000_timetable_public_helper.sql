-- anon can't read events.deleted_at: "is this event publicly visible" as a definer helper for the timetable policies.
create function public.event_visible(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events e where e.id = p_event and e.status in ('published', 'cancelled')
    and e.deleted_at is null and public.events_public(e.org_id));
$$;
grant execute on function public.event_visible(uuid) to anon, authenticated;
drop policy "public sees timetable" on public.event_slots;
create policy "public sees timetable" on public.event_slots for select to anon using (public and public.event_visible(event_id));
drop policy "public sees lineup artists" on public.artists;
create policy "public sees lineup artists" on public.artists for select to anon
  using (deleted_at is null and exists (select 1 from public.event_slots s where s.artist_id = artists.id and s.public and public.event_visible(s.event_id)));
