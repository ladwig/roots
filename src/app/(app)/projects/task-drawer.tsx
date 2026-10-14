import { Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuSubmit } from "@/components/actions-menu"
import { Notice } from "@/components/notice"
import { UrlSheet } from "@/components/url-sheet"
import type { T } from "@/i18n/translate"
import type { getContext } from "@/lib/context"
import { projectBasics } from "@/projects/load"
import { TASK_COLS } from "@/projects/server"
import { TaskEditor, taskMeta } from "./task-editor"

type Ctx = Awaited<ReturnType<typeof getContext>>

/**
 * The task panel (?task=<id>) on any page that links to tasks (board, list, home): opens in place, closing removes the
 * param. `back` = the page to return to after trashing (path + query without ?task).
 */
export async function TaskDrawer({ ctx, t, id, back, error, ok }: { ctx: Ctx; t: T; id: string | undefined; back: string; error?: string; ok?: string }) {
  if (!id || !/^[0-9a-f-]{36}$/.test(id) || !ctx.modules.has("projects") || !ctx.can("projects.view")) return null
  const [{ statuses, team, tags }, { data: task }] = await Promise.all([projectBasics(ctx), ctx.supabase.from("tasks").select(TASK_COLS).eq("id", id).eq("org_id", ctx.org.id).is("deleted_at", null).maybeSingle()])
  if (!task) return null
  const canManage = ctx.can("projects.manage")
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
      <TaskEditor t={t} task={task} statuses={statuses} team={team} tags={tags} canManage={canManage} back={back} />
    </UrlSheet>
  )
}
