import Link from "next/link"
import { notFound } from "next/navigation"
import { PlusIcon } from "lucide-react"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { fromLocalInput, toLocalInput } from "@/lib/time"
import { param, withParams } from "@/lib/url"
import { assign, deleteShift, moveShift, saveShift } from "./actions"
import { CalendarView, type CalendarItem } from "@/components/calendar-view"

const day = (d: string) => new Date(`${d}T12:00:00Z`)
const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (d: string, n: number) => iso(new Date(day(d).getTime() + n * 86_400_000))
const monday = (d: string) => addDays(d, -((day(d).getUTCDay() + 6) % 7))
const berlinDay = (ts: string) => new Date(ts).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })

export default async function ShiftPlan({ searchParams }: PageProps<"/shifts">) {
  const ctx = await requirePerm("shifts.view")
  if (!ctx.modules.has("shifts")) notFound()
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("shifts.manage")
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
  const dateParam = param(sp, "date")
  const focus = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today
  const week = monday(focus)
  const eventId = param(sp, "event")
  const locationId = param(sp, "location")

  let q = ctx.supabase
    .from("shifts")
    .select("*, positions(name, color), locations(name), events(title), shift_assignments(staff_id, status, checked_in_at, checked_out_at, staff(name, color))")
    .eq("org_id", ctx.org.id)
    .order("starts_at")
  q = eventId
    ? q.eq("event_id", eventId)
    : q.gte("starts_at", fromLocalInput(`${addDays(focus, -42)}T00:00`)!.toISOString()).lt("starts_at", fromLocalInput(`${addDays(focus, 49)}T00:00`)!.toISOString())
  if (locationId) q = q.eq("location_id", locationId)
  const [{ data: shifts }, { data: staff }, { data: positions }, { data: locations }, { data: events }] = await Promise.all([
    q,
    ctx.supabase.from("staff").select("id, name, position_ids, active").eq("org_id", ctx.org.id).eq("active", true).order("name"),
    ctx.supabase.from("positions").select("id, name, needed, location_id").eq("org_id", ctx.org.id).order("position").order("name"),
    ctx.supabase.from("locations").select("id, name").eq("org_id", ctx.org.id).order("name"),
    ctx.supabase.from("events").select("id, title, starts_at").eq("org_id", ctx.org.id).is("deleted_at", null).gte("starts_at", new Date(new Date().getTime() - 30 * 86_400_000).toISOString()).order("starts_at").limit(100),
  ])
  const list = shifts ?? []
  const assigned = (s: (typeof list)[number]) => s.shift_assignments.filter((a) => a.status === "assigned")
  // Coverage of the focused week (or the whole event).
  const inWeek = eventId ? list : list.filter((s) => berlinDay(s.starts_at) >= week && berlinDay(s.starts_at) < addDays(week, 7))
  const needed = inWeek.reduce((n, s) => n + s.needed, 0)
  const filled = inWeek.reduce((n, s) => n + Math.min(assigned(s).length, s.needed), 0)
  const color = (s: (typeof list)[number]) => (assigned(s).length >= s.needed ? "var(--chart-1)" : assigned(s).length > 0 ? "var(--chart-4)" : "var(--destructive)")
  const label = (s: (typeof list)[number]) => s.positions?.name ?? s.title ?? ""
  const calEvents: CalendarItem[] = list.map((s) => ({
    id: s.id,
    title: `${label(s)} · ${assigned(s).length}/${s.needed}${assigned(s).length ? ` · ${assigned(s).map((a) => a.staff?.name).join(", ")}` : ""}`,
    start: s.starts_at,
    end: s.ends_at,
    color: color(s),
    href: withParams(sp, { shift: s.id, new: undefined }),
  }))
  const resourceEvents: CalendarItem[] = list.flatMap((s) =>
    assigned(s).map((a) => ({ id: `${s.id}:${a.staff_id}`, title: label(s), start: s.starts_at, end: s.ends_at, resourceId: a.staff_id, href: withParams(sp, { shift: s.id, new: undefined }), readOnly: true })),
  )
  const editing = list.find((s) => s.id === param(sp, "shift"))
  const creating = canManage && param(sp, "new") === "shift"
  const event = events?.find((e) => e.id === eventId)
  const returnTo = `/shifts?${new URLSearchParams(Object.entries({ view: param(sp, "view") ?? "", date: dateParam ?? "", event: eventId ?? "", location: locationId ?? "" }).filter(([, v]) => v))}`

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">{event ? `${t("shifts.title")} · ${event.title}` : t("shifts.title")}</h1>
        {canManage && (
          <Button render={<Link href={withParams(sp, { new: "shift", shift: undefined })} scroll={false} />} nativeButton={false} size="sm">
            <PlusIcon /> {t("shifts.newShift")}
          </Button>
        )}
      </div>
      <Notice error={!editing && !creating ? param(sp, "error") : undefined} ok={param(sp, "ok")} />
      <div className="flex flex-wrap items-center gap-3">
        <form className="flex flex-wrap items-center gap-2">
          {param(sp, "view") && <input type="hidden" name="view" value={param(sp, "view")} />}
          {dateParam && <input type="hidden" name="date" value={dateParam} />}
          <NativeSelect name="event" defaultValue={eventId ?? ""} aria-label={t("shifts.event")} className="w-56 max-w-full">
            <NativeSelectOption value="">{t("shifts.allWeek")}</NativeSelectOption>
            {events?.map((e) => (
              <NativeSelectOption key={e.id} value={e.id}>
                {e.title} · {t.date(e.starts_at, { dateStyle: "short" })}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {(locations?.length ?? 0) > 0 && (
            <NativeSelect name="location" defaultValue={locationId ?? ""} aria-label={t("shifts.location")} className="w-44">
              <NativeSelectOption value="">{t("shifts.allLocations")}</NativeSelectOption>
              {locations?.map((l) => (
                <NativeSelectOption key={l.id} value={l.id}>
                  {l.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
          <Button type="submit" size="sm" variant="outline">
            {t("shifts.show")}
          </Button>
        </form>
        <span className="text-sm text-muted-foreground">{t("shifts.coverage", { filled, needed })}</span>
      </div>

      <CalendarView
        events={calEvents}
        resourceEvents={resourceEvents}
        resources={(staff ?? []).map((p) => ({ id: p.id, title: p.name }))}
        views={["week", "day", "month", "agenda", "resource"]}
        defaultView={eventId ? "agenda" : "week"}
        newHref={canManage ? withParams(sp, { new: "shift", shift: undefined }) : undefined}
        onMove={canManage ? moveShift : undefined}
      />

      {(creating || editing) && (
        <UrlSheet params={["new", "shift"]} title={editing ? (editing.positions?.name ?? editing.title ?? "") : t("shifts.newShift")}>
          <Notice error={param(sp, "error")} />
          {canManage && (
            <ShiftForm
              t={t}
              shift={editing}
              returnTo={returnTo}
              positions={positions ?? []}
              locations={locations ?? []}
              events={events ?? []}
              defaults={{
                event: eventId ?? null,
                location: locationId ?? null,
                start: param(sp, "start") ? toLocalInput(param(sp, "start")!) : `${focus}T18:00`,
                end: param(sp, "end") ? toLocalInput(param(sp, "end")!) : undefined,
              }}
            />
          )}
          {editing && <Assignments t={t} shift={editing} staff={staff ?? []} canManage={canManage} returnTo={returnTo} />}
          {editing && canManage && (
            <form action={deleteShift}>
              <input type="hidden" name="id" value={editing.id} />
              <input type="hidden" name="return" value={returnTo} />
              <SubmitButton size="sm" variant="ghost">
                {t("shifts.deleteShift")}
              </SubmitButton>
            </form>
          )}
        </UrlSheet>
      )}
    </div>
  )
}

type Shift = {
  id: string
  title: string | null
  position_id: string | null
  location_id: string | null
  event_id: string | null
  starts_at: string
  ends_at: string
  needed: number
  open: boolean
  notes: string | null
  shift_assignments: { staff_id: string; status: string; checked_in_at: string | null; checked_out_at: string | null; staff: { name: string } | null }[]
}

function ShiftForm({
  t,
  shift,
  returnTo,
  positions,
  locations,
  events,
  defaults,
}: {
  t: T
  shift?: Shift
  returnTo: string
  positions: { id: string; name: string; needed: number }[]
  locations: { id: string; name: string }[]
  events: { id: string; title: string; starts_at: string }[]
  defaults: { event: string | null; location: string | null; start: string; end?: string }
}) {
  return (
    <form action={saveShift} className="grid gap-4">
      {shift && <input type="hidden" name="id" value={shift.id} />}
      <input type="hidden" name="return" value={returnTo} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="sh-pos">{t("shifts.position")}</Label>
          <NativeSelect id="sh-pos" name="position" defaultValue={shift?.position_id ?? ""} className="w-full">
            <NativeSelectOption value="">–</NativeSelectOption>
            {positions.map((p) => (
              <NativeSelectOption key={p.id} value={p.id}>
                {p.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="sh-title">{t("shifts.titleLabel")}</Label>
          <Input id="sh-title" name="title" defaultValue={shift?.title ?? ""} maxLength={100} placeholder={t("shifts.titlePlaceholder")} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="sh-start">{t("shifts.start")}</Label>
          <Input id="sh-start" name="starts_at" type="datetime-local" required defaultValue={shift ? toLocalInput(shift.starts_at) : defaults.start} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="sh-end">{t("shifts.end")}</Label>
          <Input id="sh-end" name="ends_at" type="datetime-local" required defaultValue={shift ? toLocalInput(shift.ends_at) : defaults.end} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="sh-needed">{t("shifts.needed")}</Label>
          <Input id="sh-needed" name="needed" type="number" min={1} max={100} defaultValue={shift?.needed ?? 1} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="sh-event">{t("shifts.event")}</Label>
          <NativeSelect id="sh-event" name="event" defaultValue={shift?.event_id ?? defaults.event ?? ""} className="w-full">
            <NativeSelectOption value="">–</NativeSelectOption>
            {events.map((e) => (
              <NativeSelectOption key={e.id} value={e.id}>
                {e.title}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="sh-loc">{t("shifts.location")}</Label>
          <NativeSelect id="sh-loc" name="location" defaultValue={shift?.location_id ?? defaults.location ?? ""} className="w-full">
            <NativeSelectOption value="">–</NativeSelectOption>
            {locations.map((l) => (
              <NativeSelectOption key={l.id} value={l.id}>
                {l.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="open" value="1" defaultChecked={shift?.open ?? true} className="size-4" />
        {t("shifts.openLabel")}
      </label>
      <div className="grid gap-2">
        <Label htmlFor="sh-notes">{t("shifts.notes")}</Label>
        <Input id="sh-notes" name="notes" defaultValue={shift?.notes ?? ""} maxLength={2000} />
      </div>
      <SubmitButton className="justify-self-start">{shift ? t("common.save") : t("shifts.newShift")}</SubmitButton>
    </form>
  )
}

function Assignments({ t, shift, staff, canManage, returnTo }: { t: T; shift: Shift; staff: { id: string; name: string; position_ids: string[] }[]; canManage: boolean; returnTo: string }) {
  const taken = new Set(shift.shift_assignments.map((a) => a.staff_id))
  const act = (staffId: string, what: string, label: string, variant: "default" | "outline" | "ghost" = "ghost") => (
    <form action={assign}>
      <input type="hidden" name="id" value={shift.id} />
      <input type="hidden" name="staff" value={staffId} />
      <input type="hidden" name="what" value={what} />
      <input type="hidden" name="return" value={returnTo} />
      <SubmitButton size="sm" variant={variant}>
        {label}
      </SubmitButton>
    </form>
  )
  const time = (v: string) => new Date(v).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" })
  return (
    <section className="grid gap-3" aria-labelledby="assigned">
      <h3 id="assigned" className="font-medium">
        {t("shifts.people", { count: shift.shift_assignments.filter((a) => a.status === "assigned").length, needed: shift.needed })}
      </h3>
      <ul className="grid gap-2">
        {shift.shift_assignments.map((a) => (
          <li key={a.staff_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
            <span>
              {a.staff?.name}
              {a.status === "applied" && <Badge variant="outline" className="ml-2">{t("shifts.applied")}</Badge>}
              {a.checked_in_at && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {time(a.checked_in_at)}
                  {a.checked_out_at && `–${time(a.checked_out_at)}`}
                </span>
              )}
            </span>
            {canManage && (
              <span className="flex flex-wrap gap-1">
                {a.status === "applied" && act(a.staff_id, "assign", t("shifts.approve"), "default")}
                {a.status === "assigned" && !a.checked_in_at && act(a.staff_id, "check_in", t("shifts.checkIn"), "outline")}
                {a.status === "assigned" && a.checked_in_at && !a.checked_out_at && act(a.staff_id, "check_out", t("shifts.checkOut"), "outline")}
                {act(a.staff_id, "remove", t("shifts.remove"))}
              </span>
            )}
          </li>
        ))}
      </ul>
      {canManage && (
        <form action={assign} className="flex flex-wrap gap-2">
          <input type="hidden" name="id" value={shift.id} />
          <input type="hidden" name="what" value="assign" />
          <input type="hidden" name="return" value={returnTo} />
          <NativeSelect name="staff" aria-label={t("shifts.addPerson")} className="w-56 max-w-full">
            {staff
              .filter((s) => !taken.has(s.id))
              .map((s) => (
                <NativeSelectOption key={s.id} value={s.id}>
                  {s.name}
                  {shift.position_id && s.position_ids.length && !s.position_ids.includes(shift.position_id) ? ` (${t("shifts.notQualified")})` : ""}
                </NativeSelectOption>
              ))}
          </NativeSelect>
          <SubmitButton size="sm" variant="outline">
            {t("shifts.addPerson")}
          </SubmitButton>
        </form>
      )}
    </section>
  )
}

export const instant = false
