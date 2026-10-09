-- Minute-by-minute worker trigger from the database (Vercel Hobby only allows daily crons).
-- pg_cron calls GET <app>/api/cron/events with the CRON_SECRET (kept in Vault) every minute.
-- Set up / change / stop with: npm run worker:schedule -- https://<app-url>   (or "off")
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create function public.schedule_worker(p_url text, p_secret text default null) returns text
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
  perform cron.schedule('roots-worker', '* * * * *', format(
    $job$select net.http_get(url := %L, headers := jsonb_build_object('Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'worker_cron_secret')), timeout_milliseconds := 55000)$job$,
    rtrim(p_url, '/') || '/api/cron/events'));
  return 'scheduled';
end $$;
revoke execute on function public.schedule_worker(text, text) from public, anon, authenticated;
