-- What roots charges an org, set by platform admins: a price per org (or the default for all others, org_id null),
-- valid from the first of a month until the next one. Components combine freely: monthly base, per module, per team
-- user, per active member (each with a free allowance), a fee per sale (% + fixed, taken at order time), and a
-- discount on the bill (100 = free). The running month is never changed (the App only adds prices from next month).
create table public.org_prices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.orgs on delete cascade,
  starts_on date not null check (extract(day from starts_on) = 1),
  base_cents int not null default 0 check (base_cents >= 0),
  module_cents jsonb not null default '{}' check (jsonb_typeof(module_cents) = 'object'), -- { module key: cents/month }
  user_cents int not null default 0 check (user_cents >= 0),
  included_users int not null default 0 check (included_users >= 0),
  member_cents int not null default 0 check (member_cents >= 0),
  included_members int not null default 0 check (included_members >= 0),
  sales_percent numeric(5, 2) not null default 0 check (sales_percent between 0 and 100),
  sales_fixed_cents int not null default 0 check (sales_fixed_cents >= 0),
  discount_percent int not null default 0 check (discount_percent between 0 and 100),
  note text check (length(note) <= 500),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  unique nulls not distinct (org_id, starts_on)
);
select public.enable_audit('public.org_prices');
alter table public.org_prices enable row level security;
revoke all on public.org_prices from anon;
create policy "platform admins manage prices" on public.org_prices for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Was roots' fee taken by the provider with the payment (Stripe Connect), or does it still have to be invoiced
-- (SumUp, Stripe with the org's own key)?
alter table public.pay_payments add column fee_collected boolean not null default false;
update public.pay_payments p set fee_collected = true
  where p.provider = 'stripe' and p.application_fee > 0
    and exists (select 1 from public.org_integrations i where i.org_id = p.org_id and i.provider = 'stripe' and coalesce(i.config ->> 'via', '') <> 'key');

-- One month's usage per live org, for the bill: team users (now), members active in the month, modules on (now),
-- paid sales in the month with roots' fee, split into collected and still to invoice. Platform admins only.
create function public.billing_usage(p_from date, p_to date)
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
    and po.amount_total > 0 and po.paid_at >= p_from and po.paid_at < p_to
  left join lateral (select bool_or(x.fee_collected) as fee_collected from public.pay_payments x where x.order_id = po.id and x.status = 'succeeded') pp on true
  where o.deleted_at is null
  group by o.id;
end $$;
revoke execute on function public.billing_usage(date, date) from public, anon;
grant execute on function public.billing_usage(date, date) to authenticated;
