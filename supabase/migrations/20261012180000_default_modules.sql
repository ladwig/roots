-- For now every org gets every module: existing orgs now, new orgs on creation. Platform admins can still switch
-- modules off per org (/admin/orgs). Keep the list in sync with src/modules/registry.ts (checked by a unit test).
create or replace function public.default_module_keys() returns text[]
language sql immutable set search_path = '' as $$
  select array['crm', 'payments', 'events', 'tickets', 'guestlists', 'invoices', 'shifts', 'members', 'forms', 'email', 'sites']
$$;

insert into public.org_modules (org_id, module_key)
select o.id, k from public.orgs o cross join unnest(public.default_module_keys()) k
on conflict (org_id, module_key) do nothing;

create function public.orgs_default_modules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.org_modules (org_id, module_key)
  select new.id, k from unnest(public.default_module_keys()) k
  on conflict (org_id, module_key) do nothing;
  return null;
end $$;
revoke execute on function public.orgs_default_modules() from public, anon, authenticated;
create trigger orgs_default_modules after insert on public.orgs for each row execute function public.orgs_default_modules();
