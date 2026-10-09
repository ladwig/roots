-- Step 03: invites. The app stores only sha256(token); the raw token lives in the invite link.

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  email text not null check (email = lower(email) and email like '%_@_%'),
  role_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users on delete set null,
  created_at timestamptz not null, created_by uuid, updated_at timestamptz not null, updated_by uuid,
  foreign key (role_id, org_id) references public.roles (id, org_id) on delete cascade
);
create unique index invites_one_open_per_email on public.invites (org_id, email) where accepted_at is null;
alter table public.invites enable row level security;
select public.enable_audit('public.invites');

revoke all on public.invites from anon;
revoke update on public.invites from authenticated;

create policy "managers see invites" on public.invites for select to authenticated
  using (public.has_perm(org_id, 'org.members.manage'));
create policy "managers invite" on public.invites for insert to authenticated
  with check (
    public.has_perm(org_id, 'org.members.manage')
    and (public.is_owner(org_id) or not (select r.is_owner from public.roles r where r.id = role_id))
  );
create policy "managers revoke invites" on public.invites for delete to authenticated
  using (public.has_perm(org_id, 'org.members.manage'));

-- Public preview for the accept page (the token itself is the secret).
create function public.invite_info(p_token text)
returns table (org_name text, email text, role_name text, valid boolean)
language sql stable security definer set search_path = '' as $$
  select o.name, i.email, r.name, i.accepted_at is null and i.expires_at > now()
  from public.invites i
  join public.orgs o on o.id = i.org_id
  join public.roles r on r.id = i.role_id
  where i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

create function public.accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  inv public.invites;
  v_email text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into inv from public.invites
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  for update;
  if inv.id is null or inv.accepted_at is not null or inv.expires_at < now() then
    raise exception 'This invite is invalid or has expired';
  end if;
  select email into v_email from auth.users where id = auth.uid();
  if lower(v_email) <> inv.email then
    raise exception 'This invite was sent to %. Sign in with that email to accept it.', inv.email;
  end if;
  insert into public.org_members (org_id, user_id, role_id)
  values (inv.org_id, auth.uid(), inv.role_id)
  on conflict (org_id, user_id) do nothing;
  update public.invites set accepted_at = now(), accepted_by = auth.uid() where id = inv.id;
  return inv.org_id;
end $$;
revoke execute on function public.accept_invite(text) from public, anon;
