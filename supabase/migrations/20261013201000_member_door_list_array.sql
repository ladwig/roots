-- One JSON array instead of rows: the API caps row sets at 1000, clubs can have more members.
drop function public.member_door_list(uuid);
create function public.member_door_list(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  select org_id into v_org from public.events where id = p_event and deleted_at is null;
  if v_org is null or not public.module_enabled(v_org, 'tickets') or not public.module_enabled(v_org, 'members')
     or not public.has_perm(v_org, 'tickets.scan') then
    raise exception 'not_allowed';
  end if;
  return (select coalesce(jsonb_agg(r), '[]'::jsonb) from public.member_door_rows(v_org, p_event) r);
end $$;
revoke execute on function public.member_door_list(uuid) from public, anon;
