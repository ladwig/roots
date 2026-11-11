-- Time per project: a time entry can belong to a project (and one of its tasks). Optional; payroll and approval
-- don't care. Same org, and the task must be in the project.
alter table public.time_entries
  add column project_id uuid references public.projects on delete set null,
  add column task_id uuid references public.tasks on delete set null;
create index time_entries_project on public.time_entries (project_id, started_at) where project_id is not null;

create function public.time_entries_project_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.task_id is not null and new.project_id is null then
    select project_id into new.project_id from public.tasks where id = new.task_id and org_id = new.org_id;
  end if;
  if new.project_id is not null and not exists (select 1 from public.projects where id = new.project_id and org_id = new.org_id) then raise exception 'not_allowed'; end if;
  if new.task_id is not null and not exists (select 1 from public.tasks where id = new.task_id and org_id = new.org_id and project_id is not distinct from new.project_id) then raise exception 'not_allowed'; end if;
  return new;
end $$;
revoke execute on function public.time_entries_project_guard() from public, anon, authenticated;
create trigger time_entries_project_guard before insert or update of project_id, task_id, org_id on public.time_entries
  for each row execute function public.time_entries_project_guard();
