-- Email body format: plain text, rich text from the editor (HTML), or the org's own pasted HTML.
alter table public.email_campaigns add column format text not null default 'text' check (format in ('text', 'rich', 'html'));
alter table public.email_automations add column format text not null default 'text' check (format in ('text', 'rich', 'html'));
alter table public.email_campaigns drop constraint email_campaigns_body_check, add constraint email_campaigns_body_check check (length(body) <= 200000);
alter table public.email_automations drop constraint email_automations_body_check, add constraint email_automations_body_check check (length(body) between 1 and 200000);
