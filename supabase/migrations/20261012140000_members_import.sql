-- Member import: membership.started per single insert, one memberships.imported per bulk insert (like contacts).
-- Imported numbers (from the old system) are kept and formatted like new ones.
drop trigger memberships_emit on public.memberships;
create or replace function public.memberships_emit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record; n int; v_name text;
begin
  if tg_op = 'INSERT' then
    select count(*) into n from inserted;
    if n = 1 then
      select * into r from inserted;
      select nullif(trim(concat_ws(' ', c.first_name, c.last_name)), '') into v_name from public.contacts c where c.id = r.contact_id;
      perform public.emit_event(r.org_id, 'membership.started', jsonb_build_object('membership_id', r.id, 'contact_id', r.contact_id,
        'name', v_name, 'number', r.member_no, 'starts_at', r.starts_on), 'memberships', r.id::text);
    elsif n > 1 then
      for r in select org_id, count(*) as cnt from inserted group by org_id loop
        perform public.emit_event(r.org_id, 'memberships.imported', jsonb_build_object('count', r.cnt), 'memberships', null);
      end loop;
    end if;
  elsif new.ends_on is not null and old.ends_on is distinct from new.ends_on then
    select nullif(trim(concat_ws(' ', c.first_name, c.last_name)), '') into v_name from public.contacts c where c.id = new.contact_id;
    perform public.emit_event(new.org_id, 'membership.ended', jsonb_build_object('membership_id', new.id, 'contact_id', new.contact_id,
      'name', v_name, 'number', new.member_no, 'ends_on', new.ends_on), 'memberships', new.id::text);
  end if;
  return null;
end $$;
create trigger memberships_emit_insert after insert on public.memberships
  referencing new table as inserted for each statement execute function public.memberships_emit();
create trigger memberships_emit_end after update of ends_on on public.memberships for each row execute function public.memberships_emit();

create or replace function public.memberships_number() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.member_settings;
begin
  select * into s from public.member_settings where org_id = new.org_id;
  if new.number is null then
    perform pg_advisory_xact_lock(hashtextextended('memberships:' || new.org_id, 0));
    select m.number, m.member_no into new.number, new.member_no from public.memberships m
      where m.org_id = new.org_id and m.contact_id = new.contact_id and m.number is not null order by m.starts_on desc limit 1;
    if new.number is null then
      select greatest(coalesce(max(m.number), 0) + 1, coalesce(s.number_start, 1)) into new.number from public.memberships m where m.org_id = new.org_id;
    end if;
  end if;
  if new.member_no is null then
    new.member_no := public.format_document_number(coalesce(s.number_format, '{N}'), new.number, new.starts_on);
  end if;
  if new.mandate_ref is null and new.iban is not null then
    new.mandate_ref := 'M' || lpad(new.number::text, 6, '0');
  end if;
  return new;
end $$;
