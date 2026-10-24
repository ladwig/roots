-- Per event: show the discount code field in the shop or not. Off = no field, but ?code= links (promoters) still work.
alter table public.events add column show_code_field boolean not null default true;
grant select (show_code_field) on public.events to anon;
