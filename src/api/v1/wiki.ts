import { z } from "zod"
import { messages } from "@/i18n/config"
import { createT } from "@/i18n/translate"
import { createPage, restoreVersion, savePage, WIKI_COLS, type WikiFail } from "@/wiki/server"
import { ApiError, dbError, endpoint, list, notFound, page, paged, uuid, type Endpoint } from "../core"
import { trashRow } from "./contacts"
import { ts, type Db } from "./shared"

const TAG = "Wiki"
const en = createT("en", messages.en)
function fail(f: WikiFail): never {
  if (f.db) throw f.db.message === "wiki_cycle" ? new ApiError(422, "wiki_cycle", "A page can't move below itself.") : dbError(f.db)
  throw f.error === "errors.not_allowed" ? notFound() : new ApiError(422, f.error.split(".").pop()!, en.dynamic(f.error))
}
const Page = z.object({ id: uuid, parent_id: uuid.nullable(), title: z.string(), body: z.string().describe("Markdown (GitHub flavour)"), position: z.number().int(), created_at: ts, updated_at: ts })
const Summary = Page.omit({ body: true })
async function pageOf(db: Db, orgId: string, id: string) {
  const { data } = await db.from("wiki_pages").select(WIKI_COLS).eq("id", id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
  if (!data) throw notFound()
  return data
}

export const endpoints: Endpoint[] = [
  endpoint({
    method: "GET",
    path: "/wiki-pages",
    permission: "wiki.view",
    tag: TAG,
    summary: "List pages (tree via parent_id)",
    description: "Without body; `q` searches titles and texts.",
    query: page.extend({ q: z.string().max(100).optional(), parent_id: uuid.optional() }),
    response: list(Summary),
    async handler({ db, orgId, query }) {
      let q = db.from("wiki_pages").select("id, parent_id, title, position, created_at, updated_at").eq("org_id", orgId).is("deleted_at", null).order("position").order("title").range(query.offset, query.offset + query.limit)
      const s = query.q?.replace(/[%,()*\\]/g, " ").trim()
      if (s) q = q.or(`title.ilike.%${s}%,body.ilike.%${s}%`)
      if (query.parent_id) q = q.eq("parent_id", query.parent_id)
      const { data } = await q
      return paged(data, query)
    },
  }),
  endpoint({ method: "GET", path: "/wiki-pages/{id}", permission: "wiki.view", tag: TAG, summary: "Get a page", response: Page, handler: ({ db, orgId, params }) => pageOf(db, orgId, params.id) }),
  endpoint({
    method: "POST",
    path: "/wiki-pages",
    permission: "wiki.manage",
    tag: TAG,
    summary: "Create a page",
    body: z.object({ title: z.string().trim().min(1).max(200), body: z.string().max(200000).optional(), parent_id: uuid.nullable().optional() }).strict(),
    response: Page,
    status: 201,
    async handler({ db, orgId, body }) {
      if (body.parent_id) await pageOf(db, orgId, body.parent_id)
      const r = await createPage(db, orgId, { title: body.title, body: body.body, parentId: body.parent_id ?? null })
      if ("error" in r) fail(r)
      return pageOf(db, orgId, r.id)
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/wiki-pages/{id}",
    permission: "wiki.manage",
    tag: TAG,
    summary: "Change a page",
    description: "Only the given fields change. The previous text is kept as a version.",
    body: z.object({ title: z.string().trim().min(1).max(200), body: z.string().max(200000), parent_id: uuid.nullable() }).partial().strict(),
    response: Page,
    async handler({ db, orgId, params, body }) {
      await pageOf(db, orgId, params.id)
      if (body.parent_id) await pageOf(db, orgId, body.parent_id)
      const r = await savePage(db, orgId, params.id, { title: body.title, body: body.body, parentId: body.parent_id })
      if ("error" in r) fail(r)
      return pageOf(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "GET",
    path: "/wiki-pages/{id}/versions",
    permission: "wiki.view",
    tag: TAG,
    summary: "Earlier versions of a page",
    response: z.object({ data: z.array(z.object({ id: uuid, title: z.string(), body: z.string(), created_at: ts })) }),
    async handler({ db, orgId, params }) {
      await pageOf(db, orgId, params.id)
      const { data } = await db.from("wiki_page_versions").select("id, title, body, created_at").eq("page_id", params.id).eq("org_id", orgId).order("created_at", { ascending: false }).limit(100)
      return { data: data ?? [] }
    },
  }),
  endpoint({
    method: "POST",
    path: "/wiki-pages/{id}/versions/{version}/restore",
    permission: "wiki.manage",
    tag: TAG,
    summary: "Restore a version",
    response: Page,
    async handler({ db, orgId, params }) {
      await pageOf(db, orgId, params.id)
      const r = await restoreVersion(db, orgId, params.version)
      if ("error" in r) fail(r)
      return pageOf(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/wiki-pages/{id}",
    permission: "wiki.manage",
    tag: TAG,
    summary: "Move a page to the trash",
    description: "Restorable for 30 days (POST /wiki-pages/{id}/restore). Sub-pages stay.",
    response: z.object({ ok: z.literal(true) }),
    async handler({ db, params }) {
      await trashRow(db, "public.wiki_pages", params.id)
      return { ok: true as const }
    },
  }),
  endpoint({
    method: "POST",
    path: "/wiki-pages/{id}/restore",
    permission: "wiki.manage",
    tag: TAG,
    summary: "Restore a page from the trash",
    response: Page,
    async handler({ db, orgId, params }) {
      await trashRow(db, "public.wiki_pages", params.id, true)
      return pageOf(db, orgId, params.id)
    },
  }),
]
