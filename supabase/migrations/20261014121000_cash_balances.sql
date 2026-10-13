-- Balances per account (now or at a day), with the caller's rights (invoker: RLS decides what counts).
create function public.cash_balances(p_org uuid, p_until date default null)
returns table (account_id uuid, balance_cents bigint)
language sql stable set search_path = '' as $$
  select a.id, a.opening_cents + coalesce(sum(e.amount_cents), 0)
  from public.cash_accounts a left join public.cash_entries e on e.account_id = a.id and (p_until is null or e.booked_on <= p_until)
  where a.org_id = p_org
  group by a.id, a.opening_cents;
$$;
revoke execute on function public.cash_balances(uuid, date) from public, anon;
