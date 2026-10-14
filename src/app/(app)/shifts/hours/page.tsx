import Link from "next/link"
import { ActionsMenu, MenuExport } from "@/components/actions-menu"
import { Page, PageHeader } from "@/components/page"
import { notFound } from "next/navigation"
import { DataTable } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { hoursText, MonthNav, monthOf } from "@/components/time-entries"
import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param } from "@/lib/url"
import { minutes, warnings } from "@/shifts/time"

// Time account per person and month: planned (assigned shifts), worked (time entries, net of breaks), target,
// balance, approval and law warnings. A name opens that person's entries (edit, approve).
export default async function HoursPage({ searchParams }: PageProps<"/shifts/hours">) {
  const ctx = await requirePerm("shifts.view")
  if (!ctx.modules.has("shifts")) notFound()
  const t = await getT()
  const sp = await searchParams
  const month = monthOf(param(sp, "month"))
  const [{ data: staff }, { data: planned }, { data: entries }] = await Promise.all([
    ctx.supabase.from("staff").select("id, name, target_hours, active").eq("org_id", ctx.org.id).order("name"),
    ctx.supabase.from("shift_assignments").select("staff_id, shifts!inner(starts_at, ends_at)").eq("org_id", ctx.org.id).eq("status", "assigned").gte("shifts.starts_at", month.from).lt("shifts.starts_at", month.to),
    ctx.supabase.from("time_entries").select("id, staff_id, started_at, ended_at, break_minutes, approved_at").eq("org_id", ctx.org.id).gte("started_at", month.from).lt("started_at", month.to),
  ])
  const table = (staff ?? [])
    .map((s) => {
      const shifts = (planned ?? []).filter((r) => r.staff_id === s.id)
      const mine = (entries ?? []).filter((e) => e.staff_id === s.id)
      const done = mine.filter((e) => e.ended_at)
      return {
        ...s,
        count: shifts.length,
        planned: shifts.reduce((sum, r) => sum + (new Date(r.shifts.ends_at).getTime() - new Date(r.shifts.starts_at).getTime()) / 60_000, 0),
        worked: done.reduce((sum, e) => sum + minutes(e).net, 0),
        entries: mine.length,
        unapproved: done.filter((e) => !e.approved_at).length,
        warned: [...warnings(mine).values()].filter((w) => w.length).length,
      }
    })
    .filter((s) => s.active || s.count || s.entries)
  const unapproved = table.reduce((n, s) => n + s.unapproved, 0)

  return (
    <Page>
      <PageHeader
        area="shifts"
        title={t("shifts.tabs.hours")}
        actions={<MonthNav month={month} href={(m) => `/shifts/hours?month=${m}`} />}
        menu={
          <ActionsMenu>
            <MenuExport entity="hours" query={{ month: month.month }} label={t("time.exportTotals")} />
            <MenuExport entity="time" query={{ month: month.month }} label={t("time.exportEntries")} />
          </ActionsMenu>
        }
      />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <p className="text-sm text-muted-foreground">
        {t("shifts.hoursHint")} {unapproved > 0 && t("time.exportOnlyApproved", { count: unapproved })}
      </p>
      <DataTable
        rows={table}
        rowKey={(s) => s.id}
        empty={t("shifts.noStaff")}
        columns={[
          {
            header: t("shifts.name"),
            cell: (s) => (
              <Link href={`/shifts/hours/${s.id}?month=${month.month}`} className="font-medium underline-offset-4 hover:underline">
                {s.name}
              </Link>
            ),
          },
          { header: t("shifts.shiftCount"), cell: (s) => s.count, className: "tabular-nums" },
          { header: t("shifts.planned"), cell: (s) => hoursText(t, s.planned), className: "tabular-nums" },
          { header: t("shifts.worked"), cell: (s) => hoursText(t, s.worked), className: "tabular-nums" },
          { header: t("shifts.targetHours"), cell: (s) => (s.target_hours != null ? `${t.number(Number(s.target_hours))} h` : "–"), className: "tabular-nums" },
          {
            header: t("shifts.balance"),
            cell: (s) => {
              if (s.target_hours == null) return "–"
              const diff = s.worked - Number(s.target_hours) * 60
              return <span className={diff < 0 ? "text-muted-foreground" : "font-medium"}>{`${diff >= 0 ? "+" : "−"}${hoursText(t, Math.abs(diff))}`}</span>
            },
            className: "tabular-nums",
          },
          {
            header: t("time.status"),
            cell: (s) => (
              <span className="flex flex-wrap gap-1">
                {s.entries === 0 ? "–" : s.unapproved ? <Badge variant="outline">{t("time.toApprove", { count: s.unapproved })}</Badge> : <Badge variant="secondary">{t("time.approvedBadge")}</Badge>}
                {s.warned > 0 && <Badge variant="destructive">{t("time.warningCount", { count: s.warned })}</Badge>}
              </span>
            ),
          },
        ]}
      />
    </Page>
  )
}

export const instant = false
