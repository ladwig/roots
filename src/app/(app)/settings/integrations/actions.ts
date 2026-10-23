"use server"

import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { getContext } from "@/lib/context"
import { back } from "@/lib/url"
import { getIntegration, type Config, type Secret } from "@/integrations/registry"
import { getSecret } from "@/integrations/server"
import { stripeAccountReady } from "@/integrations/stripe"
import { moneyCents } from "@/lib/inputs"
import { createAdminClient } from "@/lib/supabase/admin"

const PATH = "/settings/integrations"

export async function connectIntegration(provider: string, formData: FormData) {
  const ctx = await getContext()
  const t = await getT()
  const integration = getIntegration(provider)
  if (!integration?.fields) back(PATH, { error: t("errors.unknown_integration") })
  const retry = `${PATH}?connect=${provider}`

  let config: Config = {}
  const secret: Secret = {}
  for (const f of integration.fields) {
    const value = String(formData.get(f.key) ?? "").trim()
    if (f.secret) {
      if (value) secret[f.key] = value
    } else config[f.key] = value
  }
  const hasSecret = Object.keys(secret).length > 0
  if ("from_email" in config && !/^[^@\s<>]+@[^@\s<>]+\.[a-z]{2,}$/i.test(String(config.from_email))) back(retry, { error: t("integrations.senderInvalid") })

  // Check the credentials before storing them. Leaving the secret empty keeps the stored one.
  if (hasSecret && integration.test) {
    try {
      config = { ...config, ...((await integration.test(secret, config)) ?? {}) }
    } catch (e) {
      const key = e instanceof Error ? e.message : ""
      back(retry, { error: t.has(key) ? t.dynamic(key) : t("integrations.credentialsFailed") })
    }
  }

  // Keep what the provider setup stored besides the form fields (webhook id, account details …).
  const { data: existing } = await ctx.supabase.from("org_integrations").select("config").eq("org_id", ctx.org.id).eq("provider", provider).maybeSingle()
  config = { ...((existing?.config ?? {}) as Config), ...config }
  const { error } = await ctx.supabase.rpc("save_integration", {
    p_org: ctx.org.id,
    p_provider: provider,
    p_config: config as never,
    p_secret: hasSecret ? JSON.stringify(secret) : undefined,
  })
  if (error) back(retry, { error: dbError(t, error) })
  if (integration.onConnected && hasSecret) {
    try {
      await integration.onConnected({ orgId: ctx.org.id, config, secret })
    } catch (e) {
      console.error(e)
      back(retry, { error: t("integrations.connectFailed") })
    }
  }
  back(PATH, { ok: t("integrations.connected", { name: integration.name }) })
}

export async function disconnectIntegration(provider: string) {
  const ctx = await getContext()
  const t = await getT()
  const integration = getIntegration(provider)
  if (integration?.disconnect) {
    const { data: row } = await ctx.supabase.from("org_integrations").select("config").eq("org_id", ctx.org.id).eq("provider", provider).maybeSingle()
    try {
      if (row) await integration.disconnect({ orgId: ctx.org.id, config: row.config as Config, secret: await getSecret(ctx.org.id, provider) })
    } catch (e) {
      console.error(e) // e.g. already revoked at the provider: remove our side anyway
    }
  }
  const { error } = await ctx.supabase.rpc("delete_integration", { p_org: ctx.org.id, p_provider: provider })
  if (error) back(PATH, { error: dbError(t, error) })
  back(PATH, { ok: t("integrations.disconnected", { name: getIntegration(provider)?.name ?? provider }) })
}

// "Setup open" Stripe accounts (activation not finished at Stripe): ask Stripe again whether they can take payments.
export async function checkStripe() {
  const ctx = await getContext()
  const t = await getT()
  const { data: row } = await ctx.supabase.from("org_integrations").select("config").eq("org_id", ctx.org.id).eq("provider", "stripe").maybeSingle()
  const config = (row?.config ?? {}) as Config
  if (!config.accountId) back(PATH, { error: t("integrations.connectFailed") })
  const ready = await stripeAccountReady(String(config.accountId)).catch(() => false)
  const { error } = await ctx.supabase.rpc("save_integration", { p_org: ctx.org.id, p_provider: "stripe", p_config: config as never, p_status: ready ? "connected" : "pending" })
  if (error) back(PATH, { error: dbError(t, error) })
  back(PATH, ready ? { ok: t("integrations.connected", { name: "Stripe" }) } : { error: t("integrations.pendingHint", { name: "Stripe" }) })
}

/** Pass payment costs on to buyers as a service fee (Stripe/SumUp card): on/off, percent, fixed cents. */
export async function savePaymentCosts(provider: string, formData: FormData) {
  const ctx = await getContext()
  const t = await getT()
  if (!ctx.can("org.integrations.manage") || !["stripe", "sumup"].includes(provider)) back(PATH, { error: t("errors.not_allowed") })
  const percent = Number(String(formData.get("fee_percent") ?? "").replace(",", ".") || 0)
  const fixed = String(formData.get("fee_fixed") ?? "").trim()
  const fixedCents = fixed ? moneyCents(fixed) : 0
  if (!(percent >= 0 && percent < 50) || fixedCents === null || fixedCents > 10000) back(PATH, { error: t("integrations.costs.invalid") })
  const db = createAdminClient() // config only (no secret); permission checked above
  const { data: row } = await db.from("org_integrations").select("config").eq("org_id", ctx.org.id).eq("provider", provider).maybeSingle()
  if (!row) back(PATH, { error: t("errors.not_allowed") })
  const config = { ...(row.config as Record<string, unknown>), pass_fees: formData.get("pass_fees") === "on", fee_percent: Math.round(percent * 100) / 100, fee_fixed_cents: fixedCents }
  const { error } = await db.from("org_integrations").update({ config: config as never }).eq("org_id", ctx.org.id).eq("provider", provider)
  back(PATH, error ? { error: dbError(t, error) } : { ok: t("integrations.costs.saved") })
}
