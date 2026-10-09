-- Notifications for people (in addition to org destinations like webhooks/Telegram).
-- The worker routes each event once (events.routed_at): finds the audience (members with a permission, or
-- platform admins), applies their preferences, writes in-app notifications and queues email/push deliveries.

-- Platform events (org_id null) go to platform admins, e.g. org.created.
alter table public.events alter column org_id drop not null;
alter table public.events add column routed_at timestamptz;
create index events_unrouted on public.events (created_at) where routed_at is null;
create policy "admins see platform events" on public.events for select to authenticated
  using (org_id is null and public.is_platform_admin());

-- In-app inbox: one row per person per event.
create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  org_id uuid references public.orgs on delete cascade,
  event_id bigint not null references public.events on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, event_id)
);
create index notifications_inbox on public.notifications (user_id, created_at desc);
create index notifications_unread on public.notifications (user_id) where read_at is null;
create index notifications_event on public.notifications (event_id);
create index notifications_org on public.notifications (org_id);
alter table public.notifications enable row level security;
revoke all on public.notifications from anon;
revoke insert, delete, update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy "own notifications" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy "mark own read" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- People can read the events behind their own notifications (to render them).
create policy "events behind my notifications" on public.events for select to authenticated
  using (exists (select 1 from public.notifications n where n.event_id = events.id and n.user_id = (select auth.uid())));

-- Per-person choices; a missing row means "use the event type's default".
create table public.notification_preferences (
  user_id uuid not null references auth.users on delete cascade,
  event_type text not null,
  channel text not null check (channel in ('in_app', 'email', 'push')),
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, event_type, channel)
);
alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from anon;
create policy "own preferences" on public.notification_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Deliveries now go to an org destination (subscription) or to a person on a channel.
alter table public.event_deliveries alter column org_id drop not null;
alter table public.event_deliveries alter column subscription_id drop not null;
alter table public.event_deliveries add column user_id uuid references auth.users on delete cascade;
alter table public.event_deliveries add column channel text;
alter table public.event_deliveries add constraint event_deliveries_target_check
  check ((subscription_id is not null) <> (user_id is not null and channel is not null));
create unique index event_deliveries_person on public.event_deliveries (event_id, user_id, channel) where user_id is not null;
create index event_deliveries_user on public.event_deliveries (user_id);

-- Router (service role): unrouted events, leased like deliveries.
create function public.claim_unrouted_events(p_limit int default 50) returns setof bigint
language sql security definer set search_path = '' as $$
  update public.events e set routed_at = now()
  where e.id in (
    select id from public.events where routed_at is null order by id limit p_limit for update skip locked
  )
  returning e.id;
$$;

-- Members of an org whose role grants a permission (same rules as has_perm, for any user).
create function public.members_with_perm(p_org uuid, p_perm text) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.user_id from public.org_members m join public.roles r on r.id = m.role_id
  where m.org_id = p_org and (r.is_owner or '*' = any (r.permissions) or p_perm = any (r.permissions)
    or split_part(p_perm, '.', 1) || '.*' = any (r.permissions));
$$;
revoke execute on function public.claim_unrouted_events(int), public.members_with_perm(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_unrouted_events(int), public.members_with_perm(uuid, text) to service_role;

-- emit_event: platform events (org_id null) have no org destinations.
create or replace function public.emit_event(
  p_org uuid, p_type text, p_payload jsonb default '{}', p_subject_table text default null, p_subject_id text default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  insert into public.events (org_id, type, payload, subject_table, subject_id, actor_id)
  values (p_org, p_type, coalesce(p_payload, '{}'), p_subject_table, p_subject_id, auth.uid())
  returning id into v_id;
  if p_org is not null then
    insert into public.event_deliveries (org_id, event_id, subscription_id)
    select p_org, v_id, s.id from public.event_subscriptions s
    where s.org_id = p_org and s.active and (p_type = any (s.event_types) or '*' = any (s.event_types))
      and (s.channel <> 'telegram' or s.config ? 'chat_id');
  end if;
  return v_id;
end $$;

-- Platform event: a new organisation.
create function public.events_from_orgs() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.emit_event(null, 'org.created', jsonb_build_object('org_id', new.id, 'name', new.name, 'slug', new.slug), 'orgs', new.id::text);
  return null;
end $$;
revoke execute on function public.events_from_orgs() from public, anon, authenticated;
create trigger events_from_orgs after insert on public.orgs for each row execute function public.events_from_orgs();
