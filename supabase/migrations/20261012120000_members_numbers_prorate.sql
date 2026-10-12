-- Member number format (like invoice numbers), pro-rated fees per type, dues reminders.
alter table public.member_settings
  add column number_format text not null default '{N}' check (number_format ~ '\{N+\}' and length(number_format) <= 40),
  add column number_start int not null default 1 check (number_start >= 1);
alter table public.memberships add column member_no text check (length(member_no) <= 60);
revoke update (member_no) on public.memberships from authenticated;
alter table public.membership_types add column prorate boolean not null default false; -- part periods on joining/leaving cost per month
alter table public.member_dues add column reminded_at timestamptz, add column reminders int not null default 0;

-- Next number = max(highest so far + 1, start); the contact's earlier number when it rejoins. member_no = formatted.
create or replace function public.memberships_number() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.member_settings;
begin
  if new.number is null then
    perform pg_advisory_xact_lock(hashtextextended('memberships:' || new.org_id, 0));
    select m.number, m.member_no into new.number, new.member_no from public.memberships m
      where m.org_id = new.org_id and m.contact_id = new.contact_id and m.number is not null order by m.starts_on desc limit 1;
    if new.number is null then
      select * into s from public.member_settings where org_id = new.org_id;
      select greatest(coalesce(max(m.number), 0) + 1, coalesce(s.number_start, 1)) into new.number from public.memberships m where m.org_id = new.org_id;
      new.member_no := public.format_document_number(coalesce(s.number_format, '{N}'), new.number, new.starts_on);
    end if;
  end if;
  if new.member_no is null then new.member_no := new.number::text; end if;
  if new.mandate_ref is null and new.iban is not null then
    new.mandate_ref := 'M' || lpad(new.number::text, 6, '0');
  end if;
  return new;
end $$;

update public.memberships set member_no = number::text where member_no is null;
