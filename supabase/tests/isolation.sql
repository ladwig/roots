-- Tenant isolation + permission check. Run: npm run db:test
-- One DO block that always ends by raising, so every change is rolled back (safe on any DB).
-- Success = the error message 'isolation: all checks passed'. Anything else is a failed check.
-- Extend this file whenever a new org-scoped table is added.

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  c uuid := gen_random_uuid(); -- member of org A with the plain "Member" role
  d uuid := gen_random_uuid(); -- platform admin, member of nothing
  org_a uuid;
  org_b uuid;
  n int;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'a@isolation.test', 'authenticated', 'authenticated'),
    (b, 'b@isolation.test', 'authenticated', 'authenticated'),
    (c, 'c@isolation.test', 'authenticated', 'authenticated'),
    (d, 'd@isolation.test', 'authenticated', 'authenticated');
  insert into public.platform_admins (user_id) values (d);

  -- as A: create org A
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_org('Org A', 'iso-org-a');
  reset role;
  insert into public.org_modules (org_id, module_key) values (org_a, 'events'); -- modules: platform admins only

  -- as B: create org B
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_b := public.create_org('Org B', 'iso-org-b');
  reset role;

  -- C joins A as Member (bypassing invites, as postgres)
  insert into public.org_members (org_id, user_id, role_id)
  select org_a, c, id from public.roles where org_id is null and name ->> 'en' = 'Member';

  -- B must not see anything of A
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.orgs;                                   assert n = 1, 'B sees other orgs';
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
    insert into public.org_modules (org_id, module_key) values (org_b, 'crm');
    assert false, 'an owner enabled a module (platform admins only)';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.roles (name, permissions) values ('{"de": "Böse"}', '{*}');
    assert false, 'non-admin created a role';
  exception when insufficient_privilege then null;
  end;
  update public.roles set permissions = '{*}' where org_id is null and name ->> 'en' = 'Member';
  get diagnostics n = row_count;                                             assert n = 0, 'non-admin edited a global role';
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
  update public.org_members set role_id = (select id from public.roles where org_id is null and name ->> 'en' = 'Admin') where user_id = c;
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
  select count(*) into n from public.audit_log where org_id = org_a;         assert n >= 3, 'A should see activity';
  begin
    delete from public.org_members where user_id = a and org_id = org_a;
    assert false, 'last owner could leave';
  exception when raise_exception then null;
  end;
  perform public.save_integration(org_a, 'resend', '{"from":"x@y.z"}', 'secret-1');
  reset role;
  assert public.get_integration_secret(org_a, 'resend') = 'secret-1', 'secret round-trip failed';

  -- Non-admins can't use admin powers
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.admin_users();                          assert n = 0, 'non-admin listed users';
  begin
    insert into public.platform_admins (user_id) values (a);
    assert false, 'owner made themselves platform admin';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.orgs set slug = 'iso-renamed' where id = org_a;
    assert false, 'owner changed the org address';
  exception when raise_exception then null;
  end;
  begin
    perform public.admin_delete_user(b);
    assert false, 'non-admin deleted a user';
  exception when raise_exception then null;
  end;
  delete from public.orgs where id = org_b;
  get diagnostics n = row_count;                                             assert n = 0, 'non-admin deleted an org';
  reset role;

  -- Platform admin sees and manages everything
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.orgs where id in (org_a, org_b);        assert n = 2, 'admin should see all orgs';
  select count(*) into n from public.admin_users() where id in (a, b, c, d); assert n = 4, 'admin should list users';
  assert public.has_perm(org_b, 'org.members.manage'), 'admin should have every permission';
  update public.orgs set slug = 'iso-org-b2' where id = org_b;
  get diagnostics n = row_count;                                             assert n = 1, 'admin should change the address';
  insert into public.org_members (org_id, user_id, role_id)
  select org_b, c, id from public.roles where org_id is null and name ->> 'en' = 'Member';
  insert into public.roles (name, permissions) values ('{"de": "Kassenwart", "en": "Treasurer"}', '{payments.*}');
  update public.roles set permissions = '{payments.view}' where name ->> 'en' = 'Treasurer';
  get diagnostics n = row_count;                                             assert n = 1, 'admin should edit roles';
  delete from public.roles where is_owner;
  get diagnostics n = row_count;                                             assert n = 0, 'owner role must not be deletable';
  begin
    delete from public.platform_admins where user_id = d;
    get diagnostics n = row_count;                                           assert n = 0, 'admin removed themselves';
  end;
  begin
    perform public.admin_delete_user(b);                                     -- b is the only owner of org B
    assert false, 'deleted the last owner of an org';
  exception when raise_exception then null;
  end;
  reset role;

  -- x-org-id header: C is now in A and B, but with the header only sees the active org
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.orgs;                                   assert n = 2, 'C is in two orgs';
  perform set_config('request.headers', json_build_object('x-org-id', org_a)::text, true);
  select count(*) into n from public.orgs;                                   assert n = 1, 'header should scope to one org';
  select count(*) into n from public.org_members where org_id = org_b;       assert n = 0, 'header should hide the other org';
  perform set_config('request.headers', json_build_object('x-org-id', org_b)::text, true);
  select count(*) into n from public.org_members where org_id = org_a;       assert n = 0, 'header should hide org A';
  perform set_config('request.headers', json_build_object('x-org-id', gen_random_uuid())::text, true);
  select count(*) into n from public.orgs;                                   assert n = 0, 'unknown org header grants nothing';
  perform set_config('request.headers', '{}', true);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  set local role authenticated;
  delete from public.orgs where id = org_b;
  get diagnostics n = row_count;                                             assert n = 1, 'admin should delete orgs';
  perform public.admin_delete_user(b);                                       -- now allowed
  reset role;

  raise exception 'isolation: all checks passed';
end $$;
