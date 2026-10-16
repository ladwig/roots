import { CustomFieldInputs } from "@/components/custom-field-inputs"
import { FormCard } from "@/components/page"
import { RichTextEditor } from "@/components/rich-text-editor"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { T } from "@/i18n/translate"
import type { CustomValues, FieldDef } from "@/lib/custom-fields"
import { DOT, PICKABLE_COLORS } from "@/projects/fields"

export type ProjectValues = { name: string; description: string; color: string; status_id: string; lead_id: string | null; start_on: string | null; end_on: string | null; custom: unknown }

/** The project's fields in two cards (description, details): for /projects/new and the project page (inside its form). */
export function ProjectFields({ t, p, statuses, team, defs, disabled }: { t: T; p?: ProjectValues; statuses: { id: string; name: string }[]; team: { id: string; name: string }[]; defs: FieldDef[]; disabled?: boolean }) {
  return (
    <>
      <FormCard id="project" title={t("projects.project")}>
        <fieldset disabled={disabled} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="pj-name">{t("projects.name")}</Label>
            <Input id="pj-name" name="name" defaultValue={p?.name} maxLength={200} required autoFocus={!p} className="text-base font-medium" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pj-desc">{t("projects.description")}</Label>
            <RichTextEditor id="pj-desc" name="description" defaultValue={p?.description ?? ""} disabled={disabled} />
          </div>
        </fieldset>
      </FormCard>
      <FormCard id="details" title={t("projects.details")}>
        <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="pj-status">{t("projects.status")}</Label>
            <NativeSelect id="pj-status" name="status_id" defaultValue={p?.status_id ?? statuses[0]?.id} className="w-full">
              {statuses.map((s) => (
                <NativeSelectOption key={s.id} value={s.id}>
                  {s.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pj-lead">{t("projects.lead")}</Label>
            <NativeSelect id="pj-lead" name="lead_id" defaultValue={p?.lead_id ?? ""} className="w-full">
              <NativeSelectOption value="">{t("projects.noLead")}</NativeSelectOption>
              {team.map((m) => (
                <NativeSelectOption key={m.id} value={m.id}>
                  {m.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pj-start">{t("projects.start")}</Label>
            <Input id="pj-start" name="start_on" type="date" defaultValue={p?.start_on ?? ""} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pj-end">{t("projects.end")}</Label>
            <Input id="pj-end" name="end_on" type="date" defaultValue={p?.end_on ?? ""} />
          </div>
          <fieldset className="grid gap-2 sm:col-span-2">
            <legend className="mb-2 text-sm font-medium">{t("projects.color")}</legend>
            <div className="flex gap-1">
              {PICKABLE_COLORS.map((c) => (
                <label key={c} className="grid size-8 cursor-pointer place-items-center rounded-full has-checked:ring-2 has-checked:ring-ring">
                  <input type="radio" name="color" value={c} defaultChecked={(p?.color ?? "blue") === c} className="sr-only" aria-label={t.dynamic(`projects.colors.${c}`)} />
                  <span className="size-4 rounded-full" style={{ background: DOT[c] }} aria-hidden />
                </label>
              ))}
            </div>
          </fieldset>
        </fieldset>
        <fieldset disabled={disabled}>
          <CustomFieldInputs defs={defs} values={(p?.custom ?? {}) as CustomValues} idPrefix="pj-custom" />
        </fieldset>
      </FormCard>
    </>
  )
}
