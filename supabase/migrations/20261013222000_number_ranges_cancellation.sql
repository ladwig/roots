-- Fix: keep the cancellation-invoice range kind (dropped by accident in number_ranges_generic).
alter table public.number_ranges drop constraint number_ranges_kind_check;
alter table public.number_ranges add constraint number_ranges_kind_check check (kind in ('invoice', 'quote', 'cancellation', 'member'));
