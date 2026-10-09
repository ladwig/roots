"use server"

import { revalidatePath } from "next/cache"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { getContext } from "@/lib/context"
import { back } from "@/lib/url"
import { dependents, getModule, missingModules } from "@/modules/registry"

const PATH = "/settings/modules"

export async function enableModule(key: string, confirmed: boolean) {
  const ctx = await getContext()
  const t = await getT()
  const name = (k: string) => t.dynamic(`modules.${k}.name`)
  if (!getModule(key)) back(PATH, { error: t("errors.unknown_module") })
  const missing = missingModules(key, ctx.modules)
  if (missing.length && !confirmed) back(`${PATH}?enable=${key}`, {})

  const keys = [key, ...missing]
  const { error } = await ctx.supabase.from("org_modules").insert(keys.map((module_key) => ({ org_id: ctx.org.id, module_key })))
  if (error) back(PATH, { error: dbError(t, error) })
  revalidatePath("/", "layout")
  back(PATH, { ok: t("modules.turnedOn", { list: t.list(keys.map(name)) }) })
}

export async function disableModule(key: string) {
  const ctx = await getContext()
  const t = await getT()
  const name = (k: string) => t.dynamic(`modules.${k}.name`)
  const blocking = dependents(key, ctx.modules)
  if (blocking.length) back(PATH, { error: t("modules.turnOffFirst", { list: t.list(blocking.map(name)), name: name(key) }) })

  const { error, count } = await ctx.supabase
    .from("org_modules")
    .delete({ count: "exact" })
    .eq("org_id", ctx.org.id)
    .eq("module_key", key)
  if (error || !count) back(PATH, { error: error ? dbError(t, error) : t("errors.not_allowed") })
  revalidatePath("/", "layout")
  back(PATH, { ok: t("modules.turnedOff", { name: name(key) }) })
}
