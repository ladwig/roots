"use server"

import { getContext } from "@/lib/context"
import { back } from "@/lib/url"
import { getIntegration, type Secret } from "@/integrations/registry"

const PATH = "/settings/integrations"

export async function connectIntegration(provider: string, formData: FormData) {
  const ctx = await getContext()
  const integration = getIntegration(provider)
  if (!integration?.fields) back(PATH, { error: "Unknown integration." })
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
      back(retry, { error: e instanceof Error ? e.message : "Those credentials didn't work." })
    }
  }

  const { error } = await ctx.supabase.rpc("save_integration", {
    p_org: ctx.org.id,
    p_provider: provider,
    p_config: config,
    p_secret: hasSecret ? JSON.stringify(secret) : undefined,
  })
  if (error) back(retry, { error: error.message })
  back(PATH, { ok: `${integration.name} connected.` })
}

export async function disconnectIntegration(provider: string) {
  const ctx = await getContext()
  const { error } = await ctx.supabase.rpc("delete_integration", { p_org: ctx.org.id, p_provider: provider })
  if (error) back(PATH, { error: error.message })
  back(PATH, { ok: `${getIntegration(provider)?.name} disconnected.` })
}
