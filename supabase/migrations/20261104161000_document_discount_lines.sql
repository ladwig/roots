-- Discount / refund lines on invoices (e.g. "Erstattung" after a partial shop refund) are negative.
alter table public.document_items drop constraint if exists document_items_unit_price_check;
