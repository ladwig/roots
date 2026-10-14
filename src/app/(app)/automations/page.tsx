import Link from "next/link"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { PlusIcon } from "lucide-react"
import { DataTable } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UrlSheet } from "@/components/url-sheet"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { parseRecordTrigger } from "@/automations/objects"
import { TEMPLATES } from "@/automations/templates"
import { createWorkflow } from "./actions"

// Workflows: when something happens → conditions → waits → actions. New = blank, from a template or imported JSON.
export default async function AutomationsPage({ searchParams }: PageProps<"/automations">) {
  const ctx = await requirePerm("automations.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("automations.manage")
  const { data } = await ctx.supabase
    .from("workflows")
    .select("id, name, active, trigger_type, updated_at, all:workflow_runs(count), open:workflow_runs(count), bad:workflow_runs(count)")
    .eq("org_id", ctx.org.id)
    .is("deleted_at", null)
    .in("open.status", ["queued", "waiting"])
    .eq("bad.status", "failed")
    .order("name")
  const count = (x: { count: number }[] | null | undefined) => x?.[0]?.count ?? 0
  const rows = (data ?? []).map((w) => ({ ...w, total: count(w.all), waiting: count(w.open), failed: count(w.bad) }))
  const templates = TEMPLATES.filter((x) => !x.module || ctx.modules.has(x.module))

  return (
    <Page>
      <PageHeader area="automations" title={t("automations.title")} description={t("automations.intro")} primary={canManage ? { href: `/automations${withParams(sp, { new: "1" })}`, label: t("automations.new") } : undefined} />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <DataTable
        rows={rows}
        rowKey={(w) => w.id}
        empty={
          <EmptyState
            area="automations"
            title={t("automations.empty")}
            action={
              canManage && (
                <Button render={<Link href={`/automations${withParams(sp, { new: "1" })}`} />} nativeButton={false} size="sm">
                  <PlusIcon /> {t("automations.new")}
                </Button>
              )
            }
          />
        }
        columns={[
          {
            header: t("automations.name"),
            cell: (w) => (
              <Link href={`/automations/${w.id}`} className="font-medium underline-offset-4 hover:underline">
                {w.name}
              </Link>
            ),
          },
          {
            header: t("automations.when"),
            cell: (w) => {
              const rec = w.trigger_type ? parseRecordTrigger(w.trigger_type) : null
              return rec ? `${t.dynamic(`automations.objects.${rec.object}`)} · ${t.dynamic(`automations.recordActions.${rec.action}`)}` : w.trigger_type ? t.dynamic(`events.types.${w.trigger_type}`) : "–"
            },
          },
          { header: t("automations.status"), cell: (w) => <Badge variant={w.active ? "default" : "secondary"}>{t(w.active ? "automations.on" : "automations.off")}</Badge> },
          {
            header: t("automations.runs"),
            cell: (w) => (
              <Link href={`/automations/${w.id}/runs`} className="flex flex-wrap items-center gap-2 tabular-nums underline-offset-4 hover:underline">
                {w.total}
                {w.waiting > 0 && <Badge variant="outline">{t("automations.waitingCount", { count: w.waiting })}</Badge>}
                {w.failed > 0 && <Badge variant="destructive">{t("automations.failedCount", { count: w.failed })}</Badge>}
              </Link>
            ),
          },
        ]}
      />
      {canManage && param(sp, "new") && (
        <UrlSheet params={["new"]} title={t("automations.new")}>
          <Notice error={param(sp, "error")} />
          <div className="grid gap-6">
            <section className="grid gap-2">
              <h2 className="text-sm font-medium">{t("automations.fromTemplate")}</h2>
              <ul className="grid gap-2">
                {templates.map((tpl) => (
                  <li key={tpl.key}>
                    <form action={createWorkflow} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                      <input type="hidden" name="template" value={tpl.key} />
                      <span className="grid text-sm">
                        <span className="font-medium">{t.dynamic(`automations.templates.${tpl.key}.name`)}</span>
                        <span className="text-xs text-muted-foreground">{t.dynamic(`automations.templates.${tpl.key}.text`)}</span>
                      </span>
                      <SubmitButton size="sm" variant="outline">
                        {t("automations.use")}
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
            <form action={createWorkflow} className="grid gap-2">
              <h2 className="text-sm font-medium">{t("automations.blank")}</h2>
              <div className="flex flex-wrap gap-2">
                <Input name="name" maxLength={200} placeholder={t("automations.namePlaceholder")} aria-label={t("automations.name")} className="min-w-0 flex-1" />
                <SubmitButton>{t("automations.create")}</SubmitButton>
              </div>
            </form>
            <form action={createWorkflow} className="grid gap-2">
              <h2 className="text-sm font-medium">{t("automations.import")}</h2>
              <p className="text-xs text-muted-foreground">{t("automations.importHint")}</p>
              <Label htmlFor="wf-file" className="sr-only">
                {t("automations.importFile")}
              </Label>
              <Input id="wf-file" name="file" type="file" accept="application/json,.json" required />
              <SubmitButton variant="outline" className="justify-self-start">
                {t("automations.importButton")}
              </SubmitButton>
            </form>
          </div>
        </UrlSheet>
      )}
    </Page>
  )
}

export const instant = false
