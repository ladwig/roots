"use server"

import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { refreshPublic } from "@/lib/public-cache"
import { back } from "@/lib/url"
import { CONTENT_KEYS, discardDraft, publishSite, saveDraft } from "@/site/server"

const here = (fd: FormData) => {
  const b = String(fd.get("back") ?? "")
  return /^\/website(\/[a-z/-]*)?$/.test(b) ? b : "/website"
}

/** Saves the fields this form has into the draft (blocks come as JSON, theme as theme.<key>). Not public yet. */
export async function saveWebsiteDraft(fd: FormData) {
  const ctx = await requirePerm("org.site.manage")
  const t = await getT()
  const input: Record<string, unknown> = {}
  for (const k of CONTENT_KEYS) if (fd.has(k)) input[k] = String(fd.get(k) ?? "")
  if (fd.has("blocks")) {
    try {
      input.blocks = JSON.parse(String(fd.get("blocks")))
    } catch {
      back(here(fd), { error: t("errors.invalid_input") })
    }
  }
  if (fd.has("theme.mode")) input.theme = Object.fromEntries([...fd.entries()].filter(([k]) => k.startsWith("theme.")).map(([k, v]) => [k.slice(6), String(v)]))
  const { error } = await saveDraft(ctx.supabase, ctx.org.id, input)
  back(here(fd), error ? { error: dbError(t, error) } : { ok: t("website.draftSaved") })
}

export async function publishWebsite(fd: FormData) {
  const ctx = await requirePerm("org.site.manage")
  const t = await getT()
  const { error } = await publishSite(ctx.supabase, ctx.org.id)
  if (error) back(here(fd), { error: dbError(t, error) })
  refreshPublic(ctx.org.id) // the public pages show it
  back(here(fd), { ok: t("website.published") })
}

export async function discardWebsite(fd: FormData) {
  const ctx = await requirePerm("org.site.manage")
  const t = await getT()
  await discardDraft(ctx.supabase, ctx.org.id)
  back(here(fd), { ok: t("website.discarded") })
}
