-- Events module: real-world events an org runs (concerts, Vereinsfeste, workshops).
-- Ticketing, guest lists and shifts hang off events.id later.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$'),       -- public URL: <org>.roots.app/e/<slug>
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled')),
  starts_at timestamptz not null,
  ends_at timestamptz check (ends_at > starts_at),
  venue_name text check (length(venue_name) <= 200),
  venue_address text check (length(venue_address) <= 500),
  description text check (length(description) <= 20000),
  image_path text check (image_path ~ '^orgs/'),
  capacity int check (capacity > 0),
  published_at timestamptz,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index events_org_starts on public.events (org_id, starts_at);
select public.enable_audit('public.events');
select public.enable_soft_delete('public.events', 'org_id', 'events.manage', 30);
-- Slug unique among live events (a deleted event's address can be reused).
create unique index events_org_slug on public.events (org_id, slug) where deleted_at is null;

alter table public.events enable row level security;
revoke all on public.events from anon;
create policy "members view events" on public.events for select to authenticated
  using (public.module_enabled(org_id, 'events') and public.has_perm(org_id, 'events.view'));
create policy "managers create events" on public.events for insert to authenticated
  with check (public.module_enabled(org_id, 'events') and public.has_perm(org_id, 'events.manage'));
create policy "managers edit events" on public.events for update to authenticated
  using (public.module_enabled(org_id, 'events') and public.has_perm(org_id, 'events.manage'))
  with check (public.module_enabled(org_id, 'events') and public.has_perm(org_id, 'events.manage'));
-- no delete policy: soft_delete() / purge only

-- published_at follows status
create function public.events_set_published_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then new.published_at := now(); end if;
  if new.status = 'draft' then new.published_at := null; end if;
  return new;
end $$;
create trigger events_set_published_at before insert or update of status on public.events
  for each row execute function public.events_set_published_at();

-- Public surface: anyone may read published/cancelled, live events of a live org that has the module on.
-- Narrow column grants: no audit columns for anon.
create function public.events_public(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.org_alive(p_org) and exists (select 1 from public.org_modules where org_id = p_org and module_key = 'events');
$$;
grant execute on function public.events_public(uuid) to anon, authenticated;
grant select (id, org_id, title, slug, status, starts_at, ends_at, venue_name, venue_address, description, image_path, capacity, published_at)
  on public.events to anon;
create policy "public sees published events" on public.events for select to anon
  using (status in ('published', 'cancelled') and deleted_at is null and public.events_public(org_id));

-- Orgs: anon reads the public face only (to resolve <org>.roots.app).
grant select (id, slug, name, logo_path) on public.orgs to anon;
create policy "public sees live orgs" on public.orgs for select to anon using (deleted_at is null);

-- Event images live under orgs/<org>/events/…: events.manage may write there; the rest of orgs/<org>/ needs org.settings.manage.
create or replace function public.can_write_image(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case (storage.foldername(p_name))[1]
    when 'users' then (storage.foldername(p_name))[2] = (select auth.uid())::text
    when 'orgs' then (storage.foldername(p_name))[2] ~ '^[0-9a-f-]{36}$'
      and public.has_perm(((storage.foldername(p_name))[2])::uuid,
        case when (storage.foldername(p_name))[3] = 'events' then 'events.manage' else 'org.settings.manage' end)
    else false
  end
$$;

-- Event hub: published / changed (time, place) / cancelled → webhooks, Telegram, …
create or replace function public.events_from_changes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_type text;
begin
  if tg_table_name = 'org_members' then
    if tg_op = 'INSERT' then
      perform public.emit_event(new.org_id, 'member.joined', jsonb_build_object('user_id', new.user_id,
        'email', (select email from public.profiles where id = new.user_id)), 'org_members', new.id::text);
    elsif tg_op = 'DELETE' and exists (select 1 from public.orgs where id = old.org_id) then
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
  elsif tg_table_name = 'events' then
    v_type := case
      when new.deleted_at is not null then null
      when new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then 'event.published'
      when tg_op = 'UPDATE' and new.status = 'cancelled' and old.status = 'published' then 'event.cancelled'
      when tg_op = 'UPDATE' and new.status = 'published' and (new.starts_at, new.ends_at, new.venue_name, new.venue_address)
        is distinct from (old.starts_at, old.ends_at, old.venue_name, old.venue_address) then 'event.updated'
    end;
    if v_type is not null then
      perform public.emit_event(new.org_id, v_type, jsonb_build_object('event_id', new.id, 'title', new.title, 'slug', new.slug,
        'starts_at', new.starts_at, 'ends_at', new.ends_at, 'venue_name', new.venue_name, 'venue_address', new.venue_address,
        'org_slug', (select slug from public.orgs where id = new.org_id)), 'events', new.id::text);
    end if;
  end if;
  return null;
end $$;
create trigger events_from_changes after insert or update on public.events for each row execute function public.events_from_changes();
