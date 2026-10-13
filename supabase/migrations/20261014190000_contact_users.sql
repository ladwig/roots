-- A contact can be linked to an App account (team user) of the same org: one person behind both. Optional.
-- Automatic when exactly one live contact of the org has the user's email (on joining the team, or when such a
-- contact is created / gets that email); by hand on the contact page. At most one contact per user and org.
alter table public.contacts add column user_id uuid references auth.users on delete set null;
create unique index contacts_user on public.contacts (org_id, user_id) where user_id is not null and deleted_at is null;

-- Link if unambiguous: the user is in the org, has no linked contact there, and exactly one unlinked contact matches.
create function public.link_contact_user(p_org uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_email text; v_contact uuid;
begin
  select lower(email) into v_email from auth.users where id = p_user;
  if v_email is null or not exists (select 1 from public.org_members where org_id = p_org and user_id = p_user)
     or exists (select 1 from public.contacts where org_id = p_org and user_id = p_user and deleted_at is null) then return; end if;
  select min(id::text)::uuid into v_contact from public.contacts
    where org_id = p_org and lower(email) = v_email and user_id is null and deleted_at is null
    having count(*) = 1;
  if v_contact is not null then update public.contacts set user_id = p_user where id = v_contact; end if;
end $$;
revoke execute on function public.link_contact_user(uuid, uuid) from public, anon, authenticated;

create function public.org_members_link_contact() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.link_contact_user(new.org_id, new.user_id);
  return null;
end $$;
revoke execute on function public.org_members_link_contact() from public, anon, authenticated;
create trigger org_members_link_contact after insert on public.org_members for each row execute function public.org_members_link_contact();

create function public.contacts_link_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if new.user_id is not null or new.email is null or new.deleted_at is not null then return null; end if;
  select min(m.user_id::text)::uuid into v_user from public.org_members m join auth.users u on u.id = m.user_id
    where m.org_id = new.org_id and lower(u.email) = lower(new.email)
    having count(*) = 1;
  if v_user is not null then perform public.link_contact_user(new.org_id, v_user); end if;
  return null;
end $$;
revoke execute on function public.contacts_link_user() from public, anon, authenticated;
create trigger contacts_link_user after insert or update of email on public.contacts for each row execute function public.contacts_link_user();

-- Existing teams.
select public.link_contact_user(org_id, user_id) from public.org_members;
