-- HR module: the employee (who, on what terms, absences, org chart, payroll prep). Shifts stay planning + time;
-- HR reads approved hours from a linked shift team member (employees.staff_id).
-- Two tables on purpose: `employees` (hr.view: name, job, contract, manager) and `employee_private`
-- (hr.manage only: address, bank, tax and social security data).

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  staff_id uuid references public.staff on delete set null,       -- shift team member (hours come from there)
  user_id uuid references auth.users on delete set null,          -- has a login (org member)
  name text not null check (length(trim(name)) between 1 and 200),
  email text check (length(email) <= 320),
  phone text check (length(phone) <= 50),
  job_title text check (length(job_title) <= 100),
  department text check (length(department) <= 100),
  manager_id uuid references public.employees on delete set null, -- org chart: reports to
  employment_type text not null default 'part_time'
    check (employment_type in ('full_time', 'part_time', 'minijob', 'working_student', 'trainee', 'freelance', 'volunteer', 'other')),
  starts_on date,
  ends_on date check (ends_on >= starts_on),
  pay_type text not null default 'hourly' check (pay_type in ('hourly', 'monthly', 'none')),
  hourly_rate_cents int check (hourly_rate_cents >= 0),
  monthly_salary_cents int check (monthly_salary_cents >= 0),
  weekly_hours numeric(5, 2) check (weekly_hours between 0 and 80),
  vacation_days numeric(4, 1) check (vacation_days between 0 and 365), -- per year
  notes text check (length(notes) <= 5000),
  deleted_at timestamptz, deleted_by uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  check (manager_id <> id)
);
create unique index employees_staff on public.employees (staff_id) where staff_id is not null and deleted_at is null;
create index employees_org on public.employees (org_id, name);
create index employees_manager on public.employees (manager_id);
select public.enable_audit('public.employees');
select public.enable_soft_delete('public.employees', 'org_id', 'hr.manage', 30);

create table public.employee_private (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  employee_id uuid not null unique references public.employees on delete cascade,
  birthday date,
  street text check (length(street) <= 200),
  postal_code text check (length(postal_code) <= 20),
  city text check (length(city) <= 100),
  country text check (length(country) <= 2),
  nationality text check (length(nationality) <= 60),
  iban text check (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$'),
  bic text check (length(bic) <= 11),
  tax_id text check (tax_id ~ '^[0-9]{11}$'),                       -- Steuer-ID
  tax_class text check (tax_class in ('1', '2', '3', '4', '5', '6')),
  social_security_no text check (length(social_security_no) <= 20), -- Sozialversicherungsnummer
  health_insurance text check (length(health_insurance) <= 100),
  emergency_contact text check (length(emergency_contact) <= 300),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
select public.enable_audit('public.employee_private');

create table public.absences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  employee_id uuid not null references public.employees on delete cascade,
  kind text not null check (kind in ('vacation', 'sick', 'unpaid', 'other')),
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  half_day boolean not null default false,                         -- only for one-day absences
  note text check (length(note) <= 500),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  check (not half_day or starts_on = ends_on)
);
create index absences_org on public.absences (org_id, starts_on);
create index absences_employee on public.absences (employee_id, starts_on);
select public.enable_audit('public.absences');

alter table public.employees enable row level security;
alter table public.employee_private enable row level security;
alter table public.absences enable row level security;
revoke all on public.employees, public.employee_private, public.absences from anon;

create function public.hr_refs_ok(p_org uuid, p_staff uuid, p_manager uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (p_staff is null or exists (select 1 from public.staff where id = p_staff and org_id = p_org))
    and (p_manager is null or exists (select 1 from public.employees where id = p_manager and org_id = p_org))
    and (p_user is null or exists (select 1 from public.org_members where user_id = p_user and org_id = p_org));
$$;
create function public.hr_employee_ok(p_org uuid, p_employee uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.employees where id = p_employee and org_id = p_org);
$$;

-- Employees: hr.view sees everyone; people see their own row.
create policy "see employees" on public.employees for select to authenticated
  using (public.module_enabled(org_id, 'hr') and (public.has_perm(org_id, 'hr.view') or user_id = (select auth.uid())));
create policy "manage employees" on public.employees for all to authenticated
  using (public.module_enabled(org_id, 'hr') and public.has_perm(org_id, 'hr.manage'))
  with check (public.module_enabled(org_id, 'hr') and public.has_perm(org_id, 'hr.manage') and public.hr_refs_ok(org_id, staff_id, manager_id, user_id));
create policy "manage private data" on public.employee_private for all to authenticated
  using (public.module_enabled(org_id, 'hr') and public.has_perm(org_id, 'hr.manage'))
  with check (public.module_enabled(org_id, 'hr') and public.has_perm(org_id, 'hr.manage') and public.hr_employee_ok(org_id, employee_id));
create policy "see absences" on public.absences for select to authenticated
  using (public.module_enabled(org_id, 'hr') and (public.has_perm(org_id, 'hr.view')
    or exists (select 1 from public.employees e where e.id = employee_id and e.user_id = (select auth.uid()))));
create policy "manage absences" on public.absences for all to authenticated
  using (public.module_enabled(org_id, 'hr') and public.has_perm(org_id, 'hr.manage'))
  with check (public.module_enabled(org_id, 'hr') and public.has_perm(org_id, 'hr.manage') and public.hr_employee_ok(org_id, employee_id));

-- New module key (and the website builder's leftover "sites" key goes).
create or replace function public.default_module_keys() returns text[]
language sql immutable set search_path = '' as $$
  select array['crm', 'payments', 'events', 'tickets', 'guestlists', 'invoices', 'shifts', 'members', 'forms', 'email', 'hr']
$$;
delete from public.org_modules where module_key = 'sites';
insert into public.org_modules (org_id, module_key) select id, 'hr' from public.orgs on conflict do nothing;

-- Employee documents (contracts, payslips …) are HR data: only hr.manage sees, adds or edits files attached to an
-- employee, however broad someone's file permissions are.
create function public.file_allowed(p_org uuid, p_entity text, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_perm(p_org, p_perm) and (p_entity is distinct from 'employees' or public.has_perm(p_org, 'hr.manage'));
$$;
drop policy "members view files" on public.files;
drop policy "managers add files" on public.files;
drop policy "managers edit files" on public.files;
create policy "members view files" on public.files for select to authenticated
  using (public.file_allowed(org_id, entity, 'org.files.view'));
create policy "managers add files" on public.files for insert to authenticated
  with check (public.file_allowed(org_id, entity, 'org.files.manage'));
create policy "managers edit files" on public.files for update to authenticated
  using (public.file_allowed(org_id, entity, 'org.files.manage'))
  with check (public.file_allowed(org_id, entity, 'org.files.manage'));
-- Stored objects are readable only through a file row the reader may see (no guessing paths inside the org).
drop policy "files: read" on storage.objects;
create policy "files: read" on storage.objects for select to authenticated
  using (bucket_id = 'files' and exists (select 1 from public.files f where f.path = storage.objects.name));
