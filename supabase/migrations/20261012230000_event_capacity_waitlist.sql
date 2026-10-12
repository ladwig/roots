-- Event capacity across all ticket types (on top of each type's quota) + a waiting list.
-- When an event is full, people join the waiting list (public server action, service role). When seats free up
-- (expired reservations, voided/refunded tickets, more capacity), the minute worker offers them in order: the entry
-- gets a claim token and its seats are held for 24 h (they count against the capacity for everyone else). The claim
-- link (/e/<slug>?w=<token>) shows the shop with those seats; reserving with the token marks the entry claimed.
-- ponytail: holds are enforced through events.capacity; events limited only by type quotas still get offers, first come.

create table public.event_waitlist (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  event_id uuid not null references public.events on delete cascade,
  name text not null check (length(name) between 1 and 200),
  email text not null check (length(email) between 3 and 320),
  quantity int not null default 1 check (quantity between 1 and 20),
  status text not null default 'waiting' check (status in ('waiting', 'offered', 'claimed', 'expired', 'cancelled')),
  token text unique,                 -- claim link, set when offered
  offered_until timestamptz,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index event_waitlist_queue on public.event_waitlist (event_id, created_at) where status in ('waiting', 'offered');
create unique index event_waitlist_once on public.event_waitlist (event_id, lower(email)) where status in ('waiting', 'offered');
create index event_waitlist_org on public.event_waitlist (org_id);
select public.enable_audit('public.event_waitlist');

alter table public.event_waitlist enable row level security;
revoke all on public.event_waitlist from anon;
create policy "members view waitlist" on public.event_waitlist for select to authenticated
  using (public.module_enabled(org_id, 'tickets') and public.has_perm(org_id, 'tickets.view'));
create policy "managers edit waitlist" on public.event_waitlist for update to authenticated
  using (public.module_enabled(org_id, 'tickets') and public.has_perm(org_id, 'tickets.manage'))
  with check (public.module_enabled(org_id, 'tickets') and public.has_perm(org_id, 'tickets.manage'));
create policy "managers remove from waitlist" on public.event_waitlist for delete to authenticated
  using (public.module_enabled(org_id, 'tickets') and public.has_perm(org_id, 'tickets.manage'));
revoke update (org_id, event_id, token) on public.event_waitlist from authenticated;

-- Seats left in the event as a whole (null = no event capacity). Seats held for waiting-list offers count as taken,
-- except the ones held for p_token (the person claiming them).
create function public.event_left(p_event uuid, p_token text default null) returns int
language sql stable security definer set search_path = '' as $$
  select case when e.capacity is null then null else greatest(e.capacity
    - (select count(*) from public.tickets k where k.event_id = e.id and public.ticket_live(k))::int
    - (select coalesce(sum(w.quantity), 0) from public.event_waitlist w
       where w.event_id = e.id and w.status = 'offered' and w.offered_until > now() and w.token is distinct from p_token)::int, 0) end
  from public.events e where e.id = p_event;
$$;
revoke execute on function public.event_left(uuid, text) from public, anon, authenticated;

-- The offer as before, now also capped by the event's capacity (and a claim token's held seats).
drop function public.ticket_offer(uuid, text);
create function public.ticket_offer(p_event uuid, p_code text default null, p_waitlist text default null)
returns table (type_id uuid, name text, description text, currency text, hidden boolean, tier_id uuid, tier_name text,
  price int, final_price int, remaining int, sales_start timestamptz, sales_end timestamptz, code_id uuid, code_applies boolean)
language plpgsql stable security definer set search_path = '' as $$
declare c public.ticket_codes; v_code_left int; v_event_left int;
begin
  if not public.ticket_event_public(p_event) then return; end if;
  v_event_left := public.event_left(p_event, nullif(trim(coalesce(p_waitlist, '')), ''));
  if p_code is not null and length(trim(p_code)) > 0 then
    select * into c from public.ticket_codes x where x.event_id = p_event and x.code = upper(trim(p_code)) and x.active
      and (x.valid_from is null or x.valid_from <= now()) and (x.valid_until is null or x.valid_until > now());
    if c.id is not null and c.max_uses is not null then
      select c.max_uses - count(*) into v_code_left from public.tickets k where k.code_id = c.id and public.ticket_live(k);
    end if;
  end if;
  return query
  with types as (
    select t.* from public.ticket_types t
    where t.event_id = p_event and t.active
      and (not t.hidden or (c.id is not null and t.id = any (c.type_ids)))
  ), tier as (
    select distinct on (r.type_id) r.type_id, r.id, r.name, r.price,
      case when r.quota is null then null else r.quota - (select count(*) from public.tickets k where k.tier_id = r.id and public.ticket_live(k))::int end as left_
    from public.ticket_tiers r join types t on t.id = r.type_id
    where (r.sales_end is null or r.sales_end > now())
      and (r.quota is null or r.quota > (select count(*) from public.tickets k where k.tier_id = r.id and public.ticket_live(k)))
    order by r.type_id, r.position, r.created_at
  )
  select t.id, t.name, t.description, t.currency, t.hidden, tier.id, tier.name,
    coalesce(tier.price, t.price),
    case when c.id is not null and (cardinality(c.type_ids) = 0 or t.id = any (c.type_ids)) then
      case c.kind when 'percent' then round(coalesce(tier.price, t.price) * (100 - c.value) / 100.0)::int
                  when 'amount' then greatest(coalesce(tier.price, t.price) - c.value, 0)
                  else coalesce(tier.price, t.price) end
    else coalesce(tier.price, t.price) end,
    case when exists (select 1 from public.ticket_tiers r where r.type_id = t.id) and tier.id is null then 0
    else nullif(greatest(least(
      coalesce(t.quota - (select count(*) from public.tickets k where k.type_id = t.id and public.ticket_live(k))::int, 2147483647),
      coalesce(tier.left_, 2147483647),
      coalesce(v_event_left, 2147483647),
      case when c.id is not null and (cardinality(c.type_ids) = 0 or t.id = any (c.type_ids)) then coalesce(v_code_left, 2147483647) else 2147483647 end
    ), 0), 2147483647) end,
    t.sales_start, t.sales_end, c.id,
    c.id is not null and (cardinality(c.type_ids) = 0 or t.id = any (c.type_ids))
  from types t left join tier on tier.type_id = t.id
  order by t.position, t.created_at;
end $$;
grant execute on function public.ticket_offer(uuid, text, text) to anon, authenticated;

-- Reserve: as before + the event capacity across all requested tickets; a valid claim token uses its held seats
-- and marks the waiting-list entry claimed.
drop function public.reserve_tickets(uuid, uuid, jsonb, int, text);
create function public.reserve_tickets(p_order uuid, p_event uuid, p_items jsonb, p_minutes int, p_code text default null, p_waitlist text default null)
returns setof public.tickets
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  o record;
  r record;
  v_code text;
  v_left int;
  v_token text := nullif(trim(coalesce(p_waitlist, '')), '');
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  select org_id into v_org from public.events where id = p_event and status = 'published' and deleted_at is null for update;
  if v_org is null then raise exception 'not_on_sale'; end if;
  perform 1 from public.ticket_types where event_id = p_event order by id for update;
  perform 1 from public.ticket_tiers tr join public.ticket_types tt on tt.id = tr.type_id where tt.event_id = p_event order by tr.id for update of tr;
  if p_code is not null then perform 1 from public.ticket_codes where event_id = p_event and code = upper(trim(p_code)) for update; end if;
  if v_token is not null and not exists (select 1 from public.event_waitlist w where w.event_id = p_event and w.token = v_token and w.status = 'offered' and w.offered_until > now()) then
    v_token := null; -- expired or already used: buy like everyone else
  end if;

  for r in select (i->>'type_id')::uuid as type_id, count(*)::int as n from jsonb_array_elements(p_items) i group by 1 loop
    select * into o from public.ticket_offer(p_event, p_code, v_token) x where x.type_id = r.type_id;
    if o.type_id is null or (o.sales_start is not null and o.sales_start > now()) or (o.sales_end is not null and o.sales_end < now()) then
      raise exception 'not_on_sale';
    end if;
    if o.remaining is not null and o.remaining < r.n then raise exception 'sold_out'; end if;
  end loop;
  v_left := public.event_left(p_event, v_token);
  if v_left is not null and v_left < jsonb_array_length(p_items) then raise exception 'sold_out'; end if;
  if p_code is not null and exists (select 1 from public.ticket_codes where event_id = p_event and code = upper(trim(p_code)) and max_uses is not null) then
    if (select count(*) from jsonb_array_elements(p_items) i join public.ticket_offer(p_event, p_code, v_token) x on x.type_id = (i->>'type_id')::uuid where x.code_applies)
       > coalesce((select min(x.remaining) from public.ticket_offer(p_event, p_code, v_token) x where x.code_applies), 2147483647) then
      raise exception 'sold_out';
    end if;
  end if;

  for r in select i, x.* from jsonb_array_elements(p_items) i join public.ticket_offer(p_event, p_code, v_token) x on x.type_id = (i->>'type_id')::uuid loop
    loop
      v_code := (select string_agg(substr(v_alphabet, 1 + (get_byte(b, n) % 32), 1), '')
                 from extensions.gen_random_bytes(10) b, generate_series(0, 9) n);
      exit when not exists (select 1 from public.tickets where code = v_code);
    end loop;
    return query insert into public.tickets (org_id, event_id, type_id, tier_id, code_id, price, order_id, code, holder_name, status, expires_at)
      values (v_org, p_event, r.type_id, r.tier_id, case when r.code_applies then r.code_id end, r.final_price, p_order, v_code,
              nullif(trim(r.i->>'holder_name'), ''), 'reserved', now() + make_interval(mins => p_minutes))
      returning *;
  end loop;
  if v_token is not null then
    update public.event_waitlist set status = 'claimed', updated_at = now() where event_id = p_event and token = v_token;
  end if;
end $$;
revoke execute on function public.reserve_tickets(uuid, uuid, jsonb, int, text, text) from public, anon, authenticated;
grant execute on function public.reserve_tickets(uuid, uuid, jsonb, int, text, text) to service_role;

-- Admin view: per type as before, capped by the event's capacity.
create or replace function public.ticket_availability(p_event uuid) returns table (type_id uuid, remaining int)
language sql stable security definer set search_path = '' as $$
  select t.id, nullif(least(
    coalesce(greatest(t.quota - (select count(*) from public.tickets k where k.type_id = t.id and public.ticket_live(k))::int, 0), 2147483647),
    coalesce(public.event_left(p_event), 2147483647)), 2147483647)
  from public.ticket_types t where t.event_id = p_event and t.active;
$$;

-- Minute worker: expire stale offers, then offer free seats to the waiting list in order. Returns the new offers
-- (for the emails). Service role only.
create function public.offer_waitlist() returns table (id uuid, event_id uuid, name text, email text, quantity int, token text, offered_until timestamptz)
language plpgsql security definer set search_path = '' as $$
declare ev record; w record; v_free int;
begin
  update public.event_waitlist x set status = 'expired', updated_at = now() where x.status = 'offered' and x.offered_until <= now();
  for ev in select distinct x.event_id from public.event_waitlist x join public.events e on e.id = x.event_id
            where x.status = 'waiting' and e.status = 'published' and e.deleted_at is null and coalesce(e.ends_at, e.starts_at) > now() loop
    perform 1 from public.events e where e.id = ev.event_id for update;
    -- Free seats: event capacity left, else the sum left over all types (only if every type is limited).
    v_free := public.event_left(ev.event_id);
    if v_free is null then
      select case when count(*) filter (where o.remaining is null) = 0 then coalesce(sum(o.remaining), 0)::int end into v_free
      from public.ticket_offer(ev.event_id) o where not o.hidden;
    end if;
    continue when v_free is null or v_free <= 0;
    for w in select * from public.event_waitlist x where x.event_id = ev.event_id and x.status = 'waiting' order by x.created_at loop
      exit when w.quantity > v_free; -- strictly in order: the next in line waits for enough seats
      update public.event_waitlist x set status = 'offered', token = encode(extensions.gen_random_bytes(18), 'hex'),
        offered_until = now() + interval '24 hours', updated_at = now()
      where x.id = w.id
      returning x.id, x.event_id, x.name, x.email, x.quantity, x.token, x.offered_until
      into id, event_id, name, email, quantity, token, offered_until;
      return next;
      v_free := v_free - w.quantity;
    end loop;
  end loop;
end $$;
revoke execute on function public.offer_waitlist() from public, anon, authenticated;
grant execute on function public.offer_waitlist() to service_role;
