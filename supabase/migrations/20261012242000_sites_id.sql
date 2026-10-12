-- The audit log identifies rows by their `id` column; `sites` is keyed by org_id only, so every insert/update failed.
alter table public.sites add column id uuid not null default gen_random_uuid() unique;
