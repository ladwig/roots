-- Which document template (letterhead + layout) the org uses; can be overridden per print.
alter table public.org_billing add column template text not null default 'classic' check (template in ('classic', 'modern', 'minimal'));
