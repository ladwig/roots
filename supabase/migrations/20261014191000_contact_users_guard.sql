-- A contact can only be linked to a member of the same org's team (also for direct writes).
create function public.contacts_user_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is not null and new.user_id is distinct from old.user_id
     and not exists (select 1 from public.org_members where org_id = new.org_id and user_id = new.user_id) then
    raise exception 'not_allowed';
  end if;
  return new;
end $$;
revoke execute on function public.contacts_user_guard() from public, anon, authenticated;
create trigger contacts_user_guard before update of user_id on public.contacts for each row execute function public.contacts_user_guard();
