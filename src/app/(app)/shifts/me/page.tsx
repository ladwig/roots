import Link from "next/link"
import { notFound } from "next/navigation"
import { PlusIcon } from "lucide-react"
import { Notice } from "@/components/notice"
import { ShiftSelfView } from "@/components/shift-self-view"
import { SubmitButton } from "@/components/submit-button"
import { hoursText, MonthNav, monthOf, TIME_COLS, TimeEntryForm, TimeEntryList, type TimeRow } from "@/components/time-entries"
import { Button } from "@/components/ui/button"
import { UrlSheet } from "@/components/url-sheet"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { selfView } from "@/shifts/server"
import { minutes } from "@/shifts/time"
import { selfAction } from "../actions"
import { clock } from "../time-actions"

export default async function MyShifts({ searchParams }: PageProps<"/shifts/me">) {
  const ctx = await requirePerm("shifts.self")
  if (!ctx.modules.has("shifts")) notFound()
  const t = await getT()
  const sp = await searchParams
  const month = monthOf(param(sp, "month"))
  const { data: staffId } = await ctx.supabase.rpc("my_staff_id", { p_org: ctx.org.id })
  if (!staffId)
    return (
      <div className="grid gap-6">
        <h1 className="font-heading text-2xl font-semibold">{t("shifts.tabs.me")}</h1>
        <p className="text-sm text-muted-foreground">{t("shifts.notInTeam")}</p>
      </div>
    )
  const [data, { data: rows }, { data: running }] = await Promise.all([
    selfView(staffId),
    ctx.supabase.from("time_entries").select(TIME_COLS).eq("staff_id", staffId).gte("started_at", month.from).lt("started_at", month.to).order("started_at"),
    ctx.supabase.from("time_entries").select("id, started_at").eq("staff_id", staffId).is("ended_at", null).maybeSingle(),
  ])
  const entries = (rows ?? []) as TimeRow[]
  const editId = param(sp, "edit")
  const editing = editId ? entries.find((e) => e.id === editId) : null
  const here = `/shifts/me${withParams(sp, { edit: undefined, new: undefined })}`
  const total = entries.filter((e) => e.ended_at).reduce((s, e) => s + minutes(e).net, 0)

  return (
    <div className="grid gap-6">
      <h1 className="font-heading text-2xl font-semibold">{t("shifts.tabs.me")}</h1>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />

      <section aria-labelledby="time" className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="time" className="font-medium">
            {t("time.title")}
          </h2>
          <MonthNav month={month} href={(m) => `/shifts/me?month=${m}`} />
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
          <form action={clock}>
            <SubmitButton variant={running ? "default" : "outline"}>{running ? t("time.clockOut") : t("time.clockIn")}</SubmitButton>
          </form>
          <p className="text-sm text-muted-foreground">
            {running ? t("time.since", { time: t.date(running.started_at, { weekday: "short", hour: "2-digit", minute: "2-digit" }) }) : t("time.clockHint")}
          </p>
          <Button render={<Link href={`/shifts/me${withParams(sp, { new: "time", edit: undefined })}`} />} nativeButton={false} size="sm" variant="ghost" className="ml-auto">
            <PlusIcon /> {t("time.add")}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{t("time.monthTotal", { hours: hoursText(t, total) })}</p>
        <TimeEntryList rows={entries} editHref={(id) => (entries.find((e) => e.id === id)?.approved_at ? null : `/shifts/me${withParams(sp, { edit: id, new: undefined })}`)} />
      </section>

      {data && <ShiftSelfView data={data} action={selfAction} />}

      {(param(sp, "new") === "time" || (editing && !editing.approved_at)) && (
        <UrlSheet params={["new", "edit"]} title={editing ? t("time.edit") : t("time.add")}>
          <Notice error={param(sp, "error")} />
          <TimeEntryForm entry={editing} returnTo={here} canDelete />
        </UrlSheet>
      )}
    </div>
  )
}

export const instant = false
