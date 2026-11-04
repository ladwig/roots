-- A new release date is a new release day: the unlock (mails, completion) runs again then.
create function public.products_release_reset() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.release_at is distinct from old.release_at then new.release_done_at := null; end if;
  return new;
end $$;
revoke execute on function public.products_release_reset() from public, anon, authenticated;
create trigger products_release_reset before update of release_at on public.products
  for each row execute function public.products_release_reset();
