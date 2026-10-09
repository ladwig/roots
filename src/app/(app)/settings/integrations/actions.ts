"use server"

import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { getContext } from "@/lib/context"
import { back } from "@/lib/url"
import { getIntegration, type Secret } from "@/integrations/registry"

const PATH = "/settings/integrations"

export async function connectIntegration(provider: string, formData: FormData) {
  const ctx = await getContext()
  const t = await getT()
  const integration = getIntegration(provider)
  if (!integration?.fields) back(PATH, { error: t("errors.unknown_integration") })
  const retry = `${PATH}?connect=${provider}`

  const config: Record<string, string> = {}
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
      await integration.test(secret, config)
    } catch (e) {
      const key = e instanceof Error ? e.message : ""
      back(retry, { error: t.has(key) ? t.dynamic(key) : t("integrations.credentialsFailed") })
    }
  }

  const { error } = await ctx.supabase.rpc("save_integration", {
    p_org: ctx.org.id,
    p_provider: provider,
    p_config: config,
    p_secret: hasSecret ? JSON.stringify(secret) : undefined,
  })
  if (error) back(retry, { error: dbError(t, error) })
  back(PATH, { ok: t("integrations.connected", { name: integration.name }) })
}

export async function disconnectIntegration(provider: string) {
  const ctx = await getContext()
  const t = await getT()
  const integration = getIntegration(provider)
  if (integration?.disconnect) {
    const { data: row } = await ctx.supabase.from("org_integrations").select("config").eq("org_id", ctx.org.id).eq("provider", provider).maybeSingle()
    try {
      if (row) await integration.disconnect(row.config as Record<string, string>)
    } catch (e) {
      console.error(e) // e.g. already revoked at the provider: remove our side anyway
    }
  }
  const { error } = await ctx.supabase.rpc("delete_integration", { p_org: ctx.org.id, p_provider: provider })
  if (error) back(PATH, { error: dbError(t, error) })
  back(PATH, { ok: t("integrations.disconnected", { name: getIntegration(provider)?.name ?? provider }) })
}
