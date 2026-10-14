import Link from "next/link"
import { ActionsMenu, MenuExport } from "@/components/actions-menu"
import { Page, PageHeader } from "@/components/page"
import { DataTable } from "@/components/data-table"
import { MonthNav } from "@/components/time-entries"
import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import { payrollMonth } from "@/hr/server"
import { requirePerm } from "@/lib/context"
import { monthOf } from "@/lib/time"
import { param } from "@/lib/url"

// Payroll preparation per month: approved hours (from shifts), absences, gross preview, warnings (Minijob limit,
// minimum wage). roots doesn't run payroll: the export goes to the tax advisor / payroll software.
export default async function PayrollPage({ searchParams }: PageProps<"/hr/payroll">) {
  const ctx = await requirePerm("hr.view")
  const t = await getT()
  const sp = await searchParams
  const month = monthOf(param(sp, "month"))
  const rows = await payrollMonth(ctx.supabase, ctx.org.id, month)
  const hours = (m: number) => t.number(m / 60, { maximumFractionDigits: 2 })
  const open = rows.reduce((n, r) => n + r.unapproved_entries, 0)

  return (
    <Page>
      <PageHeader
        area="hr"
        title={t("hr.tabs.payroll")}
        description={
          <>
            {t("hr.payrollHint")} {open > 0 && t("hr.unapproved", { count: open })}
          </>
        }
        actions={<MonthNav month={month} href={(m) => `/hr/payroll?month=${m}`} />}
        menu={
          <ActionsMenu>
            <MenuExport entity="payroll" query={{ month: month.month }} />
          </ActionsMenu>
        }
      />
      <DataTable
        rows={rows}
        rowKey={(r) => r.employee_id}
        empty={t("hr.empty")}
        columns={[
          {
            header: t("hr.name"),
            cell: (r) => (
              <Link href={`/hr/${r.employee_id}#pay`} className="grid underline-offset-4 hover:underline">
                <span className="font-medium">{r.name}</span>
                <span className="text-xs text-muted-foreground">{t.dynamic(`hr.types.${r.employment_type}`)}</span>
              </Link>
            ),
          },
          { header: t("hr.hours"), cell: (r) => hours(r.approved_minutes), className: "tabular-nums" },
          {
            header: t("hr.rate"),
            cell: (r) => (r.pay_type === "hourly" && r.hourly_rate_cents != null ? `${t.money(r.hourly_rate_cents)}/h` : r.pay_type === "monthly" && r.monthly_salary_cents != null ? t.money(r.monthly_salary_cents) : "–"),
            className: "tabular-nums",
          },
          { header: t("hr.grossShort"), cell: (r) => (r.gross_cents != null ? t.money(r.gross_cents) : "–"), className: "tabular-nums" },
          {
            header: t("hr.tabs.absences"),
            cell: (r) =>
              [r.vacation_days && `${t.dynamic("hr.kinds.vacation")} ${t.number(r.vacation_days)}`, r.sick_days && `${t.dynamic("hr.kinds.sick")} ${t.number(r.sick_days)}`, r.other_absence_days && `${t("hr.otherAbsence")} ${t.number(r.other_absence_days)}`]
                .filter(Boolean)
                .join(" · ") || "–",
          },
          {
            header: t("hr.notesShort"),
            cell: (r) => (
              <span className="flex flex-wrap gap-1">
                {r.warnings.map((w) => (
                  <Badge key={w} variant="destructive">
                    {t.dynamic(`hr.payWarnings.${w}`)}
                  </Badge>
                ))}
                {r.unapproved_entries > 0 && <Badge variant="outline">{t("time.toApprove", { count: r.unapproved_entries })}</Badge>}
              </span>
            ),
          },
        ]}
      />
    </Page>
  )
}

export const instant = false
