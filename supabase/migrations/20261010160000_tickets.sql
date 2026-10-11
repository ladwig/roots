-- Ticketing: ticket types per event, tickets per buyer. One order (pay_orders) holds several tickets, each with
-- its own code/QR. Tickets are created as 'reserved' when checkout starts (counts against the quota until
-- expires_at), become 'valid' when the payment webhook arrives, 'used' at the door, 'void' on refund/cancel.

alter table public.events
  add column ticket_names text not null default 'off' check (ticket_names in ('off', 'optional', 'required')),
  add column max_tickets_per_order int not null default 10 check (max_tickets_per_order between 1 and 100);
grant select (ticket_names, max_tickets_per_order) on public.events to anon;

create table public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  event_id uuid not null references public.events on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  description text check (length(description) <= 1000),
  price int not null check (price >= 0),                 -- cents
  currency text not null default 'eur' check (currency ~ '^[a-z]{3}$'),
  quota int check (quota > 0),                            -- null = unlimited (event capacity still applies later)
  sales_start timestamptz,
  sales_end timestamptz check (sales_end > sales_start),
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index ticket_types_event on public.ticket_types (event_id, position);
create index ticket_types_org on public.ticket_types (org_id);
select public.enable_audit('public.ticket_types');

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  event_id uuid not null references public.events on delete cascade,
  type_id uuid not null references public.ticket_types on delete restrict,
  order_id uuid not null references public.pay_orders on delete restrict,
  contact_id uuid references public.contacts on delete set null,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{10}$'), -- no 0/O/1/I look-alikes
  holder_name text check (length(holder_name) <= 200),
  status text not null default 'reserved' check (status in ('reserved', 'valid', 'used', 'void')),
  expires_at timestamptz,                                -- for 'reserved'
  checked_in_at timestamptz,
  checked_in_by uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index tickets_type_status on public.tickets (type_id, status);
create index tickets_event on public.tickets (event_id, created_at desc);
create index tickets_order on public.tickets (order_id);
create index tickets_org on public.tickets (org_id);
create index tickets_contact on public.tickets (contact_id);
select public.enable_audit('public.tickets');

alter table public.ticket_types enable row level security;
alter table public.tickets enable row level security;
revoke all on public.ticket_types, public.tickets from anon;
revoke insert, update, delete on public.tickets from authenticated; -- written by the payment flow (service role) and check_in_ticket()

create policy "members view ticket types" on public.ticket_types for select to authenticated
  using (public.module_enabled(org_id, 'tickets') and (public.has_perm(org_id, 'tickets.view') or public.has_perm(org_id, 'tickets.manage')));
create policy "managers add ticket types" on public.ticket_types for insert to authenticated
  with check (public.module_enabled(org_id, 'tickets') and public.has_perm(org_id, 'tickets.manage')
    and exists (select 1 from public.events e where e.id = event_id and e.org_id = ticket_types.org_id));
create policy "managers edit ticket types" on public.ticket_types for update to authenticated
  using (public.module_enabled(org_id, 'tickets') and public.has_perm(org_id, 'tickets.manage'))
  with check (public.module_enabled(org_id, 'tickets') and public.has_perm(org_id, 'tickets.manage'));
-- Types that have tickets can't be deleted (FK restrict); deactivate them instead.
create policy "managers delete ticket types" on public.ticket_types for delete to authenticated
  using (public.module_enabled(org_id, 'tickets') and public.has_perm(org_id, 'tickets.manage'));
create policy "members view tickets" on public.tickets for select to authenticated
  using (public.module_enabled(org_id, 'tickets') and (public.has_perm(org_id, 'tickets.view') or public.has_perm(org_id, 'tickets.scan')));

-- Public: active types of published events of orgs with the module on.
create function public.tickets_public(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.org_alive(p_org) and exists (select 1 from public.org_modules where org_id = p_org and module_key = 'tickets');
$$;
grant execute on function public.tickets_public(uuid) to anon, authenticated;
grant select (id, org_id, event_id, name, description, price, currency, sales_start, sales_end, position, active) on public.ticket_types to anon;
create policy "public sees ticket types" on public.ticket_types for select to anon
  using (active and public.tickets_public(org_id)
    and exists (select 1 from public.events e where e.id = event_id and e.status = 'published' and e.deleted_at is null));

-- Remaining tickets per type (null = unlimited). Reserved tickets count until they expire.
create function public.ticket_availability(p_event uuid) returns table (type_id uuid, remaining int)
language sql stable security definer set search_path = '' as $$
  select t.id, case when t.quota is null then null else greatest(t.quota - (
    select count(*) from public.tickets k where k.type_id = t.id
      and (k.status in ('valid', 'used') or (k.status = 'reserved' and k.expires_at > now())))::int, 0) end
  from public.ticket_types t where t.event_id = p_event and t.active;
$$;
grant execute on function public.ticket_availability(uuid) to anon, authenticated;

-- Atomically reserve tickets for an order (locks the type rows, so two buyers can't take the last ticket).
-- p_items: [{ "type_id": uuid, "holder_name": text|null }, …]. Raises 'sold_out' / 'not_on_sale'. Service role only.
create function public.reserve_tickets(p_order uuid, p_event uuid, p_items jsonb, p_minutes int) returns setof public.tickets
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  r record;
  v_left int;
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  select org_id into v_org from public.events where id = p_event and status = 'published' and deleted_at is null;
  if v_org is null then raise exception 'not_on_sale'; end if;
  for r in
    select t.*, x.n from public.ticket_types t
    join (select (i->>'type_id')::uuid as type_id, count(*)::int as n from jsonb_array_elements(p_items) i group by 1) x on x.type_id = t.id
    where t.event_id = p_event order by t.id for update of t
  loop
    if not r.active or (r.sales_start is not null and r.sales_start > now()) or (r.sales_end is not null and r.sales_end < now()) then
      raise exception 'not_on_sale';
    end if;
    if r.quota is not null then
      select r.quota - count(*) into v_left from public.tickets k where k.type_id = r.id
        and (k.status in ('valid', 'used') or (k.status = 'reserved' and k.expires_at > now()));
      if v_left < r.n then raise exception 'sold_out'; end if;
    end if;
  end loop;
  if (select count(distinct t.id) from public.ticket_types t where t.event_id = p_event
      and t.id in (select (i->>'type_id')::uuid from jsonb_array_elements(p_items) i))
     <> (select count(distinct i->>'type_id') from jsonb_array_elements(p_items) i) then
    raise exception 'not_on_sale';
  end if;
  for r in select i from jsonb_array_elements(p_items) i loop
    loop
      v_code := (select string_agg(substr(v_alphabet, 1 + (get_byte(b, n) % 32), 1), '')
                 from extensions.gen_random_bytes(10) b, generate_series(0, 9) n);
      exit when not exists (select 1 from public.tickets where code = v_code);
    end loop;
    return query insert into public.tickets (org_id, event_id, type_id, order_id, code, holder_name, status, expires_at)
      values (v_org, p_event, (r.i->>'type_id')::uuid, p_order, v_code, nullif(trim(r.i->>'holder_name'), ''), 'reserved',
              now() + make_interval(mins => p_minutes))
      returning *;
  end loop;
end $$;
revoke execute on function public.reserve_tickets(uuid, uuid, jsonb, int) from public, anon, authenticated;
grant execute on function public.reserve_tickets(uuid, uuid, jsonb, int) to service_role;

-- Door check-in by code (tickets.scan). Returns what the scanner shows; marks a valid ticket as used.
create function public.check_in_ticket(p_event uuid, p_code text)
returns table (result text, holder_name text, type_name text, checked_in_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; t record;
begin
  select org_id into v_org from public.events where id = p_event and deleted_at is null;
  if v_org is null or not public.module_enabled(v_org, 'tickets') or not public.has_perm(v_org, 'tickets.scan') then
    raise exception 'not_allowed';
  end if;
  select k.*, y.name as type_name into t from public.tickets k join public.ticket_types y on y.id = k.type_id
    where k.code = upper(trim(p_code)) and k.event_id = p_event for update of k;
  if t.id is null then return query select 'invalid'::text, null::text, null::text, null::timestamptz; return; end if;
  if t.status = 'used' then return query select 'used', t.holder_name, t.type_name, t.checked_in_at; return; end if;
  if t.status <> 'valid' then return query select 'invalid', t.holder_name, t.type_name, null::timestamptz; return; end if;
  update public.tickets set status = 'used', checked_in_at = now(), checked_in_by = auth.uid() where id = t.id;
  return query select 'ok', t.holder_name, t.type_name, now();
end $$;
revoke execute on function public.check_in_ticket(uuid, text) from public, anon;

-- Event hub: a sale (once per order, when its tickets become valid).
create function public.tickets_emit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select n.order_id, n.org_id, n.event_id, count(*) as cnt from inserted n join removed o on o.id = n.id
    where n.status = 'valid' and o.status = 'reserved' group by 1, 2, 3
  loop
    perform public.emit_event(r.org_id, 'tickets.sold', jsonb_build_object('order_id', r.order_id, 'event_id', r.event_id,
      'count', r.cnt, 'title', (select title from public.events where id = r.event_id),
      'email', (select customer_email from public.pay_orders where id = r.order_id)), 'pay_orders', r.order_id::text);
  end loop;
  return null;
end $$;
revoke execute on function public.tickets_emit() from public, anon, authenticated;
create trigger tickets_emit after update on public.tickets
  referencing old table as removed new table as inserted for each statement execute function public.tickets_emit();
