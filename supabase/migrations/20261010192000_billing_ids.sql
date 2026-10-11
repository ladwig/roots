-- The audit log keys rows by `id`: give the 1:1 / composite-key tables one.
alter table public.org_billing add column id uuid not null default gen_random_uuid() unique;
alter table public.number_ranges add column id uuid not null default gen_random_uuid() unique;
