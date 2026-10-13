-- RLS helpers of time tracking, HR and files: used inside policies of signed-in users only, never by anon.
revoke execute on function public.time_entry_refs_ok(uuid, uuid, uuid) from public, anon;
revoke execute on function public.hr_refs_ok(uuid, uuid, uuid, uuid) from public, anon;
revoke execute on function public.hr_employee_ok(uuid, uuid) from public, anon;
revoke execute on function public.file_allowed(uuid, text, text) from public, anon;
grant execute on function public.time_entry_refs_ok(uuid, uuid, uuid), public.hr_refs_ok(uuid, uuid, uuid, uuid),
  public.hr_employee_ok(uuid, uuid), public.file_allowed(uuid, text, text) to authenticated, service_role;
