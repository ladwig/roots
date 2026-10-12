-- provider_id from the previous migration isn't needed (sends are matched by the send_id tag).
alter table public.email_sends drop column provider_id;
