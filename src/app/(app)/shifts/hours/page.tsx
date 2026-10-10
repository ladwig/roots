import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { DataTable } from "@/components/data-table"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { fromLocalInput } from "@/lib/time"
import { param } from "@/lib/url"
import { workedMinutes } from "@/shifts/series"

// Time account per person and month: planned (assigned shifts), worked (from check-in/out), target, difference.
export default async function HoursPage({ searchParams }: PageProps<"/shifts/hours">) {
  const ctx = await requirePerm("shifts.view")
  if (!ctx.modules.has("shifts")) notFound()
  const t = await getT()
  const sp = await searchParams
  const now = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }).slice(0, 7)
  const month = /^\d{4}-\d{2}$/.test(param(sp, "month") ?? "") ? param(sp, "month")! : now
  const [y, m] = month.split("-").map(Number)
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`
  const [{ data: staff }, { data: rows }] = await Promise.all([
    ctx.supabase.from("staff").select("id, name, target_hours, active").eq("org_id", ctx.org.id).order("name"),
    ctx.supabase
      .from("shift_assignments")
      .select("staff_id, checked_in_at, checked_out_at, shifts!inner(starts_at, ends_at)")
      .eq("org_id", ctx.org.id)
      .eq("status", "assigned")
      .gte("shifts.starts_at", fromLocalInput(`${month}-01T00:00`)!.toISOString())
      .lt("shifts.starts_at", fromLocalInput(`${next}-01T00:00`)!.toISOString()),
  ])
  const hours = (min: number) => `${t.number(min / 60, { maximumFractionDigits: 1 })} h`
  const table = (staff ?? [])
    .map((s) => {
      const mine = (rows ?? []).filter((r) => r.staff_id === s.id)
      const planned = mine.reduce((sum, r) => sum + (new Date(r.shifts.ends_at).getTime() - new Date(r.shifts.starts_at).getTime()) / 60_000, 0)
      const worked = mine.reduce((sum, r) => sum + workedMinutes(r, r.shifts.ends_at), 0)
      return { ...s, count: mine.length, planned, worked }
    })
    .filter((s) => s.active || s.count)

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">{t("shifts.tabs.hours")}</h1>
        <div className="flex items-center gap-1">
          <Button render={<Link href={`/shifts/hours?month=${prev}`} />} nativeButton={false} size="icon-sm" variant="outline" aria-label={t("shifts.prevMonth")}>
            <ChevronLeftIcon />
          </Button>
          <span className="min-w-36 text-center text-sm font-medium">{t.date(`${month}-15T12:00:00Z`, { month: "long", year: "numeric" })}</span>
          <Button render={<Link href={`/shifts/hours?month=${next}`} />} nativeButton={false} size="icon-sm" variant="outline" aria-label={t("shifts.nextMonth")}>
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{t("shifts.hoursHint")}</p>
      <DataTable
        rows={table}
        rowKey={(s) => s.id}
        empty={t("shifts.noStaff")}
        columns={[
          { header: t("shifts.name"), cell: (s) => <span className="font-medium">{s.name}</span> },
          { header: t("shifts.shiftCount"), cell: (s) => s.count, className: "tabular-nums" },
          { header: t("shifts.planned"), cell: (s) => hours(s.planned), className: "tabular-nums" },
          { header: t("shifts.worked"), cell: (s) => hours(s.worked), className: "tabular-nums" },
          { header: t("shifts.targetHours"), cell: (s) => (s.target_hours != null ? `${t.number(Number(s.target_hours))} h` : "–"), className: "tabular-nums" },
          {
            header: t("shifts.balance"),
            cell: (s) => {
              if (s.target_hours == null) return "–"
              const diff = s.worked - Number(s.target_hours) * 60
              return <span className={diff < 0 ? "text-muted-foreground" : "font-medium"}>{`${diff >= 0 ? "+" : "−"}${hours(Math.abs(diff))}`}</span>
            },
            className: "tabular-nums",
          },
        ]}
      />
    </div>
  )
}

export const instant = false
