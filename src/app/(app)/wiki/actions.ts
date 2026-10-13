"use server"

import { redirect } from "next/navigation"
import { getT } from "@/i18n/server"
import { dbError, type T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { back } from "@/lib/url"
import { createPage, restoreVersion, savePage, type WikiFail } from "@/wiki/server"

const UUID = /^[0-9a-f-]{36}$/
const id = (fd: FormData, key: string) => (UUID.test(String(fd.get(key) ?? "")) ? String(fd.get(key)) : null)
const message = (t: T, f: WikiFail) => (f.db ? dbError(t, f.db) : t.dynamic(f.error))

async function editor() {
  const ctx = await requirePerm("wiki.manage")
  const t = await getT()
  if (!ctx.modules.has("wiki")) back("/wiki", { error: t("errors.not_allowed") })
  return { ctx, t }
}

/** New page (optionally below another), straight into the editor. */
export async function newPageAction(fd: FormData) {
  const { ctx, t } = await editor()
  const parent = id(fd, "parent_id")
  const r = await createPage(ctx.supabase, ctx.org.id, { title: t("wiki.untitled"), parentId: parent })
  if ("error" in r) back(parent ? `/wiki/${parent}` : "/wiki", { error: message(t, r) })
  redirect(`/wiki/${r.id}?edit=1`)
}

export async function savePageAction(fd: FormData) {
  const { ctx, t } = await editor()
  const page = id(fd, "id") ?? ""
  const r = await savePage(ctx.supabase, ctx.org.id, page, { title: String(fd.get("title") ?? ""), body: String(fd.get("body") ?? "").replace(/\r\n/g, "\n"), parentId: id(fd, "parent_id") })
  if ("error" in r) back(`/wiki/${page}?edit=1`, { error: message(t, r) })
  back(`/wiki/${page}`, { ok: t("wiki.saved") })
}

export async function restoreVersionAction(fd: FormData) {
  const { ctx, t } = await editor()
  const page = id(fd, "page_id") ?? ""
  const r = await restoreVersion(ctx.supabase, ctx.org.id, id(fd, "version_id") ?? "")
  back(`/wiki/${page}`, "error" in r ? { error: message(t, r) } : { ok: t("wiki.versionRestored") })
}

export async function trashPageAction(fd: FormData) {
  const { ctx, t } = await editor()
  const page = id(fd, "id") ?? ""
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.wiki_pages", p_id: page })
  if (error) back(`/wiki/${page}`, { error: dbError(t, error) })
  back("/wiki", { ok: t("wiki.trashed") })
}

export async function restorePageAction(fd: FormData) {
  const { ctx, t } = await editor()
  const page = id(fd, "id") ?? ""
  const { error } = await ctx.supabase.rpc("restore_deleted", { p_table: "public.wiki_pages", p_id: page })
  back(error ? "/wiki?status=trash" : `/wiki/${page}`, error ? { error: dbError(t, error) } : { ok: t("wiki.restored") })
}
