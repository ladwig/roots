"use server"

import { redirect } from "next/navigation"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import type { Json } from "@/lib/supabase/types"
import { back } from "@/lib/url"
import { Graph, triggerOf, validate } from "@/automations/graph"
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
  const json = (file instanceof File && file.size ? (file.size < 500_000 ? await file.text() : "") : String(fd.get("json") ?? "")).trim()
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
  const { error } = await ctx.supabase.from("workflows").update({ active: on }).eq("id", id).eq("org_id", ctx.org.id)
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
