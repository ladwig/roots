-- Files (core, every org): documents, scans, images attached to any record or kept in folders.
-- Private bucket "files", paths orgs/<org_id>/<uuid>.<ext>. The browser uploads straight to Storage, then a
-- server action registers the row here. Reads only via short signed URLs (/files/<id>).
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 26214400)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

create table public.files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  name text not null check (length(name) between 1 and 255),
  path text not null unique,
  mime text not null default 'application/octet-stream' check (length(mime) <= 200),
  size bigint not null default 0 check (size >= 0),
  -- Attached to a record of any module ("contacts", "events", "invoices", …), or loose with an optional folder.
  entity text check (entity ~ '^[a-z_]{1,40}$'),
  entity_id uuid,
  folder text check (length(folder) between 1 and 200),
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  check ((entity is null) = (entity_id is null)),
  check (path like 'orgs/' || org_id || '/%')
);
create index files_org on public.files (org_id, created_at desc);
create index files_entity on public.files (entity, entity_id) where entity is not null;
select public.enable_audit('public.files');
-- ponytail: purging a row leaves its object in the bucket; sweep orphaned objects in the purge cron if storage grows.
select public.enable_soft_delete('public.files', 'org_id', 'org.files.manage', 30);

alter table public.files enable row level security;
revoke all on public.files from anon;
create policy "members view files" on public.files for select to authenticated
  using (public.has_perm(org_id, 'org.files.view'));
create policy "managers add files" on public.files for insert to authenticated
  with check (public.has_perm(org_id, 'org.files.manage'));
create policy "managers edit files" on public.files for update to authenticated
  using (public.has_perm(org_id, 'org.files.manage'))
  with check (public.has_perm(org_id, 'org.files.manage'));
-- no delete policy: soft_delete() / purge only
revoke update (org_id, path, mime, size) on public.files from authenticated;

-- Storage: the org in orgs/<org>/… decides who may read (signed URLs) and upload.
create function public.file_org(p_name text) returns uuid
language sql stable set search_path = '' as $$
  select case when (storage.foldername(p_name))[1] = 'orgs' and (storage.foldername(p_name))[2] ~ '^[0-9a-f-]{36}$'
    then ((storage.foldername(p_name))[2])::uuid end
$$;

create policy "files: read" on storage.objects for select to authenticated
  using (bucket_id = 'files' and public.has_perm(public.file_org(name), 'org.files.view'));
create policy "files: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and public.has_perm(public.file_org(name), 'org.files.manage'));
