"use server"

import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { getContext } from "@/lib/context"
import { back } from "@/lib/url"
import { getIntegration, type Config, type Secret } from "@/integrations/registry"
import { getSecret } from "@/integrations/server"

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

  // Check the credentials before storing them. Leaving the secret empty keeps the stored one.
  if (hasSecret && integration.test) {
    try {
      config = { ...config, ...((await integration.test(secret, config)) ?? {}) }
    } catch (e) {
      const key = e instanceof Error ? e.message : ""
      back(retry, { error: t.has(key) ? t.dynamic(key) : t("integrations.credentialsFailed") })
    }
  }

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
