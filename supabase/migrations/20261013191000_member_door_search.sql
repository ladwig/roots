-- Door staff (tickets.scan) can't read memberships: find members by name for the door's Mitglieder tab.
create function public.member_door_search(p_event uuid, p_q text)
returns table (contact_id uuid, name text, member_no text)
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_q text := '%' || replace(replace(replace(trim(coalesce(p_q, '')), '\', ''), '%', ''), '_', '') || '%';
begin
  select org_id into v_org from public.events where id = p_event and deleted_at is null;
  if v_org is null or not public.module_enabled(v_org, 'members') or not public.has_perm(v_org, 'tickets.scan') then
    raise exception 'not_allowed';
  end if;
  if length(trim(coalesce(p_q, ''))) < 2 then return; end if;
  return query
    select distinct on (c.id) c.id, coalesce(nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''), c.company, c.email), m.member_no
    from public.memberships m join public.contacts c on c.id = m.contact_id
    where m.org_id = v_org and m.deleted_at is null and c.deleted_at is null
      and (concat_ws(' ', c.first_name, c.last_name) ilike v_q or c.company ilike v_q or c.email ilike v_q or m.member_no ilike v_q)
    order by c.id, m.starts_on desc
    limit 20;
end $$;
revoke execute on function public.member_door_search(uuid, text) from public, anon;
