-- Workflows can start from any record change: every audited table writes audit_log, and a workflow whose trigger is
-- "record:<table>:<insert|update|delete>" gets one run per change. The run's context holds only the record id and
-- the names of changed fields (never values: the log may contain sensitive columns); the worker loads the record
-- through the object catalog (src/automations/objects.ts), which only exposes catalog fields.
-- Loop guard: the workflow worker sends the header x-roots-workflow; its own writes (and events) start nothing.

create or replace function public.workflow_runs_start() returns trigger
language plpgsql security definer set search_path = '' as $$
declare w record; v_contact uuid;
begin
  if new.org_id is null or new.type like 'workflow.%' or not public.module_enabled(new.org_id, 'automations')
    or coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-roots-workflow', '') <> '' then
    return null;
  end if;
  v_contact := case when new.payload->>'contact_id' ~ '^[0-9a-f-]{36}$' then (new.payload->>'contact_id')::uuid end;
  if v_contact is null and nullif(new.payload->>'email', '') is not null then
    select c.id into v_contact from public.contacts c where c.org_id = new.org_id and c.email = lower(new.payload->>'email') and c.deleted_at is null;
  end if;
  for w in select id from public.workflows where org_id = new.org_id and trigger_type = new.type and active and deleted_at is null loop
    insert into public.workflow_runs (org_id, workflow_id, event_id, contact_id, context)
    values (new.org_id, w.id, new.id, v_contact, jsonb_build_object('event', new.type, 'payload', new.payload))
    on conflict (workflow_id, event_id) do nothing;
  end loop;
  return null;
end $$;

create function public.workflow_runs_from_changes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare w record; v_type text := 'record:' || new.table_name || ':' || new.action;
begin
  if new.org_id is null or new.table_name in ('workflows', 'workflow_runs', 'audit_log')
    or coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-roots-workflow', '') <> ''
    or not exists (select 1 from public.workflows where org_id = new.org_id and trigger_type = v_type and active and deleted_at is null) then
    return null;
  end if;
  for w in select id from public.workflows where org_id = new.org_id and trigger_type = v_type and active and deleted_at is null loop
    insert into public.workflow_runs (org_id, workflow_id, contact_id, context)
    values (new.org_id, w.id,
      case when new.table_name = 'contacts' and new.row_id ~ '^[0-9a-f-]{36}$' and new.action <> 'delete' then new.row_id::uuid end,
      jsonb_build_object('event', v_type, 'payload', jsonb_build_object(
        'id', new.row_id,
        'changed', (select coalesce(jsonb_agg(k), '[]') from jsonb_object_keys(case when new.action = 'update' then coalesce(new.new, '{}') else '{}' end) k))));
  end loop;
  return null;
end $$;
revoke execute on function public.workflow_runs_from_changes() from public, anon, authenticated;
create trigger workflow_runs_from_changes after insert on public.audit_log for each row execute function public.workflow_runs_from_changes();
