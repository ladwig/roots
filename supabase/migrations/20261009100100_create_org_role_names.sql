-- Seeded role names come from the app in the creator's language: [owner, admin, member, door staff].
drop function public.create_org(text, text);

create function public.create_org(
  p_name text, p_slug text, p_role_names text[] default '{Owner,Admin,Member,Door staff}'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_owner uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  insert into public.orgs (name, slug) values (trim(p_name), lower(trim(p_slug))) returning id into v_org;
  insert into public.roles (org_id, name, is_owner) values (v_org, p_role_names[1], true) returning id into v_owner;
  insert into public.roles (org_id, name, permissions) values
    (v_org, p_role_names[2], '{*}'),
    (v_org, p_role_names[3], '{}'),
    (v_org, p_role_names[4], '{tickets.scan}');
  insert into public.org_members (org_id, user_id, role_id) values (v_org, auth.uid(), v_owner);
  return v_org;
end $$;
revoke execute on function public.create_org(text, text, text[]) from public, anon;
