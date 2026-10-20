-- An org's public start page, kept simple: a tagline and an ordered list of blocks (text, hero, links, and blocks of
-- modules: events, one event, a form, the portal, wiki pages), plus Impressum and Datenschutz (Markdown). Validated in
-- the app (src/site/blocks.ts); blocks of switched-off modules are skipped when rendering. One row per org; without
-- one the start page shows the upcoming events as before. Public through public_site() (live orgs only).
create table public.org_sites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references public.orgs on delete cascade,
  tagline text check (length(tagline) <= 300),
  blocks jsonb not null default '[]' check (jsonb_typeof(blocks) = 'array'),
  imprint text check (length(imprint) <= 20000),
  privacy text check (length(privacy) <= 60000),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
select public.enable_audit('public.org_sites');
alter table public.org_sites enable row level security;
revoke all on public.org_sites from anon;
create policy "members see the website" on public.org_sites for select to authenticated using (public.is_member(org_id));
create policy "settings managers edit the website" on public.org_sites for all to authenticated
  using (public.has_perm(org_id, 'org.settings.manage')) with check (public.has_perm(org_id, 'org.settings.manage'));

-- What the public start page needs in one call: the site, the org's modules (which blocks render) and its published
-- forms (form blocks). Nothing for deleted orgs.
create function public.public_site(p_org uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public.org_alive(p_org) then jsonb_build_object(
    'tagline', s.tagline, 'blocks', s.blocks, 'imprint', s.imprint, 'privacy', s.privacy, 'saved', s.id is not null,
    'modules', coalesce((select jsonb_agg(m.module_key) from public.org_modules m where m.org_id = p_org), '[]'),
    'forms', case when public.module_enabled(p_org, 'forms') then coalesce((select jsonb_agg(jsonb_build_object('slug', f.slug, 'title', f.title, 'intro', f.intro))
      from public.forms f where f.org_id = p_org and f.status = 'published' and f.deleted_at is null), '[]') else '[]' end
  ) end
  from (select 1) one left join public.org_sites s on s.org_id = p_org
$$;
revoke execute on function public.public_site(uuid) from public;
grant execute on function public.public_site(uuid) to anon, authenticated;
