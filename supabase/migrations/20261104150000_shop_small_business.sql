-- The shop shows VAT per rate (or the § 19 UStG note): public pages need to know whether the org is a small business
-- (Kleinunternehmer, invoice settings). Only that flag, no other billing data.
create or replace function public.shop_public_settings(p_org uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public.shop_public(p_org) then coalesce((
    select jsonb_build_object('title', s.title, 'intro', s.intro, 'pay_online', s.pay_online, 'pay_transfer', s.pay_transfer,
      'pay_on_pickup', s.pay_on_pickup, 'pickup', s.pickup, 'pickup_text', s.pickup_text, 'shipping', s.shipping,
      'shipping_rates', s.shipping_rates, 'terms', s.terms, 'withdrawal', s.withdrawal)
    from public.shop_settings s where s.org_id = p_org
  ), jsonb_build_object('pay_online', true, 'pay_transfer', false, 'pay_on_pickup', false, 'pickup', true, 'shipping', false, 'shipping_rates', '[]'::jsonb))
  || jsonb_build_object('small_business', exists (select 1 from public.org_billing b where b.org_id = p_org and b.tax_mode = 'small_business')) end
$$;
