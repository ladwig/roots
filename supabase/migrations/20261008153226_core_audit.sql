-- Step 01: audit basics.
-- Every business table gets created_at/by + updated_at/by (filled by set_audit_fields)
-- and every change is written to audit_log (by log_change). Attach both with enable_audit('table').

create table public.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid,              -- no FK on purpose: the log outlives deleted rows/orgs
  table_name text not null,
  row_id text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  actor_id uuid,
  at timestamptz not null default now(),
  old jsonb,                -- update: only changed fields
  new jsonb
);
create index audit_log_org_at on public.audit_log (org_id, at desc);
create index audit_log_row on public.audit_log (table_name, row_id);
alter table public.audit_log enable row level security;
-- select policy is added with has_perm() in the tenancy migration; nobody can write directly.

create function public.set_audit_fields() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create function public.log_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, n -> k), jsonb_object_agg(k, o -> k) into n, o
    from jsonb_object_keys(n) k
    where n -> k is distinct from o -> k
      and k not in ('created_at', 'created_by', 'updated_at', 'updated_by');
    if n is null then return null; end if; -- nothing but audit fields changed
  end if;

  insert into public.audit_log (org_id, table_name, row_id, action, actor_id, old, new)
  values (
    case when tg_table_name = 'orgs' then (r ->> 'id')::uuid else (r ->> 'org_id')::uuid end,
    tg_table_name, r ->> 'id', lower(tg_op), auth.uid(), o, n
  );
  return null;
end $$;

-- DDL helper for migrations only.
create function public.enable_audit(t regclass) returns void
language plpgsql set search_path = '' as $$
begin
  execute format('create trigger set_audit_fields before insert or update on %s for each row execute function public.set_audit_fields()', t);
  execute format('create trigger log_change after insert or update or delete on %s for each row execute function public.log_change()', t);
end $$;
revoke execute on function public.enable_audit(regclass) from public, anon, authenticated;
revoke execute on function public.log_change() from public, anon, authenticated;
