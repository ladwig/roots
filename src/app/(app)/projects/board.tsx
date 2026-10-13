"use client"

import { useRef, useState, useTransition } from "react"
import Link from "next/link"
import { CalendarIcon, ListChecksIcon } from "lucide-react"
import { toast } from "sonner"
import { KanbanBoard, KanbanCard, KanbanCards, KanbanHeader, KanbanProvider } from "@/components/kibo-ui/kanban"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"
import { DOT } from "@/projects/fields"
import { createTaskAction, moveTaskAction } from "./actions"

export type BoardStatus = { id: string; name: string; color: string }
export type BoardTask = { id: string; title: string; status_id: string; tags: string[]; due_on: string | null; done: boolean; progress: string | null; people: { id: string; initials: string; name: string }[]; href: string }
type Item = { id: string; name: string; column: string; task: BoardTask }

// Kanban: one column per status, drag & drop between and within columns (saved at once), quick add per column,
// a click opens the task panel. Readers see the board without dragging.
export function Board({ statuses, tasks, canManage, back, today }: { statuses: BoardStatus[]; tasks: BoardTask[]; canManage: boolean; back: string; today: string }) {
  const t = useT()
  const [items, setItems] = useState<Item[]>(() => tasks.map((task) => ({ id: task.id, name: task.title, column: task.status_id, task })))
  const latest = useRef(items)
  const from = useRef<{ id: string; column: string } | null>(null)
  const [, start] = useTransition()
  const columns = statuses.map((s) => ({ id: s.id, name: s.name, color: s.color }))

  const change = (next: Item[]) => {
    latest.current = next
    setItems(next)
  }
  const persist = () => {
    const moved = from.current
    from.current = null
    if (!moved) return
    // After the board's own reordering (it runs right after onDragEnd): the column's order as it is now.
    queueMicrotask(() => {
      const item = latest.current.find((i) => i.id === moved.id)
      if (!item) return
      const order = latest.current.filter((i) => i.column === item.column).map((i) => i.id)
      start(async () => {
        const r = await moveTaskAction({ id: item.id, statusId: item.column, order })
        if (r.error) toast.error(r.error)
      })
    })
  }

  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-2">
      <KanbanProvider
        columns={columns}
        data={items}
        onDataChange={canManage ? change : undefined}
        onDragStart={(e) => {
          if (!canManage) return
          const i = latest.current.find((x) => x.id === e.active.id)
          from.current = i ? { id: i.id, column: i.column } : null
        }}
        onDragEnd={() => canManage && persist()}
        className="min-w-max auto-cols-[minmax(16rem,1fr)]"
      >
        {(column) => (
          <KanbanBoard id={column.id} key={column.id} className="min-h-[60vh] bg-muted/40">
            <KanbanHeader className="flex items-center gap-2 p-2.5 text-sm font-medium">
              <span className="size-2.5 rounded-full" style={{ background: DOT[String(column.color)] ?? DOT.gray }} aria-hidden />
              {column.name}
              <span className="text-xs font-normal text-muted-foreground">{items.filter((i) => i.column === column.id).length}</span>
            </KanbanHeader>
            <KanbanCards id={column.id}>
              {(item: Item) => (
                <KanbanCard key={item.id} id={item.id} name={item.name} column={item.column}>
                  <TaskCard task={item.task} today={today} />
                </KanbanCard>
              )}
            </KanbanCards>
            {canManage && (
              <form action={createTaskAction} className="flex gap-1.5 p-2">
                <input type="hidden" name="status_id" value={column.id} />
                <input type="hidden" name="back" value={back} />
                <Input name="title" placeholder={t("projects.quickAdd")} aria-label={t("projects.quickAdd")} maxLength={300} required className="h-8 text-sm" />
                <SubmitButton size="sm" variant="ghost">
                  +
                </SubmitButton>
              </form>
            )}
          </KanbanBoard>
        )}
      </KanbanProvider>
    </div>
  )
}

function TaskCard({ task, today }: { task: BoardTask; today: string }) {
  const overdue = task.due_on && !task.done && task.due_on < today
  return (
    <Link href={task.href} scroll={false} className="grid gap-2 text-sm">
      <span className={cn("font-medium break-words", task.done && "text-muted-foreground line-through")}>{task.title}</span>
      {task.tags.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {task.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-[11px]">
              {tag}
            </Badge>
          ))}
        </span>
      )}
      {(task.due_on || task.progress || task.people.length > 0) && (
        <span className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {task.due_on && (
            <span className={cn("inline-flex items-center gap-1", overdue && "text-destructive")}>
              <CalendarIcon className="size-3.5" /> {new Date(`${task.due_on}T12:00:00`).toLocaleDateString(undefined, { day: "2-digit", month: "2-digit" })}
            </span>
          )}
          {task.progress && (
            <span className="inline-flex items-center gap-1">
              <ListChecksIcon className="size-3.5" /> {task.progress}
            </span>
          )}
          <span className="ml-auto flex -space-x-1.5">
            {task.people.map((p) => (
              <span key={p.id} title={p.name} className="grid size-6 place-items-center rounded-full border-2 border-card bg-muted text-[10px] font-medium text-foreground">
                {p.initials}
              </span>
            ))}
          </span>
        </span>
      )}
    </Link>
  )
}
