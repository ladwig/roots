-- Defaults so inserts type-check without audit fields (the set_audit_fields trigger overwrites them anyway).
do $$
declare t text;
begin
  foreach t in array array['orgs', 'roles', 'org_members', 'invites', 'org_modules', 'org_integrations'] loop
    execute format('alter table public.%I alter column created_at set default now(), alter column updated_at set default now()', t);
  end loop;
end $$;
