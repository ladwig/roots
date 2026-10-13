-- Invites also work without the link: someone who signs in with the invited (confirmed) email sees the org's
-- open invites on onboarding and can accept them there (before, they only saw "create an org").
create function public.my_invites()
returns table (id uuid, org_name text, role_name jsonb)
language sql stable security definer set search_path = '' as $$
  select i.id, o.name, r.name
  from public.invites i
  join public.orgs o on o.id = i.org_id and public.org_alive(o.id)
  join public.roles r on r.id = i.role_id
  join auth.users u on u.id = auth.uid() and u.email_confirmed_at is not null and lower(u.email) = i.email
  where i.accepted_at is null and i.expires_at > now()
  order by i.created_at desc;
$$;
revoke execute on function public.my_invites() from public, anon;
grant execute on function public.my_invites() to authenticated;

create function public.accept_my_invite(p_invite uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inv public.invites;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select i.* into inv from public.invites i
  join auth.users u on u.id = auth.uid() and u.email_confirmed_at is not null and lower(u.email) = i.email
  where i.id = p_invite and i.accepted_at is null and i.expires_at > now()
  for update of i;
  if inv.id is null then raise exception 'invite_invalid'; end if;
  insert into public.org_members (org_id, user_id, role_id) values (inv.org_id, auth.uid(), inv.role_id)
    on conflict (org_id, user_id) do nothing;
  update public.invites set accepted_at = now(), accepted_by = auth.uid() where id = inv.id;
  return inv.org_id;
end $$;
revoke execute on function public.accept_my_invite(uuid) from public, anon;
grant execute on function public.accept_my_invite(uuid) to authenticated;
