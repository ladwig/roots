-- Reports (module "reports", permission reports.view): KPIs for a period in one round trip. Each section only when
-- its module is on and the person (or API key) may see that module anyway (members.view for dues etc.).
-- Days are Berlin days; p_to is inclusive.

create or replace function public.default_module_keys() returns text[]
language sql immutable set search_path = '' as $$
  select array['crm', 'payments', 'events', 'tickets', 'guestlists', 'invoices', 'shifts', 'members', 'forms', 'email', 'hr', 'courses', 'automations', 'reports']
$$;
insert into public.org_modules (org_id, module_key) select id, 'reports' from public.orgs on conflict do nothing;

create function public.report_can(p_org uuid, p_module text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.module_enabled(p_org, p_module) and (public.has_perm(p_org, p_module || '.view') or public.has_perm(p_org, p_module || '.manage'));
$$;
revoke execute on function public.report_can(uuid, text) from public, anon, authenticated;

create function public.report_kpis(p_org uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Europe/Berlin')::date;
  f timestamptz := p_from::timestamp at time zone 'Europe/Berlin';
  t timestamptz := (p_to + 1)::timestamp at time zone 'Europe/Berlin';
  out jsonb := jsonb_build_object('from', p_from, 'to', p_to);
  v_members boolean := public.report_can(p_org, 'members');
  v_tickets boolean := public.report_can(p_org, 'tickets');
  v_guests boolean := public.report_can(p_org, 'guestlists');
begin
  if not public.module_enabled(p_org, 'reports') or not public.has_perm(p_org, 'reports.view') then raise exception 'not_allowed'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 3660 then raise exception 'invalid_input'; end if;

  if public.report_can(p_org, 'crm') then
    out := out || jsonb_build_object('contacts', jsonb_build_object(
      'total', (select count(*) from public.contacts where org_id = p_org and deleted_at is null),
      'new', (select count(*) from public.contacts where org_id = p_org and deleted_at is null and created_at >= f and created_at < t)));
  end if;

  if v_members then
    out := out || jsonb_build_object('members', (
      with m as (
        select x.*, y.name as type_name,
          x.starts_on <= v_today and (x.ends_on is null or x.ends_on >= v_today) as active
        from public.memberships x join public.membership_types y on y.id = x.type_id
        where x.org_id = p_org and x.deleted_at is null),
      d as (select * from public.member_dues where org_id = p_org)
      select jsonb_build_object(
        'active', (select count(*) from m where active),
        'joined', (select count(*) from m where starts_on between p_from and p_to),
        'left', (select count(*) from m where ends_on between p_from and p_to),
        'paused', (select count(*) from m where active and paused_from <= v_today and (paused_until is null or paused_until >= v_today)),
        'fee_free', (select count(*) from m where active and fee_free_until >= v_today),
        'by_type', coalesce((select jsonb_agg(jsonb_build_object('type', type_name, 'active', n) order by n desc)
          from (select type_name, count(*) as n from m where active group by type_name) s), '[]'),
        'months', coalesce((select jsonb_agg(jsonb_build_object('month', to_char(mo, 'YYYY-MM'),
            'joined', (select count(*) from m where date_trunc('month', starts_on) = mo),
            'left', (select count(*) from m where date_trunc('month', ends_on) = mo)) order by mo)
          from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') mo), '[]'),
        'dues_open_cents', (select coalesce(sum(amount_cents), 0) from d where status = 'open'),
        'dues_overdue_cents', (select coalesce(sum(amount_cents), 0) from d where status = 'open' and due_on < v_today),
        'dues_overdue_people', (select count(distinct membership_id) from d where status = 'open' and due_on < v_today),
        'dues_paid_cents', (select coalesce(sum(amount_cents), 0) from d where status = 'paid' and paid_on between p_from and p_to))));
  end if;

  if public.report_can(p_org, 'events') then
    out := out || jsonb_build_object('events', (
      with e as (
        select id, title, starts_at, capacity from public.events
        where org_id = p_org and deleted_at is null and status <> 'draft' and starts_at >= f and starts_at < t),
      k as (
        select k.event_id, k.status, k.price, y.for_members, mt.name as member_type
        from public.tickets k join public.ticket_types y on y.id = k.type_id
        left join public.pay_orders o on y.for_members and o.id = k.order_id
        left join public.memberships ms on y.for_members and ms.id::text = o.source_id
        left join public.membership_types mt on mt.id = ms.type_id
        where v_tickets and k.org_id = p_org and k.event_id in (select id from e) and k.status in ('valid', 'used')),
      g as (select event_id, count(*) as n from public.guest_checkins where v_guests and org_id = p_org and event_id in (select id from e) group by event_id),
      rows as (
        select e.id, e.title, e.starts_at, e.capacity,
          (select count(*) from k where k.event_id = e.id and not k.for_members) as sold,
          (select coalesce(sum(k.price), 0) from k where k.event_id = e.id and not k.for_members) as revenue_cents,
          (select count(*) from k where k.event_id = e.id and not k.for_members and k.status = 'used') as tickets_in,
          (select count(*) from k where k.event_id = e.id and k.for_members and k.status = 'used') as members_in,
          coalesce((select n from g where g.event_id = e.id), 0) as guests_in,
          (select coalesce(jsonb_object_agg(member_type, n), '{}') from (select coalesce(member_type, '–') as member_type, count(*) as n
            from k where v_members and k.event_id = e.id and k.for_members and k.status = 'used' group by 1) s) as members_by_type
        from e)
      select jsonb_build_object(
        'count', (select count(*) from rows),
        'sold', (select coalesce(sum(sold), 0) from rows),
        'revenue_cents', (select coalesce(sum(revenue_cents), 0) from rows),
        'tickets_in', (select coalesce(sum(tickets_in), 0) from rows),
        'members_in', (select coalesce(sum(members_in), 0) from rows),
        'guests_in', (select coalesce(sum(guests_in), 0) from rows),
        'members_by_type', (select coalesce(jsonb_object_agg(member_type, n), '{}') from (select coalesce(member_type, '–') as member_type, count(*) as n
          from k where v_members and k.for_members and k.status = 'used' group by 1) s),
        'list', coalesce((select jsonb_agg(to_jsonb(rows) order by starts_at desc) from (select * from rows order by starts_at desc limit 100) rows), '[]'),
        'tickets', v_tickets, 'guests', v_guests)));
  end if;

  if public.report_can(p_org, 'payments') then
    out := out || jsonb_build_object('payments', (
      with o as (
        select source_module, amount_total from public.pay_orders
        where org_id = p_org and amount_total > 0 and paid_at >= f and paid_at < t and status in ('paid', 'partially_refunded', 'refunded'))
      select jsonb_build_object('orders', (select count(*) from o), 'gross_cents', (select coalesce(sum(amount_total), 0) from o),
        'by_source', (select coalesce(jsonb_object_agg(source_module, cents), '{}') from (select source_module, sum(amount_total) as cents from o group by 1) s))));
  end if;

  if public.report_can(p_org, 'shifts') then
    out := out || jsonb_build_object('shifts', jsonb_build_object(
      'count', (select count(*) from public.shifts where org_id = p_org and starts_at >= f and starts_at < t),
      'needed', (select coalesce(sum(needed), 0) from public.shifts where org_id = p_org and starts_at >= f and starts_at < t),
      'assigned', (select count(*) from public.shift_assignments a join public.shifts s on s.id = a.shift_id
        where a.org_id = p_org and a.status = 'assigned' and s.starts_at >= f and s.starts_at < t),
      'worked_minutes', (select coalesce(round(sum(extract(epoch from ended_at - started_at) / 60 - coalesce(break_minutes, 0))), 0)
        from public.time_entries where org_id = p_org and ended_at is not null and started_at >= f and started_at < t)));
  end if;

  if public.report_can(p_org, 'forms') then
    out := out || jsonb_build_object('forms', jsonb_build_object(
      'submissions', (select count(*) from public.form_submissions where org_id = p_org and created_at >= f and created_at < t)));
  end if;

  if public.report_can(p_org, 'invoices') then
    out := out || jsonb_build_object('invoices', jsonb_build_object(
      'issued', (select count(*) from public.documents where org_id = p_org and kind = 'invoice' and status <> 'draft' and issue_date between p_from and p_to),
      'issued_cents', (select coalesce(sum(gross_total), 0) from public.documents where org_id = p_org and kind = 'invoice' and status <> 'draft' and issue_date between p_from and p_to),
      'paid_cents', (select coalesce(sum(gross_total), 0) from public.documents where org_id = p_org and kind = 'invoice' and status = 'paid' and paid_at >= f and paid_at < t),
      'open_cents', (select coalesce(sum(gross_total), 0) from public.documents where org_id = p_org and kind = 'invoice' and status = 'sent'),
      'overdue_cents', (select coalesce(sum(gross_total), 0) from public.documents where org_id = p_org and kind = 'invoice' and status = 'sent' and due_date < v_today)));
  end if;

  if public.report_can(p_org, 'courses') then
    out := out || jsonb_build_object('courses', jsonb_build_object(
      'courses', (select count(*) from public.courses where org_id = p_org and deleted_at is null),
      'enrolled', (select count(*) from public.course_participants where org_id = p_org and status = 'enrolled'),
      'waiting', (select count(*) from public.course_participants where org_id = p_org and status = 'waiting')));
  end if;

  if public.report_can(p_org, 'email') then
    out := out || jsonb_build_object('email', (
      select jsonb_build_object('sent', count(*), 'delivered', count(*) filter (where delivery = 'delivered'),
        'bounced', count(*) filter (where delivery = 'bounced'), 'complained', count(*) filter (where delivery = 'complained'))
      from public.email_sends where org_id = p_org and sent_at >= f and sent_at < t));
  end if;

  return out;
end $$;
revoke execute on function public.report_kpis(uuid, date, date) from public, anon;
