import Link from "next/link"
import { notFound } from "next/navigation"
import { contactName } from "@/app/(app)/contacts/fields"
import { ContactPicker } from "@/components/contact-picker"
import { Notice } from "@/components/notice"
import { PlusIcon, RepeatIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuExport, MenuSeparator, MenuSubmit } from "@/components/actions-menu"
import { Button } from "@/components/ui/button"
import { FormCard, Page, PageHeader, RecordLayout } from "@/components/page"
import { UrlSheet } from "@/components/url-sheet"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { attendanceRate } from "@/courses/fields"
import { requirePerm } from "@/lib/context"
import { param } from "@/lib/url"
import { addParticipant, addSessions, restoreCourse, setParticipantStatus, trashCourse } from "../actions"
import { CourseForm } from "../course-form"

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7]

// One course: details, dates (single or weekly series), participants with waiting list and attendance rate.
export default async function CoursePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const ctx = await requirePerm("courses.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("courses.manage")
  const [{ data: c }, { data: sessions }, { data: people }, { data: marks }, { data: locations }] = await Promise.all([
    ctx.supabase.from("courses").select("*").eq("id", id).eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("course_sessions").select("id, starts_at, ends_at, cancelled, note").eq("course_id", id).eq("org_id", ctx.org.id).order("starts_at"),
    ctx.supabase
      .from("course_participants")
      .select("id, status, note, created_at, contacts(id, first_name, last_name, company, email)")
      .eq("course_id", id)
      .eq("org_id", ctx.org.id)
      .order("created_at"),
    ctx.supabase.from("course_attendance").select("session_id, participant_id, present, course_sessions!inner(course_id)").eq("org_id", ctx.org.id).eq("course_sessions.course_id", id),
    ctx.supabase.from("locations").select("id, name").eq("org_id", ctx.org.id).order("name"),
  ])
  if (!c) notFound()
  const now = new Date().toISOString()
  const held = (sessions ?? []).filter((s) => !s.cancelled && s.starts_at <= now)
  const heldIds = new Set(held.map((s) => s.id))
  const rate = (pid: string) => attendanceRate((marks ?? []).filter((m) => m.participant_id === pid && m.present && heldIds.has(m.session_id)).length, held.length)
  const enrolled = (people ?? []).filter((p) => p.status === "enrolled")
  const waiting = (people ?? []).filter((p) => p.status === "waiting")
  const cancelled = (people ?? []).filter((p) => p.status === "cancelled")
  const when = (s: { starts_at: string; ends_at: string }) =>
    `${t.date(s.starts_at, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}–${t.date(s.ends_at, { hour: "2-digit", minute: "2-digit" })}`
  const statusButton = (pid: string, status: "enrolled" | "cancelled", label: string) => (
    <form action={setParticipantStatus}>
      <input type="hidden" name="id" value={pid} />
      <input type="hidden" name="course_id" value={id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton size="sm" variant="outline">
        {label}
      </SubmitButton>
    </form>
  )
  const person = (p: (typeof enrolled)[number]) => (
    <span className="grid">
      {p.contacts ? (
        <Link href={`/contacts/${p.contacts.id}`} className="font-medium underline-offset-4 hover:underline">
          {contactName(p.contacts)}
        </Link>
      ) : (
        "–"
      )}
      {p.note && <span className="text-xs text-muted-foreground">{p.note}</span>}
    </span>
  )

  return (
    <Page size="record">
      <PageHeader
        crumbs={[{ href: "/courses", label: t("courses.title") }, { label: c.title }]}
        title={c.title}
        meta={[c.instructor, c.capacity ? t("courses.placesOf", { taken: enrolled.length, total: c.capacity }) : t("courses.participantsCount", { count: enrolled.length })].filter(Boolean).join(" · ")}
        menu={
          !c.deleted_at && (
            <ActionsMenu>
              <MenuExport entity="course-participants" query={{ course: id }} label={t("courses.participants")} />
              {canManage && (
                <>
                  <MenuSeparator />
                  <MenuSubmit form="trash-course" icon={<Trash2Icon />} destructive>
                    {t("courses.toTrash")}
                  </MenuSubmit>
                </>
              )}
            </ActionsMenu>
          )
        }
      />
      {canManage && !c.deleted_at && (
        <form id="trash-course" action={trashCourse} hidden>
          <input type="hidden" name="id" value={c.id} />
        </form>
      )}
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />

      {c.deleted_at ? (
        <div className="grid max-w-xl gap-3">
          <p className="rounded-lg border bg-muted px-3 py-2 text-sm">{t("courses.inTrash")}</p>
          {canManage && (
            <form action={restoreCourse}>
              <input type="hidden" name="id" value={c.id} />
              <SubmitButton>{t("courses.restore")}</SubmitButton>
            </form>
          )}
        </div>
      ) : (
        <RecordLayout aside={<CourseForm t={t} c={c} locations={locations ?? []} disabled={!canManage} />}>
          <FormCard id="participants" title={t("courses.participants")}>
            {canManage && (
              <form action={addParticipant} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto] sm:items-end">
                <input type="hidden" name="course_id" value={id} />
                <ContactPicker name="contact_id" label={t("courses.addPerson")} placeholder={t("courses.searchContact")} />
                <div className="grid gap-2">
                  <Label htmlFor="p-note">{t("courses.note")}</Label>
                  <Input id="p-note" name="note" maxLength={500} />
                </div>
                <SubmitButton>{t("courses.add")}</SubmitButton>
              </form>
            )}
            <ul className="grid gap-2">
              {enrolled.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                  {person(p)}
                  <span className="flex flex-wrap items-center gap-2">
                    {c.track_attendance && rate(p.id) != null && <Badge variant="secondary">{t("courses.rate", { rate: rate(p.id)! })}</Badge>}
                    {canManage && statusButton(p.id, "cancelled", t("courses.remove"))}
                  </span>
                </li>
              ))}
              {!enrolled.length && <li className="text-sm text-muted-foreground">{t("courses.noParticipants")}</li>}
            </ul>
            {waiting.length > 0 && (
              <>
                <h3 className="text-sm font-medium">{t("courses.waitingList")}</h3>
                <ol className="grid gap-2">
                  {waiting.map((p, i) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-sm">
                      <span className="flex items-center gap-3">
                        <span className="tabular-nums text-muted-foreground">{i + 1}.</span>
                        {person(p)}
                      </span>
                      {canManage && statusButton(p.id, "cancelled", t("courses.remove"))}
                    </li>
                  ))}
                </ol>
              </>
            )}
            {cancelled.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">{t("courses.cancelledCount", { count: cancelled.length })}</summary>
                <ul className="mt-2 grid gap-2">
                  {cancelled.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                      {person(p)}
                      {canManage && statusButton(p.id, "enrolled", t("courses.reEnrol"))}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </FormCard>

          <FormCard
            id="dates"
            title={t("courses.dates")}
            action={
              canManage && (
                <span className="flex flex-wrap gap-2">
                  <Button render={<Link href={`/courses/${id}?new=series`} scroll={false} />} nativeButton={false} size="sm" variant="outline">
                    <RepeatIcon /> {t("courses.addSeries")}
                  </Button>
                  <Button render={<Link href={`/courses/${id}?new=date`} scroll={false} />} nativeButton={false} size="sm" variant="outline">
                    <PlusIcon /> {t("courses.addOne")}
                  </Button>
                </span>
              )
            }
          >
            <ul className="grid gap-2">
              {(sessions ?? []).map((s) => {
                const present = (marks ?? []).filter((m) => m.session_id === s.id && m.present).length
                const marked = (marks ?? []).some((m) => m.session_id === s.id)
                return (
                  <li key={s.id}>
                    <Link href={`/courses/${id}/sessions/${s.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                      <span className={s.cancelled ? "text-muted-foreground line-through" : "font-medium"}>{when(s)}</span>
                      <span className="flex flex-wrap items-center gap-2">
                        {s.note && <span className="text-xs text-muted-foreground">{s.note}</span>}
                        {s.cancelled ? (
                          <Badge variant="secondary">{t("courses.cancelledDate")}</Badge>
                        ) : (
                          c.track_attendance && marked && <Badge variant="outline">{t("courses.presentOf", { present, total: enrolled.length })}</Badge>
                        )}
                      </span>
                    </Link>
                  </li>
                )
              })}
              {!sessions?.length && <li className="text-sm text-muted-foreground">{t("courses.noDates")}</li>}
            </ul>
          </FormCard>
          {canManage && param(sp, "new") === "series" && (
            <UrlSheet params={["new"]} title={t("courses.addSeries")}>
                <form action={addSessions} className="grid gap-4">
                  <input type="hidden" name="course_id" value={id} />
                  <input type="hidden" name="mode" value="series" />
                  <fieldset className="flex flex-wrap gap-2">
                    <legend className="sr-only">{t("courses.weekdays")}</legend>
                    {WEEKDAYS.map((d) => (
                      <label key={d} className="flex items-center gap-1 text-sm">
                        <input type="checkbox" name="weekdays" value={d} className="size-4" />
                        {t.date(`2026-10-${11 + d}T12:00:00Z`, { weekday: "short" })}
                      </label>
                    ))}
                  </fieldset>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1">
                      <Label htmlFor="s-start">{t("courses.startTime")}</Label>
                      <Input id="s-start" name="start_time" type="time" required defaultValue="18:00" />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="s-end">{t("courses.endTime")}</Label>
                      <Input id="s-end" name="end_time" type="time" required defaultValue="19:30" />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="s-from">{t("courses.from")}</Label>
                      <Input id="s-from" name="from" type="date" required />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="s-to">{t("courses.to")}</Label>
                      <Input id="s-to" name="to" type="date" required />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    {t("courses.every")}
                    <Input name="every_weeks" type="number" min={1} max={8} defaultValue={1} className="w-16" aria-label={t("courses.everyWeeks")} />
                    {t("courses.weeks")}
                  </label>
                  <SubmitButton className="justify-self-end">{t("courses.createDates")}</SubmitButton>
                </form>
            </UrlSheet>
          )}
          {canManage && param(sp, "new") === "date" && (
            <UrlSheet params={["new"]} title={t("courses.addOne")}>
                <form action={addSessions} className="grid gap-4">
                  <input type="hidden" name="course_id" value={id} />
                  <div className="grid gap-1">
                    <Label htmlFor="o-start">{t("courses.start")}</Label>
                    <Input id="o-start" name="starts_at" type="datetime-local" required />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="o-end">{t("courses.end")}</Label>
                    <Input id="o-end" name="ends_at" type="datetime-local" required />
                  </div>
                  <SubmitButton className="justify-self-end">{t("courses.add")}</SubmitButton>
                </form>
            </UrlSheet>
          )}
        </RecordLayout>
      )}
    </Page>
  )
}

export const instant = false
