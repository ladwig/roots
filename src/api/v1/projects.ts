import { z } from "zod"
import { messages } from "@/i18n/config"
import { createT } from "@/i18n/translate"
import { STATUS_COLORS } from "@/projects/fields"
import { createTask, moveTask, saveStatus, setAssignees, TASK_COLS, updateTask, type ProjectFail } from "@/projects/server"
import { ApiError, dbError, endpoint, list, notFound, page, paged, uuid, type Endpoint } from "../core"
import { day, ts, type Db } from "./shared"

const TAG = "Projects"
const en = createT("en", messages.en)
function fail(f: ProjectFail): never {
  if (f.db) throw dbError(f.db)
  throw new ApiError(422, f.error.split(".").pop()!.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), en.dynamic(f.error))
}

const Status = z.object({ id: uuid, name: z.string(), color: z.enum(STATUS_COLORS), is_done: z.boolean().describe("Tasks here count as completed"), position: z.number().int() })
const ChecklistItem = z.object({ id: z.string(), text: z.string(), done: z.boolean() })
const Task = z.object({
  id: uuid,
  status_id: uuid,
  title: z.string(),
  description: z.string(),
  position: z.number().describe("Order within the status column"),
  due_on: day.nullable(),
  tags: z.array(z.string()),
  checklist: z.array(ChecklistItem).describe("Subtasks"),
  assignees: z.array(uuid).describe("User ids (team members)"),
  completed_at: ts.nullable(),
  created_at: ts,
  updated_at: ts,
})
type Row = { task_assignees: { user_id: string }[]; checklist: unknown } & Record<string, unknown>
const shape = ({ task_assignees, ...r }: Row) => ({ ...r, checklist: Array.isArray(r.checklist) ? r.checklist : [], assignees: task_assignees.map((a) => a.user_id) }) as z.infer<typeof Task>

async function load(db: Db, orgId: string, id: string) {
  const { data } = await db.from("tasks").select(TASK_COLS).eq("id", id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
  if (!data) throw notFound()
  return shape(data)
}

const TaskInput = z.object({
  title: z.string().max(300),
  status_id: uuid.describe("Default: the first column"),
  description: z.string().max(100_000),
  due_on: day.nullable(),
  tags: z.array(z.string().max(40)).max(20),
  checklist: z.array(z.object({ id: z.string().optional(), text: z.string().max(300), done: z.boolean().default(false) })).max(200),
  assignees: z.array(uuid).max(20).describe("Exactly these team members (user ids)"),
})

export const endpoints: Endpoint[] = [
  endpoint({
    method: "GET",
    path: "/task-statuses",
    permission: "projects.view",
    tag: TAG,
    summary: "List the board's columns",
    response: z.object({ data: z.array(Status) }),
    async handler({ db, orgId }) {
      const { data } = await db.from("task_statuses").select("id, name, color, is_done, position").eq("org_id", orgId).order("position")
      return { data: (data ?? []) as z.infer<typeof Status>[] }
    },
  }),
  endpoint({
    method: "POST",
    path: "/task-statuses",
    permission: "projects.manage",
    tag: TAG,
    summary: "Create a column (at the end)",
    body: z.object({ name: z.string().max(60), color: z.enum(STATUS_COLORS).default("gray"), is_done: z.boolean().default(false) }).strict(),
    response: Status,
    status: 201,
    async handler({ db, orgId, body }) {
      const r = await saveStatus(db, orgId, null, body)
      if ("error" in r) fail(r)
      return (await db.from("task_statuses").select("id, name, color, is_done, position").eq("id", r.id).single()).data as z.infer<typeof Status>
    },
  }),
  endpoint({
    method: "GET",
    path: "/tasks",
    permission: "projects.view",
    tag: TAG,
    summary: "List tasks",
    description: "Board order (column position, then position in the column).",
    query: page.extend({ status_id: uuid.optional(), tag: z.string().optional(), assignee: uuid.optional(), q: z.string().max(100).optional() }),
    response: list(Task),
    async handler({ db, orgId, query }) {
      const cols = (query.assignee ? TASK_COLS.replace("task_assignees(user_id)", "task_assignees!inner(user_id)") : TASK_COLS) as typeof TASK_COLS
      let q = db.from("tasks").select(cols).eq("org_id", orgId).is("deleted_at", null).order("position").range(query.offset, query.offset + query.limit)
      if (query.assignee) q = q.eq("task_assignees.user_id", query.assignee)
      if (query.status_id) q = q.eq("status_id", query.status_id)
      if (query.tag) q = q.contains("tags", [query.tag])
      const term = query.q?.replace(/[%,()*\\]/g, " ").trim()
      if (term) q = q.or(`title.ilike.%${term}%,description.ilike.%${term}%`)
      const { data } = await q
      return paged((data ?? []).map(shape), query)
    },
  }),
  endpoint({
    method: "GET",
    path: "/tasks/{id}",
    permission: "projects.view",
    tag: TAG,
    summary: "Get a task",
    response: Task,
    handler: ({ db, orgId, params }) => load(db, orgId, params.id),
  }),
  endpoint({
    method: "POST",
    path: "/tasks",
    permission: "projects.manage",
    tag: TAG,
    summary: "Create a task (at the end of its column)",
    description: "Emits `task.assigned` per assignee.",
    body: TaskInput.partial().required({ title: true }).strict(),
    response: Task,
    status: 201,
    async handler({ db, orgId, body }) {
      const r = await createTask(db, orgId, { title: body.title, statusId: body.status_id, description: body.description, due_on: body.due_on, tags: body.tags, assignees: body.assignees })
      if ("error" in r) fail(r)
      if (body.checklist) await updateTask(db, orgId, r.id, { checklist: body.checklist })
      return load(db, orgId, r.id)
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/tasks/{id}",
    permission: "projects.manage",
    tag: TAG,
    summary: "Change a task",
    description: "Only the fields given. A status with `is_done` sets `completed_at` and emits `task.completed`.",
    body: TaskInput.partial().strict(),
    response: Task,
    async handler({ db, orgId, params, body }) {
      await load(db, orgId, params.id)
      const { assignees, status_id, ...rest } = body
      const r = await updateTask(db, orgId, params.id, { ...rest, statusId: status_id })
      if ("error" in r) fail(r)
      if (assignees) {
        const a = await setAssignees(db, orgId, params.id, assignees)
        if ("error" in a) fail(a)
      }
      return load(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "POST",
    path: "/tasks/{id}/move",
    permission: "projects.manage",
    tag: TAG,
    summary: "Move a task on the board",
    description: "Into `status_id`; `order` = that column's task ids top to bottom (the column is renumbered).",
    body: z.object({ status_id: uuid, order: z.array(uuid).max(1000).default([]) }).strict(),
    response: Task,
    async handler({ db, orgId, params, body }) {
      await load(db, orgId, params.id)
      const r = await moveTask(db, orgId, params.id, body.status_id, body.order)
      if ("error" in r) fail(r)
      return load(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/tasks/{id}",
    permission: "projects.manage",
    tag: TAG,
    summary: "Move a task to the trash",
    description: "Restorable for 30 days in the App.",
    response: z.object({ id: uuid }),
    async handler({ db, orgId, params }) {
      await load(db, orgId, params.id)
      const { error } = await db.rpc("soft_delete", { p_table: "public.tasks", p_id: params.id })
      if (error) throw dbError(error)
      return { id: params.id }
    },
  }),
]
