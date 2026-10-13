-- Every event can have one standard guest list ("Gästeliste"), created when first needed (e.g. a workflow adds a
-- guest without naming a list). Further lists (DJs, promoters …) stay as they are.
alter table public.guest_lists add column is_default boolean not null default false;
create unique index guest_lists_default on public.guest_lists (event_id) where is_default and deleted_at is null;
