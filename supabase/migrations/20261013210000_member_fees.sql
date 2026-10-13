-- Fees per member: own amount / interval / payment method (null = the type's, payment method null = SEPA when a
-- mandate is on file, else transfer), "ab X €" types (the type's fee is the minimum a member pays) and a fee-free
-- period (fee_free_until: e.g. a DJ voucher; no fees for periods ending on or before it).
alter table public.membership_types add column fee_is_minimum boolean not null default false;
alter table public.memberships
  add column fee_cents int check (fee_cents between 0 and 100000000),
  add column fee_interval text check (fee_interval in ('month', 'quarter', 'half_year', 'year', 'none')),
  add column payment_method text check (payment_method in ('sepa', 'transfer', 'cash', 'paypal', 'other')),
  add column fee_free_until date;
