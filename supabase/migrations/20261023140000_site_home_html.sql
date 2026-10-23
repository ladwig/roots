-- Start page as own HTML with placeholders (src/site/template.ts) instead of blocks.
alter table public.org_sites
  add column home_mode text not null default 'blocks' check (home_mode in ('blocks', 'html')),
  add column home_html text check (length(home_html) <= 100000);

create or replace function public.public_site(p_org uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public.org_alive(p_org) then jsonb_build_object(
    'tagline', s.tagline, 'blocks', s.blocks, 'imprint', s.imprint, 'privacy', s.privacy, 'saved', s.id is not null,
    'theme', coalesce(s.theme, '{}'), 'css', s.css, 'header_html', s.header_html, 'footer_html', s.footer_html,
    'home_mode', coalesce(s.home_mode, 'blocks'), 'home_html', s.home_html,
    'modules', coalesce((select jsonb_agg(m.module_key) from public.org_modules m where m.org_id = p_org), '[]'),
    'forms', case when public.module_enabled(p_org, 'forms') then coalesce((select jsonb_agg(jsonb_build_object('slug', f.slug, 'title', f.title, 'intro', f.intro))
      from public.forms f where f.org_id = p_org and f.status = 'published' and f.deleted_at is null), '[]') else '[]' end
  ) end
  from (select 1) one left join public.org_sites s on s.org_id = p_org
$$;
