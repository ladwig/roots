import Link from "next/link"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { DataTable } from "@/components/data-table"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { getT } from "@/i18n/server"
import { toLocalInput, type monthOf } from "@/lib/time"
import { minutes, warnings, type Entry } from "@/shifts/time"
import { deleteEntry, saveEntry } from "@/app/(app)/shifts/time-actions"

// Time tracking screens: own entries ("Meine Schichten") and one person's month (Stunden › Name).
export type TimeRow = Entry & { note: string | null; approved_at: string | null; shift_id: string | null; shifts?: { title: string | null; positions: { name: string } | null } | null }
export const TIME_COLS = "id, started_at, ended_at, break_minutes, note, approved_at, shift_id, shifts(title, positions(name))"

export { monthOf } from "@/lib/time"

export async function MonthNav({ month, href }: { month: ReturnType<typeof monthOf>; href: (m: string) => string }) {
  const t = await getT()
  return (
    <div className="flex items-center gap-1">
      <Button render={<Link href={href(month.prev)} />} nativeButton={false} size="icon-sm" variant="outline" aria-label={t("shifts.prevMonth")}>
        <ChevronLeftIcon />
      </Button>
      <span className="min-w-36 text-center text-sm font-medium">{t.date(`${month.month}-15T12:00:00Z`, { month: "long", year: "numeric" })}</span>
      <Button render={<Link href={href(month.next)} />} nativeButton={false} size="icon-sm" variant="outline" aria-label={t("shifts.nextMonth")}>
        <ChevronRightIcon />
      </Button>
    </div>
  )
}

export const hoursText = (t: Awaited<ReturnType<typeof getT>>, min: number) => `${t.number(min / 60, { maximumFractionDigits: 2 })} h`

/** Entries of one person with net time, break (auto/manual), approval and law warnings. Rows open `?edit=<id>`. */
export async function TimeEntryList({ rows, editHref }: { rows: TimeRow[]; editHref: (id: string) => string | null }) {
  const t = await getT()
  const warn = warnings(rows)
  const time = (iso: string) => t.date(iso, { hour: "2-digit", minute: "2-digit" })
  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.id}
      empty={t("time.empty")}
      columns={[
        {
          header: t("time.day"),
          cell: (r) => {
            const href = editHref(r.id)
            const label = t.date(r.started_at, { weekday: "short", day: "numeric", month: "short" })
            return href ? (
              <Link href={href} className="font-medium underline-offset-4 hover:underline">
                {label}
              </Link>
            ) : (
              <span className="font-medium">{label}</span>
            )
          },
        },
        { header: t("time.span"), cell: (r) => `${time(r.started_at)}–${r.ended_at ? time(r.ended_at) : "…"}`, className: "tabular-nums" },
        {
          header: t("time.break"),
          cell: (r) => {
            const m = minutes(r)
            return `${m.break} min${m.auto ? ` (${t("time.auto")})` : ""}`
          },
          className: "tabular-nums",
        },
        { header: t("time.net"), cell: (r) => (r.ended_at ? hoursText(t, minutes(r).net) : <Badge>{t("time.running")}</Badge>), className: "tabular-nums" },
        { header: t("time.what"), cell: (r) => [r.shifts?.positions?.name ?? r.shifts?.title, r.note].filter(Boolean).join(" · ") || "–" },
        {
          header: t("time.status"),
          cell: (r) => (
            <span className="flex flex-wrap gap-1">
              {r.approved_at ? <Badge variant="secondary">{t("time.approvedBadge")}</Badge> : <Badge variant="outline">{t("time.openBadge")}</Badge>}
              {(warn.get(r.id) ?? []).map((w) => (
                <Badge key={w} variant="destructive" title={t.dynamic(`time.warnings.${w}.hint`)}>
                  {t.dynamic(`time.warnings.${w}.label`)}
                </Badge>
              ))}
            </span>
          ),
        },
      ]}
    />
  )
}

/** New/edit form for the drawer. `staffId` only when someone with manage/approve adds an entry for a person. */
export async function TimeEntryForm({ entry, staffId, returnTo, canDelete }: { entry?: TimeRow | null; staffId?: string; returnTo: string; canDelete: boolean }) {
  const t = await getT()
  return (
    <div className="grid gap-6">
      <form action={saveEntry} className="grid gap-4">
        {entry && <input type="hidden" name="id" value={entry.id} />}
        {staffId && <input type="hidden" name="staff" value={staffId} />}
        <input type="hidden" name="return" value={returnTo} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="te-start">{t("time.start")}</Label>
            <Input id="te-start" name="started_at" type="datetime-local" required defaultValue={entry ? toLocalInput(entry.started_at) : ""} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="te-end">{t("time.end")}</Label>
            <Input id="te-end" name="ended_at" type="datetime-local" defaultValue={entry?.ended_at ? toLocalInput(entry.ended_at) : ""} />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="te-break">{t("time.breakMinutes")}</Label>
          <Input id="te-break" name="break_minutes" type="number" min={0} max={1440} inputMode="numeric" placeholder={t("time.breakAuto")} defaultValue={entry?.break_minutes ?? ""} className="max-w-40" />
          <p className="text-xs text-muted-foreground">{t("time.breakHint")}</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="te-note">{t("time.note")}</Label>
          <Textarea id="te-note" name="note" maxLength={500} rows={2} defaultValue={entry?.note ?? ""} />
        </div>
        <SubmitButton className="justify-self-start">{t("time.save")}</SubmitButton>
      </form>
      {entry && canDelete && (
        <form action={deleteEntry}>
          <input type="hidden" name="id" value={entry.id} />
          <input type="hidden" name="return" value={returnTo} />
          <SubmitButton variant="outline" size="sm">
            {t("time.delete")}
          </SubmitButton>
        </form>
      )}
    </div>
  )
}
