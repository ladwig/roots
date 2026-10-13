-- Project management (module "projects"): tasks with a status (org-defined columns of the board), assignees (team
-- members), deadline, tags (e.g. one per project), Markdown description and a checklist of subtasks.
-- Tasks are business objects (soft delete); statuses are settings (deleted only while unused).

create or replace function public.default_module_keys() returns text[]
language sql immutable set search_path = '' as $$
  select array['crm', 'payments', 'events', 'tickets', 'guestlists', 'invoices', 'shifts', 'members', 'forms', 'email', 'hr', 'courses', 'automations', 'reports', 'cashbook', 'wiki', 'projects']
$$;
insert into public.org_modules (org_id, module_key) select id, 'projects' from public.orgs on conflict do nothing;

create table public.task_statuses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  color text not null default 'gray' check (color in ('gray', 'blue', 'green', 'yellow', 'orange', 'red', 'purple', 'pink')),
  position int not null default 0,
  is_done boolean not null default false,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index task_statuses_org on public.task_statuses (org_id, position);
select public.enable_audit('public.task_statuses');

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  status_id uuid not null references public.task_statuses on delete restrict,
  title text not null check (length(trim(title)) between 1 and 300),
  description text not null default '' check (length(description) <= 100000),
  position double precision not null default 0,             -- order within the status column
  due_on date,
  tags text[] not null default '{}',
  checklist jsonb not null default '[]' check (jsonb_typeof(checklist) = 'array' and jsonb_array_length(checklist) <= 200), -- [{id, text, done}]
  completed_at timestamptz,                                  -- set when moved into a "done" status
  deleted_at timestamptz, deleted_by uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index tasks_board on public.tasks (org_id, status_id, position) where deleted_at is null;
create index tasks_tags on public.tasks using gin (tags);
select public.enable_audit('public.tasks');
select public.enable_soft_delete('public.tasks', 'org_id', 'projects.manage', 30);

create table public.task_assignees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  task_id uuid not null references public.tasks on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  unique (task_id, user_id)
);
create index task_assignees_user on public.task_assignees (user_id, org_id);
select public.enable_audit('public.task_assignees');

-- Same org everywhere; assignees are team members; completed_at follows the status.
create function public.tasks_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_done boolean;
begin
  select is_done into v_done from public.task_statuses where id = new.status_id and org_id = new.org_id;
  if v_done is null then raise exception 'not_allowed'; end if;
  if v_done and (tg_op = 'INSERT' or new.status_id is distinct from old.status_id or old.completed_at is null) then new.completed_at := coalesce(new.completed_at, now()); end if;
  if not v_done then new.completed_at := null; end if;
  return new;
end $$;
revoke execute on function public.tasks_guard() from public, anon, authenticated;
create trigger tasks_guard before insert or update of status_id on public.tasks for each row execute function public.tasks_guard();

create function public.task_assignees_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.tasks where id = new.task_id and org_id = new.org_id)
     or not exists (select 1 from public.org_members where org_id = new.org_id and user_id = new.user_id) then
    raise exception 'not_allowed';
  end if;
  return new;
end $$;
revoke execute on function public.task_assignees_guard() from public, anon, authenticated;
create trigger task_assignees_guard before insert on public.task_assignees for each row execute function public.task_assignees_guard();

-- Hub events: task.assigned (to the new assignee: user_ids), task.completed.
create function public.task_assignees_emit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.emit_event(new.org_id, 'task.assigned', jsonb_build_object('task_id', new.task_id, 'user_ids', jsonb_build_array(new.user_id),
    'title', (select title from public.tasks where id = new.task_id)), 'tasks', new.task_id::text);
  return null;
end $$;
revoke execute on function public.task_assignees_emit() from public, anon, authenticated;
create trigger task_assignees_emit after insert on public.task_assignees for each row execute function public.task_assignees_emit();

create function public.tasks_emit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.completed_at is not null and old.completed_at is null then
    perform public.emit_event(new.org_id, 'task.completed', jsonb_build_object('task_id', new.id, 'title', new.title,
      'user_ids', coalesce((select jsonb_agg(user_id) from public.task_assignees where task_id = new.id), '[]')), 'tasks', new.id::text);
  end if;
  return null;
end $$;
revoke execute on function public.tasks_emit() from public, anon, authenticated;
create trigger tasks_emit after update of completed_at on public.tasks for each row execute function public.tasks_emit();

-- Default columns for every org (and new orgs).
create function public.seed_task_statuses(p_org uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.task_statuses (org_id, name, color, position, is_done)
  select p_org, s.name, s.color, s.position, s.is_done
  from (values ('Offen', 'gray', 0, false), ('In Arbeit', 'blue', 1, false), ('Erledigt', 'green', 2, true)) s(name, color, position, is_done)
  where not exists (select 1 from public.task_statuses where org_id = p_org);
$$;
revoke execute on function public.seed_task_statuses(uuid) from public, anon, authenticated;
select public.seed_task_statuses(id) from public.orgs;
create function public.orgs_seed_task_statuses() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.seed_task_statuses(new.id);
  return null;
end $$;
revoke execute on function public.orgs_seed_task_statuses() from public, anon, authenticated;
create trigger orgs_seed_task_statuses after insert on public.orgs for each row execute function public.orgs_seed_task_statuses();

alter table public.task_statuses enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
revoke all on public.task_statuses, public.tasks, public.task_assignees from anon;

create policy "view task statuses" on public.task_statuses for select to authenticated
  using (public.module_enabled(org_id, 'projects') and (public.has_perm(org_id, 'projects.view') or public.has_perm(org_id, 'projects.manage')));
create policy "manage task statuses" on public.task_statuses for all to authenticated
  using (public.module_enabled(org_id, 'projects') and public.has_perm(org_id, 'projects.manage'))
  with check (public.module_enabled(org_id, 'projects') and public.has_perm(org_id, 'projects.manage'));
create policy "view tasks" on public.tasks for select to authenticated
  using (public.module_enabled(org_id, 'projects') and (public.has_perm(org_id, 'projects.view') or public.has_perm(org_id, 'projects.manage')));
create policy "manage tasks" on public.tasks for all to authenticated
  using (public.module_enabled(org_id, 'projects') and public.has_perm(org_id, 'projects.manage'))
  with check (public.module_enabled(org_id, 'projects') and public.has_perm(org_id, 'projects.manage'));
create policy "view task assignees" on public.task_assignees for select to authenticated
  using (public.module_enabled(org_id, 'projects') and (public.has_perm(org_id, 'projects.view') or public.has_perm(org_id, 'projects.manage')));
create policy "manage task assignees" on public.task_assignees for all to authenticated
  using (public.module_enabled(org_id, 'projects') and public.has_perm(org_id, 'projects.manage'))
  with check (public.module_enabled(org_id, 'projects') and public.has_perm(org_id, 'projects.manage'));
