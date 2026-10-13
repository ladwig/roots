-- Employees are org members (platform users): one employee per member and org. The person (name, email) comes
-- from the member's profile when the employee is created; shift team rows of the same user are linked.
create unique index employees_user on public.employees (org_id, user_id) where user_id is not null and deleted_at is null;
