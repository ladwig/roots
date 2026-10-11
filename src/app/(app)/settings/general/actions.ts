"use server"

import { revalidatePath } from "next/cache"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { getContext, requirePerm } from "@/lib/context"
import { removeImage, replaceImage } from "@/lib/images"
import { back } from "@/lib/url"

export async function updateOrg(formData: FormData) {
  const ctx = await getContext()
  const t = await getT()
  const name = String(formData.get("name") ?? "").trim()
  if (!name) back("/settings/general", { error: t("general.nameRequired") })
  const { error, count } = await ctx.supabase.from("orgs").update({ name }, { count: "exact" }).eq("id", ctx.org.id)
  if (error || !count) back("/settings/general", { error: error ? dbError(t, error) : t("errors.not_allowed") })
  revalidatePath("/", "layout")
  back("/settings/general", { ok: t("general.saved") })
}

export async function updateLogo(formData: FormData) {
  const ctx = await requirePerm("org.settings.manage")
  const t = await getT()
  const { data: org } = await ctx.supabase.from("orgs").select("logo_path").eq("id", ctx.org.id).single()
  let logo_path: string | null = null
  if (formData.get("remove") === "1") await removeImage(ctx.supabase, org?.logo_path)
  else {
    const res = await replaceImage(ctx.supabase, `orgs/${ctx.org.id}`, formData.get("file"), org?.logo_path)
    if ("error" in res) back("/settings/general", { error: t.dynamic(`errors.${res.error}`) })
    logo_path = res.path!
  }
  const { error } = await ctx.supabase.from("orgs").update({ logo_path }).eq("id", ctx.org.id)
  if (error) back("/settings/general", { error: dbError(t, error) })
  revalidatePath("/", "layout")
  back("/settings/general", { ok: t("general.saved") })
}
