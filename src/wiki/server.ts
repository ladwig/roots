// Wiki, server side (App actions + API): create, save, restore a version. Callers check wiki.manage; RLS again.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

type Db = SupabaseClient<Database>
export type WikiFail = { error: string; db?: { code?: string; message: string } }
const dbFail = (e: { code?: string; message: string }): WikiFail => ({ error: "db", db: e })
export const WIKI_COLS = "id, parent_id, title, body, position, created_at, updated_at"

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
