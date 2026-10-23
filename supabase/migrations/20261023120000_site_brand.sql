-- Website area: the org's brand on all public pages (colours, fonts, corners, light/dark), own CSS, header and footer
-- HTML (cleaned in the app, src/site/html.ts), and drafts: editing writes `draft` (the whole site), "Veröffentlichen"
-- copies it into the live columns. Own permission org.site.manage, so someone can maintain the website without
-- access to settings; every role that may change settings gets it too.
alter table public.org_sites
  add column theme jsonb not null default '{}' check (jsonb_typeof(theme) = 'object'),
  add column css text check (length(css) <= 50000),
  add column header_html text check (length(header_html) <= 50000),
  add column footer_html text check (length(footer_html) <= 50000),
  add column draft jsonb check (draft is null or jsonb_typeof(draft) = 'object'),
  add column published_at timestamptz;

update public.roles set permissions = permissions || array['org.site.manage']
  where 'org.settings.manage' = any (permissions) and not 'org.site.manage' = any (permissions);

drop policy "settings managers edit the website" on public.org_sites;
create policy "website editors edit the website" on public.org_sites for all to authenticated
  using (public.has_perm(org_id, 'org.site.manage')) with check (public.has_perm(org_id, 'org.site.manage'));

drop policy "settings managers see the domain" on public.org_domains;
create policy "website editors see the domain" on public.org_domains for select to authenticated
  using (public.has_perm(org_id, 'org.site.manage'));

-- Live data only (never the draft).
create or replace function public.public_site(p_org uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public.org_alive(p_org) then jsonb_build_object(
    'tagline', s.tagline, 'blocks', s.blocks, 'imprint', s.imprint, 'privacy', s.privacy, 'saved', s.id is not null,
    'theme', coalesce(s.theme, '{}'), 'css', s.css, 'header_html', s.header_html, 'footer_html', s.footer_html,
    'modules', coalesce((select jsonb_agg(m.module_key) from public.org_modules m where m.org_id = p_org), '[]'),
    'forms', case when public.module_enabled(p_org, 'forms') then coalesce((select jsonb_agg(jsonb_build_object('slug', f.slug, 'title', f.title, 'intro', f.intro))
      from public.forms f where f.org_id = p_org and f.status = 'published' and f.deleted_at is null), '[]') else '[]' end
  ) end
  from (select 1) one left join public.org_sites s on s.org_id = p_org
$$;
