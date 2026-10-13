-- Pause a membership: no fees for periods fully inside the pause; the end date doesn't move.
alter table public.memberships
  add column paused_from date,
  add column paused_until date,
  add column pause_reason text check (char_length(pause_reason) <= 300),
  add constraint memberships_pause_check check (paused_from is not null or paused_until is null),
  add constraint memberships_pause_order check (paused_until is null or paused_until >= paused_from);
