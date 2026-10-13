import Link from "next/link"
import { notFound } from "next/navigation"
import { contactName } from "@/app/(app)/contacts/fields"
import { DataTable, Pager, pageRange, PAGE_SIZE } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { PageCrumbs } from "@/components/page-crumbs"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { pageParam, param } from "@/lib/url"
import { cancelRun } from "../../actions"

type LogEntry = { at: string; node: string; type: string; ok: boolean; note?: string }
const TONE: Record<string, "default" | "secondary" | "outline" | "destructive"> = { done: "secondary", waiting: "outline", queued: "outline", running: "default", failed: "destructive", cancelled: "secondary" }

// Every run of a workflow: who, when, where it stands, the steps it took.
export default async function RunsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const ctx = await requirePerm("automations.view")
  const t = await getT()
  const sp = await searchParams
  const page = pageParam(sp)
  const status = param(sp, "status")
  let q = ctx.supabase
    .from("workflow_runs")
    .select("id, status, created_at, resume_at, error, log, contacts(id, first_name, last_name, company, email)")
    .eq("org_id", ctx.org.id)
    .eq("workflow_id", id)
    .order("created_at", { ascending: false })
    .range(...pageRange(page))
  if (status) q = q.eq("status", status)
  const [{ data: wf }, { data: runs }] = await Promise.all([ctx.supabase.from("workflows").select("name").eq("id", id).eq("org_id", ctx.org.id).maybeSingle(), q])
  if (!wf) notFound()
  const when = (iso: string) => t.date(iso, { dateStyle: "short", timeStyle: "short" })

  return (
    <div className="grid gap-6">
      <PageCrumbs items={[{ href: "/automations", label: t("automations.title") }, { href: `/automations/${id}`, label: wf.name }, { label: t("automations.runs") }]} />
      <h1 className="font-heading text-2xl font-semibold">{t("automations.runs")}</h1>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <nav className="flex flex-wrap gap-2 text-sm" aria-label={t("automations.status")}>
        {["", "waiting", "done", "failed", "cancelled"].map((s) => (
          <Link key={s} href={`/automations/${id}/runs${s ? `?status=${s}` : ""}`} className={(status ?? "") === s ? "font-medium underline underline-offset-4" : "text-muted-foreground hover:underline"}>
            {s ? t.dynamic(`automations.runStatus.${s}`) : t("automations.all")}
          </Link>
        ))}
      </nav>
      <DataTable
        rows={(runs ?? []).slice(0, PAGE_SIZE)}
        rowKey={(r) => r.id}
        empty={t("automations.noRuns")}
        columns={[
          { header: t("automations.started"), cell: (r) => <span className="font-medium">{when(r.created_at)}</span> },
          { header: t("automations.person"), cell: (r) => (r.contacts ? <Link href={`/contacts/${r.contacts.id}`} className="underline-offset-4 hover:underline">{contactName(r.contacts)}</Link> : "–") },
          {
            header: t("automations.status"),
            cell: (r) => (
              <span className="grid gap-1">
                <Badge variant={TONE[r.status] ?? "outline"}>{t.dynamic(`automations.runStatus.${r.status}`)}</Badge>
                {r.status === "waiting" && <span className="text-xs text-muted-foreground">{t("automations.until", { when: when(r.resume_at) })}</span>}
                {r.error && <span className="text-xs text-destructive">{r.error}</span>}
              </span>
            ),
          },
          {
            header: t("automations.steps"),
            cell: (r) => (
              <details className="text-xs">
                <summary className="cursor-pointer">{t("automations.stepCount", { count: (r.log as LogEntry[]).length })}</summary>
                <ol className="mt-1 grid gap-0.5">
                  {(r.log as LogEntry[]).map((l, i) => (
                    <li key={i} className={l.ok ? "" : "text-destructive"}>
                      {when(l.at)} · {t.dynamic(`automations.nodes.${l.type}`)}
                      {l.note && ` · ${l.note}`}
                    </li>
                  ))}
                </ol>
              </details>
            ),
          },
          {
            header: "",
            cell: (r) =>
              ctx.can("automations.manage") && (r.status === "waiting" || r.status === "queued") ? (
                <form action={cancelRun}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="workflow_id" value={id} />
                  <SubmitButton size="sm" variant="outline">
                    {t("automations.cancel")}
                  </SubmitButton>
                </form>
              ) : null,
          },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(runs?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />
    </div>
  )
}

export const instant = false
