-- Wiki (module "wiki"): pages in a tree (a page can hold pages), Markdown bodies, every change kept as a version.
-- Pages are business objects: soft delete (trash, 30 days). Versions are written by a trigger (never by hand) and are
-- themselves the history, so they aren't in the change log (that would store every body twice).

create or replace function public.default_module_keys() returns text[]
language sql immutable set search_path = '' as $$
  select array['crm', 'payments', 'events', 'tickets', 'guestlists', 'invoices', 'shifts', 'members', 'forms', 'email', 'hr', 'courses', 'automations', 'reports', 'cashbook', 'wiki']
$$;
insert into public.org_modules (org_id, module_key) select id, 'wiki' from public.orgs on conflict do nothing;

create table public.wiki_pages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  parent_id uuid references public.wiki_pages on delete set null,
  title text not null check (length(trim(title)) between 1 and 200),
  body text not null default '' check (length(body) <= 200000),
  position int not null default 0,
  deleted_at timestamptz, deleted_by uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index wiki_pages_org on public.wiki_pages (org_id, parent_id, position);
select public.enable_audit('public.wiki_pages');
select public.enable_soft_delete('public.wiki_pages', 'org_id', 'wiki.manage', 30);

create table public.wiki_page_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  page_id uuid not null references public.wiki_pages on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index wiki_page_versions_page on public.wiki_page_versions (page_id, created_at desc);

-- Parent in the same org, never the page itself or one of its children (no cycles).
create function public.wiki_pages_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.parent_id is not null then
    if not exists (select 1 from public.wiki_pages where id = new.parent_id and org_id = new.org_id) then raise exception 'not_allowed'; end if;
    if tg_op = 'UPDATE' and exists (
      with recursive up as (select id, parent_id from public.wiki_pages where id = new.parent_id
        union all select p.id, p.parent_id from public.wiki_pages p join up on p.id = up.parent_id)
      select 1 from up where id = new.id) then
      raise exception 'wiki_cycle';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.wiki_pages_guard() from public, anon, authenticated;
create trigger wiki_pages_guard before insert or update of parent_id on public.wiki_pages for each row execute function public.wiki_pages_guard();

-- The text before a change becomes a version (only when title or body really changed).
create function public.wiki_pages_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.title is distinct from old.title or new.body is distinct from old.body then
    insert into public.wiki_page_versions (org_id, page_id, title, body, created_at, created_by)
    values (old.org_id, old.id, old.title, old.body, old.updated_at, old.updated_by);
  end if;
  return null;
end $$;
revoke execute on function public.wiki_pages_version() from public, anon, authenticated;
create trigger wiki_pages_version after update of title, body on public.wiki_pages for each row execute function public.wiki_pages_version();

alter table public.wiki_pages enable row level security;
alter table public.wiki_page_versions enable row level security;
revoke all on public.wiki_pages, public.wiki_page_versions from anon;

create policy "read wiki" on public.wiki_pages for select to authenticated
  using (public.module_enabled(org_id, 'wiki') and (public.has_perm(org_id, 'wiki.view') or public.has_perm(org_id, 'wiki.manage')));
create policy "write wiki" on public.wiki_pages for insert to authenticated
  with check (public.module_enabled(org_id, 'wiki') and public.has_perm(org_id, 'wiki.manage'));
create policy "change wiki" on public.wiki_pages for update to authenticated
  using (public.module_enabled(org_id, 'wiki') and public.has_perm(org_id, 'wiki.manage'))
  with check (public.module_enabled(org_id, 'wiki') and public.has_perm(org_id, 'wiki.manage'));
create policy "read wiki versions" on public.wiki_page_versions for select to authenticated
  using (public.module_enabled(org_id, 'wiki') and (public.has_perm(org_id, 'wiki.view') or public.has_perm(org_id, 'wiki.manage')));
