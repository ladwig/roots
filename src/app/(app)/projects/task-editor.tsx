import Link from "next/link"
import { ExternalLinkIcon } from "lucide-react"
import { Markdown } from "@/components/markdown"
import { SubmitButton } from "@/components/submit-button"
import { PeopleSelect } from "./people-select"
import { TagSelect } from "@/components/tag-select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import type { T } from "@/i18n/translate"
import type { ChecklistItem } from "@/projects/fields"
import { autosaveTaskAction, trashTaskAction } from "./actions"
import { AutosaveForm } from "./autosave-form"
import { Checklist } from "./checklist"

export type EditorTask = { id: string; title: string; description: string; status_id: string; due_on: string | null; tags: string[]; checklist: unknown; created_at: string; completed_at: string | null; task_assignees: { user_id: string }[] }

// Everything about one task: fields (save themselves), checklist (saves at once), trash. Used by the board's
// side panel and the task's own page.
export function TaskEditor({
  t,
  task,
  statuses,
  team,
  tags,
  canManage,
  back,
  pageLink,
}: {
  t: T
  task: EditorTask
  statuses: { id: string; name: string }[]
  team: { id: string; name: string }[]
  tags: string[]
  canManage: boolean
  back: string
  pageLink?: boolean
}) {
  const assigned = task.task_assignees.map((a) => a.user_id)
  return (
    <div className="grid gap-6">
      {pageLink && (
        <Link href={`/projects/tasks/${task.id}`} className="inline-flex items-center gap-1 justify-self-start text-sm text-muted-foreground underline-offset-4 hover:underline">
          <ExternalLinkIcon className="size-3.5" /> {t("projects.openAsPage")}
        </Link>
      )}
      <AutosaveForm action={autosaveTaskAction} className="grid gap-4">
        <input type="hidden" name="id" value={task.id} />
        <fieldset disabled={!canManage} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="tk-title">{t("projects.taskTitle")}</Label>
            <Input id="tk-title" name="title" defaultValue={task.title} maxLength={300} required className="text-base font-medium" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="tk-status">{t("projects.status")}</Label>
              <NativeSelect id="tk-status" name="status_id" defaultValue={task.status_id} className="w-full">
                {statuses.map((s) => (
                  <NativeSelectOption key={s.id} value={s.id}>
                    {s.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tk-due">{t("projects.due")}</Label>
              <Input id="tk-due" name="due_on" type="date" defaultValue={task.due_on ?? ""} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tk-people">{t("projects.assignees")}</Label>
            <PeopleSelect id="tk-people" name="assignees" team={team} defaultValue={assigned} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tk-tags">{t("projects.tags")}</Label>
            <TagSelect id="tk-tags" name="tags" options={tags} defaultValue={task.tags} creatable />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tk-desc">{t("projects.description")}</Label>
            <Textarea id="tk-desc" name="description" defaultValue={task.description} rows={6} maxLength={100000} placeholder={t("projects.descriptionHint")} />
          </div>
        </fieldset>
      </AutosaveForm>
      {!canManage && task.description.trim() && <Markdown>{task.description}</Markdown>}
      <Checklist taskId={task.id} initial={(Array.isArray(task.checklist) ? task.checklist : []) as ChecklistItem[]} disabled={!canManage} />
      <p className="text-xs text-muted-foreground">
        {t("projects.created", { date: t.date(task.created_at, { dateStyle: "medium" }) })}
        {task.completed_at && ` · ${t("projects.completedOn", { date: t.date(task.completed_at, { dateStyle: "medium" }) })}`}
      </p>
      {canManage && (
        <form action={trashTaskAction}>
          <input type="hidden" name="id" value={task.id} />
          <input type="hidden" name="back" value={back} />
          <SubmitButton size="sm" variant="ghost" className="text-muted-foreground">
            {t("projects.toTrash")}
          </SubmitButton>
        </form>
      )}
    </div>
  )
}
