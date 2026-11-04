-- Music on shop products (Bandcamp-style): the org uploads a lossless master per track (WAV/AIFF/FLAC) straight to
-- Cloudflare R2 (audio/<org>/<product>/<track>/…); the audio worker (/api/audio/process) converts it with ffmpeg into
-- a stream MP3 (128k, the shop's player) and downloads (MP3 320, FLAC, WAV), then builds one album ZIP per download
-- format (products.audio_zips). Buyers get every format, single tracks or the ZIP, via short-lived links.
create table public.product_tracks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  product_id uuid not null references public.products on delete cascade,
  title text not null check (length(title) between 1 and 200),
  position int not null default 0,
  stream boolean not null default true, -- false = listed in the player, but only buyers get it
  master_key text not null,
  master_name text not null,
  master_size bigint,
  status text not null default 'uploading' check (status in ('uploading', 'pending', 'processing', 'ready', 'failed')),
  error text,
  formats jsonb not null default '{}', -- { stream | mp3 | flac | wav: { key, size } }
  duration_seconds int,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index product_tracks_product on public.product_tracks (product_id, position);
create index product_tracks_org on public.product_tracks (org_id);
create index product_tracks_due on public.product_tracks (status) where status in ('pending', 'processing');
select public.enable_audit('public.product_tracks');

-- Album ZIPs per download format ({} = (re)build once every track is ready); claimed by the worker while building.
alter table public.products add column audio_zips jsonb not null default '{}', add column audio_zips_claimed_at timestamptz;

create trigger product_tracks_guard before insert or update of product_id, org_id on public.product_tracks
  for each row execute function public.product_variants_guard(); -- same check: the product belongs to the org

alter table public.product_tracks enable row level security;
revoke all on public.product_tracks from anon;
create policy "shop.view" on public.product_tracks for select to authenticated
  using (public.has_perm(org_id, 'shop.view') and public.module_enabled(org_id, 'shop'));
create policy "shop.manage" on public.product_tracks for all to authenticated
  using (public.has_perm(org_id, 'shop.manage') and public.module_enabled(org_id, 'shop'))
  with check (public.has_perm(org_id, 'shop.manage') and public.module_enabled(org_id, 'shop'));

-- The worker takes one job at a time (several workers never take the same; a crashed one is retried after 10 min).
create function public.claim_audio_track() returns public.product_tracks
language sql security definer set search_path = '' as $$
  update public.product_tracks set status = 'processing', claimed_at = now()
  where id = (select id from public.product_tracks
              where status = 'pending' or (status = 'processing' and claimed_at < now() - interval '10 minutes')
              order by created_at limit 1 for update skip locked)
  returning *
$$;

-- A product whose tracks are all ready but whose ZIPs are missing (or a stale build).
create function public.claim_audio_zips() returns uuid
language sql security definer set search_path = '' as $$
  update public.products set audio_zips_claimed_at = now()
  where id = (select p.id from public.products p
              where p.audio_zips = '{}' and p.deleted_at is null
                and (p.audio_zips_claimed_at is null or p.audio_zips_claimed_at < now() - interval '10 minutes')
                and exists (select 1 from public.product_tracks t where t.product_id = p.id and t.status = 'ready')
                and not exists (select 1 from public.product_tracks t where t.product_id = p.id and t.status in ('pending', 'processing'))
              limit 1 for update skip locked)
  returning id
$$;

create function public.audio_due() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.product_tracks where status = 'pending' or (status = 'processing' and claimed_at < now() - interval '10 minutes'))
      or exists (select 1 from public.products p where p.audio_zips = '{}' and p.deleted_at is null
                   and (p.audio_zips_claimed_at is null or p.audio_zips_claimed_at < now() - interval '10 minutes')
                   and exists (select 1 from public.product_tracks t where t.product_id = p.id and t.status = 'ready')
                   and not exists (select 1 from public.product_tracks t where t.product_id = p.id and t.status in ('pending', 'processing')))
$$;
revoke execute on function public.claim_audio_track(), public.claim_audio_zips(), public.audio_due() from public, anon, authenticated;
grant execute on function public.claim_audio_track(), public.claim_audio_zips(), public.audio_due() to service_role;

create or replace function public.worker_due() returns boolean
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
      or public.audio_due()                                                                                         -- audio worker
$$;
