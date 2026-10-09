-- Deleting an org cascades to its members: don't emit member.left for an org that's being deleted.
create or replace function public.events_from_changes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'org_members' then
    if tg_op = 'INSERT' then
      perform public.emit_event(new.org_id, 'member.joined', jsonb_build_object('user_id', new.user_id,
        'email', (select email from public.profiles where id = new.user_id)), 'org_members', new.id::text);
    elsif tg_op = 'DELETE' and exists (select 1 from public.orgs where id = old.org_id) then
      perform public.emit_event(old.org_id, 'member.left', jsonb_build_object('user_id', old.user_id,
        'email', (select email from public.profiles where id = old.user_id)), 'org_members', old.id::text);
    end if;
  elsif tg_table_name = 'invites' and tg_op = 'INSERT' then
    perform public.emit_event(new.org_id, 'member.invited', jsonb_build_object('email', new.email), 'invites', new.id::text);
  elsif tg_table_name = 'pay_orders' and tg_op = 'UPDATE' and new.status is distinct from old.status
    and new.status in ('paid', 'refunded', 'failed') then
    perform public.emit_event(new.org_id, 'order.' || new.status, jsonb_build_object(
      'order_id', new.id, 'amount', new.amount_total, 'currency', new.currency,
      'customer_email', new.customer_email, 'source_module', new.source_module), 'pay_orders', new.id::text);
  end if;
  return null;
end $$;
