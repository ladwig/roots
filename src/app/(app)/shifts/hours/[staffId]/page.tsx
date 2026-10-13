import Link from "next/link"
import { notFound } from "next/navigation"
import { PlusIcon } from "lucide-react"
import { Notice } from "@/components/notice"
import { PageCrumbs } from "@/components/page-crumbs"
import { SubmitButton } from "@/components/submit-button"
import { hoursText, MonthNav, monthOf, TIME_COLS, TimeEntryForm, TimeEntryList, type TimeRow } from "@/components/time-entries"
import { Button } from "@/components/ui/button"
import { UrlSheet } from "@/components/url-sheet"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { minutes } from "@/shifts/time"
import { approveMonth } from "../../time-actions"

// One person's month: entries with warnings; shifts.manage/approve correct and add entries, shifts.approve
// approves the month (then the person can't change those entries any more) or reopens it.
export default async function PersonHours({ params, searchParams }: { params: Promise<{ staffId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePerm("shifts.view")
  if (!ctx.modules.has("shifts")) notFound()
  const { staffId } = await params
  const sp = await searchParams
  const t = await getT()
  const month = monthOf(param(sp, "month"))
  const [{ data: person }, { data: rows }] = await Promise.all([
    ctx.supabase.from("staff").select("id, name, target_hours").eq("id", staffId).eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("time_entries").select(TIME_COLS).eq("org_id", ctx.org.id).eq("staff_id", staffId).gte("started_at", month.from).lt("started_at", month.to).order("started_at"),
  ])
  if (!person) notFound()
  const entries = (rows ?? []) as TimeRow[]
  const canEdit = ctx.can("shifts.manage") || ctx.can("shifts.approve")
  const canApprove = ctx.can("shifts.approve")
  const base = `/shifts/hours/${staffId}`
  const here = `${base}${withParams(sp, { edit: undefined, new: undefined })}`
  const editing = entries.find((e) => e.id === param(sp, "edit"))
  const done = entries.filter((e) => e.ended_at)
  const open = done.filter((e) => !e.approved_at).length
  const total = done.reduce((s, e) => s + minutes(e).net, 0)
  const approve = (undo: boolean) => (
    <form action={approveMonth}>
      <input type="hidden" name="staff" value={staffId} />
      <input type="hidden" name="month" value={month.month} />
      <input type="hidden" name="return" value={here} />
      {undo && <input type="hidden" name="undo" value="1" />}
      <SubmitButton size="sm" variant={undo ? "outline" : "default"}>
        {undo ? t("time.reopen") : t("time.approveMonth", { count: open })}
      </SubmitButton>
    </form>
  )

  return (
    <div className="grid gap-6">
      <PageCrumbs items={[{ href: `/shifts/hours?month=${month.month}`, label: t("shifts.tabs.hours") }, { label: person.name }]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">{person.name}</h1>
        <MonthNav month={month} href={(m) => `${base}?month=${m}`} />
      </div>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          {t("time.monthTotal", { hours: hoursText(t, total) })}
          {person.target_hours != null && ` · ${t("shifts.selfTarget", { hours: t.number(Number(person.target_hours)) })}`}
        </p>
        <span className="ml-auto flex flex-wrap gap-2">
          {canEdit && (
            <Button render={<Link href={`${base}${withParams(sp, { new: "time", edit: undefined })}`} />} nativeButton={false} size="sm" variant="outline">
              <PlusIcon /> {t("time.add")}
            </Button>
          )}
          {canApprove && open > 0 && approve(false)}
          {canApprove && done.length > open && approve(true)}
        </span>
      </div>
      <TimeEntryList rows={entries} editHref={(id) => (canEdit ? `${base}${withParams(sp, { edit: id, new: undefined })}` : null)} />
      {canEdit && (param(sp, "new") === "time" || editing) && (
        <UrlSheet params={["new", "edit"]} title={editing ? t("time.edit") : t("time.add")}>
          <Notice error={param(sp, "error")} />
          <TimeEntryForm entry={editing} staffId={staffId} returnTo={here} canDelete={ctx.can("shifts.manage")} />
        </UrlSheet>
      )}
    </div>
  )
}

export const instant = false
