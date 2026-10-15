-- Rentals (module "rentals", "Vermietung"): anything an org rents out or hands out, in one model.
-- rental_objects = things (studio, room, parking spot, car, beamer, key…) with a family that decides the behaviour
--   and a hierarchy (building › studio › key A-1); `included` = fixed part of its parent (rented along, never alone).
-- rental_rates   = price models per object (800 €/month with notice + renewal, 15 €/hour, deposit only…); defaults only.
-- rentals        = one Vergabe: Mietvertrag, Buchung, Ausleihe or Schlüsselausgabe. Values copied from the rate.
--   ends_at null = open-ended; renew_months = extends itself (worker) unless notice_at is set. A key handout can hang
--   on the rental of its studio (parent_id).
-- rental_contacts = the people on a rental: role main (contract partner, pays) or member (Mitnutzer:in).
-- No double booking: confirmed rentals of an object never overlap beyond its capacity (requests don't block).

create or replace function public.default_module_keys() returns text[]
language sql immutable set search_path = '' as $$
  select array['crm', 'payments', 'events', 'tickets', 'guestlists', 'invoices', 'shifts', 'members', 'forms', 'email', 'hr', 'courses', 'automations', 'reports', 'cashbook', 'wiki', 'projects', 'rentals']
$$;
insert into public.org_modules (org_id, module_key) select id, 'rentals' from public.orgs on conflict do nothing;

create table public.rental_objects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  parent_id uuid references public.rental_objects on delete set null,
  family text not null default 'place' check (family in ('place', 'vehicle', 'item', 'access', 'other')),
  kind text not null check (length(trim(kind)) between 1 and 40),        -- "studio", "key", … (labels in the app) or free text
  name text not null check (length(trim(name)) between 1 and 200),
  status text not null default 'active' check (status in ('active', 'inactive', 'lost')),
  rentable boolean not null default false,                               -- has rates, gets rental contracts / bookings
  lendable boolean not null default false,                               -- handed out (keys, devices), deposit only
  included boolean not null default false,                               -- fixed part of the parent, never on its own
  capacity int not null default 1 check (capacity between 1 and 10000),  -- confirmed rentals at the same time
  deposit_cents int check (deposit_cents >= 0),                          -- usual deposit when handed out
  location_id uuid references public.locations on delete set null,
  description text not null default '' check (length(description) <= 20000),
  position int not null default 0,
  custom jsonb not null default '{}',
  deleted_at timestamptz, deleted_by uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  check (parent_id is distinct from id)
);
create index rental_objects_org on public.rental_objects (org_id, parent_id, position) where deleted_at is null;
select public.enable_audit('public.rental_objects');
select public.enable_soft_delete('public.rental_objects', 'org_id', 'rentals.manage', 30);

create table public.rental_rates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  object_id uuid not null references public.rental_objects on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  unit text not null check (unit in ('hour', 'day', 'week', 'month', 'year', 'once')),
  price_cents int not null default 0 check (price_cents >= 0),
  min_units int not null default 1 check (min_units between 1 and 1000),
  term_months int check (term_months between 1 and 600),     -- fixed first term (e.g. 12), null = open-ended
  renew_months int check (renew_months between 1 and 600),   -- then renews by this unless cancelled
  notice_months int check (notice_months between 0 and 60),
  deposit_cents int check (deposit_cents >= 0),
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index rental_rates_object on public.rental_rates (object_id, position);
select public.enable_audit('public.rental_rates');

create table public.rentals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  object_id uuid not null references public.rental_objects on delete restrict,
  parent_id uuid references public.rentals on delete set null,             -- key handout ↔ the studio's rental
  rate_id uuid references public.rental_rates on delete set null,
  status text not null default 'confirmed' check (status in ('request', 'confirmed', 'cancelled')),
  starts_at timestamptz not null,
  ends_at timestamptz,                                                     -- null = open-ended; handouts: returned
  price_cents int check (price_cents >= 0),
  unit text check (unit in ('hour', 'day', 'week', 'month', 'year', 'once')),
  renew_months int check (renew_months between 1 and 600),
  notice_months int check (notice_months between 0 and 60),
  notice_at timestamptz,                                                   -- notice received (no more renewing)
  deposit_cents int check (deposit_cents >= 0),
  deposit_back_at timestamptz,
  note text not null default '' check (length(note) <= 20000),
  custom jsonb not null default '{}',
  deleted_at timestamptz, deleted_by uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  check (ends_at is null or ends_at > starts_at)
);
create index rentals_object on public.rentals (object_id, starts_at) where deleted_at is null;
create index rentals_org on public.rentals (org_id, starts_at desc) where deleted_at is null;
create index rentals_parent on public.rentals (parent_id) where parent_id is not null;
select public.enable_audit('public.rentals');
select public.enable_soft_delete('public.rentals', 'org_id', 'rentals.manage', 30);

create table public.rental_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  rental_id uuid not null references public.rentals on delete cascade,
  contact_id uuid not null references public.contacts on delete cascade,
  role text not null default 'main' check (role in ('main', 'member')),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  unique (rental_id, contact_id)
);
create index rental_contacts_contact on public.rental_contacts (contact_id);
select public.enable_audit('public.rental_contacts');

alter table public.custom_fields drop constraint custom_fields_entity_check;
alter table public.custom_fields add constraint custom_fields_entity_check check (entity in ('contacts', 'events', 'memberships', 'rental_objects', 'rentals'));

-- ---------- guards ----------

-- Parent/location in the same org, no cycles in the hierarchy.
create function public.rental_objects_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v uuid := new.parent_id; n int := 0;
begin
  if new.location_id is not null and not exists (select 1 from public.locations where id = new.location_id and org_id = new.org_id) then raise exception 'not_allowed'; end if;
  while v is not null loop
    if v = new.id or n > 20 then raise exception 'object_cycle'; end if;
    if not exists (select 1 from public.rental_objects where id = v and org_id = new.org_id) then raise exception 'not_allowed'; end if;
    select parent_id into v from public.rental_objects where id = v;
    n := n + 1;
  end loop;
  return new;
end $$;
revoke execute on function public.rental_objects_guard() from public, anon, authenticated;
create trigger rental_objects_guard before insert or update of parent_id, location_id on public.rental_objects for each row execute function public.rental_objects_guard();

create function public.rental_rates_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.rental_objects where id = new.object_id and org_id = new.org_id) then raise exception 'not_allowed'; end if;
  return new;
end $$;
revoke execute on function public.rental_rates_guard() from public, anon, authenticated;
create trigger rental_rates_guard before insert or update of object_id on public.rental_rates for each row execute function public.rental_rates_guard();

-- Same org for object/rate/parent; fixed parts can't be booked alone; no overlap beyond the object's capacity.
create function public.rentals_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare o public.rental_objects; v_busy int;
begin
  select * into o from public.rental_objects where id = new.object_id and org_id = new.org_id;
  if o.id is null then raise exception 'not_allowed'; end if;
  if new.rate_id is not null and not exists (select 1 from public.rental_rates where id = new.rate_id and object_id = new.object_id) then raise exception 'not_allowed'; end if;
  if new.parent_id is not null and not exists (select 1 from public.rentals where id = new.parent_id and org_id = new.org_id) then raise exception 'not_allowed'; end if;
  if new.deleted_at is not null or new.status <> 'confirmed' then return new; end if;
  if tg_op = 'UPDATE' and new.object_id = old.object_id and new.starts_at = old.starts_at and new.ends_at is not distinct from old.ends_at
     and old.status = 'confirmed' and old.deleted_at is null then return new; end if;
  if o.included then raise exception 'object_included'; end if;
  if o.status = 'lost' or o.deleted_at is not null then raise exception 'object_unavailable'; end if;
  perform pg_advisory_xact_lock(hashtext('rental:' || new.object_id::text)); -- two bookings at once can't both pass
  select count(*) into v_busy from public.rentals r
    where r.object_id = new.object_id and r.id <> new.id and r.deleted_at is null and r.status = 'confirmed'
      and tstzrange(r.starts_at, r.ends_at) && tstzrange(new.starts_at, new.ends_at);
  if v_busy >= o.capacity then raise exception 'object_busy'; end if;
  return new;
end $$;
revoke execute on function public.rentals_guard() from public, anon, authenticated;
create trigger rentals_guard before insert or update of object_id, rate_id, parent_id, starts_at, ends_at, status, deleted_at on public.rentals
  for each row execute function public.rentals_guard();

create function public.rental_contacts_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.rentals where id = new.rental_id and org_id = new.org_id)
     or not exists (select 1 from public.contacts where id = new.contact_id and org_id = new.org_id) then
    raise exception 'not_allowed';
  end if;
  return new;
end $$;
revoke execute on function public.rental_contacts_guard() from public, anon, authenticated;
create trigger rental_contacts_guard before insert or update of rental_id, contact_id on public.rental_contacts for each row execute function public.rental_contacts_guard();

-- ---------- events ----------

-- rental.created, rental.person_added (contact_id → email automations to the person), rental.notice_received.
-- Payloads carry the object's name, kind and family, so automations can narrow down ("only keys").
create function public.rental_payload(p_rental uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('rental_id', r.id, 'object_id', o.id, 'object', o.name, 'kind', o.kind, 'family', o.family,
    'starts_at', r.starts_at, 'ends_at', r.ends_at)
  from public.rentals r join public.rental_objects o on o.id = r.object_id where r.id = p_rental
$$;
revoke execute on function public.rental_payload(uuid) from public, anon, authenticated;

create function public.rentals_emit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.status = 'confirmed' then
    perform public.emit_event(new.org_id, 'rental.created', public.rental_payload(new.id), 'rentals', new.id::text);
  elsif tg_op = 'UPDATE' and new.notice_at is not null and old.notice_at is null then
    perform public.emit_event(new.org_id, 'rental.notice_received', public.rental_payload(new.id), 'rentals', new.id::text);
  end if;
  return null;
end $$;
revoke execute on function public.rentals_emit() from public, anon, authenticated;
create trigger rentals_emit after insert or update of notice_at on public.rentals for each row execute function public.rentals_emit();

create function public.rental_contacts_emit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.emit_event(new.org_id, 'rental.person_added',
    public.rental_payload(new.rental_id) || jsonb_build_object('contact_id', new.contact_id, 'role', new.role), 'rentals', new.rental_id::text);
  return null;
end $$;
revoke execute on function public.rental_contacts_emit() from public, anon, authenticated;
create trigger rental_contacts_emit after insert on public.rental_contacts for each row execute function public.rental_contacts_emit();

-- Minute worker: contracts that renew themselves (renew_months, no notice) are extended past today.
create function public.renew_rentals() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; v_end timestamptz; n int := 0;
begin
  for r in select * from public.rentals
    where status = 'confirmed' and deleted_at is null and renew_months is not null and notice_at is null and ends_at is not null and ends_at <= now()
    for update skip locked
  loop
    v_end := r.ends_at;
    while v_end <= now() loop v_end := v_end + make_interval(months => r.renew_months); end loop;
    update public.rentals set ends_at = v_end where id = r.id;
    perform public.emit_event(r.org_id, 'rental.renewed', public.rental_payload(r.id), 'rentals', r.id::text);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.renew_rentals() from public, anon, authenticated;

-- ---------- access ----------

alter table public.rental_objects enable row level security;
alter table public.rental_rates enable row level security;
alter table public.rentals enable row level security;
alter table public.rental_contacts enable row level security;
revoke all on public.rental_objects, public.rental_rates, public.rentals, public.rental_contacts from anon;

create policy "view rental objects" on public.rental_objects for select to authenticated
  using (public.module_enabled(org_id, 'rentals') and (public.has_perm(org_id, 'rentals.view') or public.has_perm(org_id, 'rentals.manage')));
create policy "manage rental objects" on public.rental_objects for all to authenticated
  using (public.module_enabled(org_id, 'rentals') and public.has_perm(org_id, 'rentals.manage'))
  with check (public.module_enabled(org_id, 'rentals') and public.has_perm(org_id, 'rentals.manage'));
create policy "view rental rates" on public.rental_rates for select to authenticated
  using (public.module_enabled(org_id, 'rentals') and (public.has_perm(org_id, 'rentals.view') or public.has_perm(org_id, 'rentals.manage')));
create policy "manage rental rates" on public.rental_rates for all to authenticated
  using (public.module_enabled(org_id, 'rentals') and public.has_perm(org_id, 'rentals.manage'))
  with check (public.module_enabled(org_id, 'rentals') and public.has_perm(org_id, 'rentals.manage'));
create policy "view rentals" on public.rentals for select to authenticated
  using (public.module_enabled(org_id, 'rentals') and (public.has_perm(org_id, 'rentals.view') or public.has_perm(org_id, 'rentals.manage')));
create policy "manage rentals" on public.rentals for all to authenticated
  using (public.module_enabled(org_id, 'rentals') and public.has_perm(org_id, 'rentals.manage'))
  with check (public.module_enabled(org_id, 'rentals') and public.has_perm(org_id, 'rentals.manage'));
create policy "view rental contacts" on public.rental_contacts for select to authenticated
  using (public.module_enabled(org_id, 'rentals') and (public.has_perm(org_id, 'rentals.view') or public.has_perm(org_id, 'rentals.manage')));
create policy "manage rental contacts" on public.rental_contacts for all to authenticated
  using (public.module_enabled(org_id, 'rentals') and public.has_perm(org_id, 'rentals.manage'))
  with check (public.module_enabled(org_id, 'rentals') and public.has_perm(org_id, 'rentals.manage'));
