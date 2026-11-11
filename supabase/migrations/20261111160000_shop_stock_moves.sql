-- Lager: every change of a product's/variant's stock is a movement with a reason (Zugang, Entnahme, Schwund, Inventur…).
-- `stock` stays "units received in total" (so shop_left / checkout / catalog are unchanged): a trigger adds each
-- movement to it, and editing `stock` directly writes a "correction" movement with the difference. Shop sales are not
-- movements: they come from the orders (sold = paid − refunded), sales at the merch table are real shop orders too.
-- Movements are never edited or deleted; a wrong one is undone by a counter-movement.

create table public.stock_moves (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  product_id uuid not null references public.products on delete cascade,
  variant_id uuid references public.product_variants on delete cascade,
  quantity int not null check (quantity <> 0),
  reason text not null check (reason in ('opening', 'receipt', 'withdrawal', 'loss', 'correction')),
  note text check (length(note) <= 500),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index stock_moves_item on public.stock_moves (org_id, coalesce(variant_id, product_id), created_at desc);
select public.enable_audit('public.stock_moves');

alter table public.stock_moves enable row level security;
revoke all on public.stock_moves from anon;
create policy "shop.view" on public.stock_moves for select to authenticated
  using (public.module_enabled(org_id, 'shop') and public.has_perm(org_id, 'shop.view'));
create policy "shop.manage" on public.stock_moves for insert to authenticated
  with check (public.module_enabled(org_id, 'shop') and public.has_perm(org_id, 'shop.manage'));
revoke update, delete on public.stock_moves from authenticated;

-- A movement: same org/product/variant, then added to the stock (unless it was written by the stock edit below).
create function public.stock_moves_apply() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_stock int;
begin
  if not exists (select 1 from public.products where id = new.product_id and org_id = new.org_id) then raise exception 'not_allowed'; end if;
  if new.variant_id is not null and not exists (select 1 from public.product_variants where id = new.variant_id and product_id = new.product_id) then raise exception 'not_allowed'; end if;
  if current_setting('roots.stock_move', true) = '1' then return new; end if;
  perform set_config('roots.stock_move', '1', true);
  if new.variant_id is not null then
    update public.product_variants set stock = coalesce(stock, 0) + new.quantity where id = new.variant_id returning stock into v_stock;
  else
    update public.products set stock = coalesce(stock, 0) + new.quantity where id = new.product_id returning stock into v_stock;
  end if;
  perform set_config('roots.stock_move', '', true);
  if v_stock < 0 then raise exception 'stock_negative'; end if;
  return new;
end $$;
revoke execute on function public.stock_moves_apply() from public, anon, authenticated;
create trigger stock_moves_apply before insert on public.stock_moves for each row execute function public.stock_moves_apply();

-- Stock typed in directly (product form, variants table, API): booked as a correction with the difference.
-- Back to "unlimited" (null) books nothing: the item just isn't counted any more.
create function public.stock_edit_move() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('roots.stock_move', true) = '1' or new.stock is null or new.stock is not distinct from old.stock then return null; end if;
  perform set_config('roots.stock_move', '1', true);
  insert into public.stock_moves (org_id, product_id, variant_id, quantity, reason)
  values (new.org_id, case when tg_table_name = 'products' then new.id else new.product_id end,
          case when tg_table_name = 'product_variants' then new.id end, new.stock - coalesce(old.stock, 0),
          case when old.stock is null then 'opening' else 'correction' end);
  perform set_config('roots.stock_move', '', true);
  return null;
end $$;
revoke execute on function public.stock_edit_move() from public, anon, authenticated;
create trigger stock_edit_move after update of stock on public.products for each row execute function public.stock_edit_move();
create trigger stock_edit_move after update of stock on public.product_variants for each row execute function public.stock_edit_move();

-- New items with a stock start with an opening movement.
create function public.stock_new_move() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.stock is null or new.stock = 0 then return null; end if;
  perform set_config('roots.stock_move', '1', true);
  insert into public.stock_moves (org_id, product_id, variant_id, quantity, reason)
  values (new.org_id, case when tg_table_name = 'products' then new.id else new.product_id end,
          case when tg_table_name = 'product_variants' then new.id end, new.stock, 'opening');
  perform set_config('roots.stock_move', '', true);
  return null;
end $$;
revoke execute on function public.stock_new_move() from public, anon, authenticated;
create trigger stock_new_move after insert on public.products for each row execute function public.stock_new_move();
create trigger stock_new_move after insert on public.product_variants for each row execute function public.stock_new_move();

-- Today's stocks become opening movements.
select set_config('roots.stock_move', '1', false); -- session-wide: works with or without a transaction
insert into public.stock_moves (org_id, product_id, variant_id, quantity, reason, created_at)
select org_id, product_id, id, stock, 'opening', created_at from public.product_variants where stock > 0
union all
select org_id, id, null, stock, 'opening', created_at from public.products where stock > 0;
select set_config('roots.stock_move', '', false);

-- The Lager overview: every physical item (products without variants, physical variants) with received, sold
-- (paid − refunded), reserved (open orders not expired) and its last movement. Only for shop.view of that org.
create function public.shop_stock(p_org uuid) returns table (
  item_id uuid, product_id uuid, variant_id uuid, product text, variant text, stock int, sold int, reserved int, last_move timestamptz
)
language sql stable security definer set search_path = '' as $$
  with items as (
    select v.id as item_id, p.id as product_id, v.id as variant_id, p.name as product, v.name as variant, v.stock, p.position, v.position as vpos
    from public.products p join public.product_variants v on v.product_id = p.id
    where p.org_id = p_org and p.deleted_at is null and p.kind = 'physical' and not v.digital
    union all
    select p.id, p.id, null, p.name, null, p.stock, p.position, 0
    from public.products p
    where p.org_id = p_org and p.deleted_at is null and p.kind = 'physical'
      and not exists (select 1 from public.product_variants v where v.product_id = p.id)
  )
  select i.item_id, i.product_id, i.variant_id, i.product, i.variant, i.stock,
    coalesce(sum(oi.quantity - oi.refunded_quantity) filter (where o.status in ('paid', 'partially_refunded')), 0)::int,
    coalesce(sum(oi.quantity) filter (where o.status = 'open' and (o.expires_at is null or o.expires_at > now())), 0)::int,
    (select max(m.created_at) from public.stock_moves m where m.org_id = p_org and coalesce(m.variant_id, m.product_id) = i.item_id)
  from items i
  left join public.pay_order_items oi on oi.source_id = i.item_id::text
  left join public.pay_orders o on o.id = oi.order_id and o.source_module = 'shop' and o.org_id = p_org
  where public.module_enabled(p_org, 'shop') and public.has_perm(p_org, 'shop.view')
  group by i.item_id, i.product_id, i.variant_id, i.product, i.variant, i.stock, i.position, i.vpos
  order by i.position, i.product, i.vpos
$$;
revoke execute on function public.shop_stock(uuid) from public, anon;
grant execute on function public.shop_stock(uuid) to authenticated, service_role;
