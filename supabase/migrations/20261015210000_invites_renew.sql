-- Renewing an invite link replaces its token in place (same row): no delete-then-insert that can lose the invite,
-- no second member.invited event, and the open-invites list keeps its row ids. Same rule as inviting: only owners
-- touch invites for the owner role.
grant update (token_hash, expires_at) on public.invites to authenticated;

create policy "managers renew invites" on public.invites for update to authenticated
  using (
    public.has_perm(org_id, 'org.members.manage')
    and (public.is_owner(org_id) or not (select r.is_owner from public.roles r where r.id = role_id))
  )
  with check (
    public.has_perm(org_id, 'org.members.manage')
    and (public.is_owner(org_id) or not (select r.is_owner from public.roles r where r.id = role_id))
  );
