-- Members (module "members", for Vereine). A person stays a contact; a membership is a period on that contact,
-- like a subscription: active = started and not ended. Dues are money rows (never deleted, only status);
-- a SEPA run bundles open dues into one pain.008 file for the org's online banking. roots moves no money here.

alter table public.org_billing add column sepa_creditor_id text check (sepa_creditor_id ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{3}[A-Z0-9]{1,28}$'); -- Gläubiger-ID

create table public.membership_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  name text not null check (length(name) between 1 and 100),
  fee_cents int not null default 0 check (fee_cents between 0 and 100000000),
  interval text not null default 'year' check (interval in ('month', 'quarter', 'half_year', 'year', 'none')),
  entry_fee_cents int not null default 0 check (entry_fee_cents between 0 and 100000000),
  notice_months int not null default 0 check (notice_months between 0 and 24),
  active boolean not null default true,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index membership_types_org on public.membership_types (org_id);
select public.enable_audit('public.membership_types');

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  contact_id uuid not null references public.contacts,
  type_id uuid not null references public.membership_types,
  number int check (number > 0),                       -- set by trigger; a rejoining contact keeps its number
  starts_on date not null default current_date,
  ends_on date,
  -- SEPA direct debit mandate (not secrets; never in public views)
  account_holder text check (length(account_holder) <= 70),
  iban text check (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$'),
  bic text check (bic ~ '^[A-Z0-9]{8}([A-Z0-9]{3})?$'),
  mandate_ref text check (mandate_ref ~ '^[A-Za-z0-9+?/:().,'' -]{1,35}$'),
  mandate_signed_on date,
  note text check (length(note) <= 5000),
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  check (ends_on is null or ends_on >= starts_on),
  check ((iban is null) = (mandate_ref is null))
);
create index memberships_org on public.memberships (org_id, number);
create index memberships_contact on public.memberships (contact_id);
select public.enable_audit('public.memberships');
select public.enable_soft_delete('public.memberships', 'org_id', 'members.manage', 30);

-- Member numbers: next free number per org, or the contact's earlier number when it rejoins.
create function public.memberships_number() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.number is null then
    perform pg_advisory_xact_lock(hashtextextended('memberships:' || new.org_id, 0));
    select m.number into new.number from public.memberships m
      where m.org_id = new.org_id and m.contact_id = new.contact_id and m.number is not null order by m.starts_on desc limit 1;
    if new.number is null then
      select coalesce(max(m.number), 0) + 1 into new.number from public.memberships m where m.org_id = new.org_id;
    end if;
  end if;
  if new.mandate_ref is null and new.iban is not null then
    new.mandate_ref := 'M' || lpad(new.number::text, 6, '0');
  end if;
  return new;
end $$;
revoke execute on function public.memberships_number() from public, anon, authenticated;
create trigger memberships_number before insert on public.memberships for each row execute function public.memberships_number();

-- Dues: one row per amount a member owes (period fee, entry fee, levy).
create table public.member_dues (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  membership_id uuid not null references public.memberships,
  kind text not null check (kind in ('fee', 'entry', 'levy')),
  description text not null check (length(description) between 1 and 140),
  amount_cents int not null check (amount_cents > 0),
  period_start date,
  due_on date not null,
  status text not null default 'open' check (status in ('open', 'paid', 'cancelled')),
  paid_on date,
  run_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
-- A period fee exists once per membership and period (generating twice is harmless).
create unique index member_dues_period on public.member_dues (membership_id, period_start) where kind = 'fee';
create unique index member_dues_entry on public.member_dues (membership_id) where kind = 'entry';
create index member_dues_org on public.member_dues (org_id, status, due_on);
select public.enable_audit('public.member_dues');

-- SEPA collection runs (pain.008 export). Dues stay "open" until the treasurer marks the run as collected.
create table public.sepa_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  collection_on date not null,
  message_id text not null unique default 'ROOTS-' || replace(gen_random_uuid()::text, '-', ''),
  count int not null default 0,
  total_cents bigint not null default 0,
  status text not null default 'exported' check (status in ('exported', 'collected', 'cancelled')),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index sepa_runs_org on public.sepa_runs (org_id, created_at desc);
select public.enable_audit('public.sepa_runs');
alter table public.member_dues add constraint member_dues_run foreign key (run_id) references public.sepa_runs on delete set null;

-- RLS: members.view reads, members.manage writes. No delete policies (soft delete / money stays).
alter table public.membership_types enable row level security;
alter table public.memberships enable row level security;
alter table public.member_dues enable row level security;
alter table public.sepa_runs enable row level security;
revoke all on public.membership_types, public.memberships, public.member_dues, public.sepa_runs from anon;
do $$
declare tbl text;
begin
  foreach tbl in array array['membership_types', 'memberships', 'member_dues', 'sepa_runs'] loop
    execute format('create policy "members view" on public.%I for select to authenticated using (public.module_enabled(org_id, ''members'') and public.has_perm(org_id, ''members.view''))', tbl);
    execute format('create policy "managers add" on public.%I for insert to authenticated with check (public.module_enabled(org_id, ''members'') and public.has_perm(org_id, ''members.manage''))', tbl);
    execute format('create policy "managers edit" on public.%I for update to authenticated using (public.module_enabled(org_id, ''members'') and public.has_perm(org_id, ''members.manage'')) with check (public.module_enabled(org_id, ''members'') and public.has_perm(org_id, ''members.manage''))', tbl);
  end loop;
end $$;
create policy "managers delete types" on public.membership_types for delete to authenticated
  using (public.module_enabled(org_id, 'members') and public.has_perm(org_id, 'members.manage'));
revoke update (org_id, membership_id, kind, amount_cents) on public.member_dues from authenticated;
revoke update (org_id, contact_id, number) on public.memberships from authenticated;

-- Related rows must belong to the same org.
create function public.memberships_same_org() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'memberships' then
    if not exists (select 1 from public.contacts c where c.id = new.contact_id and c.org_id = new.org_id)
      or not exists (select 1 from public.membership_types t where t.id = new.type_id and t.org_id = new.org_id) then
      raise exception 'not_allowed';
    end if;
  elsif not exists (select 1 from public.memberships m where m.id = new.membership_id and m.org_id = new.org_id)
    or (new.run_id is not null and not exists (select 1 from public.sepa_runs r where r.id = new.run_id and r.org_id = new.org_id)) then
    raise exception 'not_allowed';
  end if;
  return new;
end $$;
revoke execute on function public.memberships_same_org() from public, anon, authenticated;
create trigger memberships_same_org before insert or update on public.memberships for each row execute function public.memberships_same_org();
create trigger member_dues_same_org before insert or update on public.member_dues for each row execute function public.memberships_same_org();

-- Event hub: membership.started / membership.ended
create function public.memberships_emit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  select nullif(trim(concat_ws(' ', c.first_name, c.last_name)), '') into v_name from public.contacts c where c.id = new.contact_id;
  if tg_op = 'INSERT' then
    perform public.emit_event(new.org_id, 'membership.started', jsonb_build_object('membership_id', new.id, 'contact_id', new.contact_id,
      'name', v_name, 'number', new.number, 'starts_at', new.starts_on), 'memberships', new.id::text);
  elsif new.ends_on is not null and old.ends_on is distinct from new.ends_on then
    perform public.emit_event(new.org_id, 'membership.ended', jsonb_build_object('membership_id', new.id, 'contact_id', new.contact_id,
      'name', v_name, 'number', new.number, 'ends_on', new.ends_on), 'memberships', new.id::text);
  end if;
  return null;
end $$;
revoke execute on function public.memberships_emit() from public, anon, authenticated;
create trigger memberships_emit after insert or update of ends_on on public.memberships for each row execute function public.memberships_emit();

-- A contact with a membership, or a membership with dues, can't go to the trash (the purge would hit them).
-- End the membership instead; dues are money and stay.
create function public.members_block_trash() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    if tg_table_name = 'contacts' and exists (select 1 from public.memberships m where m.contact_id = new.id) then
      raise exception 'contact_has_membership';
    elsif tg_table_name = 'memberships' and exists (select 1 from public.member_dues d where d.membership_id = new.id) then
      raise exception 'membership_has_dues';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.members_block_trash() from public, anon, authenticated;
create trigger contacts_block_trash before update of deleted_at on public.contacts for each row execute function public.members_block_trash();
create trigger memberships_block_trash before update of deleted_at on public.memberships for each row execute function public.members_block_trash();
