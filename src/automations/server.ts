// Automations worker: takes due runs, walks their workflow's graph from where they stand and executes the nodes
// until a wait (park until resume_at), the end (done) or an error (failed). Runs from the minute cron and right
// after actions that emit events. Service role, every query filtered by the run's org. Its client sends
// x-roots-workflow, so the worker's own writes and events never start workflows (no loops).
import { isAllowedUrl } from "@/events/channels/webhook"
import { getSecret } from "@/integrations/server"
import { tg } from "@/integrations/telegram"
import { loadFields, parseValue } from "@/lib/custom-fields"
import { sendOrgEmail } from "@/lib/org-email"
import { createAdminClient } from "@/lib/supabase/admin"
import { fromLocalInput } from "@/lib/time"
import type { Json } from "@/lib/supabase/types"
import { syncTickets } from "@/guestlists/server"
import { aggregate, calc, fill, Graph, NODE_DATA, next, passes, pickFirst, query, stepKey, test, triggerOf, waitMs, type GraphNode, type NodeData, type NodeType } from "./graph"
import { def, objectsFor, parseRecordTrigger, pickFields, splitPath, type Field, type ObjectKey } from "./objects"
import { berlinDay, dateMatches, nextRun, resolveDate, type Schedule } from "./schedule"

type Db = ReturnType<typeof createAdminClient>
type Run = { id: string; org_id: string; workflow_id: string; contact_id: string | null; node_id: string | null; context: Json; log: Json }
type Row = Record<string, unknown>
type Ctx = Record<string, unknown> & { event?: string; payload: Row; contact: Row | null; org: { name: string } }
type LogEntry = { at: string; node: string; type: NodeType; ok: boolean; note?: string }
const MAX_STEPS = 50 // per run and turn (graphs have no cycles, this only guards against surprises)
const UUID = /^[0-9a-f-]{36}$/
const workerDb = () => createAdminClient({ "x-roots-workflow": "1" })

export async function processWorkflowRuns(limit = 25) {
  if (!process.env.SUPABASE_SECRET_KEY) return 0
  const db = workerDb()
  const { data: runs, error } = await db.rpc("claim_workflow_runs", { p_limit: limit })
  if (error) throw error
  for (const run of runs ?? []) await step(db, run).catch((e) => finish(db, run, [], { status: "failed", error: String(e instanceof Error ? e.message : e) }))
  return runs?.length ?? 0
}

// ---------- schedules ----------

/** When a workflow with a schedule trigger runs next (null = not a schedule). Set on save/activate and after each run. */
export function scheduleNext(graph: unknown, after = new Date()) {
  const parsed = Graph.safeParse(graph)
  const d = parsed.success ? triggerOf(parsed.data)?.data : undefined
  return d?.event === "schedule" && d.every ? nextRun(d as unknown as Schedule, after).toISOString() : null
}

/**
 * Due schedules → runs: one run, or one per record of the chosen object that passes the trigger's rules and
 * date filter ("7 days before the event", "birthday today"). ponytail: up to 5000 records per object and run;
 * page through them if an org has more.
 */
export async function processSchedules() {
  if (!process.env.SUPABASE_SECRET_KEY) return 0
  const db = workerDb()
  const now = new Date()
  const { data: due } = await db.from("workflows").select("id, org_id, graph, next_run_at").eq("trigger_type", "schedule").eq("active", true).is("deleted_at", null).or(`next_run_at.is.null,next_run_at.lte.${now.toISOString()}`).limit(50)
  let started = 0
  for (const wf of due ?? []) {
    const next = scheduleNext(wf.graph, now)
    // Newly switched on: only plan the first run.
    if (wf.next_run_at) started += await startScheduled(db, wf).catch((e) => (console.error("schedule", wf.id, e), 0))
    await db.from("workflows").update({ next_run_at: next }).eq("id", wf.id)
  }
  return started
}

async function startScheduled(db: Db, wf: { id: string; org_id: string; graph: unknown }) {
  const g = Graph.parse(wf.graph)
  const d = (triggerOf(g)?.data ?? {}) as { object?: string; rules?: { field: string; op: never; value: string }[]; date_field?: string; offset?: number; yearly?: boolean }
  const rows: { context: NonNullable<Json>; contact_id: string | null }[] = []
  if (!d.object) rows.push({ context: { event: "schedule", payload: {} }, contact_id: null })
  else {
    const object = d.object as ObjectKey
    const { data } = await db.from(def(object).table as "contacts").select("*").eq("org_id", wf.org_id).limit(5000)
    const today = berlinDay(new Date())
    for (const raw of (data ?? []) as Row[]) {
      if (raw.deleted_at) continue
      const row = pickFields(object, raw)!
      const ctx = { [object]: row }
      if (d.rules?.length && !d.rules.every((r) => test(r, ctx))) continue
      if (d.date_field && !dateMatches(row[d.date_field], d.offset ?? 0, !!d.yearly, today)) continue
      const contactId = object === "contact" ? (row.id as string) : typeof row.contact_id === "string" ? row.contact_id : null
      rows.push({ context: { event: `schedule:${object}`, payload: { id: String(row.id) } }, contact_id: contactId })
    }
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("workflow_runs").insert(rows.slice(i, i + 500).map((r) => ({ org_id: wf.org_id, workflow_id: wf.id, ...r })))
    if (error) throw error
  }
  return rows.length
}

async function step(db: Db, run: Run) {
  const { data: wf } = await db.from("workflows").select("graph, active, deleted_at").eq("id", run.workflow_id).eq("org_id", run.org_id).single()
  if (!wf || wf.deleted_at) return finish(db, run, [], { status: "cancelled", error: "workflow deleted" })
  const parsed = Graph.safeParse(wf.graph)
  if (!parsed.success) return finish(db, run, [], { status: "failed", error: "invalid workflow" })
  const g = parsed.data
  const trigger = triggerOf(g)
  // "Record changed" with chosen fields: only runs when one of them changed.
  const watch = (trigger?.data.fields as string[] | undefined) ?? []
  const changed = ((run.context as { payload?: { changed?: string[] } })?.payload?.changed ?? []) as string[]
  if (!run.node_id && watch.length && changed.length && !watch.some((f) => changed.includes(f)))
    return finish(db, run, [{ at: new Date().toISOString(), node: trigger!.id, type: "trigger", ok: true, note: "skipped: other fields changed" }], { status: "done" })
  // Only once (per person / per record), optionally again after N days.
  const once = trigger?.data.once as string | undefined
  if (!run.node_id && once && (await ranBefore(db, run, once, Number(trigger?.data.again_after_days ?? 0))))
    return finish(db, run, [{ at: new Date().toISOString(), node: trigger!.id, type: "trigger", ok: true, note: "skipped: already ran" }], { status: "done" })
  const ctx = await context(db, run)
  const steps: Row = { ...(((run.context as { steps?: Row })?.steps ?? {}) as Row) } // data step results, kept across waits
  const log: LogEntry[] = []
  let node: GraphNode | null = run.node_id ? (g.nodes.find((n) => n.id === run.node_id) ?? null) : next(g, trigger?.id ?? "")
  for (let i = 0; i < MAX_STEPS && node; i++) {
    const type = node.type
    const data = NODE_DATA[type].parse(node.data) as Record<string, unknown>
    const at = new Date().toISOString()
    if (type === "wait") {
      const w = data as NodeData<"wait">
      const after = next(g, node.id)
      const until = w.mode === "until" ? untilDate(w.until, ctx) : new Date(Date.now() + waitMs(w))
      if (!until) {
        log.push({ at, node: node.id, type, ok: false, note: "no valid date" })
        return finish(db, run, log, { status: "failed", node_id: node.id, error: "wait: no valid date" }, steps)
      }
      log.push({ at, node: node.id, type, ok: true, note: until.toISOString() })
      if (!after) return finish(db, run, log, { status: "done" }, steps)
      if (until.getTime() <= Date.now()) {
        node = after // the date has passed: go on right away
        continue
      }
      return finish(db, run, log, { status: "waiting", node_id: after.id, resume_at: until.toISOString() }, steps)
    }
    if (type === "find_record" || type === "aggregate") {
      try {
        const result = await dataStep(db, run.org_id, data, ctx)
        ctx[stepKey(node.id)] = result
        steps[stepKey(node.id)] = result
        log.push({ at, node: node.id, type, ok: true, note: result == null ? "nothing found" : type === "aggregate" ? String((result as Row).value) : String((result as Row).id) })
      } catch (e) {
        log.push({ at, node: node.id, type, ok: false, note: String(e instanceof Error ? e.message : e).slice(0, 300) })
        return finish(db, run, log, { status: "failed", node_id: node.id, error: String(e instanceof Error ? e.message : e).slice(0, 2000) }, steps)
      }
      node = next(g, node.id)
      continue
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
      return finish(db, run, log, { status: "failed", node_id: node.id, error: String(e instanceof Error ? e.message : e).slice(0, 2000) }, steps)
    }
    node = next(g, node.id)
  }
  return finish(db, run, log, node ? { status: "waiting", node_id: node.id, resume_at: new Date().toISOString() } : { status: "done" }, steps)
}

// ---------- the run's data ----------

async function load(db: Db, orgId: string, object: ObjectKey, id: string) {
  const d = def(object)
  if (!d.table || !UUID.test(id)) return null
  const { data } = await db.from(d.table as "contacts").select("*").eq("id", id).eq("org_id", orgId).maybeSingle()
  return pickFields(object, data as Row | null)
}

/**
 * Everything the trigger brings, as it is now (catalog fields only): the record (record triggers) or the objects
 * named in the event's payload, then everything one relation away, the person's current membership, the
 * tickets of an order, the time, the org.
 */
export async function context(db: Db, run: Pick<Run, "org_id" | "contact_id" | "context">): Promise<Ctx> {
  const base = (run.context ?? {}) as { event?: string; payload?: Row }
  const payload = base.payload ?? {}
  const event = base.event ?? ""
  const keys = objectsFor(event)
  const ids: Partial<Record<ObjectKey, string>> = {}
  // Record triggers and schedules over records: the record itself is the first object.
  if ((parseRecordTrigger(event) || event.startsWith("schedule:")) && typeof payload.id === "string" && keys[0]) ids[keys[0]] = payload.id
  for (const k of keys) {
    const idKey = def(k).idKey
    const v = idKey && payload[idKey]
    if (k !== "tickets" && typeof v === "string" && UUID.test(v)) ids[k] ??= v
  }
  if (run.contact_id) ids.contact ??= run.contact_id
  const out: Partial<Record<ObjectKey, Row | null>> = {}
  const round = async (which: ObjectKey[]) => {
    const rows = await Promise.all(which.map((k) => load(db, run.org_id, k, ids[k]!)))
    which.forEach((k, i) => (out[k] = rows[i]))
  }
  await round((Object.keys(ids) as ObjectKey[]).filter((k) => k !== "contact"))
  // Up to two relations away (ticket → event/order/person, due → membership → person …).
  for (let hop = 0; hop < 2; hop++) {
    for (const [k, row] of Object.entries(out) as [ObjectKey, Row | null][])
      for (const [col, target] of Object.entries(def(k).relations ?? {})) if (row && typeof row[col] === "string" && keys.includes(target as ObjectKey)) ids[target as ObjectKey] ??= row[col] as string
    await round((Object.keys(ids) as ObjectKey[]).filter((k) => !(k in out)))
  }

  const contact = out.contact ?? null
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
  const [{ data: tickets }, { data: current }, { data: org }] = await Promise.all([
    keys.includes("tickets") && typeof payload.order_id === "string"
      ? db.from("tickets").select("ticket_types(name)").eq("order_id", payload.order_id).eq("org_id", run.org_id).neq("status", "void")
      : { data: null },
    !out.membership && contact && keys.includes("membership")
      ? db
          .from("memberships")
          .select("id, type_id, member_no, starts_on, ends_on, note, contact_id, custom")
          .eq("contact_id", contact.id as string)
          .eq("org_id", run.org_id)
          .is("deleted_at", null)
          .lte("starts_on", today)
          .or(`ends_on.is.null,ends_on.gte.${today}`)
          .order("starts_on", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null },
    db.from("orgs").select("name").eq("id", run.org_id).single(),
  ])
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((p) => [p.type, p.value]))
  const name = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") || (contact.company as string) || (contact.email as string) || "" : ""
  return {
    ...(((base as { steps?: Row }).steps ?? {}) as Row),
    ...out,
    event,
    payload,
    contact: contact ? { ...contact, name } : null,
    membership: out.membership ?? current ?? null,
    tickets: tickets && { types: [...new Set(tickets.map((k) => k.ticket_types?.name).filter(Boolean))], count: tickets.length },
    now: { weekday: String(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday) + 1), hour: Number(parts.hour), date: today },
    org: { name: org?.name ?? "" },
  }
}

/** Data of a test run: the same objects a real run of this hub event would see (contact via id or email). */
export async function contextForEvent(db: Db, orgId: string, event: { type: string; payload: unknown }) {
  const payload = (event.payload ?? {}) as Row
  let contactId = typeof payload.contact_id === "string" && UUID.test(payload.contact_id) ? payload.contact_id : null
  if (!contactId && typeof payload.email === "string" && payload.email)
    contactId = (await db.from("contacts").select("id").eq("org_id", orgId).eq("email", payload.email.toLowerCase()).is("deleted_at", null).maybeSingle()).data?.id ?? null
  return context(db, { org_id: orgId, contact_id: contactId, context: { event: event.type, payload } as NonNullable<Json> })
}

// ---------- data steps, waits, once ----------

/**
 * Find record / count & calculate: rows of the object (org only, catalog fields), filtered by the step's rules
 * (values may use the run: "{contact.id}", "today-90"), then the first by sort, or the aggregate as { value }.
 * Read only (also used by the test run). ponytail: up to 5000 rows per object; filter in SQL if orgs grow past it.
 */
export async function dataStep(db: Db, orgId: string, d: Record<string, unknown>, ctx: Row) {
  const object = String(d.object) as ObjectKey
  const table = def(object)?.table
  if (!table) throw new Error(`unknown object ${d.object}`)
  const { data, error } = await db.from(table as "contacts").select("*").eq("org_id", orgId).limit(5000)
  if (error) throw new Error(error.message)
  const rows = ((data ?? []) as Row[]).filter((r) => !r.deleted_at).map((r) => pickFields(object, r)!)
  const hits = query(rows, object, (d.rules ?? []) as never, ctx)
  if (d.op !== undefined) return { value: aggregate(hits, d.op as "count", String(d.field ?? "").replace(`${object}.`, "")), count: hits.length }
  const first = pickFirst(hits, String(d.sort ?? "").replace(`${object}.`, ""), d.dir === "asc" ? "asc" : "desc")
  return first && { ...first, __object: object } // "change record" on a found record needs its type
}

// "Wait until": a date (fixed/calculated) with optional " HH:MM", Berlin time.
function untilDate(raw: string, ctx: Row) {
  const m = /^(.*?)(?:\s+(\d{1,2}:\d{2}))?$/.exec(fill(raw, ctx).trim())!
  const day = resolveDate(m[1], berlinDay(new Date())).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? fromLocalInput(`${day}T${(m[2] ?? "00:00").padStart(5, "0")}`) : null
}

// Has this workflow already run for this person / record (within the last N days, 0 = ever)?
async function ranBefore(db: Db, run: Run, per: string, days: number) {
  let q = db.from("workflow_runs").select("id", { count: "exact", head: true }).eq("workflow_id", run.workflow_id).neq("id", run.id).neq("status", "cancelled")
  if (per === "contact") {
    if (!run.contact_id) return false
    q = q.eq("contact_id", run.contact_id)
  } else {
    const id = (run.context as { payload?: Row })?.payload?.id
    if (typeof id !== "string") return false
    q = q.eq("context->payload->>id", id)
  }
  if (days > 0) q = q.gte("created_at", new Date(Date.now() - days * 86_400_000).toISOString())
  const { count } = await q
  return (count ?? 0) > 0
}

// ---------- actions ----------

async function act(db: Db, run: Run, node: GraphNode, type: NodeType, d: Record<string, unknown>, ctx: Ctx): Promise<string | void> {
  const contact = ctx.contact as { id: string; email: string | null; tags: string[]; custom: Record<string, unknown>; unsubscribed_at: string | null } | null
  const needContact = () => {
    if (!contact) throw new Error("no person for this run")
    return contact
  }
  switch (type) {
    case "send_email": {
      // To the run's person ({contact.email}, the default): through the email queue (unsubscribe link, delivery
      // tracking, unsubscribed people get nothing). To any other address (e.g. the team): sent directly.
      const toRaw = String(d.to ?? "").trim() || "{contact.email}"
      if (toRaw === "{contact.email}" || toRaw === "{email}") {
        const c = needContact()
        if (!c.email) return "skipped: no email"
        if (c.unsubscribed_at) return "skipped: unsubscribed"
        const { error } = await db.from("email_sends").insert({ org_id: run.org_id, workflow_id: run.workflow_id, workflow_node: node.id, contact_id: c.id, to_email: c.email, vars: ctx.payload as NonNullable<Json> })
        if (error) throw new Error(error.message)
        return `queued → ${c.email}`
      }
      const to = fill(toRaw, ctx).trim()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new Error("no valid address")
      const esc = (x: string) => x.replace(/[&<>"]/g, (y) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[y]!)
      const html = fill(String(d.body), ctx, esc)
      const ok = await sendOrgEmail(run.org_id, { to, subject: fill(String(d.subject), ctx).slice(0, 200), html, text: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() })
      if (!ok) throw new Error("no email provider connected")
      return `sent → ${to}`
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
    case "set_field":
      return setField(db, run, String(d.field), fill(String(d.value), ctx), ctx)
    case "create_record":
      return createRecord(db, run, String(d.object), (d.values ?? {}) as Record<string, string>, ctx)
    case "delete_record": {
      // Soft = into the trash (restorable for 30 days), hard = removed; the catalog says which, money never.
      const key = String(d.object)
      const row = ctx[key] as Row | null
      if (!row?.id) return `skipped: no ${key}`
      const type = (key.startsWith("step_") ? String(row.__object ?? "") : key) as ObjectKey
      const mode = def(type)?.remove
      if (!mode) throw new Error(`${type} can't be deleted`)
      const table = def(type).table as "contacts"
      const { error } = mode === "soft" ? await db.from(table).update({ deleted_at: new Date().toISOString() } as never).eq("id", row.id as string).eq("org_id", run.org_id).is("deleted_at", null) : await db.from(table).delete().eq("id", row.id as string).eq("org_id", run.org_id)
      if (error) throw new Error(error.message)
      return `${type} ${mode === "soft" ? "→ trash" : "deleted"}`
    }
    case "webhook": {
      const url = String(d.url)
      if (!isAllowedUrl(url)) throw new Error("webhook URL not allowed")
      const { payload, event, org, ...objects } = ctx
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "roots-automations/1" },
        body: JSON.stringify({ workflow_id: run.workflow_id, run_id: run.id, event, org: org.name, payload, ...objects }),
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
    case "telegram": {
      const secret = await getSecret(run.org_id, "telegram")
      if (!secret?.botToken) throw new Error("telegram bot not connected")
      await tg(secret.botToken, "sendMessage", { chat_id: Number(d.chat_id), text: fill(String(d.text), ctx).slice(0, 4000) })
      return
    }
  }
}

// "Change record": any writable catalog field of an object the run has ("membership.ends_on", "ticket_type.active",
// "contact.custom.level"; old drafts: just the custom field key). Validated by the field's kind.
async function setField(db: Db, run: Run, rawPath: string, raw: string, ctx: Ctx): Promise<string | void> {
  const path = rawPath.includes(".") ? rawPath : `contact.custom.${rawPath}`
  const { object, field } = splitPath(path)
  if (!(object in ctx)) throw new Error(`${object} isn't part of this run`)
  const row = ctx[object] as Row | null
  if (!row?.id) throw new Error(`no ${object} in this run`)
  // A record found by "find record" (step_…) carries its type.
  const type = (object.startsWith("step_") ? String(row.__object ?? "") : object) as ObjectKey
  const d = def(type)
  if (!d) throw new Error(`${object} can't be changed`)
  const customTable = ({ contact: "contacts", event: "events", membership: "memberships" } as const)[type as "contact"]
  if (customTable && field.startsWith("custom.")) {
    // Same rules as every other way of entering custom values (type, options).
    const table = customTable
    const fdef = (await loadFields(db, run.org_id, table)).find((f) => f.key === field.slice(7))
    if (!fdef) throw new Error(`unknown field ${field}`)
    const parsed = parseValue(fdef, fdef.type === "number" ? calc(raw) : raw)
    if (parsed.error) throw new Error(`invalid value for ${fdef.key}`)
    const custom = { ...((row.custom as Row) ?? {}), [fdef.key]: parsed.value ?? null }
    if (parsed.value === undefined) delete custom[fdef.key]
    const { error } = await db.from(table).update({ custom: custom as NonNullable<Json> }).eq("id", row.id as string).eq("org_id", run.org_id)
    if (error) throw new Error(error.message)
    row.custom = custom
    return
  }
  const f = d.fields.find((x) => x.key === field && x.write)
  if (!f) throw new Error(`${path} can't be changed`)
  const value = await coerce(db, run.org_id, f, raw, path)
  const { error } = await db.from(d.table as "contacts").update({ [field]: value } as never).eq("id", row.id as string).eq("org_id", run.org_id)
  if (error) throw new Error(error.message)
  row[field] = value
  return `${path} = ${value ?? "–"}`
}

// A value for a catalog field, checked by its kind (relative dates allowed: "today+10").
async function coerce(db: Db, orgId: string, f: Field, raw: string, path: string): Promise<string | number | boolean | null> {
  let value: string | number | boolean | null = raw.trim() === "" ? null : raw.trim()
  if (value === null) return null
  if (f.kind === "date") {
    // "<date or calculation> [HH:MM]": the time only matters for timestamps (event start, shift …), Berlin time.
    const m = /^(.*?)(?:\s+(\d{1,2}:\d{2}))?$/.exec(value as string)!
    const day = resolveDate(m[1], berlinDay(new Date())).slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`invalid date for ${path}`)
    value = f.time ? (fromLocalInput(`${day}T${(m[2] ?? "00:00").padStart(5, "0")}`)?.toISOString() ?? null) : day
    if (!value) throw new Error(`invalid time for ${path}`)
  }
  if (f.kind === "number") {
    value = Number(calc(String(value)).replace(",", "."))
    if (!Number.isFinite(value)) throw new Error(`invalid number for ${path}`)
  }
  if (f.kind === "bool") value = ["true", "1", "ja", "yes"].includes(String(value).toLowerCase())
  if (f.kind === "enum" && !f.options?.includes(String(value))) throw new Error(`invalid value for ${path}`)
  if (f.kind === "ref" && f.refTable) {
    const { data: ok } = await db.from(f.refTable as "contacts").select("id").eq("id", String(value)).eq("org_id", orgId).maybeSingle()
    if (!ok) throw new Error(`unknown ${f.key}`)
  }
  if (f.kind === "text") value = String(value).slice(0, 2000)
  return value
}

// "Create record": an object the catalog marks creatable, its fields from the step (placeholders + relative dates),
// links to the run's objects (e.g. the person) set automatically. The DB's own rules apply (member numbers,
// course places …).
async function createRecord(db: Db, run: Run, object: string, values: Record<string, string>, ctx: Ctx): Promise<string | void> {
  const d = def(object as ObjectKey)
  if (!d?.create) throw new Error(`${object} can't be created`)
  const row: Row = { org_id: run.org_id }
  for (const [col, parent] of Object.entries(d.create.parents ?? {})) {
    const p = ctx[parent] as Row | null
    if (!p?.id) throw new Error(`no ${parent} in this run`)
    row[col] = p.id
  }
  for (const key of d.create.fields) {
    const f = d.fields.find((x) => x.key === key)!
    const v = await coerce(db, run.org_id, f, fill(values[key] ?? "", ctx), `${object}.${key}`)
    if (v !== null) row[key] = v
  }
  // Sensible defaults: a guest is the person of the run, a membership starts today.
  const person = ctx.contact as { name?: string; email?: string | null } | null
  if (object === "guest") {
    row.name ??= person?.name || null
    row.email ??= person?.email ?? null
    row.added_via = "automation"
  }
  if (object === "membership") row.starts_on ??= berlinDay(new Date())
  if (object === "event") {
    // A draft with its own address; publishing stays a human decision.
    row.status = "draft"
    const base = String(row.title ?? "event").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "event"
    row.slug = `${base}-${crypto.randomUUID().slice(0, 4)}`
  }
  const { data, error } = await db.from(d.table as "contacts").insert(row as never).select("id").single()
  if (error) throw new Error(error.message)
  if (object === "guest" && typeof row.list_id === "string") await syncTickets(row.list_id) // free ticket for the door
  return `${object} ${data.id}`
}

async function finish(db: Db, run: Run, log: LogEntry[], patch: { status: string; node_id?: string; resume_at?: string; error?: string }, steps?: Row) {
  await db
    .from("workflow_runs")
    .update({
      ...patch,
      log: [...((run.log as LogEntry[]) ?? []), ...log].slice(-200) as unknown as NonNullable<Json>,
      ...(steps && Object.keys(steps).length ? { context: { ...((run.context as Row) ?? {}), steps } as NonNullable<Json> } : {}),
    })
    .eq("id", run.id)
    .eq("status", "running") // a run cancelled meanwhile stays cancelled
}
