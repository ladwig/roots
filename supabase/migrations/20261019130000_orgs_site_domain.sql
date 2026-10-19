-- The org's own domain while it's live (else null), next to the slug: links to public pages (mails, checkout, App
-- buttons) use it without another query and fall back to the roots address when it's null. Written by the server only
-- (domain check / removal); public like the slug.
alter table public.orgs add column site_domain text;
grant select (site_domain) on public.orgs to anon;
