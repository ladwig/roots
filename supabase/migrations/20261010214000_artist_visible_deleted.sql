create or replace function public.artist_visible(p_artist uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.artists a where a.id = p_artist and a.deleted_at is null)
     and exists (select 1 from public.event_slots s where s.artist_id = p_artist and s.public and public.event_visible(s.event_id));
$$;
