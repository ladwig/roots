-- key_hash stays server-only: authenticated users get column-level select without it.
revoke select on public.api_keys from authenticated;
grant select (id, org_id, name, prefix, permissions, last_used_at, revoked_at, created_at, created_by, updated_at, updated_by)
  on public.api_keys to authenticated;
