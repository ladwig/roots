import Link from "next/link"
import { notFound } from "next/navigation"
import { Trash2Icon, XIcon } from "lucide-react"
import { berlinToday } from "@/api/v1/shared"
import { ActionsMenu, MenuSubmit } from "@/components/actions-menu"
import { ActivityFeed } from "@/components/activity-feed"
import { FileList } from "@/components/file-list"
import { Notice } from "@/components/notice"
import { FormCard, Page, PageHeader, RecordLayout } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { param, type SearchParams } from "@/lib/url"
import { DOT } from "@/projects/fields"
import { projectBasics } from "@/projects/load"
import { linkedRecords, PROJECT_COLS } from "@/projects/server"
import { addCommentAction, deleteCommentAction, removeLinkAction, trashProjectAction, updateProjectAction } from "../actions"
import { LinkPicker } from "../link-picker"
import { ProjectFields } from "../project-form"
import { TASK_VIEWS, TasksView, type TaskView } from "../tasks-view"
import { ViewSegments } from "../view-segments"

const VIEWS = ["overview", ...TASK_VIEWS] as const

// One project: overview (description, details, custom fields, links, files, activity) and its tasks as board, list,
// timeline or calendar (?view=…). Fields save with the SaveBar; links, files and comments at once.
export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const ctx = await requirePerm("projects.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("projects.manage")
  const view = VIEWS.find((v) => v === param(sp, "view")) ?? "overview"
  const base = `/projects/${id}`
  const [basics, { data: p }, defs, { data: links }, { data: taskRows }] = await Promise.all([
    projectBasics(ctx),
    ctx.supabase.from("projects").select(PROJECT_COLS).eq("id", id).eq("org_id", ctx.org.id).is("deleted_at", null).maybeSingle(),
    loadFields(ctx.supabase, ctx.org.id, "projects"),
    ctx.supabase.from("project_links").select("id, entity, entity_id").eq("project_id", id).eq("org_id", ctx.org.id).order("created_at"),
    ctx.supabase.from("tasks").select("completed_at, due_on").eq("project_id", id).eq("org_id", ctx.org.id).is("deleted_at", null).limit(5000),
  ])
  if (!p) notFound()
  const status = basics.projectStatuses.find((s) => s.id === p.status_id)
  const lead = basics.team.find((m) => m.id === p.lead_id)?.name
  const today = berlinToday()
  const all = taskRows ?? []
  const doneCount = all.filter((x) => x.completed_at).length
  const overdue = all.filter((x) => !x.completed_at && x.due_on && x.due_on < today).length
  const period = p.start_on || p.end_on ? [p.start_on, p.end_on].map((d) => (d ? t.date(`${d}T12:00:00`, { dateStyle: "medium" }) : "…")).join(" – ") : null
  const linked = view === "overview" ? await linkedRecords(ctx.supabase, ctx.org.id, links ?? []) : []

  return (
    <Page className={view === "overview" ? undefined : "max-w-none"}>
      <PageHeader
        crumbs={[{ href: "/projects", label: t("projects.title") }, { label: p.name }]}
        title={
          <span className="inline-flex items-center gap-2">
            <span className="size-3 shrink-0 rounded-full" style={{ background: DOT[p.color] ?? DOT.gray }} aria-hidden />
            {p.name}
          </span>
        }
        badge={status && <Badge variant={status.is_done ? "secondary" : "outline"}>{status.name}</Badge>}
        meta={[lead && t("projects.leadBy", { name: lead }), period].filter(Boolean).join(" · ") || undefined}
        actions={<ViewSegments t={t} sp={sp} views={VIEWS} current={view} />}
        menu={
          canManage && (
            <ActionsMenu>
              <MenuSubmit form="trash-project" icon={<Trash2Icon />} destructive>
                {t("projects.projectToTrash")}
              </MenuSubmit>
            </ActionsMenu>
          )
        }
      />
      {canManage && (
        <form id="trash-project" action={trashProjectAction} hidden>
          <input type="hidden" name="id" value={p.id} />
        </form>
      )}

      {view === "overview" ? (
        <>
          <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
          <RecordLayout
            aside={
              <>
                <FormCard id="progress" title={t("projects.progress")}>
                  <div className="grid gap-2 text-sm">
                    <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={all.length} aria-valuenow={doneCount} aria-label={t("projects.progress")}>
                      <div className="h-full rounded-full bg-primary" style={{ width: `${all.length ? (doneCount / all.length) * 100 : 0}%` }} />
                    </div>
                    <p>{t("projects.tasksDone", { done: doneCount, count: all.length })}</p>
                    {overdue > 0 && <p className="text-destructive">{t("projects.overdueCount", { count: overdue })}</p>}
                    <Link href={`${base}?view=board`} className="text-primary hover:underline">
                      {t("projects.openBoard")}
                    </Link>
                  </div>
                </FormCard>
                <FormCard id="links" title={t("projects.links")} description={t("projects.linksHint")}>
                  {linked.length > 0 && (
                    <ul className="grid gap-1">
                      {linked.map((l) => (
                        <li key={l.id} className="flex items-center gap-2 text-sm">
                          <Link href={l.href} className="min-w-0 flex-1 truncate hover:underline">
                            {l.title}
                          </Link>
                          <span className="shrink-0 text-xs text-muted-foreground">{t.dynamic(`projects.linkKinds.${l.entity}`)}</span>
                          {canManage && (
                            <form action={removeLinkAction}>
                              <input type="hidden" name="id" value={l.id} />
                              <input type="hidden" name="project_id" value={p.id} />
                              <SubmitButton variant="ghost" size="icon-sm" aria-label={t("projects.unlink")}>
                                <XIcon />
                              </SubmitButton>
                            </form>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {canManage && <LinkPicker projectId={p.id} />}
                </FormCard>
                <FormCard id="files" title={t("files.title")}>
                  <FileList ctx={ctx} entity="projects" entityId={p.id} back={base} />
                </FormCard>
              </>
            }
          >
            <form action={updateProjectAction} className="grid gap-6">
              <input type="hidden" name="id" value={p.id} />
              <ProjectFields t={t} p={p} statuses={basics.projectStatuses} team={basics.team} defs={defs} disabled={!canManage} />
              {canManage && <SaveBar />}
            </form>
            <FormCard id="activity" title={t("activity.title")}>
              <ActivityFeed
                ctx={ctx}
                t={t}
                entity="projects"
                entityId={p.id}
                back={base}
                defs={defs}
                canModerate={canManage}
                actions={{ add: addCommentAction, remove: deleteCommentAction }}
                fields={{
                  name: t("projects.name"),
                  status_id: t("projects.status"),
                  lead_id: t("projects.lead"),
                  start_on: t("projects.start"),
                  end_on: t("projects.end"),
                  description: t("projects.description"),
                }}
                show={{
                  status_id: (v) => basics.projectStatuses.find((s) => s.id === v)?.name ?? "–",
                  lead_id: (v) => basics.team.find((m) => m.id === v)?.name ?? "–",
                }}
              />
            </FormCard>
          </RecordLayout>
        </>
      ) : (
        <>
          <Notice error={!param(sp, "task") ? param(sp, "error") : undefined} ok={!param(sp, "task") ? param(sp, "ok") : undefined} />
          <TasksView ctx={ctx} t={t} sp={sp} base={base} view={view as TaskView} projectId={p.id} basics={basics} />
        </>
      )}
    </Page>
  )
}

export const instant = false
