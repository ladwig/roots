-- A movement that would take the stock below zero says so (errors.stock_negative) instead of the bare check error.
create or replace function public.stock_moves_apply() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_stock int;
begin
  if not exists (select 1 from public.products where id = new.product_id and org_id = new.org_id) then raise exception 'not_allowed'; end if;
  if new.variant_id is not null and not exists (select 1 from public.product_variants where id = new.variant_id and product_id = new.product_id) then raise exception 'not_allowed'; end if;
  if current_setting('roots.stock_move', true) = '1' then return new; end if;
  v_stock := case when new.variant_id is not null then (select stock from public.product_variants where id = new.variant_id)
                  else (select stock from public.products where id = new.product_id) end;
  if coalesce(v_stock, 0) + new.quantity < 0 then raise exception 'stock_negative'; end if;
  perform set_config('roots.stock_move', '1', true);
  if new.variant_id is not null then
    update public.product_variants set stock = coalesce(stock, 0) + new.quantity where id = new.variant_id;
  else
    update public.products set stock = coalesce(stock, 0) + new.quantity where id = new.product_id;
  end if;
  perform set_config('roots.stock_move', '', true);
  return new;
end $$;
revoke execute on function public.stock_moves_apply() from public, anon, authenticated;
