-- Custom fields on events (e.g. "doesn't count as a trial visit", "Worker +1"): definitions in custom_fields,
-- values in events.custom. Not granted to anon: public pages never see them.
alter table public.events add column custom jsonb not null default '{}';
alter table public.custom_fields drop constraint custom_fields_entity_check;
alter table public.custom_fields add constraint custom_fields_entity_check check (entity in ('contacts', 'events'));
