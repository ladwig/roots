import Link from "next/link"
import { notFound } from "next/navigation"
import { KanbanSquareIcon, ListIcon } from "lucide-react"
import { DataTable, SearchBox } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { Badge } from "@/components/ui/badge"
import { NativeSelectOption } from "@/components/ui/native-select"
import { UrlSheet } from "@/components/url-sheet"
import { berlinToday } from "@/api/v1/shared"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams, type SearchParams } from "@/lib/url"
import { DOT, progress, type ChecklistItem } from "@/projects/fields"
import { initials, projectBasics } from "@/projects/load"
import { TASK_COLS } from "@/projects/server"
import { Board } from "./board"
import { FilterSelect } from "./filter-select"
import { TaskEditor } from "./task-editor"

const VIEWS = ["board", "list"] as const
const DUES = ["overdue", "week", "none"] as const

// Projects: tasks as a board or a list, filtered by search, tag (e.g. a project), assignee ("me" too) and due date –
// everything in the URL so a filtered board can be bookmarked. ?task=<id> opens the side panel.
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePerm("projects.view")
  if (!ctx.modules.has("projects")) notFound()
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("projects.manage")
  const view = VIEWS.find((v) => v === param(sp, "view")) ?? "board"
  const tag = param(sp, "tag")
  const who = param(sp, "assignee")
  const due = DUES.find((d) => d === param(sp, "due"))
  const q = param(sp, "q")?.replace(/[%,()*\\]/g, " ").trim()
  const today = berlinToday()
  const week = new Date(Date.parse(`${today}T12:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10)
  const assignee = who === "me" ? ctx.userId : who && /^[0-9a-f-]{36}$/.test(who) ? who : null
  const openId = param(sp, "task")

  let query = ctx.supabase.from("tasks").select((assignee ? TASK_COLS.replace("task_assignees(user_id)", "task_assignees!inner(user_id)") : TASK_COLS) as typeof TASK_COLS).eq("org_id", ctx.org.id).is("deleted_at", null).order("position").limit(1000)
  if (assignee) query = query.eq("task_assignees.user_id", assignee)
  if (tag) query = query.contains("tags", [tag])
  if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`)
  if (due === "overdue") query = query.lt("due_on", today).is("completed_at", null)
  if (due === "week") query = query.gte("due_on", today).lte("due_on", week)
  if (due === "none") query = query.is("due_on", null)
  const [basics, { data: rows }, { data: open }] = await Promise.all([
    projectBasics(ctx),
    query,
    openId && /^[0-9a-f-]{36}$/.test(openId) ? ctx.supabase.from("tasks").select(TASK_COLS).eq("id", openId).eq("org_id", ctx.org.id).is("deleted_at", null).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const { statuses, team, tags } = basics
  const nameOf = (id: string) => team.find((p) => p.id === id)?.name ?? "?"
  const done = new Set(statuses.filter((s) => s.is_done).map((s) => s.id))
  // With an assignee filter the joined assignees are only that one: the card still shows the filtered person.
  const tasks = (rows ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    snippet: r.description.replace(/[#*_`>[\]()|~-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200),
    status_id: r.status_id,
    tags: r.tags,
    due_on: r.due_on,
    done: done.has(r.status_id),
    progress: progress((Array.isArray(r.checklist) ? r.checklist : []) as ChecklistItem[]),
    people: r.task_assignees.map((a) => ({ id: a.user_id, name: nameOf(a.user_id), initials: initials(nameOf(a.user_id)) })),
    href: `/projects${withParams(sp, { task: r.id })}`,
  }))
  const here = `/projects${withParams(sp, { task: undefined, error: undefined, ok: undefined })}`
  const chip = (href: string, active: boolean, label: React.ReactNode, key: string) => (
    <Link
      key={key}
      href={href}
      aria-current={active ? "true" : undefined}
      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground aria-[current=true]:bg-primary aria-[current=true]:text-primary-foreground"
    >
      {label}
    </Link>
  )

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">{t("projects.title")}</h1>
        <nav aria-label={t("projects.view")} className="flex gap-1">
          {chip(withParams(sp, { view: undefined, task: undefined }), view === "board", <><KanbanSquareIcon className="size-3.5" /> {t("projects.views.board")}</>, "board")}
          {chip(withParams(sp, { view: "list", task: undefined }), view === "list", <><ListIcon className="size-3.5" /> {t("projects.views.list")}</>, "list")}
        </nav>
      </div>
      <Notice error={!open ? param(sp, "error") : undefined} ok={!open ? param(sp, "ok") : undefined} />
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox q={q} label={t("projects.search")} />
        <FilterSelect param="assignee" value={who ?? ""} label={t("projects.assignee")}>
          <NativeSelectOption value="">{t("projects.everyone")}</NativeSelectOption>
          <NativeSelectOption value="me">{t("projects.mine")}</NativeSelectOption>
          {team.map((p) => (
            <NativeSelectOption key={p.id} value={p.id}>
              {p.name}
            </NativeSelectOption>
          ))}
        </FilterSelect>
        <FilterSelect param="due" value={due ?? ""} label={t("projects.due")}>
          <NativeSelectOption value="">{t("projects.anyDue")}</NativeSelectOption>
          {DUES.map((d) => (
            <NativeSelectOption key={d} value={d}>
              {t.dynamic(`projects.dues.${d}`)}
            </NativeSelectOption>
          ))}
        </FilterSelect>
      </div>
      {tags.length > 0 && (
        <nav aria-label={t("projects.tags")} className="flex flex-wrap gap-1.5">
          {chip(withParams(sp, { tag: undefined, task: undefined }), !tag, t("projects.allTags"), "_all")}
          {tags.map((x) => chip(withParams(sp, { tag: x === tag ? undefined : x, task: undefined }), x === tag, x, x))}
        </nav>
      )}

      {view === "board" ? (
        <Board statuses={statuses} tasks={tasks} canManage={canManage} back={here} today={today} />
      ) : (
        <DataTable
          rows={tasks}
          rowKey={(r) => r.id}
          rowHref={(r) => r.href}
          empty={t("projects.empty")}
          columns={[
            {
              header: t("projects.taskTitle"),
              cell: (r) => (
                <span className="grid gap-0.5">
                  <span className={r.done ? "text-muted-foreground line-through" : "font-medium"}>{r.title}</span>
                  {r.snippet && <span className="line-clamp-1 text-xs text-muted-foreground">{r.snippet}</span>}
                </span>
              ),
            },
            {
              header: t("projects.status"),
              cell: (r) => {
                const s = statuses.find((x) => x.id === r.status_id)
                return (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: DOT[s?.color ?? "gray"] }} aria-hidden /> {s?.name}
                  </span>
                )
              },
            },
            { header: t("projects.due"), cell: (r) => (r.due_on ? <span className={!r.done && r.due_on < today ? "text-destructive" : ""}>{t.date(r.due_on, { dateStyle: "medium" })}</span> : "–") },
            { header: t("projects.assignees"), cell: (r) => r.people.map((p) => p.name).join(", ") || "–" },
            { header: t("projects.tags"), cell: (r) => <span className="flex flex-wrap gap-1">{r.tags.map((x) => <Badge key={x} variant="outline">{x}</Badge>)}</span> },
            { header: t("projects.checklist"), cell: (r) => r.progress ?? "–" },
          ]}
        />
      )}

      {open && (
        <UrlSheet params={["task"]} title={open.title} wide>
          <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
          <TaskEditor t={t} task={open} statuses={statuses} team={team} tags={tags} canManage={canManage} back={`/projects${withParams(sp, { error: undefined, ok: undefined })}`} pageLink />
        </UrlSheet>
      )}
    </div>
  )
}

export const instant = false
