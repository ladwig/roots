-- Fulfilment claim that expires: fulfil_claimed_at = someone is running onPaid, fulfilled_at = it finished.
-- A crash in between leaves only a stale claim, which the minute worker takes over after a few minutes.
alter table public.pay_orders add column if not exists fulfil_claimed_at timestamptz;
create index if not exists pay_orders_unfulfilled on public.pay_orders (paid_at) where status = 'paid' and fulfilled_at is null;
