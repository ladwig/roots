-- API keys as their own principal in the database.
-- The API (server, service role) sends the org (x-org-id) and the hash of the caller's key (x-api-key-hash) with
-- every request. The org's permission checks (has_perm/is_member) pass only for a live key of exactly that org,
-- for the permissions the key has AND its creator still has today (a key never outlives its creator's rights).
-- Owner checks never pass for keys. Service-role calls without a valid key (webhooks, cron) get no org rights,
-- as before. The API checks the same in code first (api_key_auth); this is the database's own second check.

alter table public.api_keys add column expires_at timestamptz;

-- Does this user (member of the org) have the permission? Same rule as has_perm, for a given user.
create function public.user_has_perm(p_user uuid, p_org uuid, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = p_user)
    or exists (
      select 1 from public.org_members m join public.roles r on r.id = m.role_id
      where m.org_id = p_org and m.user_id = p_user
        and (r.is_owner or '*' = any (r.permissions) or p_perm = any (r.permissions)
          or split_part(p_perm, '.', 1) || '.*' = any (r.permissions)));
$$;
revoke execute on function public.user_has_perm(uuid, uuid, text) from public, anon, authenticated;

-- The key of the current API request, if it is live and belongs to the org in the request.
create function public.request_api_key() returns public.api_keys
language sql stable security definer set search_path = '' as $$
  select k.* from public.api_keys k
  where (select auth.role()) = 'service_role'
    and k.key_hash = nullif(current_setting('request.headers', true), '')::json ->> 'x-api-key-hash'
    and k.org_id = public.request_org()
    and k.revoked_at is null and (k.expires_at is null or k.expires_at > now())
    and public.org_alive(k.org_id);
$$;
revoke execute on function public.request_api_key() from public, anon, authenticated;

-- p_perm null = any live key of the org (membership-level checks).
create function public.api_perm(p_org uuid, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.request_api_key() k
    where k.id is not null and k.org_id = p_org
      and (p_perm is null or (
        ('*' = any (k.permissions) or p_perm = any (k.permissions) or split_part(p_perm, '.', 1) || '.*' = any (k.permissions))
        and public.user_has_perm(k.created_by, p_org, p_perm))));
$$;
revoke execute on function public.api_perm(uuid, text) from public, anon, authenticated;

create or replace function public.has_perm(p_org uuid, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (public.request_org() is null or p_org = public.request_org())
    and (public.is_platform_admin() or (public.org_alive(p_org) and exists (
      select 1 from public.org_members m join public.roles r on r.id = m.role_id
      where m.org_id = p_org and m.user_id = (select auth.uid())
        and (r.is_owner
          or '*' = any (r.permissions)
          or p_perm = any (r.permissions)
          or split_part(p_perm, '.', 1) || '.*' = any (r.permissions))
    )) or public.api_perm(p_org, p_perm));
$$;

create or replace function public.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (public.request_org() is null or p_org = public.request_org())
    and (public.is_platform_admin()
      or (public.org_alive(p_org) and exists (select 1 from public.org_members where org_id = p_org and user_id = (select auth.uid())))
      or public.api_perm(p_org, null));
$$;

-- API-side lookup: also expiry, and only the permissions the creator still has.
create or replace function public.api_key_auth(p_hash text)
returns table (key_id uuid, org_id uuid, permissions text[], modules text[])
language plpgsql security definer set search_path = '' as $$
declare k public.api_keys;
begin
  select * into k from public.api_keys where key_hash = p_hash and revoked_at is null and (expires_at is null or expires_at > now());
  if k.id is null or not public.org_alive(k.org_id) then return; end if;
  update public.api_keys set last_used_at = now() where id = k.id and (last_used_at is null or last_used_at < now() - interval '1 minute');
  return query select k.id, k.org_id,
    coalesce((select array_agg(p) from unnest(k.permissions) p where public.user_has_perm(k.created_by, k.org_id, p)), '{}'),
    coalesce((select array_agg(module_key) from public.org_modules m where m.org_id = k.org_id), '{}');
end $$;
