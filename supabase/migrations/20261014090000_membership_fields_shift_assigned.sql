-- Custom fields on memberships (e.g. trial visits: a new membership starts fresh).
alter table public.memberships add column custom jsonb not null default '{}';
alter table public.custom_fields drop constraint custom_fields_entity_check;
alter table public.custom_fields add constraint custom_fields_entity_check check (entity in ('contacts', 'events', 'memberships'));

-- shift.assigned: someone has a shift now, assigned directly or an application confirmed (for workflows,
-- e.g. Worker +1). Once per assignment.
create function public.shift_assignments_emit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s record; w record;
begin
  if new.status <> 'assigned' or (tg_op = 'UPDATE' and old.status = 'assigned') then return null; end if;
  select id, title, starts_at, event_id into s from public.shifts where id = new.shift_id;
  select id, name, contact_id into w from public.staff where id = new.staff_id;
  perform public.emit_event(new.org_id, 'shift.assigned', jsonb_build_object('shift_id', s.id, 'staff_id', w.id, 'contact_id', w.contact_id,
    'event_id', s.event_id, 'name', w.name, 'title', s.title, 'starts_at', s.starts_at), 'shift_assignments', new.id::text);
  return null;
end $$;
revoke execute on function public.shift_assignments_emit() from public, anon, authenticated;
create trigger shift_assignments_emit after insert or update of status on public.shift_assignments
  for each row execute function public.shift_assignments_emit();
