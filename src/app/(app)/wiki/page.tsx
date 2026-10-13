import Link from "next/link"
import { notFound } from "next/navigation"
import { PlusIcon } from "lucide-react"
import { SearchBox } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, type SearchParams } from "@/lib/url"
import { newPageAction, restorePageAction } from "./actions"
import { TreeNav } from "./tree-nav"

// Wiki start: the page tree, search over titles and texts, recently changed pages (or the trash).
export default async function WikiPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePerm("wiki.view")
  if (!ctx.modules.has("wiki")) notFound()
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("wiki.manage")
  const trash = canManage && param(sp, "status") === "trash"
  const q = param(sp, "q")?.replace(/[%,()*\\]/g, " ").trim()
  let list = ctx.supabase.from("wiki_pages").select("id, title, body, updated_at").eq("org_id", ctx.org.id).order("updated_at", { ascending: false }).limit(q ? 50 : 15)
  list = trash ? list.not("deleted_at", "is", null) : list.is("deleted_at", null)
  if (q) list = list.or(`title.ilike.%${q}%,body.ilike.%${q}%`)
  const [{ data: rows }, { data: pages }] = await Promise.all([
    ctx.supabase.from("wiki_pages").select("id, parent_id, title, position").eq("org_id", ctx.org.id).is("deleted_at", null).limit(2000),
    list,
  ])
  // A snippet around the hit (plain text, Markdown marks stripped).
  const snippet = (body: string) => {
    const text = body.replace(/[#*_>`|[\]()-]+/g, " ").replace(/\s+/g, " ").trim()
    const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : 0
    return text.slice(Math.max(0, at - 60), Math.max(0, at - 60) + 180)
  }

  return (
    <div className="grid max-w-6xl gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">{t("wiki.title")}</h1>
        {canManage && (
          <form action={newPageAction}>
            <SubmitButton size="sm">
              <PlusIcon /> {t("wiki.newPage")}
            </SubmitButton>
          </form>
        )}
      </div>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
        <aside className="grid gap-2 rounded-lg border p-2 lg:sticky lg:top-4">
          {rows?.length ? <TreeNav rows={rows} label={t("wiki.tree")} /> : <p className="p-2 text-sm text-muted-foreground">{t("wiki.empty")}</p>}
        </aside>
        <section className="grid min-w-0 gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <SearchBox q={q} label={t("wiki.search")} keep={trash ? { status: "trash" } : undefined} />
            {canManage && (
              <Link href={trash ? "/wiki" : "/wiki?status=trash"} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
                {trash ? t("wiki.backToPages") : t("wiki.trash")}
              </Link>
            )}
          </div>
          <h2 className="text-sm text-muted-foreground">{trash ? t("wiki.trash") : q ? t("wiki.results") : t("wiki.recent")}</h2>
          <ul className="grid gap-2">
            {(pages ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border px-3 py-2">
                <Link href={`/wiki/${p.id}`} className="grid min-w-0 flex-1 underline-offset-4 hover:underline">
                  <span className="font-medium">{p.title}</span>
                  {p.body && <span className="truncate text-xs text-muted-foreground">{snippet(p.body)}</span>}
                </Link>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {t.date(p.updated_at, { dateStyle: "medium" })}
                  {trash && (
                    <form action={restorePageAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <SubmitButton size="sm" variant="outline">
                        {t("wiki.restore")}
                      </SubmitButton>
                    </form>
                  )}
                </span>
              </li>
            ))}
            {!pages?.length && <li className="text-sm text-muted-foreground">{q ? t("wiki.noMatch") : trash ? t("wiki.trashEmpty") : t("wiki.empty")}</li>}
          </ul>
        </section>
      </div>
    </div>
  )
}

export const instant = false
