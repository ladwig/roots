import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { SectionProps } from "../sections"

/** Is this contact in any course here (enrolled or waiting)? Decides whether the "Kurse" tab shows. */
export async function hasCourses(orgId: string, contactId: string) {
  const { count } = await createAdminClient()
    .from("course_participants")
    .select("id, courses!inner(id)", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("contact_id", contactId)
    .in("status", ["enrolled", "waiting"])
    .is("courses.deleted_at", null)
  return (count ?? 0) > 0
}

// "Meine Kurse": the person's courses with their next dates; waiting list shown as such. Only this contact's rows.
export async function CoursesSection({ orgId, contact, tab }: SectionProps) {
  if (tab !== "courses") return null
  const t = await getT()
  const now = new Date().toISOString()
  const { data } = await createAdminClient()
    .from("course_participants")
    .select("id, status, courses!inner(id, title, instructor, deleted_at, course_sessions(starts_at, ends_at, cancelled))")
    .eq("org_id", orgId)
    .eq("contact_id", contact.id)
    .in("status", ["enrolled", "waiting"])
    .is("courses.deleted_at", null)
  if (!data?.length) return <p className="text-muted-foreground">{t("portal.courses.none")}</p>
  return (
    <section className="grid gap-3">
      <h2 className="font-heading text-lg font-semibold">{t("portal.tabs.courses")}</h2>
      <ul className="grid gap-3">
        {data.map((p) => {
          const next = (p.courses.course_sessions ?? []).filter((s) => !s.cancelled && s.ends_at >= now).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
          return (
            <li key={p.id} className="grid gap-2 rounded-xl border bg-card p-4">
              <span className="flex flex-wrap items-center gap-2 font-medium">
                {p.courses.title}
                {p.status === "waiting" && <Badge variant="outline">{t("portal.courses.waiting")}</Badge>}
              </span>
              {p.courses.instructor && <span className="text-sm text-muted-foreground">{t("portal.courses.with", { name: p.courses.instructor })}</span>}
              {next.length ? (
                <ul className="grid gap-0.5 text-sm">
                  {next.slice(0, 5).map((s) => (
                    <li key={s.starts_at} className="tabular-nums">
                      {t.date(s.starts_at, { weekday: "short", day: "2-digit", month: "2-digit" })} · {t.date(s.starts_at, { timeStyle: "short" })}–{t.date(s.ends_at, { timeStyle: "short" })}
                    </li>
                  ))}
                  {next.length > 5 && <li className="text-muted-foreground">{t("portal.courses.more", { count: next.length - 5 })}</li>}
                </ul>
              ) : (
                <span className="text-sm text-muted-foreground">{t("portal.courses.noDates")}</span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
