"use server"

import { redirect } from "next/navigation"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import type { Json } from "@/lib/supabase/types"
import { back } from "@/lib/url"
import { Graph, simulate, triggerOf, validate, type TraceStep } from "@/automations/graph"
import { OBJECTS, parseRecordTrigger, type ObjectKey } from "@/automations/objects"
import { contextForEvent, scheduleNext } from "@/automations/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { TEMPLATES } from "@/automations/templates"

const UUID = /^[0-9a-f-]{36}$/
async function manager() {
  const ctx = await requirePerm("automations.manage")
  const t = await getT()
  if (!ctx.modules.has("automations")) back("/automations", { error: t("errors.not_allowed") })
  return { ctx, t }
}

/** New workflow: blank, from a template, or from an exported JSON file (pasted / uploaded). */
export async function createWorkflow(fd: FormData) {
  const { ctx, t } = await manager()
  const from = String(fd.get("template") ?? "")
  const file = fd.get("file")
  const json = (file instanceof File && file.size && file.size < 500_000 ? await file.text() : "").trim()
  let name = String(fd.get("name") ?? "").trim().slice(0, 200)
  let graph: Graph = { nodes: [{ id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: { event: "" } }], edges: [] }
  if (json) {
    let raw: { name?: unknown; graph?: unknown } | null = null
    try {
      raw = JSON.parse(json)
    } catch {}
    const parsed = Graph.safeParse(raw?.graph ?? raw)
    if (!parsed.success) back("/automations?new=1", { error: t("automations.importInvalid") })
    graph = parsed.data
    name ||= typeof raw?.name === "string" ? raw.name.slice(0, 200) : ""
  } else if (from) {
    const tpl = TEMPLATES.find((x) => x.key === from)
    if (tpl) {
      graph = tpl.graph(t)
      name ||= t.dynamic(`automations.templates.${tpl.key}.name`)
    }
  }
  const { data, error } = await ctx.supabase
    .from("workflows")
    .insert({ org_id: ctx.org.id, name: name || t("automations.untitled"), graph: graph as unknown as NonNullable<Json>, trigger_type: (triggerOf(graph)?.data.event as string) || null })
    .select("id")
    .single()
  if (error) back("/automations?new=1", { error: dbError(t, error) })
  redirect(`/automations/${data.id}`)
}

/** Save from the editor (client): graph + name. Active workflows must stay valid. */
export async function saveWorkflow(input: { id: string; name: string; description: string; graph: unknown }): Promise<{ error?: string; problems?: { key: string; node?: string }[] }> {
  const { ctx, t } = await manager()
  if (!UUID.test(input.id)) return { error: t("errors.invalid_input") }
  const parsed = Graph.safeParse(input.graph)
  if (!parsed.success) return { error: t("automations.graphInvalid") }
  const problems = validate(parsed.data)
  const { data: wf } = await ctx.supabase.from("workflows").select("active").eq("id", input.id).eq("org_id", ctx.org.id).maybeSingle()
  if (!wf) return { error: t("errors.not_allowed") }
  if (wf.active && problems.length) return { error: t("automations.fixBeforeSave"), problems }
  const { error } = await ctx.supabase
    .from("workflows")
    .update({
      name: input.name.trim().slice(0, 200) || t("automations.untitled"),
      description: input.description.trim().slice(0, 2000) || null,
      graph: parsed.data as unknown as NonNullable<Json>,
      trigger_type: (triggerOf(parsed.data)?.data.event as string) || null,
      next_run_at: scheduleNext(parsed.data),
    })
    .eq("id", input.id)
    .eq("org_id", ctx.org.id)
  if (error) return { error: dbError(t, error) }
  return { problems }
}

/** On/off. Switching on needs a valid graph. */
export async function setActive(fd: FormData) {
  const { ctx, t } = await manager()
  const id = String(fd.get("id") ?? "")
  const on = fd.get("active") === "1"
  const here = `/automations/${id}`
  if (on) {
    const { data } = await ctx.supabase.from("workflows").select("graph").eq("id", id).eq("org_id", ctx.org.id).maybeSingle()
    const parsed = Graph.safeParse(data?.graph)
    if (!parsed.success || validate(parsed.data).length) back(here, { error: t("automations.fixBeforeActivate") })
  }
  const { data: cur } = await ctx.supabase.from("workflows").select("graph").eq("id", id).eq("org_id", ctx.org.id).maybeSingle()
  const { error } = await ctx.supabase.from("workflows").update({ active: on, next_run_at: on ? scheduleNext(cur?.graph) : null }).eq("id", id).eq("org_id", ctx.org.id)
  if (error) back(here, { error: dbError(t, error) })
  back(here, { ok: t(on ? "automations.activated" : "automations.deactivated") })
}

export async function trashWorkflow(fd: FormData) {
  const { ctx, t } = await manager()
  const id = String(fd.get("id") ?? "")
  await ctx.supabase.from("workflows").update({ active: false }).eq("id", id).eq("org_id", ctx.org.id)
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.workflows", p_id: id })
  if (error) back(`/automations/${id}`, { error: dbError(t, error) })
  back("/automations", { ok: t("automations.trashed") })
}

export async function cancelRun(fd: FormData) {
  const { ctx, t } = await manager()
  const wf = String(fd.get("workflow_id") ?? "")
  const { error } = await ctx.supabase.from("workflow_runs").update({ status: "cancelled" }).eq("id", String(fd.get("id") ?? "")).eq("org_id", ctx.org.id).in("status", ["queued", "waiting"])
  if (error) back(`/automations/${wf}/runs`, { error: dbError(t, error) })
  back(`/automations/${wf}/runs`, { ok: t("automations.runCancelled") })
}

// ---------- test run (nothing is sent or changed) ----------

/**
 * Test data for a trigger: module events → its latest hub events ("e:<id>"); record triggers → the latest changes
 * from the change log ("c:<id>"); schedules over records → the newest records of that object ("r:<uuid>").
 */
export async function testSamples(eventType: string): Promise<{ id: string; at: string; label: string }[]> {
  const ctx = await requirePerm("automations.view")
  if (!eventType) return []
  const db = createAdminClient() // hub_events / audit_log aren't member-readable; strictly this org
  const label = (n: Record<string, unknown>) =>
    ([n.name, n.title, n.holder_name, n.email, [n.first_name, n.last_name].filter(Boolean).join(" ")].find((x) => typeof x === "string" && x) as string | undefined) ?? ""
  const rec = parseRecordTrigger(eventType)
  if (rec) {
    const { data } = await db.from("audit_log").select("id, at, new").eq("org_id", ctx.org.id).eq("table_name", OBJECTS[rec.object].table).eq("action", rec.action).order("id", { ascending: false }).limit(20)
    return (data ?? []).map((e) => ({ id: `c:${e.id}`, at: e.at, label: label((e.new ?? {}) as Record<string, unknown>) }))
  }
  const sched = /^schedule:([a-z_]+)$/.exec(eventType)
  if (sched && sched[1] in OBJECTS) {
    const { data } = await db.from(OBJECTS[sched[1] as ObjectKey].table as "contacts").select("*").eq("org_id", ctx.org.id).order("created_at", { ascending: false }).limit(20)
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ id: `r:${r.id}`, at: String(r.created_at), label: label(r) }))
  }
  if (eventType === "schedule") return [{ id: "s:", at: new Date().toISOString(), label: "" }]
  const { data } = await db.from("hub_events").select("id, created_at, payload").eq("org_id", ctx.org.id).eq("type", eventType).order("id", { ascending: false }).limit(20)
  return (data ?? []).map((e) => ({ id: `e:${e.id}`, at: e.created_at, label: label((e.payload ?? {}) as Record<string, unknown>) }))
}

/** Walk the (unsaved) graph with the data of a real event: path, condition results, filled texts, the data. */
export async function testRun(input: { eventId: string; graph: unknown }): Promise<{ error?: string; trace?: TraceStep[]; data?: Record<string, unknown> }> {
  const ctx = await requirePerm("automations.view")
  const t = await getT()
  const parsed = Graph.safeParse(input.graph)
  if (!parsed.success) return { error: t("automations.graphInvalid") }
  const db = createAdminClient()
  let ev: { type: string; payload: unknown } | null = null
  const [kind, ref] = [input.eventId.slice(0, 1), input.eventId.slice(2)]
  if (kind === "c") {
    // A change from the change log (record trigger): the run sees the record id and the changed fields.
    const { data: ch } = await db.from("audit_log").select("table_name, row_id, action, new").eq("id", Number(ref)).eq("org_id", ctx.org.id).maybeSingle()
    if (ch) ev = { type: `record:${ch.table_name}:${ch.action}`, payload: { id: ch.row_id, changed: ch.action === "update" ? Object.keys((ch.new ?? {}) as object) : [] } }
  } else if (kind === "r") {
    const trig = triggerOf(parsed.data)?.data as { object?: string } | undefined
    if (trig?.object && /^[0-9a-f-]{36}$/.test(ref)) ev = { type: `schedule:${trig.object}`, payload: { id: ref } }
  } else if (kind === "s") ev = { type: "schedule", payload: {} }
  else ev = (await db.from("hub_events").select("type, payload").eq("id", Number(ref)).eq("org_id", ctx.org.id).maybeSingle()).data
  if (!ev) return { error: t("automations.noSample") }
  const full = await contextForEvent(db, ctx.org.id, ev)
  // Only data the tester may see anyway (person data needs crm.view, memberships members.view …).
  const data = Object.fromEntries(Object.entries(full).filter(([k]) => !(k in OBJECTS) || ctx.can(`${OBJECTS[k as ObjectKey].module}.view`)))
  return { trace: simulate(parsed.data, data), data }
}
