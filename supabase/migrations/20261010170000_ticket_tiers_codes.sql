-- Price tiers per ticket type (Early Bird → Regular → Door) and promo codes / discount links.
-- The current tier of a type = the first by position that isn't sold out (tier quota) and hasn't ended.
-- A type without tiers sells at its own price. Buyers buy from the current tier (ponytail: no splitting an
-- order across tiers; they order the rest separately once the next tier is current).

create table public.ticket_tiers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  type_id uuid not null references public.ticket_types on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  price int not null check (price >= 0),
  quota int check (quota > 0),
  sales_end timestamptz,
  position int not null default 0,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index ticket_tiers_type on public.ticket_tiers (type_id, position);
create index ticket_tiers_org on public.ticket_tiers (org_id);
select public.enable_audit('public.ticket_tiers');

-- Hidden types are only offered with a code that names them (crew / partner links).
alter table public.ticket_types add column hidden boolean not null default false;

create table public.ticket_codes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  event_id uuid not null references public.events on delete cascade,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{1,38}[A-Z0-9]$'),
  kind text not null check (kind in ('percent', 'amount', 'none')),   -- 'none' = only unlocks hidden types
  value int not null default 0 check (value >= 0 and (kind <> 'percent' or value <= 100)),
  max_uses int check (max_uses > 0),                                  -- tickets, not orders
  valid_from timestamptz,
  valid_until timestamptz check (valid_until > valid_from),
  type_ids uuid[] not null default '{}',                              -- empty = all visible types
  active boolean not null default true,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  unique (event_id, code)
);
create index ticket_codes_org on public.ticket_codes (org_id);
select public.enable_audit('public.ticket_codes');

alter table public.tickets
  add column tier_id uuid references public.ticket_tiers on delete restrict,
  add column code_id uuid references public.ticket_codes on delete restrict,
  add column price int check (price >= 0);
create index tickets_tier on public.tickets (tier_id);
create index tickets_code on public.tickets (code_id);

alter table public.ticket_tiers enable row level security;
alter table public.ticket_codes enable row level security;
revoke all on public.ticket_tiers, public.ticket_codes from anon;
create policy "members view tiers" on public.ticket_tiers for select to authenticated
  using (public.module_enabled(org_id, 'tickets') and (public.has_perm(org_id, 'tickets.view') or public.has_perm(org_id, 'tickets.manage')));
create policy "managers write tiers" on public.ticket_tiers for all to authenticated
  using (public.module_enabled(org_id, 'tickets') and public.has_perm(org_id, 'tickets.manage'))
  with check (public.module_enabled(org_id, 'tickets') and public.has_perm(org_id, 'tickets.manage')
    and exists (select 1 from public.ticket_types t where t.id = type_id and t.org_id = ticket_tiers.org_id));
create policy "members view codes" on public.ticket_codes for select to authenticated
  using (public.module_enabled(org_id, 'tickets') and (public.has_perm(org_id, 'tickets.view') or public.has_perm(org_id, 'tickets.manage')));
create policy "managers write codes" on public.ticket_codes for all to authenticated
  using (public.module_enabled(org_id, 'tickets') and public.has_perm(org_id, 'tickets.manage'))
  with check (public.module_enabled(org_id, 'tickets') and public.has_perm(org_id, 'tickets.manage')
    and exists (select 1 from public.events e where e.id = event_id and e.org_id = ticket_codes.org_id));

-- Hidden types aren't listed to anon directly; the shop reads ticket_offer().
drop policy "public sees ticket types" on public.ticket_types;
create policy "public sees ticket types" on public.ticket_types for select to anon
  using (active and not hidden and public.ticket_event_public(event_id));

-- Tickets that hold a place: sold/used, or reserved and not expired.
create function public.ticket_live(k public.tickets) returns boolean language sql immutable as $$
  select k.status in ('valid', 'used') or (k.status = 'reserved' and k.expires_at > now());
$$;

-- What a buyer can get right now, per type: current tier, price, price with code, how many are left.
-- Public (anon): only published events of live orgs with Ticketing on.
create function public.ticket_offer(p_event uuid, p_code text default null)
returns table (type_id uuid, name text, description text, currency text, hidden boolean, tier_id uuid, tier_name text,
  price int, final_price int, remaining int, sales_start timestamptz, sales_end timestamptz, code_id uuid, code_applies boolean)
language plpgsql stable security definer set search_path = '' as $$
declare c public.ticket_codes; v_code_left int;
begin
  if not public.ticket_event_public(p_event) then return; end if;
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
    else nullif(least(
      coalesce(t.quota - (select count(*) from public.tickets k where k.type_id = t.id and public.ticket_live(k))::int, 2147483647),
      coalesce(tier.left_, 2147483647),
      case when c.id is not null and (cardinality(c.type_ids) = 0 or t.id = any (c.type_ids)) then coalesce(v_code_left, 2147483647) else 2147483647 end
    ), 2147483647) end,
    t.sales_start, t.sales_end, c.id,
    c.id is not null and (cardinality(c.type_ids) = 0 or t.id = any (c.type_ids))
  from types t left join tier on tier.type_id = t.id
  order by t.position, t.created_at;
end $$;
grant execute on function public.ticket_offer(uuid, text) to anon, authenticated;

-- Reserve with locks: types, their tiers and the code are locked, then the offer is read and checked.
drop function public.reserve_tickets(uuid, uuid, jsonb, int);
create function public.reserve_tickets(p_order uuid, p_event uuid, p_items jsonb, p_minutes int, p_code text default null)
returns setof public.tickets
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  o record;
  r record;
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  select org_id into v_org from public.events where id = p_event and status = 'published' and deleted_at is null;
  if v_org is null then raise exception 'not_on_sale'; end if;
  perform 1 from public.ticket_types where event_id = p_event order by id for update;
  perform 1 from public.ticket_tiers r join public.ticket_types t on t.id = r.type_id where t.event_id = p_event order by r.id for update of r;
  if p_code is not null then perform 1 from public.ticket_codes where event_id = p_event and code = upper(trim(p_code)) for update; end if;

  for r in select (i->>'type_id')::uuid as type_id, count(*)::int as n from jsonb_array_elements(p_items) i group by 1 loop
    select * into o from public.ticket_offer(p_event, p_code) x where x.type_id = r.type_id;
    if o.type_id is null or (o.sales_start is not null and o.sales_start > now()) or (o.sales_end is not null and o.sales_end < now()) then
      raise exception 'not_on_sale';
    end if;
    if o.remaining is not null and o.remaining < r.n then raise exception 'sold_out'; end if;
  end loop;
  -- Codes with a use limit count every ticket they apply to, across types.
  if p_code is not null and exists (select 1 from public.ticket_codes where event_id = p_event and code = upper(trim(p_code)) and max_uses is not null) then
    if (select count(*) from jsonb_array_elements(p_items) i join public.ticket_offer(p_event, p_code) x on x.type_id = (i->>'type_id')::uuid where x.code_applies)
       > coalesce((select min(x.remaining) from public.ticket_offer(p_event, p_code) x where x.code_applies), 2147483647) then
      raise exception 'sold_out';
    end if;
  end if;

  for r in select i, x.* from jsonb_array_elements(p_items) i join public.ticket_offer(p_event, p_code) x on x.type_id = (i->>'type_id')::uuid loop
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
end $$;
revoke execute on function public.reserve_tickets(uuid, uuid, jsonb, int, text) from public, anon, authenticated;
grant execute on function public.reserve_tickets(uuid, uuid, jsonb, int, text) to service_role;

-- Availability for the App: type remaining considering tiers.
create or replace function public.ticket_availability(p_event uuid) returns table (type_id uuid, remaining int)
language sql stable security definer set search_path = '' as $$
  select t.id, case when t.quota is null then null else greatest(t.quota - (
    select count(*) from public.tickets k where k.type_id = t.id and public.ticket_live(k))::int, 0) end
  from public.ticket_types t where t.event_id = p_event and t.active;
$$;
