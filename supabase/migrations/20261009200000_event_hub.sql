-- Event hub: an outbox in Postgres. Things that happen become `events`; each matching subscription gets a
-- `event_deliveries` row in the same transaction. Any worker (cron route today, Celery or similar later)
-- claims due deliveries with claim_event_deliveries() and reports back with finish_event_delivery().

create table public.events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs on delete cascade,
  type text not null check (type ~ '^[a-z_]+\.[a-z_.]+$'),  -- 'order.paid', 'member.joined'
  subject_table text,
  subject_id text,
  actor_id uuid,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index events_org_created on public.events (org_id, created_at desc);

create table public.event_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  channel text not null check (channel in ('webhook', 'telegram')),
  event_types text[] not null default '{}',   -- '*' = all
  config jsonb not null default '{}',         -- webhook: {url}; telegram: {chat_id, chat_title, link_code}
  secret_id uuid,                             -- webhook signing secret (Vault)
  active boolean not null default true,
  created_at timestamptz not null default now(), created_by uuid, updated_at timestamptz not null default now(), updated_by uuid
);
create index event_subscriptions_org on public.event_subscriptions (org_id);
create unique index event_subscriptions_link_code on public.event_subscriptions ((config ->> 'link_code')) where config ? 'link_code';

create table public.event_deliveries (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs on delete cascade,
  event_id bigint not null references public.events on delete cascade,
  subscription_id uuid not null references public.event_subscriptions on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, subscription_id)
);
create index event_deliveries_due on public.event_deliveries (next_attempt_at) where status = 'pending';
create index event_deliveries_subscription on public.event_deliveries (subscription_id, created_at desc);
create index event_deliveries_org on public.event_deliveries (org_id);

alter table public.events enable row level security;
alter table public.event_subscriptions enable row level security;
alter table public.event_deliveries enable row level security;
select public.enable_audit('public.event_subscriptions');
revoke all on public.events, public.event_subscriptions, public.event_deliveries from anon;
revoke insert, update, delete on public.events, public.event_deliveries from authenticated;
revoke update on public.event_subscriptions from authenticated;
grant update (name, event_types, config, active) on public.event_subscriptions to authenticated;

create policy "see events" on public.events for select to authenticated
  using (public.has_perm(org_id, 'org.integrations.manage'));
create policy "see deliveries" on public.event_deliveries for select to authenticated
  using (public.has_perm(org_id, 'org.integrations.manage'));
create policy "see subscriptions" on public.event_subscriptions for select to authenticated
  using (public.has_perm(org_id, 'org.integrations.manage'));
create policy "create subscriptions" on public.event_subscriptions for insert to authenticated
  with check (public.has_perm(org_id, 'org.integrations.manage'));
create policy "edit subscriptions" on public.event_subscriptions for update to authenticated
  using (public.has_perm(org_id, 'org.integrations.manage')) with check (public.has_perm(org_id, 'org.integrations.manage'));
create policy "delete subscriptions" on public.event_subscriptions for delete to authenticated
  using (public.has_perm(org_id, 'org.integrations.manage'));

-- Record an event and fan it out to matching active subscriptions (same transaction).
create function public.emit_event(
  p_org uuid, p_type text, p_payload jsonb default '{}', p_subject_table text default null, p_subject_id text default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  insert into public.events (org_id, type, payload, subject_table, subject_id, actor_id)
  values (p_org, p_type, coalesce(p_payload, '{}'), p_subject_table, p_subject_id, auth.uid())
  returning id into v_id;
  insert into public.event_deliveries (org_id, event_id, subscription_id)
  select p_org, v_id, s.id from public.event_subscriptions s
  where s.org_id = p_org and s.active and (p_type = any (s.event_types) or '*' = any (s.event_types))
    and (s.channel <> 'telegram' or s.config ? 'chat_id');
  return v_id;
end $$;
revoke execute on function public.emit_event(uuid, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.emit_event(uuid, text, jsonb, text, text) to service_role;

-- Worker side: lease due deliveries (others skip them), then report the result.
create function public.claim_event_deliveries(p_limit int default 20) returns setof bigint
language sql security definer set search_path = '' as $$
  update public.event_deliveries d
  set attempts = d.attempts + 1, next_attempt_at = now() + interval '5 minutes' -- lease; finish sets the real time
  where d.id in (
    select id from public.event_deliveries
    where status = 'pending' and next_attempt_at <= now()
    order by next_attempt_at
    limit p_limit
    for update skip locked
  )
  returning d.id;
$$;

create function public.finish_event_delivery(p_id bigint, p_ok boolean, p_error text default null) returns void
language sql security definer set search_path = '' as $$
  update public.event_deliveries set
    status = case when p_ok then 'succeeded' when attempts >= 8 then 'failed' else 'pending' end,
    delivered_at = case when p_ok then now() end,
    last_error = case when p_ok then null else left(p_error, 500) end,
    next_attempt_at = case when p_ok then next_attempt_at else now() + make_interval(mins => power(2, attempts)::int) end
  where id = p_id;
$$;
revoke execute on function public.claim_event_deliveries(int), public.finish_event_delivery(bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_event_deliveries(int), public.finish_event_delivery(bigint, boolean, text) to service_role;

-- Signing secret for webhook subscriptions (Vault), readable only by the service role.
create function public.set_subscription_secret(p_subscription uuid, p_secret text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_secret uuid;
begin
  select org_id, secret_id into v_org, v_secret from public.event_subscriptions where id = p_subscription;
  if v_org is null or not (public.has_perm(v_org, 'org.integrations.manage') or auth.role() = 'service_role') then
    raise exception 'not_allowed';
  end if;
  if v_secret is null then
    v_secret := vault.create_secret(p_secret, 'subscription:' || p_subscription);
    update public.event_subscriptions set secret_id = v_secret where id = p_subscription;
  else
    perform vault.update_secret(v_secret, p_secret);
  end if;
end $$;
revoke execute on function public.set_subscription_secret(uuid, text) from public, anon;

create function public.get_subscription_secret(p_subscription uuid) returns text
language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret from public.event_subscriptions e join vault.decrypted_secrets s on s.id = e.secret_id
  where e.id = p_subscription;
$$;
revoke execute on function public.get_subscription_secret(uuid) from public, anon, authenticated;
grant execute on function public.get_subscription_secret(uuid) to service_role;

-- Built-in events from core tables (modules add their own triggers or call emit_event).
create function public.events_from_changes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'org_members' then
    if tg_op = 'INSERT' then
      perform public.emit_event(new.org_id, 'member.joined', jsonb_build_object('user_id', new.user_id,
        'email', (select email from public.profiles where id = new.user_id)), 'org_members', new.id::text);
    elsif tg_op = 'DELETE' then
      perform public.emit_event(old.org_id, 'member.left', jsonb_build_object('user_id', old.user_id,
        'email', (select email from public.profiles where id = old.user_id)), 'org_members', old.id::text);
    end if;
  elsif tg_table_name = 'invites' and tg_op = 'INSERT' then
    perform public.emit_event(new.org_id, 'member.invited', jsonb_build_object('email', new.email), 'invites', new.id::text);
  elsif tg_table_name = 'pay_orders' and tg_op = 'UPDATE' and new.status is distinct from old.status
    and new.status in ('paid', 'refunded', 'failed') then
    perform public.emit_event(new.org_id, 'order.' || new.status, jsonb_build_object(
      'order_id', new.id, 'amount', new.amount_total, 'currency', new.currency,
      'customer_email', new.customer_email, 'source_module', new.source_module), 'pay_orders', new.id::text);
  end if;
  return null;
end $$;
revoke execute on function public.events_from_changes() from public, anon, authenticated;
create trigger events_from_changes after insert or delete on public.org_members for each row execute function public.events_from_changes();
create trigger events_from_changes after insert on public.invites for each row execute function public.events_from_changes();
create trigger events_from_changes after update of status on public.pay_orders for each row execute function public.events_from_changes();
