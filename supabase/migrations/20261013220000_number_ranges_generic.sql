-- Number ranges become one tool for every running number: invoice, quote, member (later customer numbers etc.).
-- Format placeholders: {N…} running number (N count = digits), {YYYY} {YY} {MM} date, {BYYYY} {BY} birth year,
-- {RANDn} n random characters (no look-alikes). Needs {N…} or {RANDn}.
-- A kind belongs to a module: its .view/.manage permissions decide who sees/changes the range.

alter table public.number_ranges drop constraint number_ranges_kind_check;
alter table public.number_ranges add constraint number_ranges_kind_check check (kind in ('invoice', 'quote', 'member'));
alter table public.number_ranges drop constraint number_ranges_format_check;
alter table public.number_ranges add constraint number_ranges_format_check check (format ~ '\{N+\}|\{RAND[0-9]+\}' and length(format) <= 60);

create function public.number_range_module(p_kind text) returns text
language sql immutable set search_path = '' as $$
  select case p_kind when 'member' then 'members' else 'invoices' end;
$$;

drop policy "view ranges" on public.number_ranges;
drop policy "manage ranges" on public.number_ranges;
create policy "view ranges" on public.number_ranges for select to authenticated
  using (public.module_enabled(org_id, public.number_range_module(kind))
    and (public.has_perm(org_id, public.number_range_module(kind) || '.view') or public.has_perm(org_id, public.number_range_module(kind) || '.manage')));
create policy "manage ranges" on public.number_ranges for all to authenticated
  using (public.module_enabled(org_id, public.number_range_module(kind)) and public.has_perm(org_id, public.number_range_module(kind) || '.manage'))
  with check (public.module_enabled(org_id, public.number_range_module(kind)) and public.has_perm(org_id, public.number_range_module(kind) || '.manage'));

-- Volatile now ({RANDn}); the birth year is optional.
drop function public.format_document_number(text, int, date);
create function public.format_document_number(p_format text, p_n int, p_date date, p_birth date default null) returns text
language plpgsql volatile set search_path = '' as $$
declare v text := p_format; m text; k int;
begin
  v := replace(replace(replace(v, '{YYYY}', to_char(p_date, 'YYYY')), '{YY}', to_char(p_date, 'YY')), '{MM}', to_char(p_date, 'MM'));
  v := replace(replace(v, '{BYYYY}', coalesce(to_char(p_birth, 'YYYY'), '0000')), '{BY}', coalesce(to_char(p_birth, 'YY'), '00'));
  loop
    k := least(substring(v from '\{RAND([0-9]+)\}')::int, 20);
    exit when k is null;
    v := regexp_replace(v, '\{RAND[0-9]+\}', coalesce((select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 32), 1), '')
      from extensions.gen_random_bytes(greatest(k, 1)) b, generate_series(0, k - 1) i), ''));
  end loop;
  m := substring(v from '\{(N+)\}');
  if m is not null then v := replace(v, '{' || m || '}', lpad(p_n::text, greatest(length(m), length(p_n::text)), '0')); end if;
  return v;
end $$;

-- The next number of a range (row locked until the transaction ends; yearly reset). Callers check it's unused.
create function public.take_number(p_org uuid, p_kind text, p_date date) returns int
language plpgsql security definer set search_path = '' as $$
declare r public.number_ranges; v_year int := extract(year from p_date); v_n int;
begin
  select * into r from public.number_ranges where org_id = p_org and kind = p_kind for update;
  if r.id is null then raise exception 'range_missing'; end if;
  v_n := case when r.yearly_reset and r.year is not null and r.year <> v_year then 1 else r.next_number end;
  update public.number_ranges set next_number = v_n + 1, year = v_year where id = r.id;
  return v_n;
end $$;
revoke execute on function public.take_number(uuid, text, date) from public, anon, authenticated;

-- Members: the format + start move from member_settings into the 'member' range.
insert into public.number_ranges (org_id, kind, format, next_number, yearly_reset)
select s.org_id, 'member', s.number_format,
  greatest(s.number_start, coalesce((select max(m.number) + 1 from public.memberships m where m.org_id = s.org_id), 1)), false
from public.member_settings s
on conflict (org_id, kind) do nothing;

-- Member number: rejoining keeps the old one; otherwise the next of the org's member range. `number` stays the
-- internal running number (mandate references).
create or replace function public.memberships_number() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_format text; v_birth date; v_n int;
begin
  if new.number is null then
    perform pg_advisory_xact_lock(hashtextextended('memberships:' || new.org_id, 0));
    select m.number, m.member_no into new.number, new.member_no from public.memberships m
      where m.org_id = new.org_id and m.contact_id = new.contact_id and m.number is not null order by m.starts_on desc limit 1;
    if new.number is null then
      select coalesce(max(m.number), 0) + 1 into new.number from public.memberships m where m.org_id = new.org_id;
    end if;
  end if;
  if new.member_no is null then
    insert into public.number_ranges (org_id, kind, format, next_number, yearly_reset) values (new.org_id, 'member', '{N}', new.number, false)
      on conflict (org_id, kind) do nothing;
    select format into v_format from public.number_ranges where org_id = new.org_id and kind = 'member';
    select birthday into v_birth from public.contacts where id = new.contact_id;
    loop
      v_n := public.take_number(new.org_id, 'member', new.starts_on);
      new.member_no := public.format_document_number(v_format, v_n, new.starts_on, v_birth);
      exit when not exists (select 1 from public.memberships m where m.org_id = new.org_id and m.member_no = new.member_no);
    end loop;
  end if;
  if new.mandate_ref is null and new.iban is not null then
    new.mandate_ref := 'M' || lpad(new.number::text, 6, '0');
  end if;
  return new;
end $$;
