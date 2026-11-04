-- Buyers always give name, address, email and phone at checkout.
alter table public.shop_orders add column phone text;
