import Link from "next/link"
import { DataTable } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { getContext } from "@/lib/context"
import { CUSTOM_ENTITIES, FIELD_TYPES, type CustomEntity } from "@/lib/custom-fields"
import type { Tables } from "@/lib/supabase/types"
import { param, withParams } from "@/lib/url"
import { createField, deleteField, updateField } from "./actions"
import { SubmitButton } from "@/components/submit-button"

type Field = Tables<"custom_fields">
const textareaClass =
  "rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"

export default async function FieldsPage({ searchParams }: PageProps<"/settings/fields">) {
  const ctx = await getContext()
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("org.settings.manage")
  // Only entities of modules this org has on.
  const entities = (Object.keys(CUSTOM_ENTITIES) as CustomEntity[]).filter((e) => ctx.modules.has(CUSTOM_ENTITIES[e].module))
  const { data } = await ctx.supabase
    .from("custom_fields")
    .select("*")
    .eq("org_id", ctx.org.id)
    .order("position")
    .order("created_at")
  const fields = data ?? []
  const newFor = entities.find((e) => e === param(sp, "new"))
  const editing = fields.find((f) => f.id === param(sp, "edit"))

  return (
    <div className="grid gap-8">
      <p className="text-sm text-muted-foreground">{t("fields.intro")}</p>
      <Notice error={!newFor && !editing ? param(sp, "error") : undefined} ok={param(sp, "ok")} />
      {!entities.length && <p className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">{t("fields.noEntities")}</p>}
      {entities.map((e) => (
        <section key={e} className="grid gap-3" aria-labelledby={`fields-${e}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id={`fields-${e}`} className="font-medium">
              {t.dynamic(`fields.entities.${e}`)}
            </h2>
            {canManage && (
              <Button render={<Link href={withParams(sp, { new: e, edit: undefined })} scroll={false} />} nativeButton={false} size="sm" variant="outline">
                {t("fields.new")}
              </Button>
            )}
          </div>
          <DataTable
            rows={fields.filter((f) => f.entity === e)}
            rowKey={(f) => f.id}
            rowHref={canManage ? (f) => withParams(sp, { edit: f.id, new: undefined }) : undefined}
            empty={t("fields.empty")}
            columns={[
              { header: t("fields.label"), cell: (f) => <span className="font-medium">{f.label}</span> },
              { header: t("fields.type"), cell: (f) => t.dynamic(`fields.types.${f.type}`) },
              {
                header: t("fields.options"),
                cell: (f) => <span className="text-muted-foreground">{f.options.join(", ")}</span>,
              },
              { header: t("fields.required"), cell: (f) => (f.required ? <Badge variant="secondary">{t("fields.requiredYes")}</Badge> : null) },
            ]}
          />
        </section>
      ))}

      {canManage && newFor && (
        <UrlSheet params={["new"]} title={`${t("fields.new")} · ${t.dynamic(`fields.entities.${newFor}`)}`}>
          <Notice error={param(sp, "error")} />
          <FieldForm t={t} action={createField} entity={newFor} />
        </UrlSheet>
      )}
      {canManage && editing && (
        <UrlSheet params={["edit"]} title={editing.label} description={t.dynamic(`fields.types.${editing.type}`)}>
          <Notice error={param(sp, "error")} />
          <FieldForm t={t} action={updateField} field={editing} />
          <section className="grid gap-3 rounded-lg border border-destructive/30 p-3">
            <h3 className="font-medium text-destructive">{t("admin.dangerZone")}</h3>
            <p className="text-sm text-muted-foreground">{t("fields.deleteHint")}</p>
            <form action={deleteField}>
              <input type="hidden" name="id" value={editing.id} />
              <SubmitButton variant="outline" size="sm">
                {t("fields.delete")}
              </SubmitButton>
            </form>
          </section>
        </UrlSheet>
      )}
    </div>
  )
}

function FieldForm({ t, action, entity, field }: { t: T; action: (fd: FormData) => Promise<void>; entity?: string; field?: Field }) {
  return (
    <form action={action} className="grid gap-4">
      {field && <input type="hidden" name="id" value={field.id} />}
      {entity && <input type="hidden" name="entity" value={entity} />}
      <div className="grid gap-2">
        <Label htmlFor="f-label">{t("fields.label")}</Label>
        <Input id="f-label" name="label" defaultValue={field?.label} required maxLength={100} />
      </div>
      {!field && (
        <div className="grid gap-2">
          <Label htmlFor="f-type">{t("fields.type")}</Label>
          <NativeSelect id="f-type" name="type" defaultValue="text" className="w-full">
            {FIELD_TYPES.map((ty) => (
              <NativeSelectOption key={ty} value={ty}>
                {t.dynamic(`fields.types.${ty}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">{t("fields.typeFixed")}</p>
        </div>
      )}
      {(!field || field.type === "select") && (
        <div className="grid gap-2">
          <Label htmlFor="f-options">{t("fields.options")}</Label>
          <textarea id="f-options" name="options" rows={4} defaultValue={field?.options.join("\n")} className={textareaClass} aria-describedby="f-options-help" />
          <p id="f-options-help" className="text-xs text-muted-foreground">
            {t("fields.optionsHint")}
          </p>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="required" value="1" defaultChecked={field?.required} className="size-4" />
        {t("fields.requiredLabel")}
      </label>
      <SubmitButton className="justify-self-start">
        {field ? t("common.save") : t("fields.new")}
      </SubmitButton>
    </form>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
