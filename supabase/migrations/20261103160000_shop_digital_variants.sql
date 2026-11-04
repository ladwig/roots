-- A variant can be digital (e.g. "Digital album" next to "Vinyl"): no stock needed, no shipping, downloads after payment.
-- Also fixes `left` for unlimited stock: greatest(0, null) is 0 in Postgres, so those showed as sold out (now null).
-- Downloads of a product go to every paid buyer of it, so physical variants can include them too (vinyl + download).
alter table public.product_variants add column digital boolean not null default false;

create or replace function public.shop_catalog(p_org uuid, p_slug text default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(s.x order by s.position, s.created_at), '[]') from (
    select p.position, p.created_at, jsonb_build_object(
      'id', p.id, 'slug', p.slug, 'name', p.name, 'kind', p.kind, 'price_cents', p.price_cents, 'tax_rate', p.tax_rate,
      'images', p.images, 'video_url', p.video_url, 'category', p.category, 'max_per_order', p.max_per_order,
      'description', case when p_slug is not null then p.description end,
      'left', case when vs.list is null and p.stock is not null then greatest(0, public.shop_left(p.id::text, p.stock)) end,
      'variants', coalesce(vs.list, '[]')
    ) as x
    from public.products p
    left join lateral (
      select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'price_cents', coalesce(v.price_cents, p.price_cents),
        'digital', v.digital or p.kind = 'digital',
        'left', case when v.stock is not null then greatest(0, public.shop_left(v.id::text, v.stock)) end) order by v.position, v.created_at) as list
      from public.product_variants v where v.product_id = p.id and v.active
    ) vs on true
    where p.org_id = p_org and p.status = 'published' and p.deleted_at is null and public.shop_public(p_org)
      and (p_slug is null or p.slug = p_slug)
  ) s
$$;
