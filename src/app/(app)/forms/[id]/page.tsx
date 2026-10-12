import { ArrowDownIcon, ArrowUpIcon, Trash2Icon } from "lucide-react"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { CONTACT_INPUTS, MEMBERSHIP_INPUTS, type Element, type Purpose } from "@/forms/elements"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { param } from "@/lib/url"
import { addElement, moveElement, removeElement, saveFormSettings, trashForm, updateElement } from "../actions"

const textareaClass =
  "rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"

export default async function FormBuilderPage({ params, searchParams }: PageProps<"/forms/[id]">) {
  const { id } = await params
  const sp = await searchParams
  const ctx = await requirePerm("forms.view")
  const t = await getT()
  const canManage = ctx.can("forms.manage")
  const [{ data: form }, defs] = await Promise.all([
    ctx.supabase.from("forms").select("*").eq("id", id).eq("org_id", ctx.org.id).single(),
    loadFields(ctx.supabase, ctx.org.id, "contacts"),
  ])
  if (!form) return null
  const purpose = form.purpose as Purpose
  const elements = form.elements as unknown as Element[]
  const used = new Set(elements.flatMap((e) => (e.kind === "field" ? [e.field] : [])))
  const fieldLabel = (f: string) =>
    CONTACT_INPUTS[f] ? t.dynamic(CONTACT_INPUTS[f].label) : MEMBERSHIP_INPUTS[f] ? t.dynamic(MEMBERSHIP_INPUTS[f].label) : (defs.find((d) => `custom.${d.key}` === f)?.label ?? f)
  const available = [
    ...Object.keys(CONTACT_INPUTS),
    ...defs.map((d) => `custom.${d.key}`),
    ...(purpose === "membership" ? Object.keys(MEMBERSHIP_INPUTS) : []),
  ].filter((f) => !used.has(f))
  const settings = form.settings as { tags?: string[] }

  return (
    <>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <section className="grid gap-3" aria-labelledby="form-settings">
        <h2 id="form-settings" className="font-medium">
          {t("forms.settings")}
        </h2>
        <form action={saveFormSettings} className="grid gap-4 rounded-lg border p-4">
          <input type="hidden" name="id" value={form.id} />
          <fieldset disabled={!canManage} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
              <Field id="s-title" name="title" label={t("forms.formTitle")} required maxLength={200} defaultValue={form.title} />
              <Field id="s-slug" name="slug" label={t("forms.slug")} required maxLength={80} defaultValue={form.slug} />
              <div className="grid gap-2">
                <Label htmlFor="s-status">{t("forms.status")}</Label>
                <NativeSelect id="s-status" name="status" defaultValue={form.status} className="w-full">
                  {(["draft", "published", "closed"] as const).map((s) => (
                    <NativeSelectOption key={s} value={s}>
                      {t(`forms.statuses.${s}`)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            </div>
            <Area id="s-intro" name="intro" label={t("forms.intro")} defaultValue={form.intro ?? ""} maxLength={5000} />
            <Area id="s-success" name="success_text" label={t("forms.successText")} defaultValue={form.success_text ?? ""} maxLength={2000} />
            <div className="grid gap-2">
              <Label htmlFor="s-tags">{t("forms.tags")}</Label>
              <Input id="s-tags" name="tags" defaultValue={(settings.tags ?? []).join(", ")} aria-describedby="s-tags-help" />
              <p id="s-tags-help" className="text-xs text-muted-foreground">
                {t("forms.tagsHelp")}
              </p>
            </div>
          </fieldset>
          {canManage && <SubmitButton className="justify-self-start">{t("common.save")}</SubmitButton>}
        </form>
      </section>

      <section className="grid gap-3" aria-labelledby="form-elements">
        <div>
          <h2 id="form-elements" className="font-medium">
            {t("forms.elements")}
          </h2>
          <p className="text-sm text-muted-foreground">{t(purpose === "membership" ? "forms.elementsHintMembership" : "forms.elementsHint")}</p>
        </div>
        <ol className="grid gap-2">
          {elements.map((e, i) => (
            <li key={e.id} className="grid gap-3 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t.dynamic(`forms.kinds.${e.kind}`)}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {e.kind === "field" ? fieldLabel(e.field) : e.kind === "consent" ? e.label : e.kind === "text" ? e.body.slice(0, 80) : t("forms.mandate")}
                </span>
                {canManage && (
                  <div className="flex gap-1">
                    <IconAction action={moveElement} form={form.id} element={e.id} extra={{ dir: "up" }} label={t("forms.moveUp")} disabled={i === 0}>
                      <ArrowUpIcon />
                    </IconAction>
                    <IconAction action={moveElement} form={form.id} element={e.id} extra={{ dir: "down" }} label={t("forms.moveDown")} disabled={i === elements.length - 1}>
                      <ArrowDownIcon />
                    </IconAction>
                    <IconAction action={removeElement} form={form.id} element={e.id} label={t("forms.remove")}>
                      <Trash2Icon />
                    </IconAction>
                  </div>
                )}
              </div>
              {canManage && e.kind !== "mandate" && (
                <form action={updateElement} className="grid gap-3">
                  <input type="hidden" name="id" value={form.id} />
                  <input type="hidden" name="element" value={e.id} />
                  {e.kind === "field" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field id={`l-${e.id}`} name="label" label={t("forms.label")} maxLength={200} defaultValue={e.label ?? ""} placeholder={fieldLabel(e.field)} />
                      <Field id={`h-${e.id}`} name="help" label={t("forms.help")} maxLength={500} defaultValue={e.help ?? ""} />
                    </div>
                  )}
                  {e.kind === "consent" && <Area id={`c-${e.id}`} name="label" label={t("forms.consentText")} defaultValue={e.label} maxLength={1000} rows={2} />}
                  {e.kind === "text" && <Area id={`b-${e.id}`} name="body" label={t("forms.textBody")} defaultValue={e.body} maxLength={5000} />}
                  <div className="flex flex-wrap items-center gap-3">
                    {(e.kind === "field" || e.kind === "consent") && (
                      <label className="flex items-center gap-1.5 text-sm">
                        <input type="checkbox" name="required" defaultChecked={e.required} className="size-4" /> {t("forms.required")}
                      </label>
                    )}
                    <SubmitButton size="sm" variant="outline">
                      {t("common.save")}
                    </SubmitButton>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ol>
        {canManage && (
          <form action={addElement} className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed p-3">
            <input type="hidden" name="id" value={form.id} />
            <div className="grid min-w-56 flex-1 gap-2">
              <Label htmlFor="add-kind">{t("forms.addElement")}</Label>
              <NativeSelect id="add-kind" name="kind" className="w-full">
                {available.length > 0 && (
                  <optgroup label={t("forms.kinds.field")}>
                    {available.map((f) => (
                      <NativeSelectOption key={f} value={`field:${f}`}>
                        {fieldLabel(f)}
                      </NativeSelectOption>
                    ))}
                  </optgroup>
                )}
                <NativeSelectOption value="text">{t("forms.kinds.text")}</NativeSelectOption>
                <NativeSelectOption value="consent">{t("forms.kinds.consent")}</NativeSelectOption>
                {purpose === "membership" && !elements.some((e) => e.kind === "mandate") && <NativeSelectOption value="mandate">{t("forms.mandate")}</NativeSelectOption>}
              </NativeSelect>
            </div>
            <SubmitButton size="sm">{t("forms.add")}</SubmitButton>
          </form>
        )}
      </section>

      {canManage && (
        <form action={trashForm}>
          <input type="hidden" name="id" value={form.id} />
          <SubmitButton variant="outline" size="sm">
            {t("forms.toTrash")}
          </SubmitButton>
        </form>
      )}
    </>
  )
}

function IconAction({
  action,
  form,
  element,
  extra,
  label,
  disabled,
  children,
}: {
  action: (fd: FormData) => Promise<void>
  form: string
  element: string
  extra?: Record<string, string>
  label: string
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={form} />
      <input type="hidden" name="element" value={element} />
      {Object.entries(extra ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Tooltip>
        <TooltipTrigger render={<SubmitButton size="icon-sm" variant="ghost" aria-label={label} disabled={disabled} />}>{children}</TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </form>
  )
}

function Field({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
    </div>
  )
}

function Area({ id, label, rows = 3, ...props }: { id: string; label: string; rows?: number } & React.ComponentProps<"textarea">) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <textarea id={id} rows={rows} className={textareaClass} {...props} />
    </div>
  )
}

export const instant = false
