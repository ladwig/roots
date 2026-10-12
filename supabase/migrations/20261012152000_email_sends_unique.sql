-- Upsert needs a plain unique constraint (not a partial index). Automation sends have campaign_id null, and nulls
-- never collide, so this still only limits a campaign to one send per address.
drop index public.email_sends_campaign_once;
alter table public.email_sends add constraint email_sends_campaign_once unique (campaign_id, to_email);
