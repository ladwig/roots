-- Fix: least(null, 20) is 20 in Postgres, so the {RANDn} loop never ended without a {RAND} placeholder.
create or replace function public.format_document_number(p_format text, p_n int, p_date date, p_birth date default null) returns text
language plpgsql volatile set search_path = '' as $$
declare v text := p_format; m text; k int;
begin
  v := replace(replace(replace(v, '{YYYY}', to_char(p_date, 'YYYY')), '{YY}', to_char(p_date, 'YY')), '{MM}', to_char(p_date, 'MM'));
  v := replace(replace(v, '{BYYYY}', coalesce(to_char(p_birth, 'YYYY'), '0000')), '{BY}', coalesce(to_char(p_birth, 'YY'), '00'));
  loop
    m := substring(v from '\{RAND([0-9]+)\}');
    exit when m is null;
    k := least(greatest(m::int, 1), 20);
    v := regexp_replace(v, '\{RAND[0-9]+\}', (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 32), 1), '')
      from extensions.gen_random_bytes(k) b, generate_series(0, k - 1) i));
  end loop;
  m := substring(v from '\{(N+)\}');
  if m is not null then v := replace(v, '{' || m || '}', lpad(p_n::text, greatest(length(m), length(p_n::text)), '0')); end if;
  return v;
end $$;
