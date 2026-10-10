-- One insert per link submission → one guestlist.signed_up event (statement trigger), not one per name.
create or replace function public.guest_link_add(p_token text, p_submitted_by text, p_names text[], p_email text default null)
returns setof public.guest_entries
language plpgsql security definer set search_path = '' as $$
declare l public.guest_lists; v_n int;
begin
  select * into l from public.guest_lists where link_token = p_token and p_token ~ '^[a-z0-9]{24}$' for update;
  if l.id is null or not (select open from public.guest_link_info(p_token)) then raise exception 'link_closed'; end if;
  select count(*) into v_n from unnest(p_names) n where length(trim(n)) > 0;
  if v_n = 0 or v_n > l.per_submission then raise exception 'invalid_input'; end if;
  if l.quota is not null and (select count(*) from public.guest_entries where list_id = l.id) + v_n > l.quota then raise exception 'list_full'; end if;
  return query insert into public.guest_entries (org_id, list_id, name, email, added_via, submitted_by)
    select l.org_id, l.id, left(trim(n), 200), nullif(lower(trim(p_email)), ''), 'link', left(nullif(trim(p_submitted_by), ''), 200)
    from unnest(p_names) n where length(trim(n)) > 0
    returning *;
end $$;
