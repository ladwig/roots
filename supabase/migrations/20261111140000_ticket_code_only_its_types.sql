-- A code limited to some ticket types ("Gilt für") shows only those: a friends link for a hidden contingent no longer
-- offers the public types next to it (members bought from the wrong contingent). Codes for all types: as before.
create or replace function public.ticket_offer(p_event uuid, p_code text default null, p_waitlist text default null)
returns table (type_id uuid, name text, description text, currency text, hidden boolean, tier_id uuid, tier_name text,
  price int, final_price int, remaining int, sales_start timestamptz, sales_end timestamptz, code_id uuid, code_applies boolean)
language plpgsql stable security definer set search_path = '' as $$
declare c public.ticket_codes; v_code_left int; v_event_left int;
begin
  if not public.ticket_event_public(p_event) then return; end if;
  v_event_left := public.event_left(p_event, nullif(trim(coalesce(p_waitlist, '')), ''));
  if p_code is not null and length(trim(p_code)) > 0 then
    select * into c from public.ticket_codes x where x.event_id = p_event and x.code = upper(trim(p_code)) and x.active
      and (x.valid_from is null or x.valid_from <= now()) and (x.valid_until is null or x.valid_until > now());
    if c.id is not null and c.max_uses is not null then
      select c.max_uses - count(*) into v_code_left from public.tickets k where k.code_id = c.id and public.ticket_live(k);
    end if;
  end if;
  return query
  with types as (
    select t.* from public.ticket_types t
    where t.event_id = p_event and t.active
      and (not t.hidden or (c.id is not null and t.id = any (c.type_ids)))
      and (c.id is null or cardinality(c.type_ids) = 0 or t.id = any (c.type_ids))
  ), tier as (
    select distinct on (r.type_id) r.type_id, r.id, r.name, r.price,
      case when r.quota is null then null else r.quota - (select count(*) from public.tickets k where k.tier_id = r.id and public.ticket_live(k))::int end as left_
    from public.ticket_tiers r join types t on t.id = r.type_id
    where (r.sales_end is null or r.sales_end > now())
      and (r.quota is null or r.quota > (select count(*) from public.tickets k where k.tier_id = r.id and public.ticket_live(k)))
    order by r.type_id, r.position, r.created_at
  )
  select t.id, t.name, t.description, t.currency, t.hidden, tier.id, tier.name,
    coalesce(tier.price, t.price),
    case when c.id is not null and (cardinality(c.type_ids) = 0 or t.id = any (c.type_ids)) then
      case c.kind when 'percent' then round(coalesce(tier.price, t.price) * (100 - c.value) / 100.0)::int
                  when 'amount' then greatest(coalesce(tier.price, t.price) - c.value, 0)
                  else coalesce(tier.price, t.price) end
    else coalesce(tier.price, t.price) end,
    case when exists (select 1 from public.ticket_tiers r where r.type_id = t.id) and tier.id is null then 0
    else nullif(greatest(least(
      coalesce(t.quota - (select count(*) from public.tickets k where k.type_id = t.id and public.ticket_live(k))::int, 2147483647),
      coalesce(tier.left_, 2147483647),
      coalesce(v_event_left, 2147483647),
      case when c.id is not null and (cardinality(c.type_ids) = 0 or t.id = any (c.type_ids)) then coalesce(v_code_left, 2147483647) else 2147483647 end
    ), 0), 2147483647) end,
    t.sales_start, t.sales_end, c.id,
    c.id is not null and (cardinality(c.type_ids) = 0 or t.id = any (c.type_ids))
  from types t left join tier on tier.type_id = t.id
  order by t.position, t.created_at;
end $$;
grant execute on function public.ticket_offer(uuid, text, text) to anon, authenticated;
