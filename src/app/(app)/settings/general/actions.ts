"use server"

import { revalidatePath } from "next/cache"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { getContext } from "@/lib/context"
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
