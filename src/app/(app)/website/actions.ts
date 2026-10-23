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

// The fields a Website form has (blocks come as JSON, theme as theme.<key>); null = unreadable.
function readForm(fd: FormData) {
  const input: Record<string, unknown> = {}
  for (const k of CONTENT_KEYS) if (fd.has(k)) input[k] = String(fd.get(k) ?? "")
  if (fd.has("blocks")) {
    try {
      input.blocks = JSON.parse(String(fd.get("blocks")))
    } catch {
      return null
    }
  }
  if (fd.has("theme.mode")) input.theme = Object.fromEntries([...fd.entries()].filter(([k]) => k.startsWith("theme.")).map(([k, v]) => [k.slice(6), String(v)]))
  return input
}

/** Saves the fields this form has into the draft. Not public yet. */
export async function saveWebsiteDraft(fd: FormData) {
  const ctx = await requirePerm("org.site.manage")
  const t = await getT()
  const input = readForm(fd)
  if (!input) back(here(fd), { error: t("errors.invalid_input") })
  const { error } = await saveDraft(ctx.supabase, ctx.org.id, input)
  back(here(fd), error ? { error: dbError(t, error) } : { ok: t("website.draftSaved") })
}

/** The same while typing (<AutoSave>): no redirect, just whether it worked. */
export async function autosaveWebsiteDraft(fd: FormData) {
  const ctx = await requirePerm("org.site.manage")
  const input = readForm(fd)
  if (!input) return { ok: false }
  const { error } = await saveDraft(ctx.supabase, ctx.org.id, input)
  return { ok: !error }
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
