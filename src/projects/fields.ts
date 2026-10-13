// Projects: task input and checklist, pure (App form, API, node --test).
export const STATUS_COLORS = ["gray", "blue", "green", "yellow", "orange", "red", "purple", "pink"] as const
export type ChecklistItem = { id: string; text: string; done: boolean }

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Title/description/due/tags as given (undefined = unchanged); errors as message keys. */
export function readTask(i: { title?: string; description?: string; due_on?: string | null; tags?: string[] }) {
  const out: { title?: string; description?: string; due_on?: string | null; tags?: string[] } = {}
  if (i.title !== undefined) {
    out.title = i.title.trim().slice(0, 300)
    if (!out.title) return { error: "projects.titleRequired" }
  }
  if (i.description !== undefined) out.description = i.description.replace(/\r\n/g, "\n").slice(0, 100_000)
  if (i.due_on !== undefined) {
    if (i.due_on && !DAY.test(i.due_on)) return { error: "errors.invalid_date" }
    out.due_on = i.due_on || null
  }
  if (i.tags !== undefined) out.tags = [...new Set(i.tags.map((x) => x.trim().slice(0, 40)).filter(Boolean))].slice(0, 20)
  return { row: out }
}

/** A checklist from untrusted input: at most 200 rows, text trimmed, empty rows dropped. */
export function readChecklist(items: unknown): ChecklistItem[] {
  if (!Array.isArray(items)) return []
  return items
    .slice(0, 200)
    .map((x) => x as Partial<ChecklistItem>)
    .map((x) => ({ id: String(x.id ?? "").slice(0, 40) || Math.random().toString(36).slice(2, 10), text: String(x.text ?? "").trim().slice(0, 300), done: x.done === true }))
    .filter((x) => x.text)
}

/** "2/5" progress of a checklist (null when empty). */
export const progress = (items: ChecklistItem[]) => (items.length ? `${items.filter((x) => x.done).length}/${items.length}` : null)

/** Dot colour of a board column, from the theme's tokens (no raw colours). */
export const DOT: Record<string, string> = {
  gray: "var(--muted-foreground)",
  blue: "var(--chart-2)",
  green: "var(--chart-1)",
  yellow: "var(--chart-4)",
  purple: "var(--chart-3)",
  red: "var(--destructive)",
  orange: "var(--chart-5)",
  pink: "var(--chart-3)",
}
export const PICKABLE_COLORS = ["gray", "blue", "green", "yellow", "purple", "red"] as const
