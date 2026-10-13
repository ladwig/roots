-- Webhook inbox: claim an event before handling so parallel deliveries don't both run it.
alter table public.integration_events add column if not exists locked_at timestamptz;
