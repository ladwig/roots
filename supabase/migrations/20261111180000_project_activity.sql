-- Projects as a work log (e.g. trades): money custom fields, comments with attachments (files on the project),
-- only the author edits/removes a comment, and one activity feed per project that includes its tasks.

-- 1. custom field type "money" (value = euros as a number, shown as 1.234,50 €)
alter table public.custom_fields drop constraint custom_fields_type_check;
alter table public.custom_fields add constraint custom_fields_type_check check (type in ('text', 'number', 'money', 'date', 'boolean', 'select', 'email', 'url'));

-- 2. comments carry files (rows in public.files, attached to the project); a photo alone is a comment too
alter table public.comments add column file_ids uuid[] not null default '{}' check (cardinality(file_ids) <= 20);
alter table public.comments drop constraint comments_body_check;
alter table public.comments add constraint comments_body_check check (length(body) <= 10000 and (length(trim(body)) >= 1 or cardinality(file_ids) > 0));

-- 3. only the author removes a comment
drop policy "remove comments" on public.comments;
create policy "remove own comments" on public.comments for delete to authenticated
  using (created_by = public.actor() and public.is_member(org_id));

-- 4. a project's change log + the change log of the tasks in it now (index audit_log_row), newest first
create function public.project_changes(p_id uuid) returns table (table_name text, row_id text, at timestamptz, actor_id uuid, action text, old jsonb, new jsonb, via text)
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  select org_id into v_org from public.projects where id = p_id;
  if v_org is null or not public.module_enabled(v_org, 'projects') or not (public.has_perm(v_org, 'projects.view') or public.has_perm(v_org, 'projects.manage')) then return; end if;
  return query
    select a.table_name, a.row_id, a.at, a.actor_id, a.action, a.old, a.new, a.via from public.audit_log a
    where a.org_id = v_org and (
      (a.table_name = 'projects' and a.row_id = p_id::text)
      or (a.table_name = 'tasks' and a.row_id in (select t.id::text from public.tasks t where t.project_id = p_id and t.org_id = v_org))
    )
    order by a.at desc limit 300;
end $$;
revoke execute on function public.project_changes(uuid) from public, anon;
grant execute on function public.project_changes(uuid) to authenticated, service_role;
