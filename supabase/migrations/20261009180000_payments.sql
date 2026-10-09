-- Payments module: provider-neutral orders, payments and refunds.
-- Any module sells through it: an order points back to what was bought via (source_module, source_id),
-- and the module's fulfilment handler runs when the order is paid (src/payments/fulfilment.ts).
-- Writes happen server-side only (checkout, webhooks, refunds via the service role after permission checks);
-- org members read according to payments.view.

alter table public.org_integrations drop constraint org_integrations_status_check;
alter table public.org_integrations add constraint org_integrations_status_check
  check (status in ('pending', 'connected', 'error', 'revoked')); -- pending = onboarding not finished

create table public.pay_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  status text not null default 'open'
    check (status in ('open', 'paid', 'failed', 'expired', 'cancelled', 'refunded', 'partially_refunded')),
  currency text not null default 'eur' check (currency ~ '^[a-z]{3}$'),
  amount_total int not null check (amount_total >= 0),        -- cents, sum of items
  application_fee int not null default 0 check (application_fee >= 0),
  customer_email text,
  customer_name text,
  source_module text not null,                                -- 'tickets', 'test', …
  source_id text,                                             -- e.g. the event or booking id
  provider text,                                              -- 'stripe', …
  metadata jsonb not null default '{}',
  expires_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(), created_by uuid, updated_at timestamptz not null default now(), updated_by uuid
);
create index pay_orders_org_created on public.pay_orders (org_id, created_at desc);
create index pay_orders_source on public.pay_orders (source_module, source_id);

create table public.pay_order_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  order_id uuid not null references public.pay_orders on delete cascade,
  description text not null,
  quantity int not null check (quantity > 0),
  unit_amount int not null check (unit_amount >= 0),          -- cents
  source_id text,                                             -- e.g. ticket tier id
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(), created_by uuid, updated_at timestamptz not null default now(), updated_by uuid
);
create index pay_order_items_order on public.pay_order_items (order_id);
create index pay_order_items_org on public.pay_order_items (org_id);

create table public.pay_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  order_id uuid not null references public.pay_orders on delete cascade,
  provider text not null,
  provider_ref text not null,                                 -- Stripe: checkout session id
  provider_payment_ref text,                                  -- Stripe: payment intent id (for refunds)
  amount int not null check (amount >= 0),
  application_fee int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'expired')),
  created_at timestamptz not null default now(), created_by uuid, updated_at timestamptz not null default now(), updated_by uuid,
  unique (provider, provider_ref)
);
create index pay_payments_order on public.pay_payments (order_id);
create index pay_payments_org on public.pay_payments (org_id);

create table public.pay_refunds (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  payment_id uuid not null references public.pay_payments on delete cascade,
  amount int not null check (amount > 0),
  reason text,
  provider_ref text,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  created_at timestamptz not null default now(), created_by uuid, updated_at timestamptz not null default now(), updated_by uuid,
  unique (provider_ref)
);
create index pay_refunds_payment on public.pay_refunds (payment_id);
create index pay_refunds_org on public.pay_refunds (org_id);

do $$
declare t text;
begin
  foreach t in array array['pay_orders', 'pay_order_items', 'pay_payments', 'pay_refunds'] loop
    execute format('alter table public.%I enable row level security', t);
    perform public.enable_audit(format('public.%I', t)::regclass);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
    execute format(
      'create policy "payments.view" on public.%I for select to authenticated using (public.module_enabled(org_id, %L) and public.has_perm(org_id, %L))',
      t, 'payments', 'payments.view');
  end loop;
end $$;
