import { z } from "zod"
import { Graph, triggerOf, validate } from "@/automations/graph"
import type { Json } from "@/lib/supabase/types"
import { ApiError, dbError, endpoint, list, notFound, page, paged, uuid, type Endpoint } from "../core"
import { ts, type Db } from "./shared"

// Automations: workflows as JSON (the same graph the canvas edits; export = GET, import = POST) and their runs.
const TAG = "Automations"
const Workflow = z.object({
  id: uuid,
  name: z.string(),
  description: z.string().nullable(),
  active: z.boolean(),
  trigger_type: z.string().nullable().describe("Hub event type that starts a run"),
  graph: Graph.describe("{ nodes: [{ id, type, position, data }], edges: [{ id, source, target, sourceHandle? }] }; node types: trigger, condition, wait, send_email, add_tag, remove_tag, set_field, webhook, notify_team"),
  problems: z.array(z.object({ key: z.string(), node: z.string().optional() })).describe("Empty = can be activated"),
  created_at: ts,
  updated_at: ts,
})
const COLS = "id, name, description, active, trigger_type, graph, created_at, updated_at"
const Run = z.object({
  id: uuid,
  workflow_id: uuid,
  contact_id: uuid.nullable(),
  status: z.enum(["queued", "running", "waiting", "done", "failed", "cancelled"]),
  node_id: z.string().nullable(),
  resume_at: ts,
  error: z.string().nullable(),
  log: z.array(z.unknown()),
  created_at: ts,
})
const out = (w: { graph: unknown } & Record<string, unknown>) => {
  const g = Graph.safeParse(w.graph)
  return { ...w, graph: g.success ? g.data : { nodes: [], edges: [] }, problems: g.success ? validate(g.data) : [{ key: "graphInvalid" }] }
}
async function workflowOf(db: Db, orgId: string, id: string) {
  const { data } = await db.from("workflows").select(COLS).eq("id", id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
  if (!data) throw notFound()
  return data
}
const Input = z.object({ name: z.string().trim().min(1).max(200), description: z.string().max(2000).nullable(), graph: Graph }).partial().strict()

export const endpoints: Endpoint[] = [
  endpoint({
    method: "GET",
    path: "/workflows",
    permission: "automations.view",
    tag: TAG,
    summary: "List automations",
    query: page,
    response: list(Workflow),
    async handler({ db, orgId, query }) {
      const { data } = await db.from("workflows").select(COLS).eq("org_id", orgId).is("deleted_at", null).order("name").range(query.offset, query.offset + query.limit)
      return paged((data ?? []).map(out), query)
    },
  }),
  endpoint({
    method: "GET",
    path: "/workflows/{id}",
    permission: "automations.view",
    tag: TAG,
    summary: "Get (export) an automation",
    description: "The `name`, `description` and `graph` can be POSTed to /workflows to import it elsewhere.",
    response: Workflow,
    async handler({ db, orgId, params }) {
      return out(await workflowOf(db, orgId, params.id))
    },
  }),
  endpoint({
    method: "POST",
    path: "/workflows",
    permission: "automations.manage",
    tag: TAG,
    summary: "Create (import) an automation",
    description: "Created inactive; activate with PATCH `active: true` once `problems` is empty.",
    body: Input.required({ name: true, graph: true }),
    response: Workflow,
    status: 201,
    async handler({ db, orgId, body }) {
      const { data, error } = await db
        .from("workflows")
        .insert({ org_id: orgId, name: body.name, description: body.description ?? null, graph: body.graph as unknown as NonNullable<Json>, trigger_type: (triggerOf(body.graph)?.data.event as string) || null })
        .select(COLS)
        .single()
      if (error) throw dbError(error)
      return out(data)
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/workflows/{id}",
    permission: "automations.manage",
    tag: TAG,
    summary: "Change an automation or switch it on/off",
    description: "Active automations must stay valid (422 `invalid_workflow` with the problems).",
    body: Input.extend({ active: z.boolean() }).partial().strict(),
    response: Workflow,
    async handler({ db, orgId, params, body }) {
      const old = await workflowOf(db, orgId, params.id)
      const graph = body.graph ?? Graph.parse(old.graph)
      const active = body.active ?? old.active
      const problems = validate(graph)
      if (active && problems.length) throw new ApiError(422, "invalid_workflow", "Fix the problems before activating.", { problems })
      const { data, error } = await db
        .from("workflows")
        .update({
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.graph ? { graph: body.graph as unknown as NonNullable<Json>, trigger_type: (triggerOf(body.graph)?.data.event as string) || null } : {}),
          active,
        })
        .eq("id", params.id)
        .eq("org_id", orgId)
        .select(COLS)
        .single()
      if (error) throw dbError(error)
      return out(data)
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/workflows/{id}",
    permission: "automations.manage",
    tag: TAG,
    summary: "Move an automation to the trash",
    description: "Switches it off; waiting runs are cancelled when they would continue.",
    response: z.object({ ok: z.literal(true) }),
    async handler({ db, orgId, params }) {
      await workflowOf(db, orgId, params.id)
      await db.from("workflows").update({ active: false }).eq("id", params.id).eq("org_id", orgId)
      const { error } = await db.rpc("soft_delete", { p_table: "public.workflows", p_id: params.id })
      if (error) throw dbError(error)
      return { ok: true }
    },
  }),
  endpoint({
    method: "GET",
    path: "/workflows/{id}/runs",
    permission: "automations.view",
    tag: TAG,
    summary: "Runs of an automation",
    description: "Newest first, with the log of executed steps.",
    query: page.extend({ status: z.enum(["queued", "running", "waiting", "done", "failed", "cancelled"]).optional() }),
    response: list(Run),
    async handler({ db, orgId, params, query }) {
      await workflowOf(db, orgId, params.id)
      let q = db
        .from("workflow_runs")
        .select("id, workflow_id, contact_id, status, node_id, resume_at, error, log, created_at")
        .eq("org_id", orgId)
        .eq("workflow_id", params.id)
        .order("created_at", { ascending: false })
        .range(query.offset, query.offset + query.limit)
      if (query.status) q = q.eq("status", query.status)
      const { data } = await q
      return paged(data, query)
    },
  }),
  endpoint({
    method: "POST",
    path: "/workflow-runs/{id}/cancel",
    permission: "automations.manage",
    tag: TAG,
    summary: "Cancel a waiting run",
    response: z.object({ ok: z.literal(true) }),
    async handler({ db, orgId, params }) {
      const { data, error } = await db.from("workflow_runs").update({ status: "cancelled" }).eq("id", params.id).eq("org_id", orgId).in("status", ["queued", "waiting"]).select("id")
      if (error) throw dbError(error)
      if (!data.length) throw new ApiError(409, "not_waiting", "Only queued or waiting runs can be cancelled.")
      return { ok: true }
    },
  }),
]
