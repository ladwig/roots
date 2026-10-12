-- What an org's website needs besides its pages, for anonymous visitors: enabled modules (which blocks render),
-- published forms (form blocks) and the legal details for the generated Impressum (from the invoice settings).
-- Only when the org is live and has the website module on.
create function public.public_site_extras(p_org uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public.module_enabled(p_org, 'sites') and public.org_alive(p_org) then jsonb_build_object(
    'modules', coalesce((select jsonb_agg(m.module_key) from public.org_modules m where m.org_id = p_org), '[]'),
    'forms', case when public.module_enabled(p_org, 'forms') then coalesce((select jsonb_agg(jsonb_build_object('slug', f.slug, 'title', f.title, 'intro', f.intro) order by f.title)
      from public.forms f where f.org_id = p_org and f.status = 'published' and f.deleted_at is null), '[]') else '[]' end,
    'legal', (select jsonb_build_object('legal_name', b.legal_name, 'street', b.street, 'postal_code', b.postal_code, 'city', b.city,
      'email', b.email, 'phone', b.phone, 'website', b.website, 'representatives', b.representatives, 'register', b.register, 'vat_id', b.vat_id)
      from public.org_billing b where b.org_id = p_org)
  ) end;
$$;
grant execute on function public.public_site_extras(uuid) to anon, authenticated;
