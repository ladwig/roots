"use server"

import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePlatformAdmin } from "@/lib/context"
import { back } from "@/lib/url"
import { dependents, getModule, missingModules } from "@/modules/registry"

// Platform admins switch modules per org. Turning one on also turns on what it needs;
// turning one off is refused while another enabled module depends on it.
async function enabledFor(orgId: string) {
  const { supabase } = await requirePlatformAdmin()
  const { data } = await supabase.from("org_modules").select("module_key").eq("org_id", orgId)
  return new Set(data?.map((m) => m.module_key))
}

export async function enableModule(orgId: string, key: string) {
  const { supabase } = await requirePlatformAdmin()
  const t = await getT()
  const retry = `/admin/orgs?edit=${orgId}`
  const name = (k: string) => t.dynamic(`modules.${k}.name`)
  if (!getModule(key)) back(retry, { error: t("errors.unknown_module") })
  const keys = [key, ...missingModules(key, await enabledFor(orgId))]
  const { error } = await supabase.from("org_modules").insert(keys.map((module_key) => ({ org_id: orgId, module_key })))
  if (error) back(retry, { error: dbError(t, error) })
  back(retry, { ok: t("modules.turnedOn", { list: t.list(keys.map(name)) }) })
}

export async function disableModule(orgId: string, key: string) {
  const { supabase } = await requirePlatformAdmin()
  const t = await getT()
  const retry = `/admin/orgs?edit=${orgId}`
  const name = (k: string) => t.dynamic(`modules.${k}.name`)
  const blocking = dependents(key, await enabledFor(orgId))
  if (blocking.length) back(retry, { error: t("modules.turnOffFirst", { list: t.list(blocking.map(name)), name: name(key) }) })
  const { error } = await supabase.from("org_modules").delete().eq("org_id", orgId).eq("module_key", key)
  if (error) back(retry, { error: dbError(t, error) })
  back(retry, { ok: t("modules.turnedOff", { name: name(key) }) })
}
