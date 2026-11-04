-- Automatic shop invoices are opt-in (missing ones can be issued later in one go: Shop → Bestellungen → ⋯).
alter table public.shop_settings alter column auto_invoice set default false;
