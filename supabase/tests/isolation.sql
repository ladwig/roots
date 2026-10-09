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

  -- A subscribes to member.joined (as postgres here; the app does it via RLS as the owner)
  insert into public.event_subscriptions (org_id, name, channel, event_types, config)
  values (org_a, 'Hook', 'webhook', '{member.joined}', '{"url": "https://example.com/hook"}');

  -- C joins A as Member (bypassing invites, as postgres)
  insert into public.org_members (org_id, user_id, role_id)
  select org_a, c, id from public.roles where org_id is null and name ->> 'en' = 'Member';

  -- payments: one paid order in A (written server-side, as the service role would)
  insert into public.org_modules (org_id, module_key) values (org_a, 'payments');
  insert into public.pay_orders (org_id, amount_total, source_module, status) values (org_a, 1000, 'test', 'paid');

  select count(*) into n from public.event_deliveries d join public.hub_events e on e.id = d.event_id
    where e.org_id = org_a and e.type = 'member.joined';                     assert n >= 1, 'member.joined should fan out to the subscription';

  -- in-app notifications: one for A about A's org (as the worker would write it)
  insert into public.notifications (user_id, org_id, event_id)
  select a, org_a, id from public.hub_events where org_id = org_a order by id limit 1;

  -- B must not see anything of A
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.orgs;                                   assert n = 1, 'B sees other orgs';
  select count(*) into n from public.org_members where org_id = org_a;       assert n = 0, 'B sees members of A';
  select count(*) into n from public.org_modules where org_id = org_a;       assert n = 0, 'B sees modules of A';
  select count(*) into n from public.audit_log where org_id = org_a;         assert n = 0, 'B sees activity of A';
  select count(*) into n from public.profiles where id = a;                  assert n = 0, 'B sees profile of A';
  select count(*) into n from public.pay_orders where org_id = org_a;        assert n = 0, 'B sees orders of A';
  select count(*) into n from public.hub_events where org_id = org_a;            assert n = 0, 'B sees events of A';
  select count(*) into n from public.notifications;                          assert n = 0, 'B sees notifications of A';
  update public.notifications set read_at = now();
  get diagnostics n = row_count;                                             assert n = 0, 'B marked A''s notification read';
  select count(*) into n from public.event_subscriptions where org_id = org_a; assert n = 0, 'B sees subscriptions of A';
  begin
    perform public.claim_event_deliveries(10);
    assert false, 'a user claimed deliveries';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.emit_event(org_a, 'order.paid', '{}');
    assert false, 'a user forged an event';
  exception when insufficient_privilege then null;
  end;
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
  select count(*) into n from public.pay_orders;                             assert n = 0, 'C sees orders without payments.view';
  select count(*) into n from public.event_subscriptions;                    assert n = 0, 'C sees subscriptions without permission';
  begin
    insert into public.pay_orders (org_id, amount_total, source_module) values (org_a, 1, 'test');
    assert false, 'a member wrote an order directly';
  exception when insufficient_privilege then null;
  end;
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
  select count(*) into n from public.audit_log where org_id = org_a;         assert n = 0, 'only platform admins read the change log';
  select count(*) into n from public.pay_orders;                             assert n = 1, 'owner should see orders';
  select count(*) into n from public.notifications;                          assert n = 1, 'A sees own notification';
  update public.notifications set read_at = now();
  get diagnostics n = row_count;                                             assert n = 1, 'A marks own notification read';
  begin
    insert into public.notifications (user_id, event_id) select b, id from public.hub_events limit 1;
    assert false, 'A wrote a notification for someone else';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.event_subscriptions;                    assert n = 1, 'owner should see subscriptions';
  select count(*) into n from public.event_deliveries;                       assert n >= 1, 'owner should see deliveries';
  begin
    update public.pay_orders set status = 'refunded' where org_id = org_a;
    assert false, 'owner changed an order directly';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.org_members where user_id = a and org_id = org_a;
    assert false, 'last owner could leave';
  exception when raise_exception then null;
  end;
  perform public.save_integration(org_a, 'resend', '{"from":"x@y.z"}', 'secret-1');
  reset role;
  assert public.get_integration_secret(org_a, 'resend') = 'secret-1', 'secret round-trip failed';

  -- worker functions (as the service role would): claim, fail with backoff, succeed
  select count(*) into n from public.claim_event_deliveries(100);            assert n >= 1, 'worker should claim due deliveries';
  select count(*) into n from public.claim_event_deliveries(100);            assert n = 0, 'claimed deliveries are leased';
  perform public.finish_event_delivery(id, false, 'boom') from public.event_deliveries where org_id = org_a;
  select count(*) into n from public.event_deliveries where org_id = org_a and status = 'pending' and next_attempt_at > now();
                                                                             assert n >= 1, 'failed delivery should be retried later';

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
  select count(*) into n from public.audit_log where org_id = org_a;         assert n >= 3, 'admin should read the change log';
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
  -- soft delete: admin moves org A to the trash
  assert public.soft_delete('public.orgs', org_a), 'admin should soft-delete an org';
  select count(*) into n from public.orgs where id = org_a;                  assert n = 1, 'admin still sees the deleted org (trash)';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.orgs where id = org_a;                  assert n = 0, 'owner no longer sees a deleted org';
  assert not public.has_perm(org_a, 'org.settings.manage'), 'no rights in a deleted org';
  select count(*) into n from public.org_members where org_id = org_a;       assert n = 0, 'members of a deleted org are hidden';
  begin
    perform public.restore_deleted('public.orgs', org_a);
    assert false, 'owner restored without permission';
  exception when raise_exception then null;
  end;
  begin
    perform public.soft_delete('public.orgs', org_b);
    assert false, 'non-admin soft-deleted an org';
  exception when raise_exception then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  set local role authenticated;
  assert public.restore_deleted('public.orgs', org_a), 'admin should restore';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.orgs where id = org_a;                  assert n = 1, 'restored org is back for its owner';
  reset role;

  -- Events module: A (owner, module on) manages; C (Member, no events.view) and B see nothing; anon sees published only
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.events (org_id, title, slug, starts_at, status) values
    (org_a, 'Draft', 'draft', now() + interval '7 days', 'draft'),
    (org_a, 'Live', 'live', now() + interval '7 days', 'published');
  select count(*) into n from public.events where org_id = org_a;            assert n = 2, 'owner sees own events';
  begin
    insert into public.events (org_id, title, slug, starts_at) values (org_a, 'Dup', 'live', now());
    assert false, 'slug must be unique per org';
  exception when unique_violation then null; end;
  perform public.soft_delete('public.events', (select id from public.events where org_id = org_a and slug = 'draft'));
  insert into public.events (org_id, title, slug, starts_at) values (org_a, 'Draft again', 'draft', now()); -- deleted slug reusable
  reset role;
  select count(*) into n from public.hub_events where org_id = org_a and type = 'event.published'; assert n = 1, 'publishing emits event.published';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.events where org_id = org_a;            assert n = 0, 'B sees events of A';
  begin
    insert into public.events (org_id, title, slug, starts_at) values (org_a, 'X', 'x', now());
    assert false, 'B must not create events in A';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.events where org_id = org_a;            assert n = 0, 'Member without events.view sees events';
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  select count(*) into n from public.events where org_id = org_a;            assert n = 1, 'anon sees only the published event';
  begin
    perform created_by from public.events limit 1;
    assert false, 'anon must not read audit columns';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.orgs where id = org_a;                  assert n = 1, 'anon resolves a live org';
  reset role;
  delete from public.org_modules where org_id = org_a and module_key = 'events';
  set local role anon;
  select count(*) into n from public.events where org_id = org_a;            assert n = 0, 'module off hides public events';
  reset role;

  -- CRM: A (owner) manages contacts + notes; B and C (no crm.view) see nothing; anon nothing
  insert into public.org_modules (org_id, module_key) values (org_a, 'crm');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.contacts (org_id, first_name, email, tags) values (org_a, 'Max', 'max@x.de', '{vip}'), (org_a, 'Erika', 'erika@x.de', '{}');
  select count(*) into n from public.contacts where org_id = org_a and tags @> '{vip}'; assert n = 1, 'tag filter';
  begin
    insert into public.contacts (org_id, email) values (org_a, 'max@x.de');
    assert false, 'contact email must be unique per org';
  exception when unique_violation then null; end;
  begin
    insert into public.contacts (org_id, phone) values (org_a, '123');
    assert false, 'contact needs a name, company or email';
  exception when check_violation then null; end;
  insert into public.contact_notes (org_id, contact_id, body) select org_a, id, 'Hallo' from public.contacts where email = 'max@x.de';
  perform public.soft_delete('public.contacts', (select id from public.contacts where email = 'erika@x.de'));
  insert into public.contacts (org_id, email) values (org_a, 'erika@x.de'); -- deleted email reusable
  reset role;
  select count(*) into n from public.hub_events where org_id = org_a and type = 'contact.created'; assert n = 1, 'single insert emits contact.created';
  select count(*) into n from public.hub_events where org_id = org_a and type = 'contacts.imported'; assert n = 1, 'bulk insert emits one contacts.imported';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.contacts where org_id = org_a;          assert n = 0, 'B sees contacts of A';
  select count(*) into n from public.contact_notes where org_id = org_a;     assert n = 0, 'B sees notes of A';
  begin
    insert into public.contacts (org_id, email) values (org_a, 'b@x.de');
    assert false, 'B must not create contacts in A';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.contacts where org_id = org_a;          assert n = 0, 'Member without crm.view sees contacts';
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  begin
    perform 1 from public.contacts limit 1;
    assert false, 'anon must not read contacts';
  exception when insufficient_privilege then null; end;
  reset role;

  -- Custom fields: owner defines, members read, B sees nothing, values must be an object
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.custom_fields (org_id, entity, key, label, type) values (org_a, 'contacts', 'member_no', 'Mitgliedsnr.', 'text');
  update public.contacts set custom = '{"member_no": "42"}' where org_id = org_a and email = 'max@x.de';
  begin
    update public.contacts set custom = '[]' where org_id = org_a and email = 'max@x.de';
    assert false, 'custom must be a json object';
  exception when check_violation then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.custom_fields where org_id = org_a;     assert n = 0, 'B sees custom fields of A';
  begin
    insert into public.custom_fields (org_id, entity, key, label, type) values (org_a, 'contacts', 'x', 'X', 'text');
    assert false, 'B must not define fields in A';
  exception when insufficient_privilege then null; end;
  reset role;

  -- Tickets: quota can't be oversold, scan needs tickets.scan, anon sees types of published events only
  insert into public.org_modules (org_id, module_key) values (org_a, 'tickets'), (org_a, 'events');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.ticket_types (org_id, event_id, name, price, quota)
    select org_a, id, 'Normal', 1500, 2 from public.events where org_id = org_a and slug = 'live';
  reset role;
  declare
    v_ev uuid := (select id from public.events where org_id = org_a and slug = 'live');
    v_type uuid := (select id from public.ticket_types where event_id = (select id from public.events where org_id = org_a and slug = 'live'));
    v_order uuid;
    v_code text;
    v_res text;
  begin
    insert into public.pay_orders (org_id, amount_total, source_module) values (org_a, 3000, 'tickets') returning id into v_order;
    set local role service_role;
    perform public.reserve_tickets(v_order, v_ev, jsonb_build_array(jsonb_build_object('type_id', v_type, 'holder_name', 'Max'), jsonb_build_object('type_id', v_type)), 30);
    begin
      perform public.reserve_tickets(v_order, v_ev, jsonb_build_array(jsonb_build_object('type_id', v_type)), 30);
      assert false, 'quota must not be oversold';
    exception when raise_exception then null; end;
    reset role;
    select remaining into n from public.ticket_availability(v_ev) where type_id = v_type; assert n = 0, 'availability counts reservations';
    update public.tickets set status = 'valid' where order_id = v_order;
    select count(*) into n from public.hub_events where org_id = org_a and type = 'tickets.sold'; assert n = 1, 'one tickets.sold per order';
    select code into v_code from public.tickets where order_id = v_order and holder_name = 'Max';
    assert v_code ~ '^[A-HJ-NP-Z2-9]{10}$', 'ticket code format';
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.tickets where org_id = org_a;         assert n = 0, 'B sees tickets of A';
    begin
      perform public.check_in_ticket(v_ev, v_code);
      assert false, 'B must not check in tickets of A';
    exception when raise_exception then null; end;
    begin
      update public.tickets set status = 'used' where org_id = org_a;
      assert false, 'tickets are not writable directly';
    exception when insufficient_privilege then null; end;
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select result into v_res from public.check_in_ticket(v_ev, lower(v_code)); assert v_res = 'ok', 'owner checks in: ' || v_res;
    select result into v_res from public.check_in_ticket(v_ev, v_code);        assert v_res = 'used', 'second scan says used';
    select result into v_res from public.check_in_ticket(v_ev, 'ZZZZZZZZZZ');  assert v_res = 'invalid', 'unknown code invalid';
    reset role;
    perform set_config('request.jwt.claims', '{}', true);
    set local role anon;
    select count(*) into n from public.ticket_types where event_id = v_ev;   assert n = 1, 'anon sees types of a published event';
    begin
      perform 1 from public.tickets limit 1;
      assert false, 'anon must not read tickets';
    exception when insufficient_privilege then null; end;
    reset role;
  end;

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
