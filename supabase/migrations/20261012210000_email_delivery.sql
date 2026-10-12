-- Delivery feedback from the email provider's webhook (Resend): what happened after we handed a mail over.
-- `status` stays our side (queued → sent); `delivery` is the provider's side.
alter table public.email_sends
  add column delivery text check (delivery in ('delivered', 'delayed', 'bounced', 'complained')),
  add column delivery_at timestamptz,
  add column provider_id text check (length(provider_id) <= 200);
