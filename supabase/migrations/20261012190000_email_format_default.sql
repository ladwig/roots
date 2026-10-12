-- New campaigns and automations start in the editor (the plain-text format stays readable for old rows).
alter table public.email_campaigns alter column format set default 'rich';
alter table public.email_automations alter column format set default 'rich';
