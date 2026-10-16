import { ArrowRightIcon, Trash2Icon } from "lucide-react"
import { berlinToday } from "@/api/v1/shared"
import { BulkBar } from "@/components/bulk-bar"
import { CalendarView } from "@/components/calendar-view"
import { DataTable, SearchBox } from "@/components/data-table"
import { FilterMenu } from "@/components/filter-menu"
import { SubmitButton } from "@/components/submit-button"
import { Timeline } from "@/components/timeline"
import { Badge } from "@/components/ui/badge"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { T } from "@/i18n/translate"
import type { getContext } from "@/lib/context"
import { param, withParams, type SearchParams } from "@/lib/url"
import { DOT, progress, type ChecklistItem } from "@/projects/fields"
import { initials, projectBasics } from "@/projects/load"
import { TASK_COLS } from "@/projects/server"
import { bulkTasks, moveTaskDue } from "./actions"
import { Board } from "./board"
import { TaskDrawer } from "./task-drawer"

type Ctx = Awaited<ReturnType<typeof getContext>>
export const TASK_VIEWS = ["board", "list", "timeline", "calendar"] as const
export type TaskView = (typeof TASK_VIEWS)[number]
const DUES = ["overdue", "week", "none"] as const

/**
 * Tasks as board, list, timeline or calendar, filtered by search, assignee ("me" too), due date, tag and (on "Alle
 * Aufgaben") project – all in the URL. `projectId` = only that project's tasks (the project page); new tasks land there.
 * ?task=<id> opens the side panel.
 */
export async function TasksView({ ctx, t, sp, base, view, projectId, basics }: { ctx: Ctx; t: T; sp: SearchParams; base: string; view: TaskView; projectId?: string; basics: Awaited<ReturnType<typeof projectBasics>> }) {
  const canManage = ctx.can("projects.manage")
  const tag = param(sp, "tag")
  const who = param(sp, "assignee")
  const due = DUES.find((d) => d === param(sp, "due"))
  const inProject = projectId ?? (param(sp, "project") === "none" ? "none" : basics.projects.find((p) => p.id === param(sp, "project"))?.id)
  const q = param(sp, "q")?.replace(/[%,()*\\]/g, " ").trim()
  const today = berlinToday()
  const week = new Date(Date.parse(`${today}T12:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10)
  const assignee = who === "me" ? ctx.userId : who && /^[0-9a-f-]{36}$/.test(who) ? who : null
  const openId = param(sp, "task")

  let query = ctx.supabase.from("tasks").select((assignee ? TASK_COLS.replace("task_assignees(user_id)", "task_assignees!inner(user_id)") : TASK_COLS) as typeof TASK_COLS).eq("org_id", ctx.org.id).is("deleted_at", null).order("position").limit(1000)
  if (assignee) query = query.eq("task_assignees.user_id", assignee)
  if (inProject === "none") query = query.is("project_id", null)
  else if (inProject) query = query.eq("project_id", inProject)
  if (tag) query = query.contains("tags", [tag])
  if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`)
  if (due === "overdue") query = query.lt("due_on", today).is("completed_at", null)
  if (due === "week") query = query.gte("due_on", today).lte("due_on", week)
  if (due === "none") query = query.is("due_on", null)
  const { data: rows } = await query
  const { statuses, team, tags, projects } = basics
  const nameOf = (id: string) => team.find((p) => p.id === id)?.name ?? "?"
  const projectOf = (id: string | null) => projects.find((p) => p.id === id)
  const done = new Set(statuses.filter((s) => s.is_done).map((s) => s.id))
  const colorOf = (statusId: string) => DOT[statuses.find((st) => st.id === statusId)?.color ?? "gray"] ?? DOT.gray
  // With an assignee filter the joined assignees are only that one: the card still shows the filtered person.
  const tasks = (rows ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    snippet: r.description.replace(/[#*_`>[\]()|~-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200),
    status_id: r.status_id,
    tags: r.tags,
    start_on: r.start_on,
    due_on: r.due_on,
    done: done.has(r.status_id),
    progress: progress((Array.isArray(r.checklist) ? r.checklist : []) as ChecklistItem[]),
    people: r.task_assignees.map((a) => ({ id: a.user_id, name: nameOf(a.user_id), initials: initials(nameOf(a.user_id)) })),
    label: projectId ? undefined : projectOf(r.project_id)?.name,
    project: projectOf(r.project_id),
    href: `${base}${withParams(sp, { task: r.id })}`,
  }))
  const here = `${base}${withParams(sp, { task: undefined, error: undefined, ok: undefined })}`

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox q={q} label={t("projects.search")} />
        <FilterMenu param="assignee" label={t("projects.assignee")} allLabel={t("projects.everyone")} options={[{ value: "me", label: t("projects.mine") }, ...team.map((p) => ({ value: p.id, label: p.name }))]} />
        <FilterMenu param="due" label={t("projects.due")} allLabel={t("projects.anyDue")} options={DUES.map((d) => ({ value: d, label: t.dynamic(`projects.dues.${d}`) }))} />
        {!projectId && projects.length > 0 && (
          <FilterMenu param="project" label={t("projects.project")} allLabel={t("projects.allProjects")} options={[{ value: "none", label: t("projects.noProject") }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} />
        )}
        {tags.length > 0 && <FilterMenu param="tag" label={t("projects.tags")} allLabel={t("projects.allTags")} options={tags.map((x) => ({ value: x, label: x }))} />}
      </div>

      {view === "board" ? (
        <Board statuses={statuses} tasks={tasks} canManage={canManage} back={here} today={today} extra={projectId ? { project_id: projectId } : undefined} />
      ) : view === "timeline" ? (
        <Timeline
          t={t}
          today={today}
          empty={t("projects.empty")}
          items={tasks.map((x) => ({ id: x.id, title: x.title, start: x.start_on, end: x.due_on, color: colorOf(x.status_id), href: x.href, done: x.done, group: projectId ? undefined : (x.project?.name ?? t("projects.noProject")) }))}
        />
      ) : view === "calendar" ? (
        // Tasks with a due date as all-day entries in their column's colour; click opens the task panel.
        <CalendarView
          viewParam="cal"
          onMove={canManage ? moveTaskDue : undefined}
          views={["month", "week", "agenda"]}
          defaultView="month"
          events={tasks
            .filter((x) => x.due_on)
            .map((x) => ({ id: x.id, title: x.done ? `✓ ${x.title}` : x.title, start: `${x.due_on}T00:00:00`, end: `${x.due_on}T23:59:00`, allDay: true, color: colorOf(x.status_id), href: x.href, readOnly: !canManage }))}
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
              cell: (r) => (
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: colorOf(r.status_id) }} aria-hidden /> {statuses.find((x) => x.id === r.status_id)?.name}
                </span>
              ),
            },
            ...(projectId ? [] : [{ header: t("projects.project"), cell: (r: (typeof tasks)[number]) => r.project?.name ?? "–" }]),
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
      <TaskDrawer ctx={ctx} t={t} id={openId} back={here} basics={basics} error={param(sp, "error")} ok={param(sp, "ok")} />
    </>
  )
}
