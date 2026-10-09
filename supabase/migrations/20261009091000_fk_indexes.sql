-- Cover foreign keys flagged by the performance advisor.
create index invites_role on public.invites (role_id, org_id);
create index invites_accepted_by on public.invites (accepted_by);
create index org_members_role on public.org_members (role_id, org_id);
create index integration_events_org on public.integration_events (org_id);
