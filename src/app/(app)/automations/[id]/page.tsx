import Link from "next/link"
import { notFound } from "next/navigation"
import { ListIcon } from "lucide-react"
import { Notice } from "@/components/notice"
import { PageCrumbs } from "@/components/page-crumbs"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { Graph } from "@/automations/graph"
import { def, RECORD_ACTIONS, RECORD_OBJECTS, recordTrigger, type Field, type Kind, type RefList } from "@/automations/objects"
import { CONTACT_INPUTS, type Element } from "@/forms/elements"
import { eventTypes } from "@/events/registry"
import { createAdminClient } from "@/lib/supabase/admin"
import { modules } from "@/modules/registry"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { param } from "@/lib/url"
import { setActive, trashWorkflow } from "../actions"
import { WorkflowEditor, type EditorOptions } from "./editor"

// One workflow on the canvas (desktop works best; phones can view and switch it on/off).
// Every field the org's forms ask for, as answer fields of a submission ("submission.answers.<key>"): label from
// the form, kind from the field; consents by their text; the mandate only as masked IBAN. Same field in several
// forms = one entry naming the forms.
function formAnswers(forms: { title: string; elements: unknown }[], defs: { key: string; label: string; type: string; options: string[] }[], t: Awaited<ReturnType<typeof getT>>) {
  const out = new Map<string, { key: string; label: string; kind: Kind; ref?: RefList; refTable?: string; options?: string[]; forms: string[] }>()
  const add = (key: string, label: string, form: string, rest: Omit<Field, "key">) => {
    const cur = out.get(key)
    if (cur) cur.forms.push(form)
    else out.set(key, { key, label, forms: [form], ...rest })
  }
  for (const f of forms)
    for (const el of (f.elements as Element[]) ?? []) {
      if (el.kind === "consent") add("consents", t("automations.answers.consents"), f.title, { kind: "tags" })
      if (el.kind === "mandate") add("membership.iban", t("automations.answers.membership.iban"), f.title, { kind: "text" })
      if (el.kind !== "field") continue
      if (el.field.startsWith("custom.")) {
        const d = defs.find((x) => `custom.${x.key}` === el.field)
        if (d) add(el.field, el.label || d.label, f.title, { kind: d.type === "number" ? "number" : d.type === "date" ? "date" : d.type === "boolean" ? "bool" : d.type === "select" ? "enum" : "text", options: d.options })
      } else if (el.field === "membership.type") add("membership.type_id", el.label || t("automations.answers.membership.type_id"), f.title, { kind: "ref", ref: "membership_types", refTable: "membership_types" })
      else if (el.field === "membership.starts_on") add("membership.starts_on", el.label || t("automations.answers.membership.starts_on"), f.title, { kind: "date" })
      else if (el.field in CONTACT_INPUTS) add(el.field, el.label || t.dynamic(CONTACT_INPUTS[el.field].label), f.title, { kind: CONTACT_INPUTS[el.field].type === "date" ? "date" : "text" })
    }
  // Consents: their texts become the pickable values.
  const consentTexts = [...new Set(forms.flatMap((f) => ((f.elements as Element[]) ?? []).filter((e) => e.kind === "consent").map((e) => (e as { label: string }).label)))]
  return [...out.values()].map(({ forms: names, ...f }) => ({ ...f, ...(f.key === "consents" ? { options: consentTexts } : {}), label: forms.length > 1 ? `${f.label} (${[...new Set(names)].join(", ")})` : f.label }))
}

export default async function WorkflowPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const ctx = await requirePerm("automations.view")
  const t = await getT()
  const sp = await searchParams
  const canEdit = ctx.can("automations.manage")
  const on = (m: string) => ctx.modules.has(m)
  const none = Promise.resolve({ data: null })
  const org = ctx.org.id
  const [{ data: wf }, defs, eventDefs, { data: tagRows }, { data: events }, { data: types }, { data: forms }, { data: courses }, { data: lists }] = await Promise.all([
    ctx.supabase.from("workflows").select("id, name, description, active, graph").eq("id", id).eq("org_id", org).is("deleted_at", null).maybeSingle(),
    loadFields(ctx.supabase, org, "contacts"),
    on("events") ? loadFields(ctx.supabase, org, "events") : [],
    ctx.supabase.rpc("contact_tags", { p_org: org }),
    // Records to pick as condition values (ponytail: newest 200 each; a search picker if orgs have more).
    on("events") ? ctx.supabase.from("events").select("id, title, starts_at").eq("org_id", org).is("deleted_at", null).order("starts_at", { ascending: false }).limit(200) : none,
    on("members") ? ctx.supabase.from("membership_types").select("id, name").eq("org_id", org).order("name") : none,
    on("forms") ? ctx.supabase.from("forms").select("id, title, elements").eq("org_id", org).is("deleted_at", null).order("title").limit(200) : none,
    on("courses") ? ctx.supabase.from("courses").select("id, title").eq("org_id", org).is("deleted_at", null).order("title").limit(200) : none,
    on("guestlists") ? ctx.supabase.from("guest_lists").select("id, name").eq("org_id", org).is("deleted_at", null).order("name").limit(200) : none,
  ])
  if (!wf) notFound()
  // Telegram: connected + the chats the bot knows (titles only; the token stays in the vault).
  const { data: telegramRow } = await createAdminClient().from("org_integrations").select("status, config").eq("org_id", org).eq("provider", "telegram").maybeSingle()
  const parsed = Graph.safeParse(wf.graph)
  const graph: Graph = parsed.success ? parsed.data : { nodes: [], edges: [] }
  const options: EditorOptions = {
    // Per module (active ones): its events + "<object> created / changed / deleted" for its objects.
    triggers: ["org", ...modules.map((m) => m.key)]
      .filter((m) => m === "org" || ctx.modules.has(m))
      .map((m) => ({
        group: m === "org" ? t("automations.general") : t.dynamic(`modules.${m}.name`),
        items: [
          ...(m === "org" ? [{ key: "schedule", label: t("automations.schedule") }] : []),
          ...eventTypes.filter((e) => e.module === m && !e.key.startsWith("workflow.")).map((e) => ({ key: e.key, label: t.dynamic(`events.types.${e.key}`) })),
          ...RECORD_OBJECTS.filter((o) => def(o).module === m).flatMap((o) =>
            RECORD_ACTIONS.map((a) => ({ key: recordTrigger(o, a), label: `${t.dynamic(`automations.objects.${o}`)} · ${t.dynamic(`automations.recordActions.${a}`)}` })),
          ),
        ],
      }))
      .filter((g) => g.items.length),
    telegram: {
      connected: telegramRow?.status === "connected",
      chats: (((telegramRow?.config as { chats?: { id: number; title: string }[] } | null)?.chats ?? []) as { id: number; title: string }[]).map((c) => ({ id: String(c.id), title: c.title })),
    },
    customFields: Object.fromEntries(
      [["contact", defs] as const, ["event", eventDefs] as const].map(([o, list]) => [o, list.map((d) => ({ key: d.key, label: d.label, type: d.type, options: d.options }))]),
    ),
    tags: ((tagRows ?? []) as unknown as string[]).sort((a, b) => a.localeCompare(b, t.locale)).slice(0, 500),
    modules: [...ctx.modules],
    answers: formAnswers(forms ?? [], defs, t),
    refs: {
      events: (events ?? []).map((e) => ({ value: e.id, label: `${e.title} · ${t.date(e.starts_at, { dateStyle: "short" })}` })),
      membership_types: (types ?? []).map((x) => ({ value: x.id, label: x.name })),
      forms: (forms ?? []).map((x) => ({ value: x.id, label: x.title })),
      courses: (courses ?? []).map((x) => ({ value: x.id, label: x.title })),
      guest_lists: (lists ?? []).map((x) => ({ value: x.id, label: x.name })),
    },
  }

  return (
    <div className="grid gap-4">
      <PageCrumbs items={[{ href: "/automations", label: t("automations.title") }, { label: wf.name }]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-2xl font-semibold break-words">{wf.name}</h1>
          <Badge variant={wf.active ? "default" : "secondary"}>{t(wf.active ? "automations.on" : "automations.off")}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button render={<Link href={`/automations/${id}/runs`} />} nativeButton={false} size="sm" variant="outline">
            <ListIcon /> {t("automations.runs")}
          </Button>
          {canEdit && (
            <>
              <form action={setActive}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="active" value={wf.active ? "0" : "1"} />
                <SubmitButton size="sm" variant={wf.active ? "outline" : "default"}>
                  {t(wf.active ? "automations.deactivate" : "automations.activate")}
                </SubmitButton>
              </form>
              <form action={trashWorkflow}>
                <input type="hidden" name="id" value={id} />
                <SubmitButton size="sm" variant="ghost">
                  {t("automations.toTrash")}
                </SubmitButton>
              </form>
            </>
          )}
        </div>
      </div>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {wf.active && canEdit && <p className="text-sm text-muted-foreground">{t("automations.activeHint")}</p>}
      <WorkflowEditor id={id} name={wf.name} description={wf.description ?? ""} graph={graph} options={options} canEdit={canEdit} />
    </div>
  )
}

export const instant = false
