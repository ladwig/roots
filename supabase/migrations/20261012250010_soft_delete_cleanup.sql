-- 20261012250000 matched 'public.site_pages' but regclass prints table names without the schema, so the trash
-- registration of the dropped table stayed (dangling OID) and would break purge_deleted(). Remove registrations of
-- tables that no longer exist.
delete from public.soft_delete_tables d where not exists (select 1 from pg_class c where c.oid = d.table_name::oid);
