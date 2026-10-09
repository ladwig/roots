-- Permission helpers are meaningless for anon; keep them signed-in only.
-- invite_info stays callable by anon on purpose (invite preview before login; the token is the secret).
revoke execute on function public.is_member(uuid), public.is_owner(uuid), public.has_perm(uuid, text),
  public.shares_org(uuid), public.module_enabled(uuid, text) from public, anon;

-- New functions in public are no longer executable by anon unless granted explicitly.
alter default privileges in schema public revoke execute on functions from public, anon;
