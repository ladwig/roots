-- Locations (core, used by events + shifts) and shift planning: team, positions, shifts (per event or location day),
-- recurring series ("every 2nd Thursday"), assignments with applications, check-in/out → time account.

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  address text check (length(address) <= 500),
  notes text check (length(notes) <= 2000),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index locations_org on public.locations (org_id, name);
select public.enable_audit('public.locations');
alter table public.locations enable row level security;
revoke all on public.locations from anon;
create policy "members see locations" on public.locations for select to authenticated using (public.is_member(org_id));
create policy "settings managers write locations" on public.locations for all to authenticated
  using (public.has_perm(org_id, 'org.settings.manage')) with check (public.has_perm(org_id, 'org.settings.manage'));

alter table public.events add column location_id uuid references public.locations on delete set null;
create index events_location on public.events (location_id);

-- People who work shifts: an org member (user_id) or someone without login (magic link).
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  user_id uuid references auth.users on delete set null,
  contact_id uuid references public.contacts on delete set null,
  name text not null check (length(trim(name)) between 1 and 200),
  email text check (length(email) <= 320),
  phone text check (length(phone) <= 50),
  role_label text check (length(role_label) <= 100),            -- "Minijob", "Aushilfe", "Ehrenamt" … (free text)
  target_hours numeric(6, 2) check (target_hours >= 0),         -- per month, optional
  position_ids uuid[] not null default '{}',                     -- positions this person can do (empty = any)
  color text check (color ~ '^#[0-9a-f]{6}$'),
  active boolean not null default true,
  link_token text unique check (link_token ~ '^[a-z0-9]{24}$'),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create unique index staff_org_user on public.staff (org_id, user_id) where user_id is not null;
create index staff_org on public.staff (org_id, name);
create index staff_contact on public.staff (contact_id);
select public.enable_audit('public.staff');

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  location_id uuid references public.locations on delete set null,
  needed int not null default 1 check (needed between 1 and 100),
  color text check (color ~ '^#[0-9a-f]{6}$'),
  position int not null default 0,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index positions_org on public.positions (org_id, position);
create index positions_location on public.positions (location_id);
select public.enable_audit('public.positions');

-- Recurring shifts: weekdays (1 = Mon … 7 = Sun) every N weeks from start_date; default_staff always assigned.
create table public.shift_series (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  name text check (length(name) <= 100),
  location_id uuid references public.locations on delete set null,
  position_id uuid references public.positions on delete set null,
  weekdays int[] not null check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]),
  every_weeks int not null default 1 check (every_weeks between 1 and 8),
  start_date date not null,
  end_date date check (end_date >= start_date),
  start_time time not null,
  end_time time not null,                                         -- earlier than start_time = ends next day
  needed int not null default 1 check (needed between 1 and 100),
  default_staff uuid[] not null default '{}',
  generated_until date,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index shift_series_org on public.shift_series (org_id);
select public.enable_audit('public.shift_series');

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  event_id uuid references public.events on delete cascade,
  location_id uuid references public.locations on delete set null,
  position_id uuid references public.positions on delete set null,
  series_id uuid references public.shift_series on delete set null,
  title text check (length(title) <= 100),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  needed int not null default 1 check (needed between 1 and 100),
  open boolean not null default true,                             -- staff may apply for free spots
  notes text check (length(notes) <= 2000),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index shifts_org_time on public.shifts (org_id, starts_at);
create index shifts_event on public.shifts (event_id);
create index shifts_location on public.shifts (location_id);
create index shifts_position on public.shifts (position_id);
create unique index shifts_series_slot on public.shifts (series_id, starts_at) where series_id is not null;
select public.enable_audit('public.shifts');

create table public.shift_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  shift_id uuid not null references public.shifts on delete cascade,
  staff_id uuid not null references public.staff on delete cascade,
  status text not null default 'assigned' check (status in ('assigned', 'applied')),
  checked_in_at timestamptz,
  checked_out_at timestamptz check (checked_out_at > checked_in_at),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  unique (shift_id, staff_id)
);
create index shift_assignments_staff on public.shift_assignments (staff_id);
create index shift_assignments_org on public.shift_assignments (org_id);
select public.enable_audit('public.shift_assignments');

alter table public.staff enable row level security;
alter table public.positions enable row level security;
alter table public.shift_series enable row level security;
alter table public.shifts enable row level security;
alter table public.shift_assignments enable row level security;
revoke all on public.staff, public.positions, public.shift_series, public.shifts, public.shift_assignments from anon;

-- Everyone with shifts.view sees the plan (team + shifts); shifts.manage plans; shifts.self = own staff row only.
create function public.my_staff_id(p_org uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.staff where org_id = p_org and user_id = (select auth.uid()) and active;
$$;

create policy "see team" on public.staff for select to authenticated
  using (public.module_enabled(org_id, 'shifts') and (public.has_perm(org_id, 'shifts.view') or user_id = (select auth.uid())));
create policy "manage team" on public.staff for all to authenticated
  using (public.module_enabled(org_id, 'shifts') and public.has_perm(org_id, 'shifts.manage'))
  with check (public.module_enabled(org_id, 'shifts') and public.has_perm(org_id, 'shifts.manage'));
create policy "see positions" on public.positions for select to authenticated
  using (public.module_enabled(org_id, 'shifts') and (public.has_perm(org_id, 'shifts.view') or public.has_perm(org_id, 'shifts.self')));
create policy "manage positions" on public.positions for all to authenticated
  using (public.module_enabled(org_id, 'shifts') and public.has_perm(org_id, 'shifts.manage'))
  with check (public.module_enabled(org_id, 'shifts') and public.has_perm(org_id, 'shifts.manage'));
create policy "see series" on public.shift_series for select to authenticated
  using (public.module_enabled(org_id, 'shifts') and public.has_perm(org_id, 'shifts.view'));
create policy "manage series" on public.shift_series for all to authenticated
  using (public.module_enabled(org_id, 'shifts') and public.has_perm(org_id, 'shifts.manage'))
  with check (public.module_enabled(org_id, 'shifts') and public.has_perm(org_id, 'shifts.manage'));
create policy "see shifts" on public.shifts for select to authenticated
  using (public.module_enabled(org_id, 'shifts') and (public.has_perm(org_id, 'shifts.view') or public.has_perm(org_id, 'shifts.self')));
create policy "manage shifts" on public.shifts for all to authenticated
  using (public.module_enabled(org_id, 'shifts') and public.has_perm(org_id, 'shifts.manage'))
  with check (public.module_enabled(org_id, 'shifts') and public.has_perm(org_id, 'shifts.manage'));
create policy "see assignments" on public.shift_assignments for select to authenticated
  using (public.module_enabled(org_id, 'shifts') and (public.has_perm(org_id, 'shifts.view') or staff_id = public.my_staff_id(org_id)));
create policy "manage assignments" on public.shift_assignments for all to authenticated
  using (public.module_enabled(org_id, 'shifts') and public.has_perm(org_id, 'shifts.manage'))
  with check (public.module_enabled(org_id, 'shifts') and public.has_perm(org_id, 'shifts.manage')
    and exists (select 1 from public.shifts s where s.id = shift_id and s.org_id = shift_assignments.org_id));

-- Self-service (logged-in staff via their staff row, or people without login via the staff magic link).
-- p_staff resolves either way; everything is checked here.
create function public.shift_self(p_action text, p_shift uuid, p_token text default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_staff public.staff; s public.shifts; v_taken int;
begin
  if p_token is not null then
    select * into v_staff from public.staff where link_token = p_token and p_token ~ '^[a-z0-9]{24}$' and active;
  else
    select * into v_staff from public.staff where id = public.my_staff_id((select org_id from public.shifts where id = p_shift));
    if v_staff.id is not null and not public.has_perm(v_staff.org_id, 'shifts.self') then v_staff := null; end if;
  end if;
  if v_staff.id is null or not public.module_enabled(v_staff.org_id, 'shifts') then raise exception 'not_allowed'; end if;
  select * into s from public.shifts where id = p_shift and org_id = v_staff.org_id for update;
  if s.id is null then raise exception 'not_allowed'; end if;

  if p_action = 'apply' then
    if not s.open or s.starts_at < now() then raise exception 'shift_closed'; end if;
    if cardinality(v_staff.position_ids) > 0 and s.position_id is not null and not (s.position_id = any (v_staff.position_ids)) then
      raise exception 'not_qualified';
    end if;
    insert into public.shift_assignments (org_id, shift_id, staff_id, status) values (s.org_id, s.id, v_staff.id, 'applied')
      on conflict (shift_id, staff_id) do nothing;
    perform public.emit_event(s.org_id, 'shift.applied', jsonb_build_object('shift_id', s.id, 'name', v_staff.name, 'starts_at', s.starts_at), 'shifts', s.id::text);
    return 'applied';
  elsif p_action = 'withdraw' then
    delete from public.shift_assignments where shift_id = s.id and staff_id = v_staff.id and status = 'applied';
    return 'withdrawn';
  elsif p_action = 'check_in' then
    if now() < s.starts_at - interval '2 hours' or now() > s.ends_at + interval '2 hours' then raise exception 'not_now'; end if;
    update public.shift_assignments set checked_in_at = coalesce(checked_in_at, now())
      where shift_id = s.id and staff_id = v_staff.id and status = 'assigned';
    if not found then raise exception 'not_assigned'; end if;
    return 'checked_in';
  elsif p_action = 'check_out' then
    update public.shift_assignments set checked_out_at = greatest(now(), checked_in_at + interval '1 minute')
      where shift_id = s.id and staff_id = v_staff.id and status = 'assigned' and checked_in_at is not null and checked_out_at is null;
    if not found then raise exception 'not_assigned'; end if;
    return 'checked_out';
  end if;
  raise exception 'invalid_input';
end $$;
revoke execute on function public.shift_self(text, uuid, text) from public, anon;
grant execute on function public.shift_self(text, uuid, text) to authenticated, service_role;
