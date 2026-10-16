-- Sprout, the in-App assistant. Bring your own key: every person stores their own key per AI provider (Anthropic,
-- OpenAI, Google, xAI); the key itself lives in Vault, the row only keeps a hint (last 4) and the models the key offers.
-- Chats are private to their person and org. Not audited on purpose: the content is private conversation (the change
-- log would copy every message, readable by platform admins); the record changes the assistant makes are audited as usual.

create table public.ai_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  provider text not null check (provider in ('anthropic', 'openai', 'google', 'xai')),
  hint text not null default '' check (length(hint) <= 20),
  secret_id uuid,
  models jsonb not null default '[]' check (jsonb_typeof(models) = 'array'), -- [{ id, name }] as the provider listed them
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  unique (user_id, provider)
);
alter table public.ai_keys enable row level security;
revoke all on public.ai_keys from anon;
revoke insert, update, delete on public.ai_keys from authenticated;
create policy "own keys" on public.ai_keys for select to authenticated using (user_id = (select auth.uid()));

-- Save (or replace) the signed-in person's key for a provider; checked against the provider before by the server.
create function public.save_ai_key(p_provider text, p_key text, p_hint text, p_models jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_secret uuid;
begin
  if v_user is null then raise exception 'not_allowed'; end if;
  select secret_id into v_secret from public.ai_keys where user_id = v_user and provider = p_provider;
  if v_secret is null then v_secret := vault.create_secret(p_key, 'ai_key:' || v_user || ':' || p_provider);
  else perform vault.update_secret(v_secret, p_key); end if;
  insert into public.ai_keys (user_id, provider, hint, secret_id, models) values (v_user, p_provider, left(p_hint, 20), v_secret, coalesce(p_models, '[]'))
  on conflict (user_id, provider) do update set hint = excluded.hint, secret_id = excluded.secret_id, models = excluded.models, updated_at = now();
end $$;

create function public.delete_ai_key(p_provider text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_secret uuid;
begin
  delete from public.ai_keys where user_id = auth.uid() and provider = p_provider returning secret_id into v_secret;
  if v_secret is not null then delete from vault.secrets where id = v_secret; end if;
end $$;

create function public.get_ai_key(p_user uuid, p_provider text) returns text
language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret from public.ai_keys k join vault.decrypted_secrets s on s.id = k.secret_id
  where k.user_id = p_user and k.provider = p_provider;
$$;

revoke execute on function public.save_ai_key(text, text, text, jsonb), public.delete_ai_key(text) from public, anon;
grant execute on function public.save_ai_key(text, text, text, jsonb), public.delete_ai_key(text) to authenticated;
revoke execute on function public.get_ai_key(uuid, text) from public, anon, authenticated;
grant execute on function public.get_ai_key(uuid, text) to service_role;

-- Chats: one row per conversation, the messages (AI SDK UI messages) as one jsonb list.
-- ponytail: whole list rewritten per turn; a messages table once chats get very long.
create table public.assistant_chats (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  title text not null default '' check (length(title) <= 200),
  starred boolean not null default false,
  model text not null default '' check (length(model) <= 200), -- "provider:model id"
  messages jsonb not null default '[]' check (jsonb_typeof(messages) = 'array'),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index assistant_chats_mine on public.assistant_chats (user_id, org_id, updated_at desc);
create index assistant_chats_org on public.assistant_chats (org_id);
alter table public.assistant_chats enable row level security;
revoke all on public.assistant_chats from anon;
create policy "own chats" on public.assistant_chats for all to authenticated
  using (user_id = (select auth.uid()) and public.is_member(org_id))
  with check (user_id = (select auth.uid()) and public.is_member(org_id));
