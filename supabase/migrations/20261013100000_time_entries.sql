-- Time tracking (shifts module): every worked period is a time entry, with or without a shift.
-- Shift check-in/out now writes entries too (one source for worked time; the old columns on assignments go).
-- Staff edit their own entries until someone with shifts.approve approves them (then only shifts.manage /
-- shifts.approve can change them). Approving is its own permission, so a role can approve without planning.
-- break_minutes null = automatic (legal minimum, computed in src/shifts/time.ts).
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  staff_id uuid not null references public.staff on delete cascade,
  shift_id uuid references public.shifts on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz check (ended_at > started_at),
  break_minutes int check (break_minutes between 0 and 1440),
  note text check (length(note) <= 500),
  approved_at timestamptz,
  approved_by uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create unique index time_entries_running on public.time_entries (staff_id) where ended_at is null; -- one open clock per person
create index time_entries_org on public.time_entries (org_id, started_at);
create index time_entries_staff on public.time_entries (staff_id, started_at);
create index time_entries_shift on public.time_entries (shift_id);
select public.enable_audit('public.time_entries');

alter table public.time_entries enable row level security;
revoke all on public.time_entries from anon;

create function public.time_entry_refs_ok(p_org uuid, p_staff uuid, p_shift uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff where id = p_staff and org_id = p_org)
    and (p_shift is null or exists (select 1 from public.shifts where id = p_shift and org_id = p_org));
$$;

create policy "see time" on public.time_entries for select to authenticated
  using (public.module_enabled(org_id, 'shifts') and (public.has_perm(org_id, 'shifts.view') or public.has_perm(org_id, 'shifts.approve')
    or staff_id = public.my_staff_id(org_id)));
create policy "approve time" on public.time_entries for update to authenticated
  using (public.module_enabled(org_id, 'shifts') and public.has_perm(org_id, 'shifts.approve'))
  with check (public.module_enabled(org_id, 'shifts') and public.has_perm(org_id, 'shifts.approve') and public.time_entry_refs_ok(org_id, staff_id, shift_id));
create policy "manage time" on public.time_entries for all to authenticated
  using (public.module_enabled(org_id, 'shifts') and public.has_perm(org_id, 'shifts.manage'))
  with check (public.module_enabled(org_id, 'shifts') and public.has_perm(org_id, 'shifts.manage') and public.time_entry_refs_ok(org_id, staff_id, shift_id));
-- Own entries, as long as they aren't approved; staff can't approve.
create policy "own time" on public.time_entries for all to authenticated
  using (public.module_enabled(org_id, 'shifts') and public.has_perm(org_id, 'shifts.self') and staff_id = public.my_staff_id(org_id) and approved_at is null)
  with check (public.module_enabled(org_id, 'shifts') and public.has_perm(org_id, 'shifts.self') and staff_id = public.my_staff_id(org_id)
    and approved_at is null and approved_by is null and public.time_entry_refs_ok(org_id, staff_id, shift_id));

-- Only shifts.approve may approve/reopen (shifts.manage edits, but doesn't approve); stamps who approved.
create function public.time_entries_approval() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (tg_op = 'INSERT' and new.approved_at is not null) or (tg_op = 'UPDATE' and new.approved_at is distinct from old.approved_at) then
    if not public.has_perm(new.org_id, 'shifts.approve') then raise exception 'not_allowed'; end if;
    new.approved_by := case when new.approved_at is null then null else auth.uid() end;
  elsif tg_op = 'UPDATE' then
    new.approved_by := old.approved_by;
  else
    new.approved_by := null;
  end if;
  return new;
end $$;
create trigger time_entries_approval before insert or update on public.time_entries
  for each row execute function public.time_entries_approval();

-- Roles that plan shifts may approve time too (platform admins can change that at /admin/roles).
update public.roles set permissions = array_append(permissions, 'shifts.approve')
  where 'shifts.manage' = any (permissions) and not ('shifts.approve' = any (permissions));

-- Existing shift check-ins become entries.
insert into public.time_entries (org_id, staff_id, shift_id, started_at, ended_at)
select a.org_id, a.staff_id, a.shift_id, a.checked_in_at, coalesce(a.checked_out_at, greatest(s.ends_at, a.checked_in_at + interval '1 minute'))
from public.shift_assignments a join public.shifts s on s.id = a.shift_id
where a.checked_in_at is not null;
alter table public.shift_assignments drop column checked_in_at, drop column checked_out_at;

-- Self-service check-in/out of an assigned shift now writes a time entry linked to the shift.
create or replace function public.shift_self(p_action text, p_shift uuid, p_token text default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_staff public.staff; s public.shifts;
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
    if not exists (select 1 from public.shift_assignments where shift_id = s.id and staff_id = v_staff.id and status = 'assigned') then
      raise exception 'not_assigned';
    end if;
    if exists (select 1 from public.time_entries where staff_id = v_staff.id and ended_at is null) then raise exception 'clock_running'; end if;
    if not exists (select 1 from public.time_entries where staff_id = v_staff.id and shift_id = s.id) then
      insert into public.time_entries (org_id, staff_id, shift_id, started_at) values (s.org_id, v_staff.id, s.id, now());
    end if;
    return 'checked_in';
  elsif p_action = 'check_out' then
    update public.time_entries set ended_at = greatest(now(), started_at + interval '1 minute')
      where staff_id = v_staff.id and shift_id = s.id and ended_at is null;
    if not found then raise exception 'not_assigned'; end if;
    return 'checked_out';
  end if;
  raise exception 'invalid_input';
end $$;
