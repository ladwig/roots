-- What changed on a contact (old → new per field) for its timeline. The change log stays platform-admin only; this
-- returns just one contact's updates, to people who may see contacts in that org.
create function public.contact_changes(p_contact uuid) returns table (at timestamptz, actor_id uuid, old jsonb, new jsonb)
language sql stable security definer set search_path = '' as $$
  select a.at, a.actor_id, a.old, a.new
  from public.audit_log a
  join public.contacts c on c.id = p_contact
  where a.table_name = 'contacts' and a.row_id = p_contact::text and a.action = 'update'
    and a.org_id = c.org_id and public.has_perm(c.org_id, 'crm.view')
  order by a.at desc
  limit 100
$$;
revoke execute on function public.contact_changes(uuid) from public, anon;
grant execute on function public.contact_changes(uuid) to authenticated;
