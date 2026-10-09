-- Profile pictures and org logos. One public bucket (logos show on public pages; paths are random).
-- Paths: users/<user_id>/<random>.<ext>, orgs/<org_id>/<random>.<ext>. The DB stores the path, not a URL.
alter table public.profiles add column avatar_path text check (avatar_path ~ '^users/');
alter table public.orgs add column logo_path text check (logo_path ~ '^orgs/');
grant update (avatar_path) on public.profiles to authenticated;
grant update (logo_path) on public.orgs to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Who may write under a path: your own users/<id>/ folder, or orgs/<id>/ with org.settings.manage.
create function public.can_write_image(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case (storage.foldername(p_name))[1]
    when 'users' then (storage.foldername(p_name))[2] = (select auth.uid())::text
    when 'orgs' then (storage.foldername(p_name))[2] ~ '^[0-9a-f-]{36}$'
      and public.has_perm(((storage.foldername(p_name))[2])::uuid, 'org.settings.manage')
    else false
  end
$$;
revoke all on function public.can_write_image(text) from public, anon;
grant execute on function public.can_write_image(text) to authenticated;

-- Reads go through the public URL (no policy needed); uploads/removals are checked here.
create policy "images: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and public.can_write_image(name));
create policy "images: replace own" on storage.objects for update to authenticated
  using (bucket_id = 'images' and public.can_write_image(name));
create policy "images: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'images' and public.can_write_image(name));
