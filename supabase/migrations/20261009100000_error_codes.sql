-- Raise short codes instead of English sentences; the app translates them (messages: errors.<code>).
-- Codes: not_signed_in, not_allowed, owner_only, last_owner, invite_invalid, invite_wrong_email (detail = invited email).

create or replace function public.guard_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  was_owner boolean := (select is_owner from public.roles where id = old.role_id);
  becomes_owner boolean := tg_op = 'UPDATE' and (select is_owner from public.roles where id = new.role_id);
begin
  if not exists (select 1 from public.orgs where id = old.org_id) then
    return coalesce(new, old); -- org is being deleted
  end if;
  if (was_owner or becomes_owner) and auth.uid() is not null and not public.is_owner(old.org_id) then
    raise exception 'owner_only';
  end if;
  if was_owner and not becomes_owner and not exists (
    select 1 from public.org_members m join public.roles r on r.id = m.role_id
    where m.org_id = old.org_id and r.is_owner and m.id <> old.id
  ) then
    raise exception 'last_owner';
  end if;
  return coalesce(new, old);
end $$;

create or replace function public.create_org(p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_owner uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  insert into public.orgs (name, slug) values (trim(p_name), lower(trim(p_slug))) returning id into v_org;
  insert into public.roles (org_id, name, is_owner) values (v_org, 'Owner', true) returning id into v_owner;
  insert into public.roles (org_id, name, permissions) values
    (v_org, 'Admin', '{*}'),
    (v_org, 'Member', '{}'),
    (v_org, 'Door staff', '{tickets.scan}');
  insert into public.org_members (org_id, user_id, role_id) values (v_org, auth.uid(), v_owner);
  return v_org;
end $$;

create or replace function public.accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  inv public.invites;
  v_email text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select * into inv from public.invites
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  for update;
  if inv.id is null or inv.accepted_at is not null or inv.expires_at < now() then
    raise exception 'invite_invalid';
  end if;
  select email into v_email from auth.users where id = auth.uid();
  if lower(v_email) <> inv.email then
    raise exception 'invite_wrong_email' using detail = inv.email;
  end if;
  insert into public.org_members (org_id, user_id, role_id)
  values (inv.org_id, auth.uid(), inv.role_id)
  on conflict (org_id, user_id) do nothing;
  update public.invites set accepted_at = now(), accepted_by = auth.uid() where id = inv.id;
  return inv.org_id;
end $$;

create or replace function public.save_integration(
  p_org uuid, p_provider text, p_config jsonb, p_secret text default null, p_expires_at timestamptz default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_secret uuid;
  v_id uuid;
begin
  if not (public.has_perm(p_org, 'org.integrations.manage') or auth.role() = 'service_role') then
    raise exception 'not_allowed';
  end if;
  select secret_id into v_secret from public.org_integrations where org_id = p_org and provider = p_provider;
  if p_secret is not null then
    if v_secret is null then
      v_secret := vault.create_secret(p_secret, 'integration:' || p_org || ':' || p_provider);
    else
      perform vault.update_secret(v_secret, p_secret);
    end if;
  end if;
  insert into public.org_integrations (org_id, provider, config, secret_id, expires_at)
  values (p_org, p_provider, coalesce(p_config, '{}'), v_secret, p_expires_at)
  on conflict (org_id, provider) do update
    set config = excluded.config, secret_id = excluded.secret_id, expires_at = excluded.expires_at,
        status = 'connected', last_error = null
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.delete_integration(p_org uuid, p_provider text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_secret uuid;
begin
  if not (public.has_perm(p_org, 'org.integrations.manage') or auth.role() = 'service_role') then
    raise exception 'not_allowed';
  end if;
  delete from public.org_integrations where org_id = p_org and provider = p_provider returning secret_id into v_secret;
  delete from vault.secrets where id = v_secret;
end $$;
