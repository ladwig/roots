-- Lineup (events module): org-wide artists + timetable slots per event.
-- Guest lists (guestlists module): permanent org lists (event_id null, valid at every event) or per-event lists,
-- with a public magic link, door price, quota, optional link to a ticket type (entries get real tickets).

create table public.artists (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  name text not null check (length(trim(name)) between 1 and 200),
  contact_id uuid references public.contacts on delete set null,
  description text check (length(description) <= 5000),
  links text[] not null default '{}' check (cardinality(links) <= 10),
  notes text check (length(notes) <= 5000),                       -- internal (fee, rider, hotel…)
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index artists_org on public.artists (org_id, name);
create index artists_contact on public.artists (contact_id);
select public.enable_audit('public.artists');
select public.enable_soft_delete('public.artists', 'org_id', 'events.manage', 30);

create table public.event_slots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  event_id uuid not null references public.events on delete cascade,
  artist_id uuid references public.artists on delete set null,
  title text check (length(title) <= 200),                        -- free text when no artist ("Doors", "Panel")
  stage text check (length(stage) <= 100),
  starts_at timestamptz not null,
  ends_at timestamptz check (ends_at > starts_at),
  public boolean not null default true,                           -- shown in the public timetable
  notes text check (length(notes) <= 2000),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  check (artist_id is not null or title is not null)
);
create index event_slots_event on public.event_slots (event_id, starts_at);
create index event_slots_artist on public.event_slots (artist_id);
create index event_slots_org on public.event_slots (org_id);
select public.enable_audit('public.event_slots');

alter table public.artists enable row level security;
alter table public.event_slots enable row level security;
revoke all on public.artists, public.event_slots from anon;
create policy "members view artists" on public.artists for select to authenticated
  using (public.module_enabled(org_id, 'events') and public.has_perm(org_id, 'events.view'));
create policy "managers add artists" on public.artists for insert to authenticated
  with check (public.module_enabled(org_id, 'events') and public.has_perm(org_id, 'events.manage'));
create policy "managers edit artists" on public.artists for update to authenticated
  using (public.module_enabled(org_id, 'events') and public.has_perm(org_id, 'events.manage'))
  with check (public.module_enabled(org_id, 'events') and public.has_perm(org_id, 'events.manage'));
create policy "members view slots" on public.event_slots for select to authenticated
  using (public.module_enabled(org_id, 'events') and public.has_perm(org_id, 'events.view'));
create policy "managers write slots" on public.event_slots for all to authenticated
  using (public.module_enabled(org_id, 'events') and public.has_perm(org_id, 'events.manage'))
  with check (public.module_enabled(org_id, 'events') and public.has_perm(org_id, 'events.manage')
    and exists (select 1 from public.events e where e.id = event_id and e.org_id = event_slots.org_id));

-- Public timetable: public slots of published events (artist name/description via column grants).
grant select (id, event_id, artist_id, title, stage, starts_at, ends_at) on public.event_slots to anon;
create policy "public sees timetable" on public.event_slots for select to anon
  using (public and exists (select 1 from public.events e where e.id = event_id and e.status in ('published', 'cancelled')
    and e.deleted_at is null and public.events_public(e.org_id)));
grant select (id, name, description, links) on public.artists to anon;
create policy "public sees lineup artists" on public.artists for select to anon
  using (deleted_at is null and exists (select 1 from public.event_slots s join public.events e on e.id = s.event_id
    where s.artist_id = artists.id and s.public and e.status in ('published', 'cancelled') and e.deleted_at is null and public.events_public(e.org_id)));

create table public.guest_lists (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  event_id uuid references public.events on delete cascade,      -- null = permanent list, valid at every event
  artist_id uuid references public.artists on delete set null,
  name text not null check (length(trim(name)) between 1 and 100),
  door_price int not null default 0 check (door_price >= 0),     -- cents to pay at the door (0 = free)
  quota int check (quota > 0),                                    -- max entries on the list
  per_submission int not null default 5 check (per_submission between 1 and 50), -- names per link submission
  link_token text unique check (link_token ~ '^[a-z0-9]{24}$'),
  link_enabled boolean not null default false,
  link_closes_at timestamptz,
  ticket_type_id uuid references public.ticket_types on delete set null, -- optional: entries get real (free) tickets
  notes text check (length(notes) <= 2000),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index guest_lists_event on public.guest_lists (org_id, event_id);
create index guest_lists_artist on public.guest_lists (artist_id);
create index guest_lists_type on public.guest_lists (ticket_type_id);
select public.enable_audit('public.guest_lists');
select public.enable_soft_delete('public.guest_lists', 'org_id', 'guestlists.manage', 30);

create table public.guest_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  list_id uuid not null references public.guest_lists on delete cascade,
  name text not null check (length(trim(name)) between 1 and 200),
  email text check (length(email) <= 320),
  note text check (length(note) <= 500),
  added_via text not null default 'app' check (added_via in ('app', 'link', 'api')),
  submitted_by text check (length(submitted_by) <= 200),          -- who entered it via the link
  ticket_id uuid references public.tickets on delete set null,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index guest_entries_list on public.guest_entries (list_id, name);
create index guest_entries_org on public.guest_entries (org_id);
create index guest_entries_ticket on public.guest_entries (ticket_id);
select public.enable_audit('public.guest_entries');

-- Check-ins per event (a permanent-list entry can come to many events).
create table public.guest_checkins (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  entry_id uuid not null references public.guest_entries on delete cascade,
  event_id uuid not null references public.events on delete cascade,
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  unique (entry_id, event_id)
);
create index guest_checkins_event on public.guest_checkins (event_id);
create index guest_checkins_org on public.guest_checkins (org_id);
select public.enable_audit('public.guest_checkins');

alter table public.guest_lists enable row level security;
alter table public.guest_entries enable row level security;
alter table public.guest_checkins enable row level security;
revoke all on public.guest_lists, public.guest_entries, public.guest_checkins from anon;
-- Door staff (guestlists.checkin) see lists and names; managers edit.
create policy "view lists" on public.guest_lists for select to authenticated
  using (public.module_enabled(org_id, 'guestlists') and (public.has_perm(org_id, 'guestlists.view') or public.has_perm(org_id, 'guestlists.checkin')));
create policy "add lists" on public.guest_lists for insert to authenticated
  with check (public.module_enabled(org_id, 'guestlists') and public.has_perm(org_id, 'guestlists.manage'));
create policy "edit lists" on public.guest_lists for update to authenticated
  using (public.module_enabled(org_id, 'guestlists') and public.has_perm(org_id, 'guestlists.manage'))
  with check (public.module_enabled(org_id, 'guestlists') and public.has_perm(org_id, 'guestlists.manage'));
create policy "view entries" on public.guest_entries for select to authenticated
  using (public.module_enabled(org_id, 'guestlists') and (public.has_perm(org_id, 'guestlists.view') or public.has_perm(org_id, 'guestlists.checkin')));
create policy "write entries" on public.guest_entries for all to authenticated
  using (public.module_enabled(org_id, 'guestlists') and public.has_perm(org_id, 'guestlists.manage'))
  with check (public.module_enabled(org_id, 'guestlists') and public.has_perm(org_id, 'guestlists.manage')
    and exists (select 1 from public.guest_lists l where l.id = list_id and l.org_id = guest_entries.org_id));
create policy "view checkins" on public.guest_checkins for select to authenticated
  using (public.module_enabled(org_id, 'guestlists') and (public.has_perm(org_id, 'guestlists.view') or public.has_perm(org_id, 'guestlists.checkin')));
create policy "check in" on public.guest_checkins for insert to authenticated
  with check (public.module_enabled(org_id, 'guestlists') and public.has_perm(org_id, 'guestlists.checkin')
    and exists (select 1 from public.guest_entries g join public.guest_lists l on l.id = g.list_id
      where g.id = entry_id and g.org_id = guest_checkins.org_id and (l.event_id is null or l.event_id = guest_checkins.event_id)));
create policy "undo check in" on public.guest_checkins for delete to authenticated
  using (public.module_enabled(org_id, 'guestlists') and public.has_perm(org_id, 'guestlists.checkin'));

-- Public magic link: what the link page may show (no names), and adding names (validated, quota-locked).
create function public.guest_link_info(p_token text)
returns table (list_id uuid, list_name text, event_title text, starts_at timestamptz, org_name text, remaining int, per_submission int, open boolean)
language sql stable security definer set search_path = '' as $$
  select l.id, l.name, e.title, e.starts_at, o.name,
    case when l.quota is null then null else greatest(l.quota - (select count(*) from public.guest_entries g where g.list_id = l.id)::int, 0) end,
    l.per_submission,
    l.link_enabled and l.deleted_at is null and (l.link_closes_at is null or l.link_closes_at > now())
      and (e.id is null or (e.deleted_at is null and e.status = 'published'))
      and public.org_alive(l.org_id) and exists (select 1 from public.org_modules m where m.org_id = l.org_id and m.module_key = 'guestlists')
  from public.guest_lists l join public.orgs o on o.id = l.org_id left join public.events e on e.id = l.event_id
  where l.link_token = p_token and p_token ~ '^[a-z0-9]{24}$';
$$;
grant execute on function public.guest_link_info(text) to anon, authenticated;

create function public.guest_link_add(p_token text, p_submitted_by text, p_names text[], p_email text default null)
returns setof public.guest_entries
language plpgsql security definer set search_path = '' as $$
declare l public.guest_lists; i record; v_n int := 0; v_name text;
begin
  select * into l from public.guest_lists where link_token = p_token and p_token ~ '^[a-z0-9]{24}$' for update;
  if l.id is null or not (select open from public.guest_link_info(p_token)) then raise exception 'link_closed'; end if;
  select count(*) into v_n from unnest(p_names) n where length(trim(n)) > 0;
  if v_n = 0 or v_n > l.per_submission then raise exception 'invalid_input'; end if;
  if l.quota is not null and (select count(*) from public.guest_entries where list_id = l.id) + v_n > l.quota then raise exception 'list_full'; end if;
  for v_name in select trim(n) from unnest(p_names) n where length(trim(n)) > 0 loop
    return query insert into public.guest_entries (org_id, list_id, name, email, added_via, submitted_by)
      values (l.org_id, l.id, left(v_name, 200), nullif(lower(trim(p_email)), ''), 'link', left(nullif(trim(p_submitted_by), ''), 200))
      returning *;
  end loop;
end $$;
revoke execute on function public.guest_link_add(text, text, text[], text) from public, anon, authenticated;
grant execute on function public.guest_link_add(text, text, text[], text) to service_role;


create function public.guests_emit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select n.list_id, n.org_id, count(*) as cnt, min(n.submitted_by) as who from inserted n where n.added_via = 'link' group by 1, 2 loop
    perform public.emit_event(r.org_id, 'guestlist.signed_up', jsonb_build_object('list_id', r.list_id, 'count', r.cnt,
      'name', r.who, 'list', (select name from public.guest_lists where id = r.list_id)), 'guest_lists', r.list_id::text);
  end loop;
  return null;
end $$;
revoke execute on function public.guests_emit() from public, anon, authenticated;
create trigger guests_emit after insert on public.guest_entries referencing new table as inserted for each statement execute function public.guests_emit();
