create function public.artist_visible(p_artist uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.event_slots s where s.artist_id = p_artist and s.public and public.event_visible(s.event_id));
$$;
grant execute on function public.artist_visible(uuid) to anon, authenticated;
drop policy "public sees lineup artists" on public.artists;
create policy "public sees lineup artists" on public.artists for select to anon using (public.artist_visible(id));
