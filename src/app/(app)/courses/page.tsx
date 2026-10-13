import Link from "next/link"
import { PlusIcon } from "lucide-react"
import { DataTable, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { UrlSheet } from "@/components/url-sheet"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { pageParam, param, withParams } from "@/lib/url"
import { CourseForm } from "./course-form"

// Courses: next date, places taken/left, waiting list at a glance. A row opens the course.
export default async function CoursesPage({ searchParams }: PageProps<"/courses">) {
  const ctx = await requirePerm("courses.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("courses.manage")
  const trash = canManage && param(sp, "status") === "trash"
  const q = param(sp, "q")?.replace(/[%,()*]/g, "").trim()
  const page = pageParam(sp)
  const now = new Date().toISOString()
  let query = ctx.supabase
    .from("courses")
    .select("id, title, instructor, capacity, course_participants(status), course_sessions(starts_at, cancelled)")
    .eq("org_id", ctx.org.id)
    .order("title")
    .range(...pageRange(page))
  query = trash ? query.not("deleted_at", "is", null) : query.is("deleted_at", null)
  if (q) query = query.or(`title.ilike.%${q}%,instructor.ilike.%${q}%`)
  const creating = canManage && param(sp, "new") === "course"
  const [{ data }, { data: locations }] = await Promise.all([
    query,
    creating ? ctx.supabase.from("locations").select("id, name").eq("org_id", ctx.org.id).order("name") : Promise.resolve({ data: null }),
  ])
  const rows = (data ?? []).slice(0, PAGE_SIZE).map((c) => {
    const upcoming = c.course_sessions.filter((s) => !s.cancelled && s.starts_at >= now).map((s) => s.starts_at).sort()
    return {
      ...c,
      next: upcoming[0] ?? null,
      enrolled: c.course_participants.filter((p) => p.status === "enrolled").length,
      waiting: c.course_participants.filter((p) => p.status === "waiting").length,
    }
  })

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">{t("courses.title")}</h1>
        {canManage && (
          <Button render={<Link href={`/courses${withParams(sp, { new: "course" })}`} />} nativeButton={false} size="sm">
            <PlusIcon /> {t("courses.new")}
          </Button>
        )}
      </div>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox q={q} label={t("courses.search")} keep={trash ? { status: "trash" } : undefined} />
        {canManage && (
          <Link href={trash ? "/courses" : "/courses?status=trash"} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            {trash ? t("courses.backToList") : t("courses.trash")}
          </Link>
        )}
      </div>
      <DataTable
        rows={rows}
        rowKey={(c) => c.id}
        empty={q ? t("courses.noMatch") : t("courses.empty")}
        columns={[
          {
            header: t("courses.titleLabel"),
            cell: (c) => (
              <Link href={`/courses/${c.id}`} className="grid underline-offset-4 hover:underline">
                <span className="font-medium">{c.title}</span>
                {c.instructor && <span className="text-xs text-muted-foreground">{c.instructor}</span>}
              </Link>
            ),
          },
          { header: t("courses.nextDate"), cell: (c) => (c.next ? t.date(c.next, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "–") },
          {
            header: t("courses.places"),
            cell: (c) => (
              <span className="flex flex-wrap items-center gap-2 tabular-nums">
                {c.capacity ? `${c.enrolled} / ${c.capacity}` : c.enrolled}
                {c.capacity != null && c.enrolled >= c.capacity && <Badge variant="secondary">{t("courses.full")}</Badge>}
                {c.waiting > 0 && <Badge variant="outline">{t("courses.waitingCount", { count: c.waiting })}</Badge>}
              </span>
            ),
          },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />
      {creating && (
        <UrlSheet params={["new"]} title={t("courses.new")}>
          <Notice error={param(sp, "error")} />
          <CourseForm t={t} locations={locations ?? []} />
        </UrlSheet>
      )}
    </div>
  )
}

export const instant = false
