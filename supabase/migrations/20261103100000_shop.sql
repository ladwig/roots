-- Shop (module "shop", "Onlineshop"): an org sells things (merch, books, downloads…) on its public pages.
-- products         = what's for sale: gross price + VAT rate, pictures, optional video, physical or digital, stock.
-- product_variants = sizes/colours with their own stock (and optional own price); a product with variants is
--                    always bought as one of them.
-- shop_orders      = the shop's side of a pay_orders row (1:1): delivery, address, payment method, fulfilment
--                    status, the invoice. Items + money stay in pay_orders / pay_order_items (source_module 'shop',
--                    item source_id = variant or product id).
-- shop_settings    = one row per org: payment methods, pickup/shipping, invoices, legal texts, which mails go out.
-- Stock works like ticket quotas: `stock` = units for sale in total; paid orders and open orders that haven't
-- expired hold units (shop_left). No locks needed: an order is checked after its items are stored, so of two
-- orders racing for the last unit the later check always sees the other one.

create or replace function public.default_module_keys() returns text[]
language sql immutable set search_path = '' as $$
  select array['crm', 'payments', 'events', 'tickets', 'guestlists', 'invoices', 'shifts', 'members', 'forms', 'email', 'hr', 'courses', 'automations', 'reports', 'cashbook', 'wiki', 'projects', 'rentals', 'shop']
$$;
insert into public.org_modules (org_id, module_key) select id, 'shop' from public.orgs on conflict do nothing;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  name text not null check (length(trim(name)) between 1 and 200),
  description text not null default '' check (length(description) <= 50000), -- rich text (HTML, cleaned when shown)
  kind text not null default 'physical' check (kind in ('physical', 'digital')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  price_cents int not null default 0 check (price_cents >= 0),               -- gross, what the buyer pays
  tax_rate numeric(4, 2) not null default 19 check (tax_rate in (19, 7, 0)),
  stock int check (stock >= 0),                                               -- for sale in total; null = unlimited
  max_per_order int not null default 10 check (max_per_order between 1 and 100),
  images text[] not null default '{}' check (cardinality(images) <= 12),     -- paths in the images bucket
  video_url text check (video_url ~ '^https://' and length(video_url) <= 500),
  category text check (length(trim(category)) between 1 and 60),
  position int not null default 0,
  deleted_at timestamptz, deleted_by uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create unique index products_slug on public.products (org_id, slug) where deleted_at is null;
create index products_org on public.products (org_id, position) where deleted_at is null;
select public.enable_audit('public.products');
select public.enable_soft_delete('public.products', 'org_id', 'shop.manage', 30);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  product_id uuid not null references public.products on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  price_cents int check (price_cents >= 0),                                   -- null = the product's price
  stock int check (stock >= 0),
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index product_variants_product on public.product_variants (product_id, position);
create index product_variants_org on public.product_variants (org_id);
select public.enable_audit('public.product_variants');

create table public.shop_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references public.orgs on delete cascade,
  title text check (length(title) <= 200),
  intro text check (length(intro) <= 5000),
  pay_online boolean not null default true,        -- the org's payment provider (Stripe/SumUp), when connected
  pay_transfer boolean not null default false,     -- Überweisung: bank details from the invoice settings
  pay_on_pickup boolean not null default false,    -- bar / Karte bei Abholung
  transfer_days int not null default 7 check (transfer_days between 1 and 60), -- units held for an unpaid transfer
  pickup boolean not null default true,
  pickup_text text check (length(pickup_text) <= 2000),                        -- where + when
  shipping boolean not null default false,
  shipping_rates jsonb not null default '[]' check (jsonb_typeof(shipping_rates) = 'array'), -- [{id,name,cents,free_from,countries}]
  auto_invoice boolean not null default true,
  terms text check (length(terms) <= 50000),       -- AGB (rich text)
  withdrawal text check (length(withdrawal) <= 50000), -- Widerrufsbelehrung (rich text)
  mails jsonb not null default '{}' check (jsonb_typeof(mails) = 'object'),     -- {kind: {off, message}}
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
select public.enable_audit('public.shop_settings');

create table public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  order_id uuid not null unique references public.pay_orders on delete cascade,
  number int not null,                                                        -- per org, from 1001 (set by trigger)
  token uuid not null default gen_random_uuid(),                              -- the buyer's order page
  status text not null default 'new' check (status in ('new', 'ready', 'shipped', 'completed', 'cancelled')),
  delivery text not null check (delivery in ('pickup', 'shipping', 'digital')),
  payment text not null check (payment in ('online', 'transfer', 'pickup')),
  name text not null check (length(trim(name)) between 1 and 200),
  company text check (length(company) <= 200),
  street text check (length(street) <= 200),
  postal_code text check (length(postal_code) <= 20),
  city text check (length(city) <= 100),
  country text check (country ~ '^[A-Z]{2}$'),
  shipping_name text check (length(shipping_name) <= 100),
  shipping_cents int not null default 0 check (shipping_cents >= 0),
  note text check (length(note) <= 2000),                                    -- from the buyer
  tracking text check (length(tracking) <= 300),                             -- carrier + number, free text
  contact_id uuid references public.contacts on delete set null,
  invoice_id uuid references public.documents on delete set null,
  invoice_error text check (length(invoice_error) <= 300),
  placed_at timestamptz,                                                     -- a real order: transfer/pickup at once, online when paid
  shipped_at timestamptz, completed_at timestamptz, cancelled_at timestamptz,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  unique (org_id, number),
  check (delivery <> 'shipping' or (street is not null and postal_code is not null and city is not null and country is not null)),
  check (payment <> 'pickup' or delivery = 'pickup')
);
create index shop_orders_org on public.shop_orders (org_id, placed_at desc) where placed_at is not null;
create index shop_orders_contact on public.shop_orders (contact_id) where contact_id is not null;
create index shop_orders_invoice on public.shop_orders (invoice_id) where invoice_id is not null;
select public.enable_audit('public.shop_orders');

-- Stock counting looks items up by their product/variant.
create index pay_order_items_source on public.pay_order_items (source_id) where source_id is not null;

-- ---------- guards ----------

create function public.product_variants_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.products where id = new.product_id and org_id = new.org_id) then raise exception 'not_allowed'; end if;
  return new;
end $$;
revoke execute on function public.product_variants_guard() from public, anon, authenticated;
create trigger product_variants_guard before insert or update of product_id, org_id on public.product_variants
  for each row execute function public.product_variants_guard();

-- Order number (per org, gap-free enough for a reference) + same org for order, contact and invoice.
create function public.shop_orders_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.pay_orders where id = new.order_id and org_id = new.org_id and source_module = 'shop') then raise exception 'not_allowed'; end if;
  if new.contact_id is not null and not exists (select 1 from public.contacts where id = new.contact_id and org_id = new.org_id) then raise exception 'not_allowed'; end if;
  if new.invoice_id is not null and not exists (select 1 from public.documents where id = new.invoice_id and org_id = new.org_id) then raise exception 'not_allowed'; end if;
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('shop_order_no:' || new.org_id::text));
    new.number := coalesce((select max(number) from public.shop_orders where org_id = new.org_id), 1000) + 1;
  elsif new.number <> old.number or new.order_id <> old.order_id or new.token <> old.token then
    raise exception 'not_allowed';
  end if;
  if new.status = 'shipped' and (tg_op = 'INSERT' or old.status <> 'shipped') then new.shipped_at := now(); end if;
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status <> 'completed') then new.completed_at := now(); end if;
  if new.status = 'cancelled' and (tg_op = 'INSERT' or old.status <> 'cancelled') then new.cancelled_at := now(); end if;
  return new;
end $$;
revoke execute on function public.shop_orders_guard() from public, anon, authenticated;
create trigger shop_orders_guard before insert or update on public.shop_orders for each row execute function public.shop_orders_guard();

-- Event hub: shipped / ready for pickup (placed + paid are emitted by the app, which knows when an order is real).
create function public.shop_orders_emit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('shipped', 'ready') and old.status <> new.status then
    perform public.emit_event(new.org_id, case new.status when 'shipped' then 'shop.order_shipped' else 'shop.order_ready' end,
      jsonb_build_object('shop_order_id', new.id, 'order_id', new.order_id, 'number', new.number, 'name', new.name, 'contact_id', new.contact_id),
      'shop_orders', new.id::text);
  end if;
  return null;
end $$;
revoke execute on function public.shop_orders_emit() from public, anon, authenticated;
create trigger shop_orders_emit after update of status on public.shop_orders for each row execute function public.shop_orders_emit();

-- ---------- RLS ----------

alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.shop_settings enable row level security;
alter table public.shop_orders enable row level security;
revoke all on public.products, public.product_variants, public.shop_settings, public.shop_orders from anon;

create policy "shop.view" on public.products for select to authenticated
  using (public.module_enabled(org_id, 'shop') and public.has_perm(org_id, 'shop.view'));
create policy "shop.manage" on public.products for all to authenticated
  using (public.module_enabled(org_id, 'shop') and public.has_perm(org_id, 'shop.manage'))
  with check (public.module_enabled(org_id, 'shop') and public.has_perm(org_id, 'shop.manage'));
create policy "shop.view" on public.product_variants for select to authenticated
  using (public.module_enabled(org_id, 'shop') and public.has_perm(org_id, 'shop.view'));
create policy "shop.manage" on public.product_variants for all to authenticated
  using (public.module_enabled(org_id, 'shop') and public.has_perm(org_id, 'shop.manage'))
  with check (public.module_enabled(org_id, 'shop') and public.has_perm(org_id, 'shop.manage'));
create policy "shop.view" on public.shop_settings for select to authenticated
  using (public.module_enabled(org_id, 'shop') and public.has_perm(org_id, 'shop.view'));
create policy "shop.manage" on public.shop_settings for all to authenticated
  using (public.module_enabled(org_id, 'shop') and public.has_perm(org_id, 'shop.manage'))
  with check (public.module_enabled(org_id, 'shop') and public.has_perm(org_id, 'shop.manage'));
-- Orders are created by the public checkout (service role); the team only reads + updates them.
create policy "shop.view" on public.shop_orders for select to authenticated
  using (public.module_enabled(org_id, 'shop') and public.has_perm(org_id, 'shop.view'));
create policy "shop.manage" on public.shop_orders for update to authenticated
  using (public.module_enabled(org_id, 'shop') and public.has_perm(org_id, 'shop.manage'))
  with check (public.module_enabled(org_id, 'shop') and public.has_perm(org_id, 'shop.manage'));
revoke insert, delete on public.shop_orders from authenticated;

-- ---------- stock + public catalog ----------

-- Units of a product/variant still free: stock − paid − held by open orders that haven't expired. Can be negative
-- (shop_check uses that). ponytail: refunded/cancelled orders give their units back even if shipped; the team
-- lowers the stock by hand when goods don't come back.
create function public.shop_left(p_item text, p_stock int) returns int
language sql stable security definer set search_path = '' as $$
  select case when p_stock is null then null else p_stock - coalesce((
    select sum(i.quantity) from public.pay_order_items i join public.pay_orders o on o.id = i.order_id
    where i.source_id = p_item and o.source_module = 'shop'
      and (o.status in ('paid', 'partially_refunded') or (o.status = 'open' and (o.expires_at is null or o.expires_at > now())))
  ), 0)::int end
$$;
revoke execute on function public.shop_left(text, int) from public, anon, authenticated;
grant execute on function public.shop_left(text, int) to service_role;

-- After an order's items are stored: is every limited item still within its stock (this order included)?
create function public.shop_check(p_order uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.pay_order_items i
      left join public.product_variants v on v.id::text = i.source_id
      left join public.products p on p.id::text = i.source_id
    where i.order_id = p_order and i.source_id is not null
      and public.shop_left(i.source_id, coalesce(v.stock, p.stock)) < 0
  )
$$;
revoke execute on function public.shop_check(uuid) from public, anon, authenticated;
grant execute on function public.shop_check(uuid) to service_role;

create function public.shop_public(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.org_alive(p_org) and exists (select 1 from public.org_modules where org_id = p_org and module_key = 'shop');
$$;
grant execute on function public.shop_public(uuid) to anon, authenticated;

-- The public catalog (published, live products; one product with its description when p_slug is given).
create function public.shop_catalog(p_org uuid, p_slug text default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(s.x order by s.position, s.created_at), '[]') from (
    select p.position, p.created_at, jsonb_build_object(
      'id', p.id, 'slug', p.slug, 'name', p.name, 'kind', p.kind, 'price_cents', p.price_cents, 'tax_rate', p.tax_rate,
      'images', p.images, 'video_url', p.video_url, 'category', p.category, 'max_per_order', p.max_per_order,
      'description', case when p_slug is not null then p.description end,
      'left', case when vs.list is null then greatest(0, public.shop_left(p.id::text, p.stock)) end,
      'variants', coalesce(vs.list, '[]')
    ) as x
    from public.products p
    left join lateral (
      select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'price_cents', coalesce(v.price_cents, p.price_cents),
        'left', greatest(0, public.shop_left(v.id::text, v.stock))) order by v.position, v.created_at) as list
      from public.product_variants v where v.product_id = p.id and v.active
    ) vs on true
    where p.org_id = p_org and p.status = 'published' and p.deleted_at is null and public.shop_public(p_org)
      and (p_slug is null or p.slug = p_slug)
  ) s
$$;
grant execute on function public.shop_catalog(uuid, text) to anon, authenticated;

-- What the public pages need from the settings (no internal fields).
create function public.shop_public_settings(p_org uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public.shop_public(p_org) then coalesce((
    select jsonb_build_object('title', s.title, 'intro', s.intro, 'pay_online', s.pay_online, 'pay_transfer', s.pay_transfer,
      'pay_on_pickup', s.pay_on_pickup, 'pickup', s.pickup, 'pickup_text', s.pickup_text, 'shipping', s.shipping,
      'shipping_rates', s.shipping_rates, 'terms', s.terms, 'withdrawal', s.withdrawal)
    from public.shop_settings s where s.org_id = p_org
  ), jsonb_build_object('pay_online', true, 'pay_transfer', false, 'pay_on_pickup', false, 'pickup', true, 'shipping', false, 'shipping_rates', '[]'::jsonb)) end
$$;
grant execute on function public.shop_public_settings(uuid) to anon, authenticated;

-- Product pictures: orgs/<org>/shop/… for shop.manage.
create or replace function public.can_write_image(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case (storage.foldername(p_name))[1]
    when 'users' then (storage.foldername(p_name))[2] = (select auth.uid())::text
    when 'orgs' then (storage.foldername(p_name))[2] ~ '^[0-9a-f-]{36}$'
      and public.has_perm(((storage.foldername(p_name))[2])::uuid,
        case (storage.foldername(p_name))[3] when 'events' then 'events.manage' when 'shop' then 'shop.manage' else 'org.settings.manage' end)
    else false
  end
$$;

-- ---------- invoices: gross prices + issued by the system ----------
-- Shop invoices are built from gross prices (what the buyer paid), so the total matches the payment to the cent:
-- with prices_gross, unit_price is gross and the VAT is taken out of each rate's sum.
alter table public.documents add column prices_gross boolean not null default false;
-- Invoices up to 250 € without the buyer's address (Kleinbetragsrechnung, § 33 UStDV): a setting, on by default.
alter table public.org_billing add column short_invoices boolean not null default true;

create or replace function public.documents_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status <> 'draft' and (
    (new.kind, new.number, new.contact_id, new.title, new.recipient_name, new.recipient_address, new.recipient_email,
     new.recipient_vat_id, new.issue_date, new.service_from, new.service_to, new.due_date, new.valid_until, new.intro,
     new.outro, new.tax_mode, new.currency, new.net_total, new.tax_total, new.gross_total, new.seller, new.issued_at, new.prices_gross)
    is distinct from
    (old.kind, old.number, old.contact_id, old.title, old.recipient_name, old.recipient_address, old.recipient_email,
     old.recipient_vat_id, old.issue_date, old.service_from, old.service_to, old.due_date, old.valid_until, old.intro,
     old.outro, old.tax_mode, old.currency, old.net_total, old.tax_total, old.gross_total, old.seller, old.issued_at, old.prices_gross)
  ) then raise exception 'document_locked'; end if;
  if old.status = 'draft' and new.status <> 'draft' and current_setting('roots.issuing', true) is distinct from 'on' then
    raise exception 'document_locked';
  end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' and current_setting('roots.cancelling', true) is distinct from 'on' then
    raise exception 'use_cancellation';
  end if;
  if old.status <> new.status and not (
    (old.status = 'draft') or
    (new.kind = 'invoice' and old.status = 'sent' and new.status in ('paid', 'cancelled')) or
    (new.kind = 'invoice' and old.status = 'paid' and new.status in ('sent', 'cancelled')) or
    (new.kind = 'quote' and old.status = 'sent' and new.status in ('accepted', 'declined')) or
    (new.kind = 'quote' and old.status in ('accepted', 'declined') and new.status = 'sent')
  ) then raise exception 'invalid_status'; end if;
  if new.status = 'paid' and old.status <> 'paid' then new.paid_at := now(); end if;
  if new.status <> 'paid' then new.paid_at := null; end if;
  if new.status = 'cancelled' then new.cancelled_at := now(); end if;
  return new;
end $$;

-- The service role (shop fulfilment, no person signed in, no API key) may issue/cancel too: it bypasses RLS anyway.
create or replace function public.system_call() returns boolean
language sql stable set search_path = '' as $$
  select auth.role() = 'service_role' and public.request_org() is null
$$;
revoke execute on function public.system_call() from public, anon, authenticated;

-- Issue: as before; recipient optional on invoices up to 250 € when the org allows it (org_billing.short_invoices).
create or replace function public.issue_document(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare d public.documents; b public.org_billing; r public.number_ranges; v_year int; v_n int; v_number text; v_date date;
begin
  select * into d from public.documents where id = p_id for update;
  if d.id is null or not public.module_enabled(d.org_id, 'invoices') or not (public.system_call() or public.has_perm(d.org_id, 'invoices.manage')) then
    raise exception 'not_allowed';
  end if;
  if d.status <> 'draft' then raise exception 'document_locked'; end if;
  select * into b from public.org_billing where org_id = d.org_id;
  if b.org_id is null or b.legal_name is null or b.street is null or b.postal_code is null or b.city is null then
    raise exception 'billing_incomplete';
  end if;
  if d.kind <> 'quote' and b.tax_number is null and b.vat_id is null then raise exception 'tax_id_missing'; end if;
  if (d.recipient_name is null or d.recipient_address is null) and not (b.short_invoices and d.kind <> 'quote' and abs(d.gross_total) <= 25000) then
    raise exception 'recipient_missing';
  end if;
  if not exists (select 1 from public.document_items where document_id = d.id) then raise exception 'items_missing'; end if;
  v_date := coalesce(d.issue_date, current_date);
  if d.kind <> 'quote' and d.service_from is null then raise exception 'service_date_missing'; end if;

  insert into public.number_ranges (org_id, kind, format)
    values (d.org_id, d.kind, case d.kind when 'invoice' then 'RE-{YYYY}-{NNNN}' when 'quote' then 'AN-{YYYY}-{NNNN}' else 'ST-{YYYY}-{NNNN}' end)
    on conflict (org_id, kind) do nothing;
  select * into r from public.number_ranges where org_id = d.org_id and kind = d.kind for update;
  v_year := extract(year from v_date);
  v_n := case when r.yearly_reset and r.year is not null and r.year <> v_year then 1 else r.next_number end;
  v_number := public.format_document_number(r.format, v_n, v_date);
  while exists (select 1 from public.documents where org_id = d.org_id and kind = d.kind and number = v_number) loop
    v_n := v_n + 1; v_number := public.format_document_number(r.format, v_n, v_date);
  end loop;
  update public.number_ranges set next_number = v_n + 1, year = v_year where org_id = d.org_id and kind = d.kind;

  perform set_config('roots.issuing', 'on', true);
  update public.documents set status = 'sent', number = v_number, issue_date = v_date, issued_at = now(),
    seller = to_jsonb(b) - 'created_at' - 'created_by' - 'updated_at' - 'updated_by' - 'org_id' - 'id'
    where id = d.id;
  perform set_config('roots.issuing', 'off', true);
  return v_number;
end $$;

create or replace function public.cancel_invoice(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare d public.documents; v_id uuid;
begin
  select * into d from public.documents where id = p_id for update;
  if d.id is null or not public.module_enabled(d.org_id, 'invoices') or not (public.system_call() or public.has_perm(d.org_id, 'invoices.manage')) then
    raise exception 'not_allowed';
  end if;
  if d.kind <> 'invoice' or d.status not in ('sent', 'paid') then raise exception 'invalid_status'; end if;
  insert into public.documents (org_id, kind, source_id, contact_id, recipient_name, recipient_address, recipient_email,
    recipient_vat_id, service_from, service_to, tax_mode, currency, net_total, tax_total, gross_total, prices_gross)
  values (d.org_id, 'cancellation', d.id, d.contact_id, d.recipient_name, d.recipient_address, d.recipient_email,
    d.recipient_vat_id, d.service_from, d.service_to, d.tax_mode, d.currency, -d.net_total, -d.tax_total, -d.gross_total, d.prices_gross)
  returning id into v_id;
  insert into public.document_items (org_id, document_id, position, title, description, quantity, unit, unit_price, tax_rate)
    select org_id, v_id, position, title, description, quantity, unit, unit_price, tax_rate from public.document_items where document_id = d.id;
  perform public.issue_document(v_id);
  perform set_config('roots.cancelling', 'on', true);
  update public.documents set status = 'cancelled' where id = d.id;
  perform set_config('roots.cancelling', 'off', true);
  return v_id;
end $$;
revoke execute on function public.cancel_invoice(uuid) from public, anon;
