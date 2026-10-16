import { redirect } from "next/navigation"
import { ArchiveRestoreIcon, ListTodoIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { berlinToday } from "@/api/v1/shared"
import { ActionsMenu, MenuLink } from "@/components/actions-menu"
import { DataTable, SearchBox } from "@/components/data-table"
import { FilterMenu } from "@/components/filter-menu"
import { Notice } from "@/components/notice"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { SubmitButton } from "@/components/submit-button"
import { Timeline } from "@/components/timeline"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams, type SearchParams } from "@/lib/url"
import { DOT } from "@/projects/fields"
import { initials, projectBasics } from "@/projects/load"
import { PROJECT_COLS } from "@/projects/server"
import Link from "next/link"
import { restoreProjectAction } from "./actions"
import { Board } from "./board"
import { ViewSegments } from "./view-segments"

const VIEWS = ["board", "list", "timeline"] as const

// Projects: board by project status, list or timeline; each card opens the project page. "Alle Aufgaben" is its own
// sub-page. Old task links (/projects?task=<id>) go to the task on "Alle Aufgaben".
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const task = param(sp, "task")
  if (task) redirect(`/projects/tasks?task=${encodeURIComponent(task)}`)
  const ctx = await requirePerm("projects.view")
  const t = await getT()
  const canManage = ctx.can("projects.manage")
  const trash = canManage && param(sp, "view") === "trash"
  const view = VIEWS.find((v) => v === param(sp, "view")) ?? "board"
  const lead = param(sp, "lead")
  const q = param(sp, "q")?.replace(/[%,()*\\]/g, " ").trim()
  const today = berlinToday()

  let query = ctx.supabase.from("projects").select(`${PROJECT_COLS}, deleted_at`).eq("org_id", ctx.org.id).order("position").limit(500)
  query = trash ? query.not("deleted_at", "is", null).order("deleted_at", { ascending: false }) : query.is("deleted_at", null)
  if (lead && /^[0-9a-f-]{36}$/.test(lead)) query = query.eq("lead_id", lead)
  if (q) query = query.ilike("name", `%${q}%`)
  const [basics, { data: rows }, { data: counts }] = await Promise.all([
    projectBasics(ctx),
    query,
    // Progress per project: done / all tasks (one small query, counted here).
    ctx.supabase.from("tasks").select("project_id, completed_at").eq("org_id", ctx.org.id).is("deleted_at", null).not("project_id", "is", null).limit(10000),
  ])
  const { projectStatuses, team } = basics
  const nameOf = (id: string | null) => team.find((p) => p.id === id)?.name
  const tally = (id: string) => {
    const all = (counts ?? []).filter((c) => c.project_id === id)
    return all.length ? `${all.filter((c) => c.completed_at).length}/${all.length}` : null
  }
  const done = new Set(projectStatuses.filter((s) => s.is_done).map((s) => s.id))
  const projects = (rows ?? []).map((p) => ({
    id: p.id,
    title: p.name,
    snippet: p.description.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 160),
    status_id: p.status_id,
    tags: [],
    start_on: p.start_on,
    due_on: p.end_on,
    done: done.has(p.status_id),
    progress: tally(p.id),
    color: p.color,
    people: p.lead_id ? [{ id: p.lead_id, name: nameOf(p.lead_id) ?? "?", initials: initials(nameOf(p.lead_id) ?? "?") }] : [],
    href: `/projects/${p.id}`,
  }))
  const here = `/projects${withParams(sp, { error: undefined, ok: undefined })}`
  const empty = !trash && !q && !lead && !projects.length

  return (
    <Page className={view === "list" || trash ? undefined : "max-w-none"}>
      <PageHeader
        area="projects"
        title={trash ? `${t("projects.title")} · ${t("projects.trash")}` : t("projects.title")}
        settings={canManage && { href: "/projects/settings", label: t("common.settings") }}
        actions={
          !trash && (
            <>
              <Button variant="outline" size="sm" render={<Link href="/projects/tasks" />} nativeButton={false}>
                <ListTodoIcon /> {t("projects.allTasks")}
              </Button>
              <ViewSegments t={t} sp={sp} views={VIEWS} current={view} />
            </>
          )
        }
        menu={
          canManage && (
            <ActionsMenu>
              <MenuLink href={trash ? "/projects" : "/projects?view=trash"} icon={trash ? <ArchiveRestoreIcon /> : <Trash2Icon />}>
                {trash ? t("projects.backToProjects") : t("projects.trash")}
              </MenuLink>
            </ActionsMenu>
          )
        }
        primary={
          canManage &&
          !trash && (
            <Button size="sm" render={<Link href="/projects/new" />} nativeButton={false}>
              <PlusIcon /> {t("projects.newProject")}
            </Button>
          )
        }
      />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {empty ? (
        <EmptyState
          area="projects"
          title={t("projects.emptyTitle")}
          text={t("projects.emptyText")}
          action={
            canManage && (
              <Button size="sm" render={<Link href="/projects/new" />} nativeButton={false}>
                <PlusIcon /> {t("projects.newProject")}
              </Button>
            )
          }
        />
      ) : trash ? (
        <>
          <p className="text-sm text-muted-foreground">{t("projects.trashHint", { days: 30 })}</p>
          <DataTable
            rows={rows ?? []}
            rowKey={(r) => r.id}
            empty={t("projects.trashEmpty")}
            columns={[
              { header: t("projects.name"), cell: (r) => r.name },
              { header: t("projects.deletedAt"), cell: (r) => (r.deleted_at ? t.date(r.deleted_at, { dateStyle: "medium" }) : "–") },
              {
                header: "",
                cell: (r) => (
                  <form action={restoreProjectAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <SubmitButton size="sm" variant="outline">
                      {t("projects.restore")}
                    </SubmitButton>
                  </form>
                ),
              },
            ]}
          />
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <SearchBox q={q} label={t("projects.searchProjects")} />
            <FilterMenu param="lead" label={t("projects.lead")} allLabel={t("projects.everyone")} options={team.map((p) => ({ value: p.id, label: p.name }))} />
          </div>
          {view === "board" ? (
            <Board kind="project" statuses={projectStatuses} tasks={projects} canManage={canManage} back={here} today={today} />
          ) : view === "timeline" ? (
            <Timeline
              t={t}
              today={today}
              empty={t("projects.noProjects")}
              items={projects.map((p) => ({ id: p.id, title: p.title, start: p.start_on, end: p.due_on, color: DOT[p.color] ?? DOT.gray, href: p.href, done: p.done, group: projectStatuses.find((s) => s.id === p.status_id)?.name }))}
            />
          ) : (
            <DataTable
              rows={projects}
              rowKey={(r) => r.id}
              rowHref={(r) => r.href}
              empty={t("projects.noProjects")}
              columns={[
                {
                  header: t("projects.name"),
                  cell: (r) => (
                    <span className="inline-flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: DOT[r.color] ?? DOT.gray }} aria-hidden />
                      <span className={r.done ? "text-muted-foreground line-through" : "font-medium"}>{r.title}</span>
                    </span>
                  ),
                },
                { header: t("projects.status"), cell: (r) => projectStatuses.find((s) => s.id === r.status_id)?.name ?? "–" },
                { header: t("projects.lead"), cell: (r) => r.people[0]?.name ?? "–" },
                {
                  header: t("projects.period"),
                  cell: (r) => (r.start_on || r.due_on ? [r.start_on, r.due_on].map((d) => (d ? t.date(`${d}T12:00:00`, { dateStyle: "medium" }) : "…")).join(" – ") : "–"),
                },
                { header: t("projects.progress"), cell: (r) => r.progress ?? "–" },
              ]}
            />
          )}
        </>
      )}
    </Page>
  )
}

export const instant = false
