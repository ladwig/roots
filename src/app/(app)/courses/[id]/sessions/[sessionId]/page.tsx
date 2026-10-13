import { notFound } from "next/navigation"
import { contactName } from "@/app/(app)/contacts/fields"
import { Notice } from "@/components/notice"
import { PageCrumbs } from "@/components/page-crumbs"
import { SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { toLocalInput } from "@/lib/time"
import { param } from "@/lib/url"
import { deleteSession, saveAttendance, updateSession } from "../../../actions"

// One date of a course: attendance list (enrolled participants, tick who was there), change/cancel/delete the date.
export default async function SessionPage({ params, searchParams }: { params: Promise<{ id: string; sessionId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id, sessionId } = await params
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f-]{36}$/.test(sessionId)) notFound()
  const ctx = await requirePerm("courses.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("courses.manage")
  const [{ data: s }, { data: people }, { data: marks }] = await Promise.all([
    ctx.supabase.from("course_sessions").select("*, courses(title, track_attendance)").eq("id", sessionId).eq("course_id", id).eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("course_participants").select("id, contacts(first_name, last_name, company, email)").eq("course_id", id).eq("org_id", ctx.org.id).eq("status", "enrolled").order("created_at"),
    ctx.supabase.from("course_attendance").select("participant_id, present").eq("session_id", sessionId).eq("org_id", ctx.org.id),
  ])
  if (!s || !s.courses) notFound()
  const present = new Set((marks ?? []).filter((m) => m.present).map((m) => m.participant_id))
  const title = t.date(s.starts_at, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })

  return (
    <div className="grid max-w-3xl gap-6">
      <PageCrumbs items={[{ href: "/courses", label: t("courses.title") }, { href: `/courses/${id}#dates`, label: s.courses.title }, { label: title }]} />
      <h1 className="font-heading text-2xl font-semibold">{title}</h1>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {s.cancelled && <p className="rounded-lg border bg-muted px-3 py-2 text-sm">{t("courses.dateIsCancelled")}</p>}

      {s.courses.track_attendance && !s.cancelled && (
        <section id="attendance" className="grid gap-3">
          <h2 className="font-medium">{t("courses.attendance")}</h2>
          {!people?.length ? (
            <p className="text-sm text-muted-foreground">{t("courses.noParticipants")}</p>
          ) : (
            <form action={saveAttendance} className="grid gap-3">
              <input type="hidden" name="session_id" value={sessionId} />
              <input type="hidden" name="course_id" value={id} />
              <ul className="grid gap-1">
                {people.map((p) => (
                  <li key={p.id}>
                    <input type="hidden" name="participant" value={p.id} />
                    <label className="flex min-h-10 items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                      <input type="checkbox" name="present" value={p.id} defaultChecked={present.has(p.id)} disabled={!canManage} className="size-5" />
                      {p.contacts ? contactName(p.contacts) : "–"}
                    </label>
                  </li>
                ))}
              </ul>
              {canManage && <SubmitButton className="justify-self-start">{t("courses.saveAttendance")}</SubmitButton>}
            </form>
          )}
        </section>
      )}

      {canManage && (
        <section id="date" className="grid gap-3">
          <h2 className="font-medium">{t("courses.editDate")}</h2>
          <form action={updateSession} className="grid gap-4">
            <input type="hidden" name="id" value={sessionId} />
            <input type="hidden" name="course_id" value={id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="d-start">{t("courses.start")}</Label>
                <Input id="d-start" name="starts_at" type="datetime-local" required defaultValue={toLocalInput(s.starts_at)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="d-end">{t("courses.end")}</Label>
                <Input id="d-end" name="ends_at" type="datetime-local" required defaultValue={toLocalInput(s.ends_at)} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="d-note">{t("courses.note")}</Label>
              <Input id="d-note" name="note" maxLength={500} defaultValue={s.note ?? ""} placeholder={t("courses.dateNotePlaceholder")} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="cancelled" value="1" defaultChecked={s.cancelled} className="size-4" />
              {t("courses.cancelDate")}
            </label>
            <SubmitButton className="justify-self-start">{t("common.save")}</SubmitButton>
          </form>
          <form action={deleteSession}>
            <input type="hidden" name="id" value={sessionId} />
            <input type="hidden" name="course_id" value={id} />
            <SubmitButton size="sm" variant="outline">
              {t("courses.deleteDate")}
            </SubmitButton>
          </form>
        </section>
      )}
    </div>
  )
}

export const instant = false
