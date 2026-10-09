-- The change log is a platform tool: only platform admins read it (via /admin/activity).
drop policy "view activity" on public.audit_log;
update public.roles set permissions = array_remove(permissions, 'org.audit.view');
