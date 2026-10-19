-- Platform admins' test payments (payments page) aren't sales.
create or replace function public.billing_usage(p_from date, p_to date)
returns table (org_id uuid, users int, members int, modules text[], orders int, sales_cents bigint, fees_collected_cents bigint, fees_open_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'not_allowed'; end if;
  return query
  select o.id,
    (select count(*)::int from public.org_members m where m.org_id = o.id),
    (select count(distinct ms.contact_id)::int from public.memberships ms
       where ms.org_id = o.id and ms.starts_on < p_to and (ms.ends_on is null or ms.ends_on >= p_from)),
    (select coalesce(array_agg(om.module_key order by om.module_key), '{}') from public.org_modules om where om.org_id = o.id),
    count(po.id)::int,
    coalesce(sum(po.amount_total), 0)::bigint,
    coalesce(sum(po.application_fee) filter (where pp.fee_collected), 0)::bigint,
    coalesce(sum(po.application_fee) filter (where not coalesce(pp.fee_collected, false)), 0)::bigint
  from public.orgs o
  left join public.pay_orders po on po.org_id = o.id and po.status in ('paid', 'partially_refunded')
    and po.amount_total > 0 and po.source_module <> 'test' and po.paid_at >= p_from and po.paid_at < p_to
  left join lateral (select bool_or(x.fee_collected) as fee_collected from public.pay_payments x where x.order_id = po.id and x.status = 'succeeded') pp on true
  where o.deleted_at is null
  group by o.id;
end $$;
revoke execute on function public.billing_usage(date, date) from public, anon;
grant execute on function public.billing_usage(date, date) to authenticated;
