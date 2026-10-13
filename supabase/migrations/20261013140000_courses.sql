-- Courses module (requires crm): a course with dates (sessions), participants (contacts) with a waiting list,
-- optional attendance per session. Places are enforced in the DB: a new participant waits when the course is
-- full; when an enrolled one leaves, the oldest waiting one moves up (both under a lock on the course).
-- ponytail: no public sign-up, fees or member-area section yet (v2).

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  description text check (length(description) <= 5000),
  location_id uuid references public.locations on delete set null,
  instructor text check (length(instructor) <= 200),
  capacity int check (capacity between 1 and 10000),             -- null = unlimited
  track_attendance boolean not null default true,
  deleted_at timestamptz, deleted_by uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index courses_org on public.courses (org_id, title);
select public.enable_audit('public.courses');
select public.enable_soft_delete('public.courses', 'org_id', 'courses.manage', 30);

create table public.course_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  course_id uuid not null references public.courses on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  location_id uuid references public.locations on delete set null, -- null = the course's
  cancelled boolean not null default false,
  note text check (length(note) <= 500),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  unique (course_id, starts_at)
);
create index course_sessions_org on public.course_sessions (org_id, starts_at);
select public.enable_audit('public.course_sessions');

create table public.course_participants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  course_id uuid not null references public.courses on delete cascade,
  contact_id uuid not null references public.contacts on delete cascade,
  status text not null default 'enrolled' check (status in ('enrolled', 'waiting', 'cancelled')),
  note text check (length(note) <= 500),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  unique (course_id, contact_id)
);
create index course_participants_course on public.course_participants (course_id, status, created_at);
create index course_participants_contact on public.course_participants (contact_id);
select public.enable_audit('public.course_participants');

create table public.course_attendance (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  session_id uuid not null references public.course_sessions on delete cascade,
  participant_id uuid not null references public.course_participants on delete cascade,
  present boolean not null,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  unique (session_id, participant_id)
);
create index course_attendance_participant on public.course_attendance (participant_id);
select public.enable_audit('public.course_attendance');

alter table public.courses enable row level security;
alter table public.course_sessions enable row level security;
alter table public.course_participants enable row level security;
alter table public.course_attendance enable row level security;
revoke all on public.courses, public.course_sessions, public.course_participants, public.course_attendance from anon;

-- References must stay inside the org (course, contact, location, session/participant of the same course).
create function public.course_refs_ok(p_org uuid, p_course uuid, p_contact uuid, p_location uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (p_course is null or exists (select 1 from public.courses where id = p_course and org_id = p_org))
    and (p_contact is null or exists (select 1 from public.contacts where id = p_contact and org_id = p_org))
    and (p_location is null or exists (select 1 from public.locations where id = p_location and org_id = p_org));
$$;
create function public.attendance_refs_ok(p_org uuid, p_session uuid, p_participant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.course_sessions s join public.course_participants p on p.course_id = s.course_id
    where s.id = p_session and p.id = p_participant and s.org_id = p_org and p.org_id = p_org);
$$;
revoke execute on function public.course_refs_ok(uuid, uuid, uuid, uuid), public.attendance_refs_ok(uuid, uuid, uuid) from public, anon;
grant execute on function public.course_refs_ok(uuid, uuid, uuid, uuid), public.attendance_refs_ok(uuid, uuid, uuid) to authenticated, service_role;

create policy "see courses" on public.courses for select to authenticated
  using (public.module_enabled(org_id, 'courses') and public.has_perm(org_id, 'courses.view'));
create policy "manage courses" on public.courses for all to authenticated
  using (public.module_enabled(org_id, 'courses') and public.has_perm(org_id, 'courses.manage'))
  with check (public.module_enabled(org_id, 'courses') and public.has_perm(org_id, 'courses.manage') and public.course_refs_ok(org_id, null, null, location_id));
create policy "see sessions" on public.course_sessions for select to authenticated
  using (public.module_enabled(org_id, 'courses') and public.has_perm(org_id, 'courses.view'));
create policy "manage sessions" on public.course_sessions for all to authenticated
  using (public.module_enabled(org_id, 'courses') and public.has_perm(org_id, 'courses.manage'))
  with check (public.module_enabled(org_id, 'courses') and public.has_perm(org_id, 'courses.manage') and public.course_refs_ok(org_id, course_id, null, location_id));
create policy "see participants" on public.course_participants for select to authenticated
  using (public.module_enabled(org_id, 'courses') and public.has_perm(org_id, 'courses.view'));
create policy "manage participants" on public.course_participants for all to authenticated
  using (public.module_enabled(org_id, 'courses') and public.has_perm(org_id, 'courses.manage'))
  with check (public.module_enabled(org_id, 'courses') and public.has_perm(org_id, 'courses.manage') and public.course_refs_ok(org_id, course_id, contact_id, null));
create policy "see attendance" on public.course_attendance for select to authenticated
  using (public.module_enabled(org_id, 'courses') and public.has_perm(org_id, 'courses.view'));
create policy "manage attendance" on public.course_attendance for all to authenticated
  using (public.module_enabled(org_id, 'courses') and public.has_perm(org_id, 'courses.manage'))
  with check (public.module_enabled(org_id, 'courses') and public.has_perm(org_id, 'courses.manage') and public.attendance_refs_ok(org_id, session_id, participant_id));

-- Places: a new (or re-joining) participant waits when the course is full.
create function public.course_participant_place() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_cap int; v_taken int;
begin
  if new.status = 'enrolled' and (tg_op = 'INSERT' or old.status <> 'enrolled') then
    select capacity into v_cap from public.courses where id = new.course_id for update;
    if v_cap is not null then
      select count(*) into v_taken from public.course_participants where course_id = new.course_id and status = 'enrolled' and id <> new.id;
      if v_taken >= v_cap then new.status := 'waiting'; end if;
    end if;
  end if;
  return new;
end $$;
create trigger course_participant_place before insert or update of status on public.course_participants
  for each row execute function public.course_participant_place();

-- Free places (someone left, or the course got bigger) go to the waiting list, oldest first.
create function public.course_fill(p_course uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_cap int; v_free int; r record;
begin
  select capacity into v_cap from public.courses where id = p_course for update;
  if not found then return; end if;
  v_free := case when v_cap is null then 2147483647 else v_cap - (select count(*) from public.course_participants where course_id = p_course and status = 'enrolled') end;
  for r in select id, org_id, contact_id from public.course_participants where course_id = p_course and status = 'waiting' order by created_at limit greatest(v_free, 0) loop
    update public.course_participants set status = 'enrolled' where id = r.id;
    perform public.emit_event(r.org_id, 'course.moved_up',
      jsonb_build_object('course_id', p_course, 'contact_id', r.contact_id, 'title', (select title from public.courses where id = p_course)), 'courses', p_course::text);
  end loop;
end $$;
revoke execute on function public.course_fill(uuid) from public, anon, authenticated;

create function public.course_participant_left() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'enrolled' then perform public.course_fill(old.course_id); end if;
    return old;
  end if;
  if old.status = 'enrolled' and new.status <> 'enrolled' then perform public.course_fill(new.course_id); end if;
  return new;
end $$;
create trigger course_participant_left after update of status or delete on public.course_participants
  for each row execute function public.course_participant_left();

create function public.course_capacity_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.capacity is distinct from old.capacity then perform public.course_fill(new.id); end if;
  return new;
end $$;
create trigger course_capacity_changed after update of capacity on public.courses
  for each row execute function public.course_capacity_changed();

-- Hub event when someone gets a place (enrolled directly).
create function public.course_enrolled_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'enrolled' and tg_op = 'INSERT' then
    perform public.emit_event(new.org_id, 'course.enrolled',
      jsonb_build_object('course_id', new.course_id, 'contact_id', new.contact_id, 'title', (select title from public.courses where id = new.course_id)), 'courses', new.course_id::text);
  end if;
  return new;
end $$;
create trigger course_enrolled_event after insert on public.course_participants
  for each row execute function public.course_enrolled_event();

-- New module key for every org.
create or replace function public.default_module_keys() returns text[]
language sql immutable set search_path = '' as $$
  select array['crm', 'payments', 'events', 'tickets', 'guestlists', 'invoices', 'shifts', 'members', 'forms', 'email', 'hr', 'courses']
$$;
insert into public.org_modules (org_id, module_key) select id, 'courses' from public.orgs on conflict do nothing;
