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
import { eventTypes } from "@/events/registry"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { param } from "@/lib/url"
import { setActive, trashWorkflow } from "../actions"
import { WorkflowEditor, type EditorOptions } from "./editor"

const CONTACT_FIELDS = ["first_name", "last_name", "company", "email", "phone", "city", "country", "birthday", "tags"]

// One workflow on the canvas (desktop works best; phones can view and switch it on/off).
export default async function WorkflowPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const ctx = await requirePerm("automations.view")
  const t = await getT()
  const sp = await searchParams
  const canEdit = ctx.can("automations.manage")
  const [{ data: wf }, defs, { data: tagRows }] = await Promise.all([
    ctx.supabase.from("workflows").select("id, name, description, active, graph").eq("id", id).eq("org_id", ctx.org.id).is("deleted_at", null).maybeSingle(),
    loadFields(ctx.supabase, ctx.org.id, "contacts"),
    ctx.supabase.rpc("contact_tags", { p_org: ctx.org.id }),
  ])
  if (!wf) notFound()
  const parsed = Graph.safeParse(wf.graph)
  const graph: Graph = parsed.success ? parsed.data : { nodes: [], edges: [] }
  const options: EditorOptions = {
    events: eventTypes
      .filter((e) => e.module !== "platform" && !e.key.startsWith("workflow.") && (e.module === "org" || ctx.modules.has(e.module)))
      .map((e) => ({ key: e.key, label: t.dynamic(`events.types.${e.key}`) }))
      .sort((a, b) => a.label.localeCompare(b.label, t.locale)),
    fields: [
      ...CONTACT_FIELDS.map((f) => ({ value: `contact.${f}`, label: t.dynamic(`automations.contactFields.${f}`) })),
      ...defs.map((d) => ({ value: `contact.custom.${d.key}`, label: d.label })),
      { value: "payload.", label: t("automations.eventData") },
    ],
    customFields: defs.map((d) => ({ key: d.key, label: d.label })),
    tags: ((tagRows ?? []) as unknown as string[]).slice(0, 500),
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
