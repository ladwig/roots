-- Team = organisation members only (no outsiders via magic link for now). Name stays as a display copy of the profile.
delete from public.staff where user_id is null;
alter table public.staff alter column user_id set not null;
update public.staff set link_token = null;
