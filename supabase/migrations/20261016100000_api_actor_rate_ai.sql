-- API/MCP phase 4:
-- 1. Real authors: changes made with an API key are attributed to the key's creator (before: no actor). Changes via
--    an AI connection (OAuth token) already run as the person. audit_log.via says how: 'api_key:<id>' or 'oauth:<client>'.
-- 2. Rate limits: a per-minute counter per key / connection (rate_hit), checked by the API and MCP before running.
-- 3. orgs.allow_ai: org admins can forbid AI connections (Claude via MCP) for their org.

-- 1. who did it, and how
create function public.actor() returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.uid(), (select k.created_by from public.request_api_key() k where k.id is not null))
$$;
-- Called by the audit triggers of every write, also anonymous ones (returns null there).
grant execute on function public.actor() to anon, authenticated, service_role;

create function public.actor_via() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select 'api_key:' || k.id from public.request_api_key() k where k.id is not null),
    (select 'oauth:' || (auth.jwt() ->> 'client_id') where auth.jwt() ->> 'client_id' is not null))
$$;
grant execute on function public.actor_via() to anon, authenticated, service_role;

create or replace function public.set_audit_fields() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := public.actor();
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := public.actor();
  return new;
end $$;

alter table public.audit_log add column if not exists via text;

create or replace function public.log_change() returns trigger
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

  insert into public.audit_log (org_id, table_name, row_id, action, actor_id, old, new, via)
  values (
    case when tg_table_name = 'orgs' then (r ->> 'id')::uuid else (r ->> 'org_id')::uuid end,
    tg_table_name, r ->> 'id', lower(tg_op), public.actor(), o, n, public.actor_via()
  );
  return null;
end $$;

-- The contact timeline shows "via Claude / API" next to the person.
drop function public.contact_changes(uuid);
create function public.contact_changes(p_contact uuid) returns table (at timestamptz, actor_id uuid, old jsonb, new jsonb, via text)
language sql stable security definer set search_path = '' as $$
  select a.at, a.actor_id, a.old, a.new, a.via
  from public.audit_log a
  join public.contacts c on c.id = p_contact
  where a.table_name = 'contacts' and a.row_id = p_contact::text and a.action = 'update'
    and a.org_id = c.org_id and public.has_perm(c.org_id, 'crm.view')
  order by a.at desc
  limit 100
$$;
revoke execute on function public.contact_changes(uuid) from public, anon;
grant execute on function public.contact_changes(uuid) to authenticated;

-- 2. rate limits: one row per key and minute (technical, no org, service role only; old minutes swept here)
create table public.api_rate (
  key text not null,
  minute timestamptz not null,
  n int not null default 0,
  primary key (key, minute)
);
alter table public.api_rate enable row level security;
revoke all on public.api_rate from anon, authenticated;

create function public.rate_hit(p_key text, p_limit int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  insert into public.api_rate (key, minute, n) values (p_key, date_trunc('minute', now()), 1)
  on conflict (key, minute) do update set n = public.api_rate.n + 1
  returning n into v_n;
  if random() < 0.01 then delete from public.api_rate where minute < now() - interval '10 minutes'; end if;
  return v_n <= p_limit;
end $$;
revoke execute on function public.rate_hit(text, int) from public, anon, authenticated;

-- 3. AI connections allowed in this org (default yes)
alter table public.orgs add column if not exists allow_ai boolean not null default true;
