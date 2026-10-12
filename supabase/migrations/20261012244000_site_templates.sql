-- Module page templates: an org can design the page used for every event (/e/<slug>), every form (/f/<slug>) and
-- the member area (/portal). A template is a site page of kind event|form|portal (one per kind, no own address).
-- Published = used for all such pages; unpublished / none = roots' standard page. Normal pages are kind 'page'.
alter table public.site_pages add column kind text not null default 'page' check (kind in ('page', 'event', 'form', 'portal'));
drop index public.site_pages_org_slug;
create unique index site_pages_org_slug on public.site_pages (org_id, slug) where deleted_at is null and kind = 'page';
create unique index site_pages_org_template on public.site_pages (org_id, kind) where deleted_at is null and kind <> 'page';

-- Normal pages only (templates have no address and are not in the menu).
create or replace function public.public_site(p_org uuid, p_slug text default '') returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public.module_enabled(p_org, 'sites') and public.org_alive(p_org)
    and exists (select 1 from public.site_pages x where x.org_id = p_org and x.deleted_at is null and x.published_at is not null)
  then jsonb_build_object(
    'theme', coalesce((select s.theme from public.sites s where s.org_id = p_org), '{}'),
    'settings', coalesce((select s.settings from public.sites s where s.org_id = p_org), '{}'),
    'nav', coalesce((select jsonb_agg(jsonb_build_object('slug', n.slug, 'title', n.title) order by n.position, n.created_at)
      from public.site_pages n where n.org_id = p_org and n.deleted_at is null and n.published_at is not null and n.in_nav and n.kind = 'page'), '[]'),
    'page', (select jsonb_build_object('id', p.id, 'slug', p.slug, 'title', p.title, 'description', p.description, 'data', p.published)
      from public.site_pages p where p.org_id = p_org and p.slug = coalesce(p_slug, '') and p.kind = 'page' and p.deleted_at is null and p.published_at is not null),
    'templates', coalesce((select jsonb_object_agg(x.kind, x.published) from public.site_pages x
      where x.org_id = p_org and x.kind <> 'page' and x.deleted_at is null and x.published_at is not null), '{}'))
  end;
$$;
