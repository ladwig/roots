-- Cash book (module "cashbook"): accounts (cash boxes, bank accounts), entries with receipts, month closings with a
-- cash count. Money: entries are never changed or deleted; a mistake is corrected by a reversal entry. Closed months
-- take no new entries. Entry numbers come from the 'cash' number range (gap-free, per year by default).

create or replace function public.default_module_keys() returns text[]
language sql immutable set search_path = '' as $$
  select array['crm', 'payments', 'events', 'tickets', 'guestlists', 'invoices', 'shifts', 'members', 'forms', 'email', 'hr', 'courses', 'automations', 'reports', 'cashbook']
$$;
insert into public.org_modules (org_id, module_key) select id, 'cashbook' from public.orgs on conflict do nothing;

alter table public.number_ranges drop constraint number_ranges_kind_check;
alter table public.number_ranges add constraint number_ranges_kind_check check (kind in ('invoice', 'quote', 'cancellation', 'member', 'cash'));
create or replace function public.number_range_module(p_kind text) returns text
language sql immutable set search_path = '' as $$
  select case p_kind when 'member' then 'members' when 'cash' then 'cashbook' else 'invoices' end;
$$;

create table public.cash_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  kind text not null default 'cash' check (kind in ('cash', 'bank')),
  opening_cents int not null default 0,
  opening_on date not null default current_date,
  active boolean not null default true,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index cash_accounts_org on public.cash_accounts (org_id);
select public.enable_audit('public.cash_accounts');

create table public.cash_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  account_id uuid not null references public.cash_accounts on delete restrict,
  number text check (length(number) <= 60),
  booked_on date not null,
  amount_cents int not null check (amount_cents <> 0),               -- + income, − expense
  description text not null check (length(trim(description)) between 1 and 300),
  category text check (length(category) <= 100),
  sphere text check (sphere in ('ideal', 'asset', 'purpose', 'commercial')), -- ideeller Bereich, Vermögensverwaltung, Zweckbetrieb, wirtschaftl. Geschäftsbetrieb
  counterparty text check (length(counterparty) <= 200),
  contact_id uuid references public.contacts on delete set null,
  document_id uuid references public.documents on delete set null,  -- the invoice this payment settles
  reverses_id uuid references public.cash_entries on delete restrict unique, -- this entry reverses that one
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index cash_entries_account on public.cash_entries (account_id, booked_on);
create index cash_entries_org on public.cash_entries (org_id, booked_on desc);
create index cash_entries_contact on public.cash_entries (contact_id);
create index cash_entries_document on public.cash_entries (document_id);
select public.enable_audit('public.cash_entries');

create table public.cash_closings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  account_id uuid not null references public.cash_accounts on delete restrict,
  month date not null check (extract(day from month) = 1),          -- first day of the closed month
  balance_cents int not null,                                       -- computed balance at the end of the month
  counted_cents int,                                                -- cash count (Kassensturz), optional
  note text check (length(note) <= 1000),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  unique (account_id, month)
);
create index cash_closings_org on public.cash_closings (org_id);
select public.enable_audit('public.cash_closings');

-- Entries: number on insert, account of the same org, not in a closed month; afterwards frozen.
create function public.cash_entries_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_format text; v_n int;
begin
  -- Frozen. Exceptions: the whole org is deleted, or a linked contact/invoice disappears (link set to null).
  if tg_op = 'DELETE' then
    if exists (select 1 from public.orgs where id = old.org_id) then raise exception 'cash_entry_locked'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'contact_id' - 'document_id' - 'updated_at' - 'updated_by') = (to_jsonb(old) - 'contact_id' - 'document_id' - 'updated_at' - 'updated_by') then return new; end if;
    raise exception 'cash_entry_locked';
  end if;
  if not exists (select 1 from public.cash_accounts where id = new.account_id and org_id = new.org_id) then raise exception 'not_allowed'; end if;
  if exists (select 1 from public.cash_closings where account_id = new.account_id and month >= date_trunc('month', new.booked_on)::date) then
    raise exception 'cash_month_closed';
  end if;
  insert into public.number_ranges (org_id, kind, format, yearly_reset) values (new.org_id, 'cash', 'K-{YYYY}-{NNNN}', true)
    on conflict (org_id, kind) do nothing;
  select format into v_format from public.number_ranges where org_id = new.org_id and kind = 'cash';
  loop
    v_n := public.take_number(new.org_id, 'cash', new.booked_on);
    new.number := public.format_document_number(v_format, v_n, new.booked_on);
    exit when not exists (select 1 from public.cash_entries where org_id = new.org_id and number = new.number);
  end loop;
  return new;
end $$;
revoke execute on function public.cash_entries_guard() from public, anon, authenticated;
create trigger cash_entries_guard before insert or update or delete on public.cash_entries for each row execute function public.cash_entries_guard();

-- Closings: only after the month ended, balance computed here (not trusted from the client), never changed.
create function public.cash_closings_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.orgs where id = old.org_id) then return old; end if; -- org deleted
  if tg_op <> 'INSERT' then raise exception 'cash_month_closed'; end if;
  if not exists (select 1 from public.cash_accounts where id = new.account_id and org_id = new.org_id) then raise exception 'not_allowed'; end if;
  if (new.month + interval '1 month')::date > (now() at time zone 'Europe/Berlin')::date then raise exception 'cash_month_open'; end if;
  new.balance_cents := (select a.opening_cents + coalesce((select sum(e.amount_cents) from public.cash_entries e
    where e.account_id = a.id and e.booked_on < (new.month + interval '1 month')::date), 0) from public.cash_accounts a where a.id = new.account_id);
  return new;
end $$;
revoke execute on function public.cash_closings_guard() from public, anon, authenticated;
create trigger cash_closings_guard before insert or update or delete on public.cash_closings for each row execute function public.cash_closings_guard();

alter table public.cash_accounts enable row level security;
alter table public.cash_entries enable row level security;
alter table public.cash_closings enable row level security;
revoke all on public.cash_accounts, public.cash_entries, public.cash_closings from anon;

create policy "view cash accounts" on public.cash_accounts for select to authenticated
  using (public.module_enabled(org_id, 'cashbook') and (public.has_perm(org_id, 'cashbook.view') or public.has_perm(org_id, 'cashbook.manage')));
create policy "manage cash accounts" on public.cash_accounts for all to authenticated
  using (public.module_enabled(org_id, 'cashbook') and public.has_perm(org_id, 'cashbook.manage'))
  with check (public.module_enabled(org_id, 'cashbook') and public.has_perm(org_id, 'cashbook.manage'));
create policy "view cash entries" on public.cash_entries for select to authenticated
  using (public.module_enabled(org_id, 'cashbook') and (public.has_perm(org_id, 'cashbook.view') or public.has_perm(org_id, 'cashbook.manage')));
create policy "add cash entries" on public.cash_entries for insert to authenticated
  with check (public.module_enabled(org_id, 'cashbook') and public.has_perm(org_id, 'cashbook.manage'));
create policy "view cash closings" on public.cash_closings for select to authenticated
  using (public.module_enabled(org_id, 'cashbook') and (public.has_perm(org_id, 'cashbook.view') or public.has_perm(org_id, 'cashbook.manage')));
create policy "add cash closings" on public.cash_closings for insert to authenticated
  with check (public.module_enabled(org_id, 'cashbook') and public.has_perm(org_id, 'cashbook.manage'));
