-- The events → template reference is (email_template_id, org_id); index both so the linter's covering check passes.
drop index public.events_email_template;
create index events_email_template on public.events (email_template_id, org_id) where email_template_id is not null;
