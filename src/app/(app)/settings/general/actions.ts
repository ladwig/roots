"use server"

import { revalidatePath } from "next/cache"
import { getContext } from "@/lib/context"
import { back } from "@/lib/url"

export async function updateOrg(formData: FormData) {
  const ctx = await getContext()
  const name = String(formData.get("name") ?? "").trim()
  if (!name) back("/settings/general", { error: "The name can't be empty." })
  const { error, count } = await ctx.supabase.from("orgs").update({ name }, { count: "exact" }).eq("id", ctx.org.id)
  if (error || !count) back("/settings/general", { error: error?.message ?? "You can't edit this organisation." })
  revalidatePath("/", "layout")
  back("/settings/general", { ok: "Saved." })
}
