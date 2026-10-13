import Link from "next/link"
import { notFound } from "next/navigation"
import { FilePlusIcon, HistoryIcon } from "lucide-react"
import { Markdown } from "@/components/markdown"
import { Notice } from "@/components/notice"
import { PageCrumbs } from "@/components/page-crumbs"
import { SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import { UrlSheet } from "@/components/url-sheet"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams, type SearchParams } from "@/lib/url"
import { pathTo } from "@/wiki/tree"
import { newPageAction, restorePageAction, restoreVersionAction, trashPageAction } from "../actions"
import { TreeNav } from "../tree-nav"
import { WikiEditor } from "./editor"

// One wiki page: tree on the left (drag & drop to move), the page – editable in place for writers, read-only text for
// readers – sub-pages, history (?history=1). Files live inline in the text (images, file cards).
export default async function WikiPageView({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const ctx = await requirePerm("wiki.view")
  if (!ctx.modules.has("wiki")) notFound()
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("wiki.manage")
  const showHistory = param(sp, "history") === "1"
  const versionId = param(sp, "version")
  const [{ data: page }, { data: rows }, { data: versions }, { data: version }] = await Promise.all([
    ctx.supabase.from("wiki_pages").select("*").eq("id", id).eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("wiki_pages").select("id, parent_id, title, position").eq("org_id", ctx.org.id).is("deleted_at", null).limit(2000),
    showHistory ? ctx.supabase.from("wiki_page_versions").select("id, title, created_at, created_by").eq("page_id", id).order("created_at", { ascending: false }).limit(100) : Promise.resolve({ data: null }),
    versionId && /^[0-9a-f-]{36}$/.test(versionId) ? ctx.supabase.from("wiki_page_versions").select("id, title, body, created_at").eq("id", versionId).eq("page_id", id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  if (!page) notFound()
  const all = rows ?? []
  const editing = canManage && !page.deleted_at
  const children = all.filter((r) => r.parent_id === page.id).sort((a, b) => a.position - b.position || a.title.localeCompare(b.title, "de"))

  return (
    <div className="grid max-w-6xl gap-6">
      <PageCrumbs items={[{ href: "/wiki", label: t("wiki.title") }, ...pathTo(all, page.id).map((p) => ({ href: `/wiki/${p.id}`, label: p.title })), { label: page.title }]} />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
        <aside className="hidden rounded-lg border p-2 lg:sticky lg:top-4 lg:grid">
          <TreeNav rows={all} current={page.id} label={t("wiki.tree")} movable={canManage} />
        </aside>
        <article className="grid min-w-0 gap-6">
          {page.deleted_at ? (
            <div className="grid gap-3">
              <p className="rounded-lg border bg-muted px-3 py-2 text-sm">{t("wiki.inTrash")}</p>
              {canManage && (
                <form action={restorePageAction}>
                  <input type="hidden" name="id" value={page.id} />
                  <SubmitButton size="sm">{t("wiki.restore")}</SubmitButton>
                </form>
              )}
            </div>
          ) : (
            <>
              <header className="flex flex-wrap items-start justify-between gap-3">
                {editing ? (
                  <span />
                ) : (
                  <div className="grid gap-1">
                    <h1 className="font-heading text-2xl font-semibold break-words">{page.title}</h1>
                    <p className="text-xs text-muted-foreground">{t("wiki.updated", { date: t.date(page.updated_at, { dateStyle: "medium", timeStyle: "short" }) })}</p>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {canManage && (
                    <form action={newPageAction}>
                      <input type="hidden" name="parent_id" value={page.id} />
                      <SubmitButton size="sm" variant="outline">
                        <FilePlusIcon /> {t("wiki.subPage")}
                      </SubmitButton>
                    </form>
                  )}
                  <Button render={<Link href={`/wiki/${page.id}${withParams(sp, { history: "1" })}`} />} nativeButton={false} size="sm" variant="outline">
                    <HistoryIcon /> {t("wiki.history")}
                  </Button>
                </div>
              </header>
              {editing ? (
                <WikiEditor key={`${page.id}:${param(sp, "r") ?? ""}`} page={page} orgId={ctx.org.id} />
              ) : page.body.trim() ? (
                <Markdown>{page.body}</Markdown>
              ) : (
                <p className="text-sm text-muted-foreground">{t("wiki.emptyPage")}</p>
              )}
              {children.length > 0 && (
                <section className="grid gap-2" aria-labelledby="sub">
                  <h2 id="sub" className="text-sm font-medium">
                    {t("wiki.subPages")}
                  </h2>
                  <ul className="grid gap-1 sm:grid-cols-2">
                    {children.map((c) => (
                      <li key={c.id}>
                        <Link href={`/wiki/${c.id}`} className="block truncate rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                          {c.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {canManage && (
                <form action={trashPageAction}>
                  <input type="hidden" name="id" value={page.id} />
                  <SubmitButton size="sm" variant="ghost" className="text-muted-foreground">
                    {t("wiki.toTrash")}
                  </SubmitButton>
                </form>
              )}
            </>
          )}
        </article>
      </div>

      {showHistory && (
        <UrlSheet params={["history", "version"]} title={t("wiki.history")} description={page.title}>
          {version ? (
            <div className="grid gap-3">
              <Link href={`/wiki/${page.id}?history=1`} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
                ← {t("wiki.allVersions")}
              </Link>
              <p className="text-sm font-medium">
                {version.title} · {t.date(version.created_at, { dateStyle: "medium", timeStyle: "short" })}
              </p>
              <div className="rounded-lg border px-4 py-3">
                <Markdown>{version.body}</Markdown>
              </div>
              {canManage && (
                <form action={restoreVersionAction}>
                  <input type="hidden" name="page_id" value={page.id} />
                  <input type="hidden" name="version_id" value={version.id} />
                  <SubmitButton size="sm">{t("wiki.restoreVersion")}</SubmitButton>
                </form>
              )}
            </div>
          ) : versions?.length ? (
            <ul className="grid gap-1">
              {versions.map((v) => (
                <li key={v.id}>
                  <Link href={`/wiki/${page.id}?history=1&version=${v.id}`} className="flex justify-between gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                    <span className="truncate">{v.title}</span>
                    <span className="shrink-0 text-muted-foreground">{t.date(v.created_at, { dateStyle: "medium", timeStyle: "short" })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("wiki.noVersions")}</p>
          )}
        </UrlSheet>
      )}
    </div>
  )
}

export const instant = false
