-- Upsert needs a plain unique constraint (a partial index can't be targeted by ON CONFLICT). NULL series stay distinct.
drop index public.shifts_series_slot;
alter table public.shifts add constraint shifts_series_slot unique (series_id, starts_at);
