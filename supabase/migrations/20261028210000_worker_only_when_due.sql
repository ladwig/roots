-- The minute worker only wakes the App (Vercel) when something is due; otherwise once an hour for housekeeping
-- (shift series, rental renewals, trash purge, expired portal logins, daily domain checks).
-- pg_cron still runs every minute, but here in the database: a few cheap exists() checks.

-- Freed seats for someone on a waiting list, or an offer that ran out (same rules as offer_waitlist(), read-only).
create function public.waitlist_due() returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare ev record; v_free int; v_next int;
begin
  if exists (select 1 from public.event_waitlist where status = 'offered' and offered_until <= now()) then return true; end if;
  for ev in select distinct x.event_id from public.event_waitlist x join public.events e on e.id = x.event_id
            where x.status = 'waiting' and e.status = 'published' and e.deleted_at is null and coalesce(e.ends_at, e.starts_at) > now() loop
    v_free := public.event_left(ev.event_id);
    if v_free is null then
      select case when count(*) filter (where o.remaining is null) = 0 then coalesce(sum(o.remaining), 0)::int end into v_free
      from public.ticket_offer(ev.event_id) o where not o.hidden;
    end if;
    select x.quantity into v_next from public.event_waitlist x where x.event_id = ev.event_id and x.status = 'waiting' order by x.created_at limit 1;
    if v_free is not null and v_free >= v_next then return true; end if;
  end loop;
  return false;
end $$;

-- Anything for the worker right now? Mirrors what each step of /api/cron/events claims.
create function public.worker_due() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.hub_events where routed_at is null)                                         -- routeEvents
      or exists (select 1 from public.event_deliveries where status = 'pending' and next_attempt_at <= now())      -- deliverDue
      or exists (select 1 from public.workflows where trigger_type = 'schedule' and active and deleted_at is null
                   and (next_run_at is null or next_run_at <= now()))                                              -- processSchedules
      or exists (select 1 from public.workflow_runs where (status in ('queued', 'waiting') and resume_at <= now())
                   or (status = 'running' and updated_at < now() - interval '10 minutes'))                         -- processWorkflowRuns
      or exists (select 1 from public.email_campaigns where status = 'scheduled' and send_at <= now() and deleted_at is null)
      or exists (select 1 from public.email_sends where (status = 'queued' and send_after <= now())
                   or (status = 'sending' and claimed_at < now() - interval '15 minutes'))                         -- processEmailQueue
      or exists (select 1 from public.org_domains where checked_at is null
                   or (status = 'pending' and checked_at < now() - interval '5 minutes'))                          -- checkDomains (live ones: hourly run)
      or exists (select 1 from public.pay_orders where status = 'paid' and fulfilled_at is null
                   and paid_at > now() - interval '2 days' and paid_at < now() - interval '5 minutes'
                   and (fulfil_claimed_at is null or fulfil_claimed_at < now() - interval '5 minutes'))           -- fulfilPending
      or public.waitlist_due()                                                                                      -- offerWaitlist
$$;
revoke execute on function public.waitlist_due(), public.worker_due() from public, anon, authenticated;
grant execute on function public.waitlist_due(), public.worker_due() to service_role;

-- The job's command: call the App only when due, or at minute 0.
create function public.worker_command(p_url text) returns text
language sql immutable set search_path = '' as $$
  select format(
    $job$select net.http_get(url := %L, headers := jsonb_build_object('Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'worker_cron_secret')), timeout_milliseconds := 55000)
    where extract(minute from now()) = 0 or public.worker_due()$job$,
    rtrim(p_url, '/') || '/api/cron/events')
$$;
revoke execute on function public.worker_command(text) from public, anon, authenticated;

create or replace function public.schedule_worker(p_url text, p_secret text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'roots-worker';
  if p_url is null or p_url = 'off' then return 'stopped'; end if;
  if p_url !~ '^https?://[^ ]+$' then raise exception 'invalid_url'; end if;
  if p_secret is not null then
    select id into v_id from vault.secrets where name = 'worker_cron_secret';
    if v_id is null then perform vault.create_secret(p_secret, 'worker_cron_secret');
    else perform vault.update_secret(v_id, p_secret); end if;
  end if;
  perform cron.schedule('roots-worker', '* * * * *', public.worker_command(p_url));
  return 'scheduled';
end $$;
revoke execute on function public.schedule_worker(text, text) from public, anon, authenticated;

-- Switch the running job over (same URL).
do $$
declare j record; v_url text;
begin
  for j in select jobid, command from cron.job where jobname = 'roots-worker' loop
    v_url := substring(j.command from 'url := ''([^'']+)/api/cron/events''');
    if v_url is not null then perform cron.alter_job(j.jobid, command := public.worker_command(v_url)); end if;
  end loop;
end $$;
