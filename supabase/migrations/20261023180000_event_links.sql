-- Up to 3 links per event (title + URL, e.g. Telegram group, Instagram, Resident Advisor): buttons on the event page,
-- {{#event.links}} in event templates. Public like the rest of a published event.
alter table public.events add column links jsonb not null default '[]'
  check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 3);
grant select (links) on public.events to anon;
