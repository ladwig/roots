-- Website builder (module "sites"): an org's public website on <org>.<root>. Pages are Puck documents
-- ({ content, root, zones } JSON of our own block types, see src/sites/), edited as a draft and copied to
-- `published` on publish. The theme (preset + colours + font) lives on `sites`. The public reads only through
-- public_site(), which returns published pages of live orgs with the module on – never drafts.

create table public.sites (
  org_id uuid primary key references public.orgs on delete cascade,
  theme jsonb not null default '{}',               -- { preset, primary, accent, font, radius }
  settings jsonb not null default '{}',            -- { footer, nav_events, nav_portal }
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
select public.enable_audit('public.sites');

create table public.site_pages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  slug text not null default '' check (slug ~ '^([a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?)?$'), -- '' = home page
  title text not null check (length(title) between 1 and 120),
  description text check (length(description) <= 300),
  in_nav boolean not null default true,
  position int not null default 0,
  draft jsonb not null default '{"content": [], "root": {"props": {}}}',
  published jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  check (octet_length(draft::text) <= 2000000 and octet_length(coalesce(published, '{}')::text) <= 2000000)
);
select public.enable_audit('public.site_pages');
select public.enable_soft_delete('public.site_pages', 'org_id', 'sites.manage', 30);
create unique index site_pages_org_slug on public.site_pages (org_id, slug) where deleted_at is null;

alter table public.sites enable row level security;
alter table public.site_pages enable row level security;
revoke all on public.sites, public.site_pages from anon;
create policy "site managers read" on public.sites for select to authenticated
  using (public.module_enabled(org_id, 'sites') and public.has_perm(org_id, 'sites.manage'));
create policy "site managers add" on public.sites for insert to authenticated
  with check (public.module_enabled(org_id, 'sites') and public.has_perm(org_id, 'sites.manage'));
create policy "site managers edit" on public.sites for update to authenticated
  using (public.module_enabled(org_id, 'sites') and public.has_perm(org_id, 'sites.manage'))
  with check (public.module_enabled(org_id, 'sites') and public.has_perm(org_id, 'sites.manage'));
create policy "site managers read pages" on public.site_pages for select to authenticated
  using (public.module_enabled(org_id, 'sites') and public.has_perm(org_id, 'sites.manage'));
create policy "site managers add pages" on public.site_pages for insert to authenticated
  with check (public.module_enabled(org_id, 'sites') and public.has_perm(org_id, 'sites.manage'));
create policy "site managers edit pages" on public.site_pages for update to authenticated
  using (public.module_enabled(org_id, 'sites') and public.has_perm(org_id, 'sites.manage'))
  with check (public.module_enabled(org_id, 'sites') and public.has_perm(org_id, 'sites.manage'));
revoke update (org_id) on public.site_pages from authenticated;

-- Public read: the site (theme, nav of published pages) + one published page by slug ('' = home). Null if the
-- org isn't live, the module is off, or the page doesn't exist / isn't published.
create function public.public_site(p_org uuid, p_slug text default '') returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'theme', coalesce(s.theme, '{}'),
    'settings', coalesce(s.settings, '{}'),
    'nav', coalesce((select jsonb_agg(jsonb_build_object('slug', n.slug, 'title', n.title) order by n.position, n.created_at)
      from public.site_pages n where n.org_id = p_org and n.deleted_at is null and n.published_at is not null and n.in_nav), '[]'),
    'page', jsonb_build_object('id', p.id, 'slug', p.slug, 'title', p.title, 'description', p.description, 'data', p.published))
  from public.site_pages p left join public.sites s on s.org_id = p.org_id
  where p.org_id = p_org and p.slug = coalesce(p_slug, '') and p.deleted_at is null and p.published_at is not null
    and public.module_enabled(p_org, 'sites') and public.org_alive(p_org);
$$;
grant execute on function public.public_site(uuid, text) to anon, authenticated;

-- Site images (orgs/<org>/site/…) may be written by whoever manages the site.
create or replace function public.can_write_image(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case (storage.foldername(p_name))[1]
    when 'users' then (storage.foldername(p_name))[2] = (select auth.uid())::text
    when 'orgs' then (storage.foldername(p_name))[2] ~ '^[0-9a-f-]{36}$'
      and public.has_perm(((storage.foldername(p_name))[2])::uuid,
        case (storage.foldername(p_name))[3] when 'events' then 'events.manage' when 'site' then 'sites.manage' else 'org.settings.manage' end)
    else false
  end
$$;
