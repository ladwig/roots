// Automations worker: takes due runs, walks their workflow's graph from where they stand and executes the nodes
// until a wait (park until resume_at), the end (done) or an error (failed). Runs from the minute cron and right
// after actions that emit events. Service role: everything here filters by the run's org.
import { isAllowedUrl } from "@/events/channels/webhook"
import { loadFields, parseValue } from "@/lib/custom-fields"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Json, TablesUpdate } from "@/lib/supabase/types"
import { OBJECTS, objectsFor, splitPath, type ObjectKey } from "./objects"
import { fill, Graph, NODE_DATA, next, passes, triggerOf, waitMs, type GraphNode, type NodeData, type NodeType } from "./graph"

type Db = ReturnType<typeof createAdminClient>
type Run = { id: string; org_id: string; workflow_id: string; contact_id: string | null; node_id: string | null; context: Json; log: Json }
type Ctx = Record<string, unknown> & { payload: Record<string, unknown>; contact: Record<string, unknown> | null; org: { name: string } }
type LogEntry = { at: string; node: string; type: NodeType; ok: boolean; note?: string }
const MAX_STEPS = 50 // per run and turn (graphs have no cycles, this only guards against surprises)

export async function processWorkflowRuns(limit = 25) {
  if (!process.env.SUPABASE_SECRET_KEY) return 0
  const db = createAdminClient()
  const { data: runs, error } = await db.rpc("claim_workflow_runs", { p_limit: limit })
  if (error) throw error
  for (const run of runs ?? []) await step(db, run).catch((e) => finish(db, run, [], { status: "failed", error: String(e instanceof Error ? e.message : e) }))
  return runs?.length ?? 0
}

async function step(db: Db, run: Run) {
  const { data: wf } = await db.from("workflows").select("graph, active, deleted_at").eq("id", run.workflow_id).eq("org_id", run.org_id).single()
  if (!wf || wf.deleted_at) return finish(db, run, [], { status: "cancelled", error: "workflow deleted" })
  const parsed = Graph.safeParse(wf.graph)
  if (!parsed.success) return finish(db, run, [], { status: "failed", error: "invalid workflow" })
  const g = parsed.data
  const ctx = await context(db, run)
  const log: LogEntry[] = []
  let node: GraphNode | null = run.node_id ? (g.nodes.find((n) => n.id === run.node_id) ?? null) : next(g, triggerOf(g)?.id ?? "")
  for (let i = 0; i < MAX_STEPS && node; i++) {
    const type = node.type
    const data = NODE_DATA[type].parse(node.data) as Record<string, unknown>
    const at = new Date().toISOString()
    if (type === "wait") {
      const after = next(g, node.id)
      log.push({ at, node: node.id, type, ok: true })
      if (!after) return finish(db, run, log, { status: "done" })
      return finish(db, run, log, { status: "waiting", node_id: after.id, resume_at: new Date(Date.now() + waitMs(data as NodeData<"wait">)).toISOString() })
    }
    if (type === "condition") {
      const yes = passes(data as NodeData<"condition">, ctx)
      log.push({ at, node: node.id, type, ok: true, note: yes ? "yes" : "no" })
      node = next(g, node.id, yes ? "yes" : "no")
      continue
    }
    try {
      const note = await act(db, run, node, type, data, ctx)
      log.push({ at, node: node.id, type, ok: true, ...(note ? { note } : {}) })
    } catch (e) {
      log.push({ at, node: node.id, type, ok: false, note: String(e instanceof Error ? e.message : e).slice(0, 300) })
      return finish(db, run, log, { status: "failed", node_id: node.id, error: String(e instanceof Error ? e.message : e).slice(0, 2000) })
    }
    node = next(g, node.id)
  }
  return finish(db, run, log, node ? { status: "waiting", node_id: node.id, resume_at: new Date().toISOString() } : { status: "done" })
}

// The run's data: trigger payload, the objects the trigger brings (src/automations/objects.ts) as they are now,
// the person (from the run, or via the membership/invoice), the org.
async function context(db: Db, run: Run): Promise<Ctx> {
  const base = (run.context ?? {}) as { event?: string; payload?: Record<string, unknown> }
  const payload = base.payload ?? {}
  const idOf = (k: ObjectKey) => {
    const v = payload[OBJECTS[k].idKey]
    return typeof v === "string" && /^[0-9a-f-]{36}$/.test(v) ? v : null
  }
  const want = new Set(objectsFor(base.event ?? ""))
  const id = (k: ObjectKey) => (want.has(k) ? idOf(k) : null)
  const none = { data: null }
  const [{ data: event }, { data: order }, { data: membership }, { data: form }, { data: course }, { data: invoice }, { data: guestList }, { data: shift }, { data: org }] = await Promise.all([
    id("event") ? db.from("events").select("id, title, status, starts_at, venue_name").eq("id", id("event")!).eq("org_id", run.org_id).maybeSingle() : none,
    id("order") ? db.from("pay_orders").select("amount_total, status, source_module, customer_email").eq("id", id("order")!).eq("org_id", run.org_id).maybeSingle() : none,
    id("membership") ? db.from("memberships").select("type_id, member_no, starts_on, ends_on, contact_id").eq("id", id("membership")!).eq("org_id", run.org_id).maybeSingle() : none,
    id("form") ? db.from("forms").select("id, title").eq("id", id("form")!).eq("org_id", run.org_id).maybeSingle() : none,
    id("course") ? db.from("courses").select("id, title, capacity").eq("id", id("course")!).eq("org_id", run.org_id).maybeSingle() : none,
    id("invoice") ? db.from("documents").select("kind, number, gross_total, contact_id").eq("id", id("invoice")!).eq("org_id", run.org_id).maybeSingle() : none,
    id("guest_list") ? db.from("guest_lists").select("id, name").eq("id", id("guest_list")!).eq("org_id", run.org_id).maybeSingle() : none,
    id("shift") ? db.from("shifts").select("title, starts_at").eq("id", id("shift")!).eq("org_id", run.org_id).maybeSingle() : none,
    db.from("orgs").select("name").eq("id", run.org_id).single(),
  ])
  const contactId = run.contact_id ?? membership?.contact_id ?? invoice?.contact_id ?? null
  const { data: contact } = contactId
    ? await db.from("contacts").select("id, first_name, last_name, company, email, phone, city, country, birthday, tags, custom, unsubscribed_at").eq("id", contactId).eq("org_id", run.org_id).is("deleted_at", null).maybeSingle()
    : { data: null }
  const name = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.company || contact.email || "" : ""
  return {
    ...base,
    payload,
    contact: contact ? { ...contact, name, unsubscribed: !!contact.unsubscribed_at } : null,
    event,
    order: order && { ...order, amount: order.amount_total / 100 },
    membership,
    form,
    course,
    invoice: invoice && { ...invoice, amount: invoice.gross_total / 100 },
    guest_list: guestList,
    shift,
    org: { name: org?.name ?? "" },
  }
}

async function act(db: Db, run: Run, node: GraphNode, type: NodeType, d: Record<string, unknown>, ctx: Ctx): Promise<string | void> {
  const contact = ctx.contact as { id: string; email: string | null; tags: string[]; custom: Record<string, unknown>; unsubscribed_at: string | null } | null
  const needContact = () => {
    if (!contact) throw new Error("no contact for this run")
    return contact
  }
  switch (type) {
    case "send_email": {
      const c = needContact()
      if (!c.email) return "skipped: no email"
      if (c.unsubscribed_at) return "skipped: unsubscribed"
      const { error } = await db.from("email_sends").insert({ org_id: run.org_id, workflow_id: run.workflow_id, workflow_node: node.id, contact_id: c.id, to_email: c.email, vars: ctx.payload as NonNullable<Json> })
      if (error) throw new Error(error.message)
      return "queued"
    }
    case "add_tag":
    case "remove_tag": {
      const c = needContact()
      const tag = fill(String(d.tag), ctx).trim().slice(0, 40)
      const tags = type === "add_tag" ? [...new Set([...c.tags, tag])] : c.tags.filter((x) => x.toLowerCase() !== tag.toLowerCase())
      const { error } = await db.from("contacts").update({ tags }).eq("id", c.id).eq("org_id", run.org_id)
      if (error) throw new Error(error.message)
      c.tags = tags
      return
    }
    case "set_field": {
      // "contact.custom.level", "contact.city", "membership.type_id" (old drafts: just the custom field key).
      const path = String(d.field).includes(".") ? String(d.field) : `contact.custom.${d.field}`
      const { object, field } = splitPath(path)
      const raw = fill(String(d.value), ctx)
      if (object === "contact") {
        const c = needContact()
        if (field.startsWith("custom.")) {
          // Same rules as every other way of entering custom values (type, options).
          const def = (await loadFields(db, run.org_id, "contacts")).find((f) => f.key === field.slice(7))
          if (!def) throw new Error(`unknown field ${field}`)
          const parsed = parseValue(def, raw)
          if (parsed.error) throw new Error(`invalid value for ${def.key}`)
          const custom = { ...c.custom, [def.key]: parsed.value ?? null }
          if (parsed.value === undefined) delete custom[def.key]
          const { error } = await db.from("contacts").update({ custom: custom as NonNullable<Json> }).eq("id", c.id).eq("org_id", run.org_id)
          if (error) throw new Error(error.message)
          c.custom = custom
          return
        }
        const f = OBJECTS.contact.fields.find((x) => x.key === field && x.write)
        if (!f) throw new Error(`field ${field} can't be set`)
        if (f.kind === "date" && raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`invalid date for ${field}`)
        const { error } = await db.from("contacts").update({ [field]: raw.trim().slice(0, 200) || null } as TablesUpdate<"contacts">).eq("id", c.id).eq("org_id", run.org_id)
        if (error) throw new Error(error.message)
        return
      }
      if (object === "membership") {
        const m = ctx.membership as { id?: string } | null
        const id = (ctx.payload.membership_id as string) ?? m?.id
        if (!id) throw new Error("no membership for this run")
        if (field === "type_id") {
          const { data: type } = await db.from("membership_types").select("id").eq("id", raw).eq("org_id", run.org_id).maybeSingle()
          if (!type) throw new Error("unknown membership type")
        } else if (field === "ends_on") {
          if (raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error("invalid end date")
        } else throw new Error(`field ${field} can't be set`)
        const { error } = await db.from("memberships").update({ [field]: raw || null } as TablesUpdate<"memberships">).eq("id", id).eq("org_id", run.org_id)
        if (error) throw new Error(error.message)
        return
      }
      throw new Error(`${object} can't be changed`)
    }
    case "webhook": {
      const url = String(d.url)
      if (!isAllowedUrl(url)) throw new Error("webhook URL not allowed")
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "roots-automations/1" },
        body: JSON.stringify({ workflow_id: run.workflow_id, run_id: run.id, event: ctx.event, payload: ctx.payload, contact: ctx.contact }),
        signal: AbortSignal.timeout(10_000),
        redirect: "manual",
      })
      if (!res.ok) throw new Error(`webhook answered ${res.status}`)
      return String(res.status)
    }
    case "notify_team": {
      const { error } = await db.rpc("emit_event", {
        p_org: run.org_id,
        p_type: "workflow.notified",
        p_payload: { workflow_id: run.workflow_id, text: fill(String(d.text), ctx).slice(0, 500), contact_id: contact?.id ?? null } as NonNullable<Json>,
        p_subject_table: "workflows",
        p_subject_id: run.workflow_id,
      })
      if (error) throw new Error(error.message)
      return
    }
  }
}

async function finish(db: Db, run: Run, log: LogEntry[], patch: { status: string; node_id?: string; resume_at?: string; error?: string }) {
  await db
    .from("workflow_runs")
    .update({ ...patch, log: [...((run.log as LogEntry[]) ?? []), ...log].slice(-200) as unknown as NonNullable<Json> })
    .eq("id", run.id)
    .eq("status", "running") // a run cancelled meanwhile stays cancelled
}
