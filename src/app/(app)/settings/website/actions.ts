"use server"

import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { refreshPublic } from "@/lib/public-cache"
import { back } from "@/lib/url"
import { saveSite } from "@/site/server"

export async function saveWebsite(fd: FormData) {
  const ctx = await requirePerm("org.settings.manage")
  const t = await getT()
  let blocks: unknown = []
  try {
    blocks = JSON.parse(String(fd.get("blocks") ?? "[]"))
  } catch {
    back("/settings/website", { error: t("errors.invalid_input") })
  }
  const { error } = await saveSite(ctx.supabase, ctx.org.id, {
    tagline: String(fd.get("tagline") ?? ""),
    blocks,
    imprint: String(fd.get("imprint") ?? ""),
    privacy: String(fd.get("privacy") ?? ""),
  })
  if (error) back("/settings/website", { error: dbError(t, error) })
  refreshPublic(ctx.org.id) // the public pages show it
  back("/settings/website", { ok: t("site.saved") })
}
