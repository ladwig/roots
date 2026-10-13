-- The wiki editor saves while you type: keep a version only when the page's last version by the same person is older
-- than 10 minutes (or someone else changed it), so the history shows working states, not every keystroke.
create or replace function public.wiki_pages_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.title is distinct from old.title or new.body is distinct from old.body)
     and not exists (select 1 from public.wiki_page_versions v where v.page_id = old.id
       and v.created_at > now() - interval '10 minutes' and v.created_by is not distinct from auth.uid())
     and not (old.updated_by is not distinct from auth.uid() and old.updated_at > now() - interval '10 minutes'
       and exists (select 1 from public.wiki_page_versions v where v.page_id = old.id)) then
    insert into public.wiki_page_versions (org_id, page_id, title, body, created_at, created_by)
    values (old.org_id, old.id, old.title, old.body, now(), auth.uid());
  end if;
  return null;
end $$;
