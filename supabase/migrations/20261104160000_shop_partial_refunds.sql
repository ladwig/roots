-- Partial refunds in the shop: how many of an order line went back. Refunded pieces count as in stock again.
alter table public.pay_order_items
  add column refunded_quantity int not null default 0,
  add constraint pay_order_items_refunded_quantity check (refunded_quantity between 0 and quantity);

create or replace function public.shop_left(p_item text, p_stock int) returns int
language sql stable security definer set search_path = '' as $$
  select case when p_stock is null then null else p_stock - coalesce((
    select sum(i.quantity - i.refunded_quantity) from public.pay_order_items i join public.pay_orders o on o.id = i.order_id
    where i.source_id = p_item and o.source_module = 'shop'
      and (o.status in ('paid', 'partially_refunded') or (o.status = 'open' and (o.expires_at is null or o.expires_at > now())))
  ), 0)::int end
$$;
