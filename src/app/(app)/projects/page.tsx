import { Segments } from "@/components/segments"
import { CalendarView } from "@/components/calendar-view"
import { BulkBar } from "@/components/bulk-bar"
import { SubmitButton } from "@/components/submit-button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { bulkTasks, moveTaskDue } from "./actions"
import { FilterMenu } from "@/components/filter-menu"
import { Page, PageHeader } from "@/components/page"
import { notFound } from "next/navigation"
import { ArrowRightIcon, CalendarDaysIcon, KanbanSquareIcon, ListIcon, Trash2Icon } from "lucide-react"
import { DataTable, SearchBox } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { Badge } from "@/components/ui/badge"
import { berlinToday } from "@/api/v1/shared"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams, type SearchParams } from "@/lib/url"
import { DOT, progress, type ChecklistItem } from "@/projects/fields"
import { initials, projectBasics } from "@/projects/load"
import { TASK_COLS } from "@/projects/server"
import { Board } from "./board"
import { TaskDrawer } from "./task-drawer"

const VIEWS = ["board", "list", "calendar"] as const
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
  const [basics, { data: rows }] = await Promise.all([projectBasics(ctx), query])
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

  return (
    <Page className="max-w-none">
      <PageHeader
        area="projects"
        title={t("projects.title")}
        settings={canManage && { href: "/projects/settings", label: t("common.settings") }}
        actions={
          <Segments
            label={t("projects.view")}
            items={[
              { href: withParams(sp, { view: undefined, task: undefined }), current: view === "board", label: <><KanbanSquareIcon /> {t("projects.views.board")}</> },
              { href: withParams(sp, { view: "list", task: undefined }), current: view === "list", label: <><ListIcon /> {t("projects.views.list")}</> },
              { href: withParams(sp, { view: "calendar", task: undefined }), current: view === "calendar", label: <><CalendarDaysIcon /> {t("projects.views.calendar")}</> },
            ]}
          />
        }
      />
      <Notice error={!openId ? param(sp, "error") : undefined} ok={!openId ? param(sp, "ok") : undefined} />
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox q={q} label={t("projects.search")} />
        <FilterMenu param="assignee" label={t("projects.assignee")} allLabel={t("projects.everyone")} options={[{ value: "me", label: t("projects.mine") }, ...team.map((p) => ({ value: p.id, label: p.name }))]} />
        <FilterMenu param="due" label={t("projects.due")} allLabel={t("projects.anyDue")} options={DUES.map((d) => ({ value: d, label: t.dynamic(`projects.dues.${d}`) }))} />
        {tags.length > 0 && <FilterMenu param="tag" label={t("projects.tags")} allLabel={t("projects.allTags")} options={tags.map((x) => ({ value: x, label: x }))} />}
      </div>

      {view === "board" ? (
        <Board statuses={statuses} tasks={tasks} canManage={canManage} back={here} today={today} />
      ) : view === "calendar" ? (
        // Tasks with a due date as all-day entries in their column's colour; click opens the task panel.
        <CalendarView
          viewParam="cal"
          onMove={canManage ? moveTaskDue : undefined}
          views={["month", "week", "agenda"]}
          defaultView="month"
          events={tasks
            .filter((x) => x.due_on)
            .map((x) => ({
              id: x.id,
              title: x.done ? `✓ ${x.title}` : x.title,
              start: `${x.due_on}T00:00:00`,
              end: `${x.due_on}T23:59:00`,
              allDay: true,
              color: DOT[statuses.find((st) => st.id === x.status_id)?.color ?? "gray"] ?? DOT.gray,
              href: x.href,
              readOnly: !canManage,
            }))}
        />
      ) : (
        <DataTable
          rows={tasks}
          rowKey={(r) => r.id}
          rowHref={(r) => r.href}
          select={canManage ? { form: "bulk-tasks", label: t("common.select") } : undefined}
          empty={t("projects.empty")}
          columns={[
            {
              header: t("projects.taskTitle"),
              cell: (r) => (
                <span className="grid gap-0.5">
                  <span className={r.done ? "text-muted-foreground line-through" : "font-medium"}>{r.title}</span>
                  {r.snippet && <span className="line-clamp-1 max-w-md text-xs break-words text-muted-foreground">{r.snippet}</span>}
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

      {canManage && view === "list" && (
        <BulkBar form="bulk-tasks">
          <input type="hidden" name="back" value={here} />
          <NativeSelect name="status_id" aria-label={t("projects.status")} defaultValue={statuses[0]?.id} className="h-8 w-40">
            {statuses.map((x) => (
              <NativeSelectOption key={x.id} value={x.id}>
                {x.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <SubmitButton size="sm" variant="outline" formAction={bulkTasks} name="intent" value="move">
            <ArrowRightIcon /> {t("projects.moveTo")}
          </SubmitButton>
          <SubmitButton size="sm" variant="ghost" formAction={bulkTasks} name="intent" value="trash" data-confirm="common.confirmTrashMany" className="text-destructive hover:text-destructive">
            <Trash2Icon /> {t("common.toTrash")}
          </SubmitButton>
        </BulkBar>
      )}
      <TaskDrawer ctx={ctx} t={t} id={openId} back={here} error={param(sp, "error")} ok={param(sp, "ok")} />
    </Page>
  )
}

export const instant = false
