-- Projects v2: real projects (between a task board and full project management).
-- * projects: name, description (rich text), colour, lead, start/end, custom fields, a status from the org's project
--   columns (task_statuses with scope 'project', so the project board works like the task board), soft delete.
-- * tasks: optional project, start date, custom fields.
-- * project_links: a project points to records elsewhere (wiki pages, events, contacts …).
-- * comments: generic comment thread on a record (projects, tasks for now); the activity feed = comments + change log
--   (record_changes()).

-- 1. columns for projects next to the task columns
alter table public.task_statuses add column scope text not null default 'task' check (scope in ('task', 'project'));
create index task_statuses_scope on public.task_statuses (org_id, scope, position);

create or replace function public.seed_task_statuses(p_org uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.task_statuses (org_id, name, color, position, is_done, scope)
  select p_org, s.name, s.color, s.position, s.is_done, 'task'
  from (values ('Offen', 'gray', 0, false), ('In Arbeit', 'blue', 1, false), ('Erledigt', 'green', 2, true)) s(name, color, position, is_done)
  where not exists (select 1 from public.task_statuses where org_id = p_org and scope = 'task');
  insert into public.task_statuses (org_id, name, color, position, is_done, scope)
  select p_org, s.name, s.color, s.position, s.is_done, 'project'
  from (values ('Geplant', 'gray', 0, false), ('Aktiv', 'blue', 1, false), ('Pausiert', 'yellow', 2, false), ('Abgeschlossen', 'green', 3, true)) s(name, color, position, is_done)
  where not exists (select 1 from public.task_statuses where org_id = p_org and scope = 'project');
$$;
revoke execute on function public.seed_task_statuses(uuid) from public, anon, authenticated;
select public.seed_task_statuses(id) from public.orgs;

-- 2. projects
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  status_id uuid not null references public.task_statuses on delete restrict,
  name text not null check (length(trim(name)) between 1 and 200),
  description text not null default '' check (length(description) <= 200000), -- rich text (HTML)
  color text not null default 'blue' check (color in ('gray', 'blue', 'green', 'yellow', 'orange', 'red', 'purple', 'pink')),
  lead_id uuid references auth.users on delete set null,
  start_on date,
  end_on date,
  position double precision not null default 0, -- order within its status column
  custom jsonb not null default '{}',
  completed_at timestamptz,
  deleted_at timestamptz, deleted_by uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  check (end_on is null or start_on is null or end_on >= start_on)
);
create index projects_board on public.projects (org_id, status_id, position) where deleted_at is null;
select public.enable_audit('public.projects');
select public.enable_soft_delete('public.projects', 'org_id', 'projects.manage', 30);

-- Status = a project column of the same org; lead = team member; completed_at follows the column (like tasks).
create function public.projects_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_done boolean;
begin
  select is_done into v_done from public.task_statuses where id = new.status_id and org_id = new.org_id and scope = 'project';
  if v_done is null then raise exception 'not_allowed'; end if;
  if new.lead_id is not null and not exists (select 1 from public.org_members where org_id = new.org_id and user_id = new.lead_id) then
    raise exception 'not_allowed';
  end if;
  if v_done then new.completed_at := coalesce(case when tg_op = 'UPDATE' then old.completed_at end, now()); else new.completed_at := null; end if;
  return new;
end $$;
revoke execute on function public.projects_guard() from public, anon, authenticated;
create trigger projects_guard before insert or update of status_id, lead_id on public.projects for each row execute function public.projects_guard();

-- 3. tasks: project, start date, custom fields
alter table public.tasks add column project_id uuid references public.projects on delete set null;
alter table public.tasks add column start_on date;
alter table public.tasks add column custom jsonb not null default '{}';
alter table public.tasks add constraint tasks_dates check (due_on is null or start_on is null or due_on >= start_on);
create index tasks_project on public.tasks (project_id, position) where deleted_at is null;

create or replace function public.tasks_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_done boolean;
begin
  select is_done into v_done from public.task_statuses where id = new.status_id and org_id = new.org_id and scope = 'task';
  if v_done is null then raise exception 'not_allowed'; end if;
  if new.project_id is not null and not exists (select 1 from public.projects where id = new.project_id and org_id = new.org_id) then
    raise exception 'not_allowed';
  end if;
  if v_done and (tg_op = 'INSERT' or new.status_id is distinct from old.status_id or old.completed_at is null) then new.completed_at := coalesce(new.completed_at, now()); end if;
  if not v_done then new.completed_at := null; end if;
  return new;
end $$;
drop trigger tasks_guard on public.tasks;
create trigger tasks_guard before insert or update of status_id, project_id on public.tasks for each row execute function public.tasks_guard();

-- 4. links from a project to other records (link rows: hard delete)
create table public.project_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  project_id uuid not null references public.projects on delete cascade,
  entity text not null check (entity in ('wiki_pages', 'events', 'contacts', 'courses', 'rentals', 'rental_objects', 'documents', 'forms')),
  entity_id uuid not null,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  unique (project_id, entity, entity_id)
);
create index project_links_target on public.project_links (entity, entity_id);
create index project_links_org on public.project_links (org_id);
select public.enable_audit('public.project_links');

create function public.project_links_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_ok boolean;
begin
  if not exists (select 1 from public.projects where id = new.project_id and org_id = new.org_id) then raise exception 'not_allowed'; end if;
  execute format('select exists (select 1 from public.%I where id = $1 and org_id = $2)', new.entity) into v_ok using new.entity_id, new.org_id;
  if not v_ok then raise exception 'not_allowed'; end if;
  return new;
end $$;
revoke execute on function public.project_links_guard() from public, anon, authenticated;
create trigger project_links_guard before insert or update on public.project_links for each row execute function public.project_links_guard();

-- 5. comments on a record (everyone who sees the record may comment; own comments can be changed/removed, managers remove any)
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  entity text not null check (entity in ('projects', 'tasks')),
  entity_id uuid not null,
  body text not null check (length(trim(body)) between 1 and 10000),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index comments_record on public.comments (entity, entity_id, created_at desc);
create index comments_org on public.comments (org_id);
select public.enable_audit('public.comments');

create function public.comments_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_ok boolean;
begin
  execute format('select exists (select 1 from public.%I where id = $1 and org_id = $2 and deleted_at is null)', new.entity) into v_ok using new.entity_id, new.org_id;
  if not v_ok then raise exception 'not_allowed'; end if;
  return new;
end $$;
revoke execute on function public.comments_guard() from public, anon, authenticated;
create trigger comments_guard before insert on public.comments for each row execute function public.comments_guard();

-- 6. activity: the change log of one record, for people who may see it (projects + tasks)
create function public.record_changes(p_table text, p_id uuid) returns table (at timestamptz, actor_id uuid, action text, old jsonb, new jsonb, via text)
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  if p_table not in ('projects', 'tasks') then return; end if;
  execute format('select org_id from public.%I where id = $1', p_table) into v_org using p_id;
  if v_org is null or not public.module_enabled(v_org, 'projects') or not (public.has_perm(v_org, 'projects.view') or public.has_perm(v_org, 'projects.manage')) then return; end if;
  return query
    select a.at, a.actor_id, a.action, a.old, a.new, a.via from public.audit_log a
    where a.table_name = p_table and a.row_id = p_id::text and a.org_id = v_org
    order by a.at desc limit 200;
end $$;
revoke execute on function public.record_changes(text, uuid) from public, anon;
grant execute on function public.record_changes(text, uuid) to authenticated, service_role;

-- 7. custom fields on projects and tasks
alter table public.custom_fields drop constraint custom_fields_entity_check;
alter table public.custom_fields add constraint custom_fields_entity_check check (entity in ('contacts', 'events', 'memberships', 'rental_objects', 'rentals', 'projects', 'tasks'));

-- 8. RLS
alter table public.projects enable row level security;
alter table public.project_links enable row level security;
alter table public.comments enable row level security;
revoke all on public.projects, public.project_links, public.comments from anon;

create policy "view projects" on public.projects for select to authenticated
  using (public.module_enabled(org_id, 'projects') and (public.has_perm(org_id, 'projects.view') or public.has_perm(org_id, 'projects.manage')));
create policy "manage projects" on public.projects for all to authenticated
  using (public.module_enabled(org_id, 'projects') and public.has_perm(org_id, 'projects.manage'))
  with check (public.module_enabled(org_id, 'projects') and public.has_perm(org_id, 'projects.manage'));
create policy "view project links" on public.project_links for select to authenticated
  using (public.module_enabled(org_id, 'projects') and (public.has_perm(org_id, 'projects.view') or public.has_perm(org_id, 'projects.manage')));
create policy "manage project links" on public.project_links for all to authenticated
  using (public.module_enabled(org_id, 'projects') and public.has_perm(org_id, 'projects.manage'))
  with check (public.module_enabled(org_id, 'projects') and public.has_perm(org_id, 'projects.manage'));
create policy "view comments" on public.comments for select to authenticated
  using (public.module_enabled(org_id, 'projects') and (public.has_perm(org_id, 'projects.view') or public.has_perm(org_id, 'projects.manage')));
create policy "write comments" on public.comments for insert to authenticated
  with check (public.module_enabled(org_id, 'projects') and (public.has_perm(org_id, 'projects.view') or public.has_perm(org_id, 'projects.manage')) and created_by = public.actor());
create policy "edit own comments" on public.comments for update to authenticated
  using (created_by = public.actor() and public.is_member(org_id))
  with check (created_by = public.actor() and public.is_member(org_id));
create policy "remove comments" on public.comments for delete to authenticated
  using ((created_by = public.actor() and public.is_member(org_id)) or (public.module_enabled(org_id, 'projects') and public.has_perm(org_id, 'projects.manage')));
