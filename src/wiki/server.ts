// Wiki, server side (App actions + API): create, save, restore a version. Callers check wiki.manage; RLS again.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { VISIBILITIES } from "./tree"

type Db = SupabaseClient<Database>
export type WikiFail = { error: string; db?: { code?: string; message: string } }
const dbFail = (e: { code?: string; message: string }): WikiFail => ({ error: "db", db: e })
export const WIKI_COLS = "id, parent_id, icon, title, body, position, visibility, role_ids, created_at, updated_at"

export function readPage(i: { title?: string; body?: string }) {
  const title = (i.title ?? "").trim().slice(0, 200)
  if (i.title !== undefined && !title) return { error: "wiki.titleRequired" }
  if ((i.body ?? "").length > 200_000) return { error: "wiki.tooLong" }
  return { title, body: i.body }
}

/** New page at the end of its parent's children. */
export async function createPage(db: Db, orgId: string, input: { title: string; body?: string; parentId?: string | null }): Promise<WikiFail | { id: string }> {
  const r = readPage(input)
  if ("error" in r) return { error: r.error! }
  let last = db.from("wiki_pages").select("position").eq("org_id", orgId).order("position", { ascending: false }).limit(1)
  last = input.parentId ? last.eq("parent_id", input.parentId) : last.is("parent_id", null)
  const { data: prev } = await last.maybeSingle()
  const { data, error } = await db
    .from("wiki_pages")
    .insert({ org_id: orgId, title: r.title, body: r.body ?? "", parent_id: input.parentId ?? null, position: (prev?.position ?? -1) + 1 })
    .select("id")
    .single()
  return error || !data ? dbFail(error ?? { message: "insert failed" }) : { id: data.id }
}

/** Change title/body/parent (only what's given). The DB keeps the old text as a version and refuses cycles. */
export async function savePage(db: Db, orgId: string, id: string, input: { title?: string; body?: string; parentId?: string | null }): Promise<WikiFail | { id: string }> {
  const r = readPage(input)
  if ("error" in r) return { error: r.error! }
  const row = { ...(input.title !== undefined && { title: r.title }), ...(input.body !== undefined && { body: input.body }), ...(input.parentId !== undefined && { parent_id: input.parentId }) }
  const { data, error } = await db.from("wiki_pages").update(row).eq("id", id).eq("org_id", orgId).is("deleted_at", null).select("id").maybeSingle()
  if (error) return dbFail(error)
  return data ? { id } : { error: "errors.not_allowed" }
}

/** Back to an old version (the current text becomes a version itself). */
export async function restoreVersion(db: Db, orgId: string, versionId: string): Promise<WikiFail | { id: string }> {
  const { data: v } = await db.from("wiki_page_versions").select("page_id, title, body").eq("id", versionId).eq("org_id", orgId).maybeSingle()
  if (!v) return { error: "errors.not_allowed" }
  return savePage(db, orgId, v.page_id, { title: v.title, body: v.body })
}

/** Move a page: below `parentId` (null = top level), before `beforeId` or at the end; siblings renumbered. */
export async function movePage(db: Db, orgId: string, id: string, parentId: string | null, beforeId: string | null): Promise<WikiFail | { id: string }> {
  if (parentId === id || beforeId === id) return { error: "errors.invalid_input" }
  let q = db.from("wiki_pages").select("id").eq("org_id", orgId).is("deleted_at", null).neq("id", id).order("position").order("title")
  q = parentId ? q.eq("parent_id", parentId) : q.is("parent_id", null)
  const { data: siblings } = await q
  const order = (siblings ?? []).map((s) => s.id)
  const at = beforeId ? order.indexOf(beforeId) : -1
  order.splice(at < 0 ? order.length : at, 0, id)
  // Parent first (the DB refuses cycles), then the order.
  const { error } = await db.from("wiki_pages").update({ parent_id: parentId, position: order.indexOf(id) }).eq("id", id).eq("org_id", orgId)
  if (error) return dbFail(error)
  await Promise.all(order.map((pid, i) => (pid === id ? null : db.from("wiki_pages").update({ position: i }).eq("id", pid).eq("org_id", orgId))))
  return { id }
}

/** Who may read the page (null = like its parent page); role ids must be roles of the platform. */
export async function setVisibility(db: Db, orgId: string, id: string, visibility: string | null, roleIds: string[]): Promise<WikiFail | { id: string }> {
  if (visibility !== null && !(VISIBILITIES as readonly string[]).includes(visibility)) return { error: "errors.invalid_input" }
  const ids = visibility === "roles" ? [...new Set(roleIds)].slice(0, 50) : []
  if (ids.length) {
    const { data } = await db.from("roles").select("id").is("org_id", null).in("id", ids)
    if ((data?.length ?? 0) !== ids.length) return { error: "errors.invalid_input" }
  }
  const { data, error } = await db.from("wiki_pages").update({ visibility, role_ids: ids }).eq("id", id).eq("org_id", orgId).is("deleted_at", null).select("id").maybeSingle()
  if (error) return dbFail(error)
  return data ? { id } : { error: "errors.not_allowed" }
}

/** Page icon: one emoji (or null to remove). */
export async function setIcon(db: Db, orgId: string, id: string, icon: string | null): Promise<WikiFail | { id: string }> {
  const v = icon?.trim() || null
  if (v && (v.length > 16 || !/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(v))) return { error: "wiki.iconInvalid" }
  const { data, error } = await db.from("wiki_pages").update({ icon: v }).eq("id", id).eq("org_id", orgId).is("deleted_at", null).select("id").maybeSingle()
  if (error) return dbFail(error)
  return data ? { id } : { error: "errors.not_allowed" }
}
