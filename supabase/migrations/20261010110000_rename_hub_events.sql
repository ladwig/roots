-- The event hub's log becomes hub_events so `events` is free for the Events module (real-world events).
alter table public.events rename to hub_events;
alter index public.events_org_created rename to hub_events_org_created;
alter index public.events_unrouted rename to hub_events_unrouted;

-- Function bodies reference tables by name: rewrite every function that mentions public.events.
do $$
declare f record;
begin
  for f in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosrc ~ 'public\.events\M'
  loop
    execute regexp_replace(pg_get_functiondef(f.oid), 'public\.events\M', 'public.hub_events', 'g');
  end loop;
end $$;
