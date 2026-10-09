"use server"

import { revalidatePath } from "next/cache"
import { getContext } from "@/lib/context"
import { back } from "@/lib/url"
import { dependents, getModule, missingModules } from "@/modules/registry"

const PATH = "/settings/modules"

export async function enableModule(key: string, confirmed: boolean) {
  const ctx = await getContext()
  if (!getModule(key)) back(PATH, { error: "Unknown module." })
  const missing = missingModules(key, ctx.modules)
  if (missing.length && !confirmed) back(`${PATH}?enable=${key}`, {})

  const rows = [key, ...missing].map((module_key) => ({ org_id: ctx.org.id, module_key }))
  const { error } = await ctx.supabase.from("org_modules").insert(rows)
  if (error) back(PATH, { error: error.code === "42501" ? "You can't turn modules on." : error.message })
  revalidatePath("/", "layout")
  back(PATH, { ok: `${[key, ...missing].map((k) => getModule(k)?.name).join(", ")} turned on.` })
}

export async function disableModule(key: string) {
  const ctx = await getContext()
  const blocking = dependents(key, ctx.modules)
  if (blocking.length)
    back(PATH, { error: `Turn off ${blocking.map((k) => getModule(k)?.name).join(", ")} first. It needs ${getModule(key)?.name}.` })

  const { error, count } = await ctx.supabase
    .from("org_modules")
    .delete({ count: "exact" })
    .eq("org_id", ctx.org.id)
    .eq("module_key", key)
  if (error || !count) back(PATH, { error: error?.message ?? "You can't turn modules off." })
  revalidatePath("/", "layout")
  back(PATH, { ok: `${getModule(key)?.name} turned off. Its data is kept.` })
}
