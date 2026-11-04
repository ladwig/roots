-- Name your price (docs/plans/shop-name-your-price.md): the price becomes the minimum, buyers choose what they pay;
-- per product with an optional suggested price, variants follow the product unless set (null). Single tracks: a
-- product with track_price_cents sells its ready tracks one by one (product_tracks.buyable; "or more" when the
-- product is name-your-price); a track purchase unlocks just that track.
alter table public.products
  add column name_your_price boolean not null default false,
  add column suggested_cents int check (suggested_cents between 0 and 100000000),
  add column track_price_cents int check (track_price_cents between 0 and 100000000);
alter table public.product_variants add column name_your_price boolean;
alter table public.product_tracks add column buyable boolean not null default true;

create or replace function public.shop_catalog(p_org uuid, p_slug text default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(s.x order by s.position, s.created_at), '[]') from (
    select p.position, p.created_at, jsonb_build_object(
      'id', p.id, 'slug', p.slug, 'name', p.name, 'kind', p.kind, 'price_cents', p.price_cents, 'tax_rate', p.tax_rate,
      'images', p.images, 'video_url', p.video_url, 'category', p.category, 'max_per_order', p.max_per_order,
      'name_your_price', p.name_your_price, 'suggested_cents', p.suggested_cents, 'track_price_cents', p.track_price_cents,
      'release_at', case when p.release_at > now() then p.release_at end,
      'description', case when p_slug is not null then p.description end,
      'left', case when vs.list is null and p.stock is not null then greatest(0, public.shop_left(p.id::text, p.stock)) end,
      'variants', coalesce(vs.list, '[]'),
      'tracks', coalesce(ts.list, '[]')
    ) as x
    from public.products p
    left join lateral (
      select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'price_cents', coalesce(v.price_cents, p.price_cents),
        'digital', v.digital or p.kind = 'digital', 'name_your_price', coalesce(v.name_your_price, p.name_your_price),
        'left', case when v.stock is not null then greatest(0, public.shop_left(v.id::text, v.stock)) end) order by v.position, v.created_at) as list
      from public.product_variants v where v.product_id = p.id and v.active
    ) vs on true
    left join lateral ( -- tracks sold one by one (only when the product sets a track price)
      select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title) order by t.position, t.created_at) as list
      from public.product_tracks t where t.product_id = p.id and t.status = 'ready' and t.buyable and p.track_price_cents is not null
    ) ts on true
    where p.org_id = p_org and p.status = 'published' and p.deleted_at is null and public.shop_public(p_org)
      and (p_slug is null or p.slug = p_slug)
  ) s
$$;
