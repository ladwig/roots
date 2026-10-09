-- Tenant isolation + permission check. Run: npm run db:test
-- One DO block that always ends by raising, so every change is rolled back (safe on any DB).
-- Success = the error message 'isolation: all checks passed'. Anything else is a failed check.
-- Extend this file whenever a new org-scoped table is added.

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  c uuid := gen_random_uuid(); -- member of org A with the plain "Member" role
  org_a uuid;
  org_b uuid;
  n int;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'a@isolation.test', 'authenticated', 'authenticated'),
    (b, 'b@isolation.test', 'authenticated', 'authenticated'),
    (c, 'c@isolation.test', 'authenticated', 'authenticated');

  -- as A: create org A
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_org('Org A', 'iso-org-a');
  insert into public.org_modules (org_id, module_key) values (org_a, 'events');
  reset role;

  -- as B: create org B
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_b := public.create_org('Org B', 'iso-org-b');
  reset role;

  -- C joins A as Member (bypassing invites, as postgres)
  insert into public.org_members (org_id, user_id, role_id)
  select org_a, c, id from public.roles where org_id = org_a and name = 'Member';

  -- B must not see anything of A
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.orgs;                                   assert n = 1, 'B sees other orgs';
  select count(*) into n from public.roles where org_id = org_a;             assert n = 0, 'B sees roles of A';
  select count(*) into n from public.org_members where org_id = org_a;       assert n = 0, 'B sees members of A';
  select count(*) into n from public.org_modules where org_id = org_a;       assert n = 0, 'B sees modules of A';
  select count(*) into n from public.audit_log where org_id = org_a;         assert n = 0, 'B sees activity of A';
  select count(*) into n from public.profiles where id = a;                  assert n = 0, 'B sees profile of A';
  update public.orgs set name = 'hacked' where id = org_a;
  get diagnostics n = row_count;                                             assert n = 0, 'B renamed org A';
  begin
    insert into public.org_modules (org_id, module_key) values (org_a, 'crm');
    assert false, 'B enabled a module in A';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.roles (org_id, name, permissions) values (org_a, 'Evil', '{*}');
    assert false, 'B created a role in A';
  exception when insufficient_privilege then null;
  end;
  assert not public.has_perm(org_a, 'events.view'), 'B has a permission in A';
  reset role;

  -- C (plain Member) can see A but not manage it
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.orgs;                                   assert n = 1, 'C should see org A';
  select count(*) into n from public.profiles;                               assert n = 2, 'C should see self + A';
  select count(*) into n from public.audit_log;                              assert n = 0, 'C sees activity without org.audit.view';
  update public.orgs set name = 'renamed' where id = org_a;
  get diagnostics n = row_count;                                             assert n = 0, 'C renamed org without permission';
  update public.org_members set role_id = (select id from public.roles where org_id = org_a and name = 'Admin') where user_id = c;
  get diagnostics n = row_count;                                             assert n = 0, 'C promoted themselves';
  begin
    perform public.save_integration(org_a, 'resend', '{}', 'secret');
    assert false, 'C saved an integration';
  exception when raise_exception then null;
  end;
  begin
    perform public.get_integration_secret(org_a, 'resend');
    assert false, 'C read a secret';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- A (owner): can't remove the last owner; audit trail exists
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.audit_log where org_id = org_a;         assert n >= 6, 'A should see activity';
  begin
    delete from public.org_members where user_id = a and org_id = org_a;
    assert false, 'last owner could leave';
  exception when raise_exception then null;
  end;
  perform public.save_integration(org_a, 'resend', '{"from":"x@y.z"}', 'secret-1');
  reset role;
  assert public.get_integration_secret(org_a, 'resend') = 'secret-1', 'secret round-trip failed';

  raise exception 'isolation: all checks passed';
end $$;
