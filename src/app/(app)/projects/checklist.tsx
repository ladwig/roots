"use client"

import { useState, useTransition } from "react"
import { XIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"
import type { ChecklistItem } from "@/projects/fields"
import { saveChecklistAction } from "./actions"

// Subtasks as rows to tick off. Every change saves at once.
export function Checklist({ taskId, initial, disabled }: { taskId: string; initial: ChecklistItem[]; disabled: boolean }) {
  const t = useT()
  const [items, setItems] = useState(initial)
  const [draft, setDraft] = useState("")
  const [pending, start] = useTransition()
  const save = (next: ChecklistItem[]) => {
    setItems(next)
    start(async () => {
      const r = await saveChecklistAction({ id: taskId, checklist: next })
      if (r.error) toast.error(r.error)
    })
  }
  const done = items.filter((i) => i.done).length
  return (
    <section className="grid gap-2" aria-labelledby="checklist">
      <h3 id="checklist" className="flex items-center justify-between text-sm font-medium">
        {t("projects.checklist")}
        {items.length > 0 && (
          <span className="text-xs font-normal text-muted-foreground">
            {done}/{items.length}
          </span>
        )}
      </h3>
      {items.length > 0 && (
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
      )}
      <ul className="grid gap-1">
        {items.map((item) => (
          <li key={item.id} className="group flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-muted/60">
            <input
              type="checkbox"
              checked={item.done}
              disabled={disabled}
              aria-label={item.text}
              onChange={() => save(items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)))}
              className="size-4"
            />
            <span className={cn("flex-1 text-sm break-words", item.done && "text-muted-foreground line-through")}>{item.text}</span>
            {!disabled && (
              <Button type="button" size="icon-sm" variant="ghost" aria-label={t("projects.removeRow")} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => save(items.filter((i) => i.id !== item.id))}>
                <XIcon />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {!disabled && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!draft.trim()) return
            save([...items, { id: crypto.randomUUID().slice(0, 8), text: draft.trim(), done: false }])
            setDraft("")
          }}
        >
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("projects.addRow")} aria-label={t("projects.addRow")} maxLength={300} className="h-8 text-sm" />
          <Button type="submit" size="sm" variant="outline" disabled={pending || !draft.trim()}>
            {t("projects.add")}
          </Button>
        </form>
      )}
    </section>
  )
}
