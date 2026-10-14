import { FilterMenu } from "@/components/filter-menu"
import { SaveBar } from "@/components/save-bar"
import { Page, PageHeader } from "@/components/page"
import { notFound, redirect } from "next/navigation"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { getContext } from "@/lib/context"
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
  const ctx = await getContext()
  if (!ctx.modules.has("shifts")) notFound()
  if (!ctx.can("shifts.view")) {
    if (ctx.can("shifts.self")) redirect("/shifts/me")
    notFound()
  }
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
    .select("*, positions(name, color), locations(name), events(title), shift_assignments(staff_id, status, staff(name, color)), time_entries(staff_id, started_at, ended_at)")
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
  // Check-in/out of a shift = its time entry per person.
  const list = (shifts ?? []).map((s) => ({
    ...s,
    shift_assignments: s.shift_assignments.map((a) => {
      const e = s.time_entries.find((x) => x.staff_id === a.staff_id)
      return { ...a, checked_in_at: e?.started_at ?? null, checked_out_at: e?.ended_at ?? null }
    }),
  }))
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
    <Page>
      <PageHeader
        area="shifts"
        title={event ? `${t("shifts.title")} · ${event.title}` : t("shifts.title")}
        meta={t("shifts.coverage", { filled, needed })}
        settings={canManage && { href: "/shifts/settings", label: t("common.settings") }}
        primary={canManage ? { href: withParams(sp, { new: "shift", shift: undefined }), label: t("shifts.newShift") } : undefined}
      />
      <Notice error={!editing && !creating ? param(sp, "error") : undefined} ok={param(sp, "ok")} />
      <div className="flex flex-wrap items-center gap-2">
        {!!events?.length && <FilterMenu param="event" label={t("shifts.event")} allLabel={t("shifts.allWeek")} options={events.map((e) => ({ value: e.id, label: `${e.title} · ${t.date(e.starts_at, { dateStyle: "short" })}` }))} />}
        {(locations?.length ?? 0) > 0 && <FilterMenu param="location" label={t("shifts.location")} allLabel={t("shifts.allLocations")} options={(locations ?? []).map((l) => ({ value: l.id, label: l.name }))} />}
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
                // Created in a person's column (per-person view): that person gets assigned.
                assign: !editing ? ((staff ?? []).find((p) => p.id === param(sp, "resource")) ?? null) : null,
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
    </Page>
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
  defaults: { event: string | null; location: string | null; start: string; end?: string; assign?: { id: string; name: string } | null }
}) {
  return (
    <form action={saveShift} className="grid gap-4">
      {shift && <input type="hidden" name="id" value={shift.id} />}
      <input type="hidden" name="return" value={returnTo} />
      {defaults.assign && (
        <>
          <input type="hidden" name="assign" value={defaults.assign.id} />
          <p className="rounded-lg border bg-muted px-3 py-2 text-sm">{t("shifts.assignOnCreate", { name: defaults.assign.name })}</p>
        </>
      )}
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
      <SaveBar label={shift ? undefined : t("shifts.newShift")} always={!shift} />
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
