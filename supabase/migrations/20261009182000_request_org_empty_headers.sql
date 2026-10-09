-- request.headers can be '' on a reused connection (custom setting defined earlier in the session): treat as no header.
create or replace function public.request_org() returns uuid
language sql stable set search_path = '' as $$
  select case when h ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then h::uuid end
  from (select nullif(current_setting('request.headers', true), '')::json ->> 'x-org-id' as h) s;
$$;
