import { notFound } from "next/navigation"
import { Notice } from "@/components/notice"
import { PageCrumbs } from "@/components/page-crumbs"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, type SearchParams } from "@/lib/url"
import { projectBasics } from "@/projects/load"
import { TASK_COLS } from "@/projects/server"
import { TaskEditor } from "../../task-editor"

// A task as a page (from the side panel: "Als Seite öffnen"), e.g. for a long description.
export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const ctx = await requirePerm("projects.view")
  if (!ctx.modules.has("projects")) notFound()
  const t = await getT()
  const sp = await searchParams
  const [{ data: task }, basics] = await Promise.all([
    ctx.supabase.from("tasks").select(TASK_COLS).eq("id", id).eq("org_id", ctx.org.id).is("deleted_at", null).maybeSingle(),
    projectBasics(ctx),
  ])
  if (!task) notFound()
  return (
    <div className="grid max-w-3xl gap-6">
      <PageCrumbs items={[{ href: "/projects", label: t("projects.title") }, { label: task.title }]} />
      <h1 className="font-heading text-2xl font-semibold break-words">{task.title}</h1>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <TaskEditor t={t} task={task} statuses={basics.statuses} team={basics.team} tags={basics.tags} canManage={ctx.can("projects.manage")} back={`/projects/tasks/${task.id}`} />
    </div>
  )
}

export const instant = false
