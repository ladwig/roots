-- Allow deleting a whole org (its members cascade); still block removing the last owner of an org that stays.
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
    raise exception 'Only owners can change who is an owner';
  end if;
  if was_owner and not becomes_owner and not exists (
    select 1 from public.org_members m join public.roles r on r.id = m.role_id
    where m.org_id = old.org_id and r.is_owner and m.id <> old.id
  ) then
    raise exception 'An organisation needs at least one owner';
  end if;
  return coalesce(new, old);
end $$;
