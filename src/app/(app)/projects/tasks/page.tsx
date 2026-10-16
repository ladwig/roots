import { Notice } from "@/components/notice"
import { Page, PageHeader } from "@/components/page"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, type SearchParams } from "@/lib/url"
import { projectBasics } from "@/projects/load"
import { TASK_VIEWS, TasksView } from "../tasks-view"
import { ViewSegments } from "../view-segments"

// All tasks of the org, across projects (and without one): board, list, timeline, calendar.
export default async function AllTasksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePerm("projects.view")
  const t = await getT()
  const sp = await searchParams
  const view = TASK_VIEWS.find((v) => v === param(sp, "view")) ?? "board"
  const basics = await projectBasics(ctx)
  return (
    <Page className="max-w-none">
      <PageHeader
        crumbs={[{ href: "/projects", label: t("projects.title") }, { label: t("projects.allTasks") }]}
        title={t("projects.allTasks")}
        settings={ctx.can("projects.manage") && { href: "/projects/settings", label: t("common.settings") }}
        actions={<ViewSegments t={t} sp={sp} views={TASK_VIEWS} current={view} />}
      />
      <Notice error={!param(sp, "task") ? param(sp, "error") : undefined} ok={!param(sp, "task") ? param(sp, "ok") : undefined} />
      <TasksView ctx={ctx} t={t} sp={sp} base="/projects/tasks" view={view} basics={basics} />
    </Page>
  )
}

export const instant = false
