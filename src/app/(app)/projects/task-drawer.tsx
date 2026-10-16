import { Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuSubmit } from "@/components/actions-menu"
import { ActivityFeed } from "@/components/activity-feed"
import { Notice } from "@/components/notice"
import { UrlSheet } from "@/components/url-sheet"
import type { T } from "@/i18n/translate"
import type { getContext } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { projectBasics } from "@/projects/load"
import { TASK_COLS } from "@/projects/server"
import { addCommentAction, deleteCommentAction } from "./actions"
import { TaskEditor, taskMeta } from "./task-editor"

type Ctx = Awaited<ReturnType<typeof getContext>>

/**
 * The task panel (?task=<id>) on any page that links to tasks (boards, lists, project page, home): opens in place,
 * closing removes the param. `back` = the page to return to (path + query without ?task). Fields, checklist, then the
 * activity (comments + changes).
 */
export async function TaskDrawer({ ctx, t, id, back, basics, error, ok }: { ctx: Ctx; t: T; id: string | undefined; back: string; basics?: Awaited<ReturnType<typeof projectBasics>>; error?: string; ok?: string }) {
  if (!id || !/^[0-9a-f-]{36}$/.test(id) || !ctx.modules.has("projects") || !ctx.can("projects.view")) return null
  const [b, { data: task }, defs] = await Promise.all([
    basics ?? projectBasics(ctx),
    ctx.supabase.from("tasks").select(TASK_COLS).eq("id", id).eq("org_id", ctx.org.id).is("deleted_at", null).maybeSingle(),
    loadFields(ctx.supabase, ctx.org.id, "tasks"),
  ])
  if (!task) return null
  const canManage = ctx.can("projects.manage")
  const here = `${back}${back.includes("?") ? "&" : "?"}task=${id}`
  const name = (uid: unknown) => b.team.find((p) => p.id === uid)?.name ?? "–"
  return (
    <UrlSheet
      params={["task"]}
      title={task.title}
      wide
      meta={taskMeta(t, task)}
      menu={
        canManage && (
          <ActionsMenu>
            <MenuSubmit form="trash-task" icon={<Trash2Icon />} destructive>
              {t("projects.toTrash")}
            </MenuSubmit>
          </ActionsMenu>
        )
      }
    >
      <Notice error={error} ok={ok} />
      <TaskEditor t={t} task={task} statuses={b.statuses} team={b.team} tags={b.tags} projects={b.projects} defs={defs} canManage={canManage} back={back} />
      <section aria-labelledby="task-activity" className="grid gap-3 border-t pt-4">
        <h3 id="task-activity" className="text-sm font-medium">
          {t("activity.title")}
        </h3>
        <ActivityFeed
          ctx={ctx}
          t={t}
          entity="tasks"
          entityId={task.id}
          back={here}
          defs={defs}
          canModerate={canManage}
          actions={{ add: addCommentAction, remove: deleteCommentAction }}
          fields={{
            title: t("projects.taskTitle"),
            status_id: t("projects.status"),
            project_id: t("projects.project"),
            start_on: t("projects.start"),
            due_on: t("projects.due"),
            tags: t("projects.tags"),
            description: t("projects.description"),
          }}
          show={{
            status_id: (v) => b.statuses.find((s) => s.id === v)?.name ?? "–",
            project_id: (v) => b.projects.find((p) => p.id === v)?.name ?? "–",
            lead_id: name,
          }}
        />
      </section>
    </UrlSheet>
  )
}
