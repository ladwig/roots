-- Claim time for the email queue, so only sends stuck in "sending" for 15 minutes go back to the queue.
alter table public.email_sends add column claimed_at timestamptz;
create or replace function public.claim_email_sends(p_limit int default 50) returns setof public.email_sends
language sql security definer set search_path = '' as $$
  update public.email_sends s set status = 'sending', claimed_at = now()
  where s.id in (select id from public.email_sends where status = 'queued' and send_after <= now() order by send_after limit p_limit for update skip locked)
  returning s.*;
$$;
