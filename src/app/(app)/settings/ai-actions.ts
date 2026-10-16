"use server"

import { revalidatePath } from "next/cache"
import { fetchModels } from "@/assistant/keys"
import { detectProvider, keyHint, PROVIDERS, type Provider } from "@/assistant/providers"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { getContext } from "@/lib/context"
import { back } from "@/lib/url"

const PATH = "/settings/profile"

/** Add or replace a key: the provider comes from the key, the provider checks it and lists its models. */
export async function saveAiKeyAction(fd: FormData) {
  const ctx = await getContext()
  const t = await getT()
  const key = String(fd.get("key") ?? "").trim()
  const provider = detectProvider(key)
  if (!provider) back(`${PATH}#ai`, { error: t("sprout.keyUnknown") })
  const r = await fetchModels(provider, key)
  if ("error" in r) back(`${PATH}#ai`, { error: t("sprout.keyRejected", { provider: PROVIDERS[provider].vendor, reason: r.error }) })
  const { error } = await ctx.supabase.rpc("save_ai_key", { p_provider: provider, p_key: key, p_hint: keyHint(key), p_models: r.models })
  revalidatePath("/", "layout")
  back(`${PATH}#ai`, error ? { error: dbError(t, error) } : { ok: t("sprout.keySaved", { provider: PROVIDERS[provider].label, count: r.models.length }) })
}

export async function deleteAiKeyAction(fd: FormData) {
  const ctx = await getContext()
  const t = await getT()
  const provider = String(fd.get("provider")) as Provider
  if (!(provider in PROVIDERS)) back(`${PATH}#ai`, {})
  const { error } = await ctx.supabase.rpc("delete_ai_key", { p_provider: provider })
  revalidatePath("/", "layout")
  back(`${PATH}#ai`, error ? { error: dbError(t, error) } : { ok: t("sprout.keyDeleted") })
}
