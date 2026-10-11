-- Fulfilment is tracked separately from payment, so a failed fulfilment is retried on the next webhook delivery.
alter table public.pay_orders add column fulfilled_at timestamptz;

-- save_integration gets a status (redirect onboarding like Stripe starts as 'pending').
drop function public.save_integration(uuid, text, jsonb, text, timestamptz);
create function public.save_integration(
  p_org uuid, p_provider text, p_config jsonb, p_secret text default null, p_expires_at timestamptz default null,
  p_status text default 'connected'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_secret uuid;
  v_id uuid;
begin
  if not (public.has_perm(p_org, 'org.integrations.manage') or auth.role() = 'service_role') then
    raise exception 'not_allowed';
  end if;
  select secret_id into v_secret from public.org_integrations where org_id = p_org and provider = p_provider;
  if p_secret is not null then
    if v_secret is null then
      v_secret := vault.create_secret(p_secret, 'integration:' || p_org || ':' || p_provider);
    else
      perform vault.update_secret(v_secret, p_secret);
    end if;
  end if;
  insert into public.org_integrations (org_id, provider, config, secret_id, expires_at, status)
  values (p_org, p_provider, coalesce(p_config, '{}'), v_secret, p_expires_at, p_status)
  on conflict (org_id, provider) do update
    set config = excluded.config, secret_id = excluded.secret_id, expires_at = excluded.expires_at,
        status = excluded.status, last_error = null
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.save_integration(uuid, text, jsonb, text, timestamptz, text) from public, anon;
