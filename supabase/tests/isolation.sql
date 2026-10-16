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

  -- as B: create org B
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_b := public.create_org('Org B', 'iso-org-b');
  reset role;
  -- New orgs get every module by default; this test switches them on one by one, so start from none.
  select count(*) into n from public.org_modules where org_id = org_a;       assert n > 5, 'new org gets the default modules';
  delete from public.org_modules where org_id in (org_a, org_b);
  insert into public.org_modules (org_id, module_key) values (org_a, 'events');

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
    -- Tiers: Early (1 left) → Regular; codes: -50 %, max 1 use, unlocks the hidden Crew type
    declare v_vip uuid; v_crew uuid; v_order2 uuid; v_price int; v_tier text;
    begin
      insert into public.ticket_types (org_id, event_id, name, price) values (org_a, v_ev, 'VIP', 9999) returning id into v_vip;
      insert into public.ticket_tiers (org_id, type_id, name, price, quota, position) values
        (org_a, v_vip, 'Early', 2000, 1, 0), (org_a, v_vip, 'Regular', 3000, null, 1);
      insert into public.ticket_types (org_id, event_id, name, price, hidden) values (org_a, v_ev, 'Crew', 0, true) returning id into v_crew;
      insert into public.ticket_codes (org_id, event_id, code, kind, value, max_uses, type_ids) values
        (org_a, v_ev, 'HALF', 'percent', 50, 1, array[v_vip]), (org_a, v_ev, 'CREW', 'none', 0, null, array[v_crew]);
      select tier_name, price into v_tier, v_price from public.ticket_offer(v_ev) where type_id = v_vip;
      assert v_tier = 'Early' and v_price = 2000, 'first tier is current';
      select count(*) into n from public.ticket_offer(v_ev) where type_id = v_crew;   assert n = 0, 'hidden type not offered';
      select count(*) into n from public.ticket_offer(v_ev, 'crew') where type_id = v_crew; assert n = 1, 'code unlocks hidden type';
      select final_price into v_price from public.ticket_offer(v_ev, 'HALF') where type_id = v_vip; assert v_price = 1000, 'code halves the price';
      insert into public.pay_orders (org_id, amount_total, source_module) values (org_a, 1000, 'tickets') returning id into v_order2;
      set local role service_role;
      perform public.reserve_tickets(v_order2, v_ev, jsonb_build_array(jsonb_build_object('type_id', v_vip)), 30, 'HALF');
      begin
        perform public.reserve_tickets(v_order2, v_ev, jsonb_build_array(jsonb_build_object('type_id', v_vip)), 30, 'HALF');
        assert false, 'code use limit';
      exception when raise_exception then null; end;
      reset role;
      select price into v_price from public.tickets where order_id = v_order2;      assert v_price = 1000, 'ticket stores the paid price';
      select tier_name, price into v_tier, v_price from public.ticket_offer(v_ev) where type_id = v_vip;
      assert v_tier = 'Regular' and v_price = 3000, 'next tier after the first sold out';
    end;
    perform set_config('request.jwt.claims', '{}', true);
    set local role anon;
    select count(*) into n from public.ticket_offer(v_ev);                  assert n = 2, 'anon gets the offer (no hidden)';
    begin
      perform 1 from public.ticket_codes limit 1;
      assert false, 'anon must not read codes';
    exception when insufficient_privilege then null; end;
    select count(*) into n from public.ticket_types where event_id = v_ev;   assert n = 2, 'anon sees visible types of a published event';
    begin
      perform 1 from public.tickets limit 1;
      assert false, 'anon must not read tickets';
    exception when insufficient_privilege then null; end;
    reset role;
  end;

  -- API keys: only integration managers of the org see them, the hash isn't readable, auth is server-only
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.api_keys (org_id, name, prefix, key_hash, permissions) values (org_a, 'Sync', 'roots_abcdef', repeat('a', 64), '{crm.view}');
  select count(*) into n from public.api_keys where org_id = org_a;           assert n = 1, 'owner sees own keys';
  begin
    perform key_hash from public.api_keys limit 1;
    assert false, 'key hash must not be readable';
  exception when insufficient_privilege then null; end;
  begin
    perform public.api_key_auth(repeat('a', 64));
    assert false, 'api_key_auth is server-only';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.api_keys where org_id = org_a;           assert n = 0, 'B sees keys of A';
  reset role;
  select count(*) into n from public.api_key_auth(repeat('a', 64));           assert n = 1, 'service resolves a key';

  -- Invoices: number assigned on issue (format, gap-free), issued documents frozen, B sees nothing
  insert into public.org_modules (org_id, module_key) values (org_a, 'invoices');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  declare v_doc uuid; v_num text;
  begin
    insert into public.documents (org_id, kind, recipient_name, recipient_address, service_from)
      values (org_a, 'invoice', 'Kunde', 'Str. 1\n12345 Ort', current_date) returning id into v_doc;
    begin
      perform public.issue_document(v_doc);
      assert false, 'issue needs billing data';
    exception when raise_exception then null; end;
    insert into public.org_billing (org_id, legal_name, street, postal_code, city, tax_number) values (org_a, 'Verein A', 'Weg 1', '50667', 'Köln', '214/5678/1234');
    insert into public.number_ranges (org_id, kind, format, next_number) values (org_a, 'invoice', 'R{YY}-{NNN}', 7);
    insert into public.document_items (org_id, document_id, position, title, unit, unit_price, tax_rate) values (org_a, v_doc, 0, 'Leistung', 'hour', 5000, 19);
    begin
      update public.documents set status = 'sent', number = 'X' where id = v_doc;
      assert false, 'only issue_document leaves draft';
    exception when raise_exception or check_violation then null; end;
    v_num := public.issue_document(v_doc);
    assert v_num = 'R' || to_char(current_date, 'YY') || '-007', 'number format: ' || v_num;
    begin
      update public.documents set recipient_name = 'Anders' where id = v_doc;
      assert false, 'issued document is frozen';
    exception when raise_exception then null; end;
    begin
      insert into public.document_items (org_id, document_id, position, title, unit, unit_price) values (org_a, v_doc, 1, 'Nachtrag', 'piece', 1);
      assert false, 'no items on issued documents';
    exception when insufficient_privilege then null; end;
    begin
      delete from public.documents where id = v_doc;
      select count(*) into n from public.documents where id = v_doc; assert n = 1, 'issued documents are never deleted';
    end;
    update public.documents set status = 'paid' where id = v_doc;
    begin
      update public.documents set status = 'cancelled' where id = v_doc;
      assert false, 'cancel only via Stornorechnung';
    exception when raise_exception then null; end;
    select count(*) into n from public.documents where id = v_doc and paid_at is not null; assert n = 1, 'paid sets paid_at';
    select count(*) into n from public.hub_events where org_id = org_a and type in ('invoice.issued', 'invoice.paid'); assert n = 2, 'invoice events';
    perform public.cancel_invoice(v_doc);
    select count(*) into n from public.documents where source_id = v_doc and kind = 'cancellation' and number like 'ST-%'; assert n = 1, 'Stornorechnung with own number, negative';
    select count(*) into n from public.documents where id = v_doc and status = 'cancelled'; assert n = 1, 'invoice cancelled';
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.documents where org_id = org_a;          assert n = 0, 'B sees invoices of A';
  select count(*) into n from public.org_billing where org_id = org_a;        assert n = 0, 'B sees billing of A';
  reset role;

  -- Lineup + guest lists
  insert into public.org_modules (org_id, module_key) values (org_a, 'guestlists');
  insert into public.org_modules (org_id, module_key) values (org_a, 'events') on conflict do nothing;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  declare v_ev uuid := (select id from public.events where org_id = org_a and slug = 'live'); v_art uuid; v_list uuid; v_gt uuid;
  begin
    insert into public.artists (org_id, name) values (org_a, 'DJ Test') returning id into v_art;
    insert into public.event_slots (org_id, event_id, artist_id, stage, starts_at) values (org_a, v_ev, v_art, 'Main', now() + interval '7 days');
    insert into public.guest_lists (org_id, event_id, artist_id, name, quota, per_submission, link_token, link_enabled)
      values (org_a, v_ev, v_art, 'DJ Test +', 2, 2, 'abcdefghijklmnopqrstuvwx', true) returning id into v_list;
    reset role;
    set local role service_role;
    perform public.guest_link_add('abcdefghijklmnopqrstuvwx', 'DJ Test', array['Anna', 'Ben']);
    begin
      perform public.guest_link_add('abcdefghijklmnopqrstuvwx', 'DJ Test', array['Cara']);
      assert false, 'guest list quota';
    exception when raise_exception then null; end;
    reset role;
    select count(*) into n from public.hub_events where org_id = org_a and type = 'guestlist.signed_up'; assert n = 1, 'one sign-up event per submission';
    -- Linked to a ticket type: one live ticket + one paid order per entry, however often it syncs. A live ticket the entry
    -- doesn't point to yet (a concurrent run still writing back) is linked, not issued twice; voided ones are re-issued.
    insert into public.ticket_types (org_id, event_id, name, price) values (org_a, v_ev, 'Gäste', 0) returning id into v_gt;
    update public.guest_lists set ticket_type_id = v_gt where id = v_list;
    set local role service_role;
    n := public.guest_sync_tickets(v_list);                                    assert n = 2, 'sync issues a ticket per entry';
    update public.guest_entries set ticket_id = null, name = 'Anna B' where list_id = v_list and name = 'Anna';
    n := public.guest_sync_tickets(v_list);                                    assert n = 0, 'second sync issues nothing';
    reset role;
    select count(*) into n from public.guest_entries g join public.tickets t on t.id = g.ticket_id
      where g.list_id = v_list and t.guest_entry_id = g.id and t.status = 'valid' and t.holder_name = g.name; assert n = 2, 'entries point to their live, renamed ticket';
    select count(*) into n from public.pay_orders where source_id = v_list::text and status = 'paid'; assert n = 2, 'one paid order per entry';
    begin
      insert into public.tickets (org_id, event_id, type_id, order_id, code, holder_name, status, price, guest_entry_id)
        select org_a, v_ev, v_gt, order_id, 'GUESTDUPXZ', 'x', 'valid', 0, guest_entry_id from public.tickets where type_id = v_gt limit 1;
      assert false, 'second live ticket for a guest entry';
    exception when unique_violation then null; end;
    update public.tickets set status = 'void' where type_id = v_gt and holder_name = 'Ben';
    n := public.guest_sync_tickets(v_list);                                    assert n = 1, 'voided ticket is re-issued';
    select count(*) into n from public.tickets where type_id = v_gt and status = 'valid'; assert n = 2, 'one live ticket each after re-issue';
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.guest_entries where org_id = org_a;     assert n = 0, 'B sees guest entries of A';
    select count(*) into n from public.artists where org_id = org_a;           assert n = 0, 'B sees artists of A';
    reset role;
    perform set_config('request.jwt.claims', '{}', true);
    set local role anon;
    select count(*) into n from public.event_slots where event_id = v_ev;     assert n = 1, 'anon sees the public timetable';
    select count(*) into n from public.artists where id = v_art;              assert n = 1, 'anon sees lineup artists';
    select remaining into n from public.guest_link_info('abcdefghijklmnopqrstuvwx'); assert n = 0, 'link shows remaining, no names';
    begin
      perform 1 from public.guest_entries limit 1;
      assert false, 'anon must not read guest entries';
    exception when insufficient_privilege then null; end;
    reset role;
  end;

  -- Shifts: a team member applies, can't check in before assignment; B sees nothing
  insert into public.org_modules (org_id, module_key) values (org_a, 'shifts');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  declare v_staff uuid; v_shift uuid; v_res text;
  begin
    insert into public.staff (org_id, user_id, name) values (org_a, a, 'Owner A') returning id into v_staff;
    insert into public.shifts (org_id, title, starts_at, ends_at) values (org_a, 'Bar', now() + interval '1 hour', now() + interval '5 hours') returning id into v_shift;
    v_res := public.shift_self('apply', v_shift);                               assert v_res = 'applied', 'member applies';
    begin
      perform public.shift_self('check_in', v_shift);
      assert false, 'check-in needs an assignment';
    exception when raise_exception then null; end;
    update public.shift_assignments set status = 'assigned' where shift_id = v_shift;
    v_res := public.shift_self('check_in', v_shift);                            assert v_res = 'checked_in', 'check-in';
    select count(*) into n from public.time_entries where shift_id = v_shift and ended_at is null;  assert n = 1, 'check-in opens a time entry';
    v_res := public.shift_self('check_out', v_shift);                           assert v_res = 'checked_out', 'check-out';
    update public.time_entries set approved_at = now() where shift_id = v_shift;  -- A is owner: may approve
    select count(*) into n from public.time_entries where shift_id = v_shift and approved_by = a;  assert n = 1, 'approval stamps the approver';
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.staff where org_id = org_a;              assert n = 0, 'B sees staff of A';
    select count(*) into n from public.shifts where org_id = org_a;             assert n = 0, 'B sees shifts of A';
    select count(*) into n from public.time_entries where org_id = org_a;       assert n = 0, 'B sees time entries of A';
    begin
      perform public.shift_self('apply', v_shift, null);
      assert false, 'B must not apply in A';
    exception when raise_exception then null; end;
    reset role;
  end;

  -- Members: numbers per org, rejoin keeps the number, mandate ref generated, trash guard, B sees nothing
  insert into public.org_modules (org_id, module_key) values (org_a, 'members');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  declare v_type uuid; v_max uuid; v_m uuid; v_num int; v_ref text;
  begin
    insert into public.membership_types (org_id, name, fee_cents) values (org_a, 'Voll', 6000) returning id into v_type;
    select id into v_max from public.contacts where org_id = org_a and email = 'max@x.de';
    insert into public.memberships (org_id, contact_id, type_id, starts_on, ends_on, iban) values (org_a, v_max, v_type, '2020-01-01', '2021-12-31', 'DE02120300000000202051')
      returning id, number, mandate_ref into v_m, v_num, v_ref;
    assert v_num = 1 and v_ref = 'M000001', 'first member gets number 1 and a mandate ref';
    insert into public.memberships (org_id, contact_id, type_id) values (org_a, v_max, v_type) returning number into v_num;
    assert v_num = 1, 'rejoining contact keeps its number';
    begin
      insert into public.memberships (org_id, contact_id, type_id, starts_on) values (org_a, v_max, v_type, current_date + 30);
      assert false, 'overlapping memberships of one person are rejected';
    exception when raise_exception then null; end;
    insert into public.member_dues (org_id, membership_id, kind, description, amount_cents, period_start, due_on) values (org_a, v_m, 'fee', 'Beitrag 2020', 6000, '2020-01-01', '2020-01-15');
    begin
      insert into public.member_dues (org_id, membership_id, kind, description, amount_cents, period_start, due_on) values (org_a, v_m, 'fee', 'again', 6000, '2020-01-01', '2020-01-15');
      assert false, 'a period fee exists once';
    exception when unique_violation then null; end;
    begin
      perform public.soft_delete('public.contacts', v_max);
      assert false, 'contact with membership must not go to the trash';
    exception when raise_exception then null; end;
  end;
  reset role;
  select count(*) into n from public.hub_events where org_id = org_a and type = 'membership.started'; assert n = 2, 'memberships emit membership.started';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.memberships where org_id = org_a;       assert n = 0, 'B sees memberships of A';
  select count(*) into n from public.member_dues where org_id = org_a;       assert n = 0, 'B sees dues of A';
  reset role;

  -- Forms: anon gets only published forms via public_form(); B sees nothing of A
  insert into public.org_modules (org_id, module_key) values (org_a, 'forms');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.forms (org_id, title, slug, status) values (org_a, 'Antrag', 'antrag', 'draft'), (org_a, 'Kontakt', 'kontakt', 'published');
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  assert public.public_form(org_a, 'antrag') is null, 'draft form must not be public';
  assert public.public_form(org_a, 'kontakt')->>'title' = 'Kontakt', 'published form is public';
  begin
    perform 1 from public.forms limit 1;
    assert false, 'anon must not read forms directly';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.forms where org_id = org_a;             assert n = 0, 'B sees forms of A';
  reset role;

  -- Event capacity + waiting list: capacity caps all types, a freed seat is offered (held) to the next in line,
  -- only the claim token can take it; B / anon see nothing
  declare v_ev uuid; v_type uuid; v_o1 uuid; v_o2 uuid; v_tok text;
  begin
    insert into public.events (org_id, title, slug, starts_at, status, capacity) values (org_a, 'Voll', 'voll', now() + interval '7 days', 'published', 1) returning id into v_ev;
    insert into public.ticket_types (org_id, event_id, name, price) values (org_a, v_ev, 'Frei', 0) returning id into v_type;
    insert into public.pay_orders (org_id, amount_total, source_module) values (org_a, 0, 'tickets') returning id into v_o1;
    insert into public.pay_orders (org_id, amount_total, source_module) values (org_a, 0, 'tickets') returning id into v_o2;
    set local role service_role;
    perform public.reserve_tickets(v_o1, v_ev, jsonb_build_array(jsonb_build_object('type_id', v_type)), 30);
    begin
      perform public.reserve_tickets(v_o2, v_ev, jsonb_build_array(jsonb_build_object('type_id', v_type)), 30);
      assert false, 'event capacity must cap unlimited types';
    exception when raise_exception then null; end;
    reset role;
    select remaining into n from public.ticket_offer(v_ev) where type_id = v_type;        assert n = 0, 'offer shows the event as full';
    insert into public.event_waitlist (org_id, event_id, name, email) values (org_a, v_ev, 'Wartend', 'w@x.de');
    select count(*) into n from public.offer_waitlist() where event_id = v_ev;            assert n = 0, 'no offer while full';
    update public.tickets set status = 'void' where order_id = v_o1;
    select count(*) into n from public.offer_waitlist() where event_id = v_ev;            assert n = 1, 'freed seat is offered';
    select token into v_tok from public.event_waitlist where event_id = v_ev and status = 'offered';
    select remaining into n from public.ticket_offer(v_ev) where type_id = v_type;        assert n = 0, 'offered seat is held for others';
    select remaining into n from public.ticket_offer(v_ev, null, v_tok) where type_id = v_type; assert n = 1, 'claim token sees its seat';
    set local role service_role;
    perform public.reserve_tickets(v_o2, v_ev, jsonb_build_array(jsonb_build_object('type_id', v_type)), 30, null, v_tok);
    reset role;
    select count(*) into n from public.event_waitlist where event_id = v_ev and status = 'claimed'; assert n = 1, 'claim marks the entry';
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.event_waitlist where org_id = org_a;    assert n = 0, 'B sees waiting list of A';
    reset role;
    perform set_config('request.jwt.claims', '{}', true);
    set local role anon;
    begin
      perform 1 from public.event_waitlist limit 1;
      assert false, 'anon must not read the waiting list';
    exception when insufficient_privilege then null; end;
    reset role;
  end;

  -- Letter templates: own ones are org-private, roots defaults (org_id null) visible to all and read-only
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.letter_templates (org_id, name) values (org_a, 'Eigene Vorlage');
  update public.letter_templates set name = 'gekapert' where org_id is null;
  begin
    insert into public.letter_templates (org_id, name) values (null, 'Fake-Standard');
    assert false, 'members must not add default templates';
  exception when insufficient_privilege then null; end;
  reset role;
  select count(*) into n from public.letter_templates where org_id is null and name = 'gekapert';        assert n = 0, 'defaults are read-only';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.letter_templates where org_id = org_a;    assert n = 0, 'B sees templates of A';
  select count(*) into n from public.letter_templates where org_id is null;    assert n >= 4, 'everyone sees the default templates';
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  begin
    perform 1 from public.letter_templates limit 1;
    assert false, 'anon must not read templates';
  exception when insufficient_privilege then null; end;
  reset role;

  -- Email: an active automation on contact.created queues one send; unsubscribed contacts get none; B sees nothing
  insert into public.org_modules (org_id, module_key) values (org_a, 'email');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.email_automations (org_id, name, event_type, subject, body, active) values (org_a, 'Willkommen', 'contact.created', 'Hallo', 'Hallo {first_name}', true);
  insert into public.contacts (org_id, first_name, email) values (org_a, 'Neu', 'neu-auto@x.de');
  insert into public.contacts (org_id, first_name, email, unsubscribed_at) values (org_a, 'Weg', 'weg-auto@x.de', now());
  insert into public.email_campaigns (org_id, name) values (org_a, 'News');
  reset role;
  select count(*) into n from public.email_sends where org_id = org_a and to_email = 'neu-auto@x.de';   assert n = 1, 'automation queues one send';
  select count(*) into n from public.email_sends where org_id = org_a and to_email = 'weg-auto@x.de';   assert n = 0, 'unsubscribed contact gets no automation';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.email_campaigns where org_id = org_a;    assert n = 0, 'B sees campaigns of A';
  select count(*) into n from public.email_sends where org_id = org_a;       assert n = 0, 'B sees sends of A';
  reset role;

  -- Files: A (owner) registers files in A only, with paths under its own folder; B sees nothing
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.files (org_id, name, path, entity, entity_id) values (org_a, 'a.pdf', 'orgs/' || org_a || '/f1.pdf', 'contacts', gen_random_uuid());
  begin
    insert into public.files (org_id, name, path) values (org_a, 'x.pdf', 'orgs/' || org_b || '/f2.pdf');
    assert false, 'file path must be in the own org folder';
  exception when check_violation then null; end;
  begin
    insert into public.files (org_id, name, path) values (org_b, 'x.pdf', 'orgs/' || org_b || '/f3.pdf');
    assert false, 'A must not add files to B';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.files where org_id = org_a;              assert n = 0, 'B sees files of A';
  reset role;

  -- HR: personal data + employee documents only for hr.manage; B sees nothing
  insert into public.org_modules (org_id, module_key) values (org_a, 'hr') on conflict do nothing;
  declare v_emp uuid;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into public.employees (org_id, name) values (org_a, 'Erika') returning id into v_emp;
    insert into public.employee_private (org_id, employee_id, iban) values (org_a, v_emp, 'DE02120300000000202051');
    insert into public.files (org_id, name, path, mime, size, entity, entity_id)
      values (org_a, 'Vertrag.pdf', 'orgs/' || org_a || '/' || gen_random_uuid() || '.pdf', 'application/pdf', 1, 'employees', v_emp);
    select count(*) into n from public.files where entity = 'employees';        assert n = 1, 'HR manager sees employee documents';
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.employee_private where org_id = org_a;  assert n = 0, 'member without hr.manage sees personal data';
    select count(*) into n from public.files where entity = 'employees';        assert n = 0, 'employee documents need hr.manage';
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.employees where org_id = org_a;          assert n = 0, 'B sees employees of A';
    select count(*) into n from public.absences where org_id = org_a;           assert n = 0, 'B sees absences of A';
    reset role;
  end;

  -- Courses: places + waiting list in the DB (full → waiting; someone leaves → next moves up); B sees nothing
  insert into public.org_modules (org_id, module_key) values (org_a, 'courses') on conflict do nothing;
  insert into public.org_modules (org_id, module_key) values (org_a, 'crm') on conflict do nothing;
  declare v_course uuid; v_p1 uuid; v_c1 uuid; v_c2 uuid; v_status text;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into public.contacts (org_id, first_name, email) values (org_a, 'Kurs 1', 'kurs1@x.de') returning id into v_c1;
    insert into public.contacts (org_id, first_name, email) values (org_a, 'Kurs 2', 'kurs2@x.de') returning id into v_c2;
    insert into public.courses (org_id, title, capacity) values (org_a, 'Yoga', 1) returning id into v_course;
    insert into public.course_participants (org_id, course_id, contact_id) values (org_a, v_course, v_c1) returning id into v_p1;
    insert into public.course_participants (org_id, course_id, contact_id) values (org_a, v_course, v_c2) returning status into v_status;
    assert v_status = 'waiting', 'full course puts the next one on the waiting list';
    update public.course_participants set status = 'cancelled' where id = v_p1;
    select status into v_status from public.course_participants where course_id = v_course and contact_id = v_c2;
    assert v_status = 'enrolled', 'a freed place goes to the waiting list';
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.courses where org_id = org_a;              assert n = 0, 'B sees courses of A';
    select count(*) into n from public.course_participants where org_id = org_a;  assert n = 0, 'B sees course participants of A';
    begin
      insert into public.course_participants (org_id, course_id, contact_id) values (org_b, v_course, v_c1);
      assert false, 'B must not add to a course of A';
    exception when insufficient_privilege then null; end;
    reset role;
  end;

  -- Cash book: numbered entries, frozen after booking, closed months take nothing; B sees nothing
  insert into public.org_modules (org_id, module_key) values (org_a, 'cashbook') on conflict do nothing;
  declare v_acc uuid; v_entry uuid; v_no text;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into public.cash_accounts (org_id, name, opening_cents, opening_on) values (org_a, 'Barkasse', 10000, '2025-01-01') returning id into v_acc;
    insert into public.cash_entries (org_id, account_id, booked_on, amount_cents, description) values (org_a, v_acc, '2025-03-10', -2500, 'Getränke')
      returning id, number into v_entry, v_no;
    assert v_no = 'K-2025-0001', 'entries get a number from the cash range';
    update public.cash_entries set amount_cents = -1 where id = v_entry;      -- no update policy: changes nothing
    select amount_cents into n from public.cash_entries where id = v_entry;     assert n = -2500, 'booked entries are frozen';
    insert into public.cash_closings (org_id, account_id, month, balance_cents, counted_cents) values (org_a, v_acc, '2025-03-01', 0, 7500);
    select balance_cents into n from public.cash_closings where account_id = v_acc;  assert n = 7500, 'closing balance is computed in the DB';
    begin
      insert into public.cash_entries (org_id, account_id, booked_on, amount_cents, description) values (org_a, v_acc, '2025-03-20', 100, 'Nachtrag');
      assert false, 'closed months take no entries';
    exception when raise_exception then null; end;
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.cash_accounts where org_id = org_a;  assert n = 0, 'B sees cash accounts of A';
    select count(*) into n from public.cash_entries where org_id = org_a;   assert n = 0, 'B sees cash entries of A';
    begin
      insert into public.cash_entries (org_id, account_id, booked_on, amount_cents, description) values (org_b, v_acc, '2025-04-01', 100, 'x');
      assert false, 'B must not book on an account of A';
    exception when insufficient_privilege or raise_exception then null; end;
    reset role;
  end;

  -- Wiki: a change keeps the old text as a version, no cycles in the tree; B sees nothing
  insert into public.org_modules (org_id, module_key) values (org_a, 'wiki') on conflict do nothing;
  declare v_root uuid; v_child uuid;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into public.wiki_pages (org_id, title, body) values (org_a, 'Handbuch', 'v1') returning id into v_root;
    insert into public.wiki_pages (org_id, parent_id, title) values (org_a, v_root, 'Kasse') returning id into v_child;
    update public.wiki_pages set body = 'v2' where id = v_root;
    select count(*) into n from public.wiki_page_versions where page_id = v_root and body = 'v1';  assert n = 1, 'old text is kept as a version';
    begin
      update public.wiki_pages set parent_id = v_child where id = v_root;
      assert false, 'a page cannot move into its own child';
    exception when raise_exception then null; end;
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.wiki_pages where org_id = org_a;          assert n = 0, 'B sees wiki pages of A';
    select count(*) into n from public.wiki_page_versions where org_id = org_a;  assert n = 0, 'B sees wiki versions of A';
    reset role;
    -- Visibility: a page for certain roles hides it (and its sub-pages) from readers without that role
    update public.roles set permissions = permissions || '{wiki.view}' where org_id is null and name ->> 'en' = 'Member';
    update public.wiki_pages set visibility = 'roles', role_ids = '{}' where id = v_root;
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.wiki_pages where id in (v_root, v_child);  assert n = 0, 'role-restricted page and its sub-page are hidden';
    reset role;
    update public.wiki_pages set visibility = 'team' where id = v_child;
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.wiki_pages where id = v_child;  assert n = 1, 'a sub-page with its own setting is visible';
    reset role;
  end;

  -- Projects: default columns, done column sets completed_at, assignees must be team members; B sees nothing
  insert into public.org_modules (org_id, module_key) values (org_a, 'projects') on conflict do nothing;
  declare v_open uuid; v_done uuid; v_task uuid; v_at timestamptz;
  begin
    perform public.seed_task_statuses(org_a);
    select id into v_open from public.task_statuses where org_id = org_a and scope = 'task' and not is_done order by position limit 1;
    select id into v_done from public.task_statuses where org_id = org_a and scope = 'task' and is_done limit 1;
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into public.tasks (org_id, status_id, title) values (org_a, v_open, 'Flyer drucken') returning id into v_task;
    update public.tasks set status_id = v_done where id = v_task;
    select completed_at into v_at from public.tasks where id = v_task;  assert v_at is not null, 'moving into a done column completes the task';
    insert into public.task_assignees (org_id, task_id, user_id) values (org_a, v_task, c);
    begin
      insert into public.task_assignees (org_id, task_id, user_id) values (org_a, v_task, b);
      assert false, 'only team members can be assigned';
    exception when raise_exception then null; end;
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.tasks where org_id = org_a;           assert n = 0, 'B sees tasks of A';
    select count(*) into n from public.task_assignees where org_id = org_a;  assert n = 0, 'B sees task assignees of A';
    select count(*) into n from public.task_statuses where org_id = org_a;   assert n = 0, 'B sees task statuses of A';
    reset role;
  end;

  -- Projects v2: project columns, tasks in a project, links only to own records, comments; B sees nothing
  declare v_pstat uuid; v_tstat uuid; v_proj uuid; v_contact uuid; v_other uuid; v_at timestamptz;
  begin
    select id into v_pstat from public.task_statuses where org_id = org_a and scope = 'project' and is_done limit 1;
    select id into v_tstat from public.task_statuses where org_id = org_a and scope = 'task' limit 1;
    insert into public.contacts (org_id, first_name) values (org_b, 'Fremd') returning id into v_other;
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into public.projects (org_id, status_id, name) values (org_a, v_pstat, 'Sommerfest') returning id into v_proj;
    select completed_at into v_at from public.projects where id = v_proj;  assert v_at is not null, 'a project in a done column is completed';
    begin
      insert into public.projects (org_id, status_id, name) values (org_a, v_tstat, 'Falsch');
      assert false, 'projects only take project columns';
    exception when raise_exception then null; end;
    insert into public.tasks (org_id, status_id, title, project_id) values (org_a, v_tstat, 'Bühne', v_proj);
    insert into public.contacts (org_id, first_name) values (org_a, 'Erika') returning id into v_contact;
    insert into public.project_links (org_id, project_id, entity, entity_id) values (org_a, v_proj, 'contacts', v_contact);
    begin
      insert into public.project_links (org_id, project_id, entity, entity_id) values (org_a, v_proj, 'contacts', v_other);
      assert false, 'links only to records of the same org';
    exception when raise_exception then null; end;
    insert into public.comments (org_id, entity, entity_id, body) values (org_a, 'projects', v_proj, 'Los gehts');
    select count(*) into n from public.record_changes('projects', v_proj);  assert n >= 1, 'the project has its change log';
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.projects where org_id = org_a;       assert n = 0, 'B sees projects of A';
    select count(*) into n from public.project_links where org_id = org_a;  assert n = 0, 'B sees project links of A';
    select count(*) into n from public.comments where org_id = org_a;       assert n = 0, 'B sees comments of A';
    select count(*) into n from public.record_changes('projects', v_proj);  assert n = 0, 'B reads the change log of A';
    begin
      insert into public.comments (org_id, entity, entity_id, body) values (org_a, 'projects', v_proj, 'hi');
      assert false, 'B comments in A';
    exception when insufficient_privilege then null; end;
    reset role;
  end;

  -- Guest lists of an event get their own hidden ticket type; every entry a ticket (QR, counts against capacity)
  declare v_ev uuid; v_list uuid; v_type uuid; v_active boolean;
  begin
    insert into public.org_modules (org_id, module_key) values (org_a, 'guestlists') on conflict do nothing;
    insert into public.events (org_id, title, slug, starts_at) values (org_a, 'GL Party', 'gl-party', now() + interval '3 days') returning id into v_ev;
    insert into public.guest_lists (org_id, event_id, name, link_token) values (org_a, v_ev, 'DJ Foo +', 'glisttokenglisttokenglis') returning id into v_list;
    select ticket_type_id into v_type from public.guest_lists where id = v_list;
    select active into v_active from public.ticket_types where id = v_type;
    assert v_type is not null and v_active = false, 'an event guest list gets its own hidden ticket type';
    insert into public.guest_entries (org_id, list_id, name, email, added_via) values (org_a, v_list, 'Ada', 'ada@x.de', 'app');
    perform public.guest_sync_tickets(v_list);
    select count(*) into n from public.tickets where type_id = v_type and status = 'valid';  assert n = 1, 'each guest gets a ticket';
    update public.guest_lists set name = 'Crew' where id = v_list;
    select count(*) into n from public.ticket_types where id = v_type and name = 'Gästeliste: Crew';  assert n = 1, 'renaming the list renames its type';
  end;

  -- Assistant: chats and AI keys are private to their person (not even teammates in the same org see them)
  declare v_chat uuid;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into public.assistant_chats (org_id, user_id, title) values (org_a, a, 'Mein Chat') returning id into v_chat;
    perform public.save_ai_key('xai', 'xai-test-secret', '…cret', '[]');
    begin
      insert into public.assistant_chats (org_id, user_id, title) values (org_a, c, 'fremd');
      assert false, 'A creates a chat for someone else';
    exception when insufficient_privilege then null; end;
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.assistant_chats where id = v_chat;  assert n = 0, 'a teammate sees my chat';
    select count(*) into n from public.ai_keys where user_id = a;           assert n = 0, 'a teammate sees my AI key';
    begin
      perform public.get_ai_key(a, 'xai');
      assert false, 'a signed-in person reads a key';
    exception when insufficient_privilege then null; end;
    reset role;
    assert public.get_ai_key(a, 'xai') = 'xai-test-secret', 'the server reads the key';
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    perform public.delete_ai_key('xai');
  end;

  -- Rentals: no double booking (capacity), fixed parts not alone, renewal extends, people from the same org; B sees nothing
  insert into public.org_modules (org_id, module_key) values (org_a, 'rentals') on conflict do nothing;
  declare v_studio uuid; v_shelf uuid; v_room uuid; v_r uuid; v_ct uuid; v_end timestamptz;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into public.rental_objects (org_id, kind, name, rentable) values (org_a, 'studio', 'Studio A', true) returning id into v_studio;
    insert into public.rental_objects (org_id, parent_id, kind, name, included) values (org_a, v_studio, 'furniture', 'Regal', true) returning id into v_shelf;
    insert into public.rental_objects (org_id, kind, name, rentable, capacity) values (org_a, 'room', 'Proberaum', true, 2) returning id into v_room;
    insert into public.rentals (org_id, object_id, starts_at) values (org_a, v_studio, '2026-01-01') returning id into v_r;
    begin
      insert into public.rentals (org_id, object_id, starts_at, ends_at) values (org_a, v_studio, '2026-06-01', '2026-07-01');
      assert false, 'a studio can be rented twice at the same time';
    exception when raise_exception then null; end;
    insert into public.rentals (org_id, object_id, starts_at, ends_at, status) values (org_a, v_studio, '2026-06-01', '2026-07-01', 'request'); -- requests don't block
    insert into public.rentals (org_id, object_id, starts_at, ends_at) values (org_a, v_room, '2026-05-01 10:00', '2026-05-01 12:00');
    insert into public.rentals (org_id, object_id, starts_at, ends_at) values (org_a, v_room, '2026-05-01 11:00', '2026-05-01 13:00'); -- capacity 2
    begin
      insert into public.rentals (org_id, object_id, starts_at, ends_at) values (org_a, v_room, '2026-05-01 11:30', '2026-05-01 12:30');
      assert false, 'capacity 2 allowed a third booking';
    exception when raise_exception then null; end;
    begin
      insert into public.rentals (org_id, object_id, starts_at) values (org_a, v_shelf, '2027-01-01');
      assert false, 'a fixed part was rented on its own';
    exception when raise_exception then null; end;
    insert into public.contacts (org_id, first_name) values (org_a, 'Mieterin') returning id into v_ct;
    insert into public.rental_contacts (org_id, rental_id, contact_id) values (org_a, v_r, v_ct);
    reset role;
    update public.rentals set ends_at = now() - interval '1 day', renew_months = 12 where id = v_r;
    perform public.renew_rentals();
    select ends_at into v_end from public.rentals where id = v_r;  assert v_end > now() + interval '300 days', 'a renewing contract was not extended';
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.rental_objects where org_id = org_a;   assert n = 0, 'B sees rental objects of A';
    select count(*) into n from public.rentals where org_id = org_a;          assert n = 0, 'B sees rentals of A';
    select count(*) into n from public.rental_contacts where org_id = org_a;  assert n = 0, 'B sees rental contacts of A';
    reset role;
  end;

  -- MCP connections: a person adds their own (only for orgs they belong to); B doesn't see A's
  declare v_conn uuid;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into public.mcp_connections (org_id, user_id, client_id, client_name) values (org_a, a, 'iso-client', 'Claude') returning id into v_conn;
    begin
      insert into public.mcp_connections (org_id, user_id, client_id) values (org_a, b, 'iso-client-2');
      assert false, 'a connection was added for someone else';
    exception when insufficient_privilege then null; end;
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.mcp_connections where org_id = org_a;  assert n = 0, 'B sees MCP connections of A';
    begin
      insert into public.mcp_connections (org_id, user_id, client_id) values (org_a, b, 'iso-client-3');
      assert false, 'B connected to an org B is not in';
    exception when insufficient_privilege then null; end;
    reset role;
  end;

  -- Automations: an event of the trigger type starts one run per active workflow; B sees nothing
  insert into public.org_modules (org_id, module_key) values (org_a, 'automations') on conflict do nothing;
  declare v_wf uuid;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into public.workflows (org_id, name, active, trigger_type, graph) values (org_a, 'Test', true, 'iso.tested', '{"nodes": [], "edges": []}') returning id into v_wf;
    reset role;
    perform public.emit_event(org_a, 'iso.tested', '{"x": 1}'::jsonb);
    perform public.emit_event(org_a, 'workflow.notified', '{"x": 1}'::jsonb);
    select count(*) into n from public.workflow_runs where workflow_id = v_wf;        assert n = 1, 'an event starts one run (workflow events start none)';
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.workflows where org_id = org_a;               assert n = 0, 'B sees workflows of A';
    select count(*) into n from public.workflow_runs where org_id = org_a;           assert n = 0, 'B sees workflow runs of A';
    reset role;
  end;

  -- API keys: the service role gets org rights only with a live key of that org (x-api-key-hash + x-org-id),
  -- only for the key's permissions that its creator (A, owner) still has; never owner rights.
  reset role;
  -- created_by comes from the audit trigger (auth.uid()), so insert each key "as" its creator
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  insert into public.api_keys (org_id, name, prefix, key_hash, permissions) values (org_a, 'k', 'roots_aaaaaa', repeat('b', 64), '{events.manage}');
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  insert into public.api_keys (org_id, name, prefix, key_hash, permissions) values (org_a, 'c', 'roots_cccccc', repeat('d', 64), '{events.manage}');
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('request.headers', json_build_object('x-org-id', org_a)::text, true);
  assert not public.has_perm(org_a, 'events.manage'), 'service role without key has no org rights';
  perform set_config('request.headers', json_build_object('x-org-id', org_a, 'x-api-key-hash', repeat('b', 64))::text, true);
  assert public.has_perm(org_a, 'events.manage'), 'live key passes its permission';
  assert public.is_member(org_a), 'live key counts as member';
  assert not public.has_perm(org_a, 'crm.manage'), 'key passes only its own permissions';
  assert not public.is_owner(org_a), 'keys never get owner rights';
  assert not public.has_perm(org_b, 'events.manage'), 'key passes nothing in another org';
  -- changes made with the key are attributed to its creator, and the log says it came via the key
  declare v_loc uuid; v_by uuid; v_via text;
  begin
    insert into public.locations (org_id, name) values (org_a, 'Via API') returning id, created_by into v_loc, v_by;
    assert v_by = a, 'API write not attributed to the key creator';
    select via into v_via from public.audit_log where table_name = 'locations' and row_id = v_loc::text order by at desc limit 1;
    assert v_via like 'api_key:%', 'audit log does not say the change came via an API key';
  end;
  perform set_config('request.headers', json_build_object('x-org-id', org_b, 'x-api-key-hash', repeat('b', 64))::text, true);
  assert not public.has_perm(org_b, 'events.manage'), 'key with another org header passes nothing';
  perform set_config('request.headers', json_build_object('x-org-id', org_a, 'x-api-key-hash', repeat('d', 64))::text, true);
  assert not public.has_perm(org_a, 'events.manage'), 'key cannot exceed its creator (C is a plain member)';
  update public.api_keys set expires_at = now() - interval '1 second' where key_hash = repeat('b', 64);
  perform set_config('request.headers', json_build_object('x-org-id', org_a, 'x-api-key-hash', repeat('b', 64))::text, true);
  assert not public.has_perm(org_a, 'events.manage'), 'expired key passes nothing';
  update public.api_keys set expires_at = null, revoked_at = now() where key_hash = repeat('b', 64);
  assert not public.has_perm(org_a, 'events.manage'), 'revoked key passes nothing';
  perform set_config('request.headers', '{}', true);
  perform set_config('request.jwt.claims', '{}', true);

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

  -- invites: renewing a link = updating token_hash/expires_at; managers only, owner invites only by owners
  insert into public.invites (org_id, email, role_id, token_hash) values
    (org_a, 'own@isolation.test', (select id from public.roles where org_id is null and is_owner), 'iso-hash-1'),
    (org_a, 'mem@isolation.test', (select id from public.roles where org_id is null and name ->> 'en' = 'Member'), 'iso-hash-2');
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.invites set token_hash = 'iso-hash-3' where email = 'mem@isolation.test';
  get diagnostics n = row_count;                                             assert n = 0, 'a plain member renewed an invite';
  reset role;
  update public.org_members set role_id = (select id from public.roles where org_id is null and name ->> 'en' = 'Admin')
    where org_id = org_a and user_id = c;
  set local role authenticated;
  update public.invites set token_hash = 'iso-hash-3' where email = 'own@isolation.test';
  get diagnostics n = row_count;                                             assert n = 0, 'a non-owner renewed an owner invite';
  update public.invites set token_hash = 'iso-hash-4', expires_at = now() + interval '7 days' where email = 'mem@isolation.test';
  get diagnostics n = row_count;                                             assert n = 1, 'an admin should renew an invite link';
  begin
    update public.invites set accepted_at = now() where email = 'mem@isolation.test';
    assert false, 'an admin marked an invite accepted';
  exception when insufficient_privilege then null;
  end;
  reset role;

  raise exception 'isolation: all checks passed';
end $$;
