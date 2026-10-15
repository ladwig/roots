import { z } from "zod"
import { Graph, GraphInput, NODE_DATA, NODE_TYPES, OPS, triggerOf, validate } from "@/automations/graph"
import { creatableFor, def, deletableFor, OPS_FOR, objectsFor, RECORD_ACTIONS, RECORD_OBJECTS, recordTrigger, writableFor, type ObjectKey } from "@/automations/objects"
import { TEMPLATES } from "@/automations/templates"
import { eventTypes } from "@/events/registry"
import { messages } from "@/i18n/config"
import { createT } from "@/i18n/translate"
import { scheduleNext } from "@/automations/server"
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
  problems: z.array(z.object({ key: z.string(), node: z.string().optional(), message: z.string() })).describe("Empty = can be activated"),
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
  return { ...w, graph: g.success ? g.data : { nodes: [], edges: [] }, problems: explain(g.success ? validate(g.data) : [{ key: "graphInvalid" }]) }
}
async function workflowOf(db: Db, orgId: string, id: string) {
  const { data } = await db.from("workflows").select(COLS).eq("id", id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
  if (!data) throw notFound()
  return data
}
const Input = z.object({ name: z.string().trim().min(1).max(200), description: z.string().max(2000).nullable(), graph: GraphInput.describe("Node positions are optional (laid out automatically)") }).partial().strict()
const en = createT("en", messages.en)
// Problems with a readable message (keys stay for programs).
const explain = (problems: { key: string; node?: string }[]) => problems.map((p) => ({ ...p, message: en.has(`automations.problems.${p.key}`) ? en.dynamic(`automations.problems.${p.key}`) : p.key }))
async function modulesOf(db: Db, orgId: string) {
  const { data } = await db.from("org_modules").select("module_key").eq("org_id", orgId)
  return new Set((data ?? []).map((m) => m.module_key))
}
const fieldsOf = (o: ObjectKey) => def(o).fields.map((f) => ({ key: f.key, kind: f.kind, ...(f.options ? { options: f.options } : {}), ...(f.write ? { writable: true } : {}), ...(f.time ? { timestamp: true } : {}) }))

export const endpoints: Endpoint[] = [
  endpoint({
    method: "GET",
    path: "/workflows/catalog",
    permission: "automations.view",
    tag: TAG,
    summary: "What automations can use: triggers, node types, objects and fields",
    description:
      "Start here to build a workflow. Without `trigger`: all triggers of the enabled modules + node types (with their data schema) + condition operators. With `trigger`: also the objects a run of that trigger has (fields for conditions and {object.field} placeholders) and what it may write, create or delete. Triggers: hub events (e.g. contact.created), record triggers record:<table>:<insert|update|delete>, and schedule (data: every day/week/month at time; optional object + date_field + offset for 'date reached').",
    query: z.object({ trigger: z.string().max(100).optional() }),
    response: z.object({ triggers: z.array(z.unknown()), node_types: z.record(z.string(), z.unknown()), operators: z.unknown(), objects: z.unknown().optional(), placeholders: z.string() }),
    async handler({ db, orgId, query }) {
      const mods = await modulesOf(db, orgId)
      const on = (m: string) => m === "org" || mods.has(m)
      const triggers = [
        { key: "schedule", kind: "schedule", label: "Schedule / date reached", module: "org" },
        ...eventTypes.filter((e) => on(e.module) && !e.key.startsWith("workflow.")).map((e) => ({ key: e.key, kind: "event", label: en.has(`events.types.${e.key}`) ? en.dynamic(`events.types.${e.key}`) : e.key, module: e.module })),
        ...RECORD_OBJECTS.filter((o) => on(def(o).module)).flatMap((o) => RECORD_ACTIONS.map((a) => ({ key: recordTrigger(o, a), kind: "record", label: `${en.dynamic(`automations.objects.${o}`)} ${a}`, module: def(o).module }))),
      ]
      const node_types = Object.fromEntries(NODE_TYPES.map((n) => [n, z.toJSONSchema(NODE_DATA[n], { io: "input", unrepresentable: "any" })]))
      const objects = query.trigger
        ? {
            available: objectsFor(query.trigger, mods).map((o) => ({ object: o, fields: fieldsOf(o) })),
            writable: writableFor(query.trigger, mods),
            creatable: creatableFor(query.trigger, mods),
            deletable: deletableFor(query.trigger, mods),
          }
        : undefined
      return {
        triggers,
        node_types,
        operators: { all: OPS, by_field_kind: OPS_FOR },
        ...(objects ? { objects } : {}),
        placeholders: "Texts can use {object.field} (e.g. {contact.first_name}, {event.title}) and {now.date}. Dates in values: today, today+10, today-1m, {membership.ends_on}+30d. Edges: { source, target, sourceHandle: 'yes'|'no' for conditions }.",
      }
    },
  }),
  endpoint({
    method: "POST",
    path: "/workflows/validate",
    permission: "automations.view",
    tag: TAG,
    summary: "Check a workflow graph before saving",
    description: "Returns the problems (empty = can be activated) with readable messages, and the graph with positions filled in. Nothing is saved.",
    body: z.object({ graph: GraphInput }).strict(),
    response: z.object({ problems: z.array(z.object({ key: z.string(), node: z.string().optional(), message: z.string() })), graph: Graph }),
    async handler({ body }) {
      return { problems: explain(validate(body.graph)), graph: body.graph }
    },
  }),
  endpoint({
    method: "GET",
    path: "/workflow-templates",
    permission: "automations.view",
    tag: TAG,
    summary: "Ready-made workflows to start from",
    description: "Each graph can be POSTed to /workflows as is (texts in English; change them before activating).",
    response: z.object({ data: z.array(z.object({ key: z.string(), module: z.string().optional(), graph: Graph })) }),
    async handler({ db, orgId }) {
      const mods = await modulesOf(db, orgId)
      return { data: TEMPLATES.filter((x) => !x.module || mods.has(x.module)).map((x) => ({ key: x.key, module: x.module, graph: x.graph(en) })) }
    },
  }),
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
      if (active && problems.length) throw new ApiError(422, "invalid_workflow", "Fix the problems before activating.", { problems: explain(problems) })
      const { data, error } = await db
        .from("workflows")
        .update({
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.graph ? { graph: body.graph as unknown as NonNullable<Json>, trigger_type: (triggerOf(body.graph)?.data.event as string) || null } : {}),
          active,
          next_run_at: active ? scheduleNext(graph) : null,
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
