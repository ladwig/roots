-- All tags in use in an org (for tag pickers and filter chips), any number of contacts. RLS applies (invoker).
create function public.contact_tags(p_org uuid) returns setof text
language sql stable set search_path = '' as $$
  select distinct t from public.contacts c, unnest(c.tags) t where c.org_id = p_org and c.deleted_at is null order by 1
$$;
grant execute on function public.contact_tags(uuid) to authenticated;
