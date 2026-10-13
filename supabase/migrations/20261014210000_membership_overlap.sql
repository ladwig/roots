-- One membership at a time per person: several memberships of a contact are fine (leaving and rejoining), but their
-- periods must not overlap. Memberships in the trash don't count; restoring one is checked too.
-- Checked on new memberships and when the period/contact really changes, so an existing overlap (from before) doesn't
-- block editing other fields; it can't be removed automatically because its dues are money.

create function public.memberships_no_overlap() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.deleted_at is not null then return new; end if;
  if tg_op = 'UPDATE' and new.contact_id = old.contact_id and new.starts_on = old.starts_on and new.ends_on is not distinct from old.ends_on
     and old.deleted_at is null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('membership:' || new.contact_id::text)); -- two saves at once can't both pass
  if exists (
    select 1 from public.memberships m
    where m.contact_id = new.contact_id and m.id <> new.id and m.deleted_at is null
      and daterange(m.starts_on, m.ends_on, '[]') && daterange(new.starts_on, new.ends_on, '[]')
  ) then
    raise exception 'membership_overlap';
  end if;
  return new;
end $$;
revoke execute on function public.memberships_no_overlap() from public, anon, authenticated;
create trigger memberships_no_overlap before insert or update of contact_id, starts_on, ends_on, deleted_at on public.memberships
  for each row execute function public.memberships_no_overlap();
