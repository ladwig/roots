-- Release date (pre-orders, generic): products.release_at. Before it a product sells normally, but its digital
-- delivery (downloads, music) stays locked; on the day the worker unlocks it (shopReleases(): mail to the buyers,
-- purely digital orders → completed) and marks the product done (release_done_at). Moving the date resets that.
alter table public.products add column release_at timestamptz, add column release_done_at timestamptz;

create function public.shop_release_due() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.products where release_at <= now() and release_done_at is null and deleted_at is null)
$$;
revoke execute on function public.shop_release_due() from public, anon, authenticated;
grant execute on function public.shop_release_due() to service_role;

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
      or public.shop_release_due()                                                                                  -- shopReleases
$$;

create or replace function public.shop_catalog(p_org uuid, p_slug text default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(s.x order by s.position, s.created_at), '[]') from (
    select p.position, p.created_at, jsonb_build_object(
      'id', p.id, 'slug', p.slug, 'name', p.name, 'kind', p.kind, 'price_cents', p.price_cents, 'tax_rate', p.tax_rate,
      'images', p.images, 'video_url', p.video_url, 'category', p.category, 'max_per_order', p.max_per_order,
      'release_at', case when p.release_at > now() then p.release_at end,
      'description', case when p_slug is not null then p.description end,
      'left', case when vs.list is null and p.stock is not null then greatest(0, public.shop_left(p.id::text, p.stock)) end,
      'variants', coalesce(vs.list, '[]')
    ) as x
    from public.products p
    left join lateral (
      select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'price_cents', coalesce(v.price_cents, p.price_cents),
        'digital', v.digital or p.kind = 'digital',
        'left', case when v.stock is not null then greatest(0, public.shop_left(v.id::text, v.stock)) end) order by v.position, v.created_at) as list
      from public.product_variants v where v.product_id = p.id and v.active
    ) vs on true
    where p.org_id = p_org and p.status = 'published' and p.deleted_at is null and public.shop_public(p_org)
      and (p_slug is null or p.slug = p_slug)
  ) s
$$;
