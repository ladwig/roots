"use server"

import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { replaceImage } from "@/lib/images"
import { allowedBlocks, TEMPLATE_KINDS, templateStarter, type TemplateKind } from "./blocks"
import { pageSlug, RESERVED_SLUGS, sanitizePage } from "./sanitize"
import { readTheme } from "./theme"

// Everything the website editor does, called from the client (results instead of redirects).
type Result = { ok?: string; error?: string; id?: string }
const UUID = /^[0-9a-f-]{36}$/

async function manager() {
  const ctx = await requirePerm("sites.manage")
  const t = await getT()
  return { ctx, t, allowed: ctx.modules.has("sites") }
}

/** Image upload → orgs/<org>/site/<uuid>.<ext> in the public images bucket. */
export async function uploadSiteImage(fd: FormData): Promise<{ path?: string; error?: string }> {
  const { ctx, t } = await manager()
  const r = await replaceImage(ctx.supabase, `orgs/${ctx.org.id}/site`, fd.get("file"))
  return "path" in r ? { path: r.path } : { error: t.dynamic(`errors.${r.error}`) }
}

/** Save the draft, or save + publish. The document is checked against the org's blocks. */
export async function savePage(id: string, data: unknown, publish: boolean): Promise<Result> {
  const { ctx, t, allowed } = await manager()
  if (!allowed || !UUID.test(String(id))) return { error: t("errors.not_allowed") }
  const { data: row } = await ctx.supabase.from("site_pages").select("kind").eq("id", id).eq("org_id", ctx.org.id).maybeSingle()
  if (!row) return { error: t("errors.not_allowed") }
  const clean = sanitizePage(data, allowedBlocks([...ctx.modules], row.kind), ctx.org.id)
  const { error, count } = await ctx.supabase
    .from("site_pages")
    .update({ draft: clean as never, ...(publish && { published: clean as never, published_at: new Date().toISOString() }) }, { count: "exact" })
    .eq("id", id)
    .eq("org_id", ctx.org.id)
  if (error || !count) return { error: error ? dbError(t, error) : t("errors.not_allowed") }
  return { ok: publish ? t("sites.publishedOk") : t("sites.draftSaved") }
}

type Settings = { title: string; slug: string; description: string; in_nav: boolean }
function readSettings(s: Settings, t: Awaited<ReturnType<typeof getT>>) {
  const title = String(s?.title ?? "").trim().slice(0, 120)
  const slug = pageSlug(String(s?.slug ?? ""))
  if (!title) return { error: t("sites.titleRequired") }
  if (RESERVED_SLUGS.includes(slug)) return { error: t("sites.slugReserved") }
  return { row: { title, slug, description: String(s?.description ?? "").trim().slice(0, 300) || null, in_nav: !!s?.in_nav } }
}
const slugError = (t: Awaited<ReturnType<typeof getT>>, e: { code?: string; message: string }) => (e.code === "23505" ? t("sites.slugTaken") : dbError(t, e))

export async function createSitePage(s: Settings): Promise<Result> {
  const { ctx, t, allowed } = await manager()
  if (!allowed) return { error: t("errors.not_allowed") }
  const r = readSettings(s, t)
  if (!r.row) return { error: r.error }
  const { count } = await ctx.supabase.from("site_pages").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).is("deleted_at", null)
  const { data, error } = await ctx.supabase
    .from("site_pages")
    .insert({ org_id: ctx.org.id, ...r.row, in_nav: true, position: count ?? 0, draft: { root: { props: {} }, content: [] } as never })
    .select("id")
    .single()
  return error ? { error: slugError(t, error) } : { ok: t("sites.created"), id: data.id }
}

export async function updateSitePage(id: string, s: Settings): Promise<Result> {
  const { ctx, t, allowed } = await manager()
  if (!allowed || !UUID.test(String(id))) return { error: t("errors.not_allowed") }
  const r = readSettings(s, t)
  if (!r.row) return { error: r.error }
  const { error } = await ctx.supabase.from("site_pages").update(r.row).eq("id", id).eq("org_id", ctx.org.id)
  return error ? { error: slugError(t, error) } : { ok: t("sites.saved") }
}

export async function unpublishSitePage(id: string): Promise<Result> {
  const { ctx, t } = await manager()
  const { error } = await ctx.supabase.from("site_pages").update({ published: null, published_at: null }).eq("id", String(id)).eq("org_id", ctx.org.id)
  return error ? { error: dbError(t, error) } : { ok: t("sites.unpublishedOk") }
}

export async function trashSitePage(id: string): Promise<Result> {
  const { ctx, t } = await manager()
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.site_pages", p_id: String(id) })
  return error ? { error: dbError(t, error) } : { ok: t("sites.trashed") }
}

export async function saveSiteDesign(theme: unknown): Promise<Result> {
  const { ctx, t, allowed } = await manager()
  if (!allowed) return { error: t("errors.not_allowed") }
  const { error } = await ctx.supabase.from("sites").upsert({ org_id: ctx.org.id, theme: readTheme(theme) as never }, { onConflict: "org_id" })
  return error ? { error: dbError(t, error) } : { ok: t("sites.designSaved") }
}

/** The org's own design for a module page (event / form / portal), started from roots' standard layout. */
export async function createTemplatePage(kind: TemplateKind): Promise<Result> {
  const { ctx, t, allowed } = await manager()
  if (!allowed || !TEMPLATE_KINDS.includes(kind)) return { error: t("errors.not_allowed") }
  const { data, error } = await ctx.supabase
    .from("site_pages")
    .insert({ org_id: ctx.org.id, kind, slug: "", title: t.dynamic(`sites.templates.${kind}`), in_nav: false, draft: templateStarter(kind) as never })
    .select("id")
    .single()
  return error ? { error: dbError(t, error) } : { id: data.id }
}
