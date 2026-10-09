-- ticket_live() reads now(): stable, not immutable.
create or replace function public.ticket_live(k public.tickets) returns boolean language sql stable as $$
  select k.status in ('valid', 'used') or (k.status = 'reserved' and k.expires_at > now());
$$;
