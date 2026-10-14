import { CustomFieldInputs } from "@/components/custom-field-inputs"
import { Choice } from "@/components/choice"
import { FormCard } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { TagSelect } from "@/components/tag-select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TypedInput } from "@/components/typed-input"
import type { T } from "@/i18n/translate"
import type { CustomValues, FieldDef } from "@/lib/custom-fields"
import type { Tables } from "@/lib/supabase/types"
import { COUNTRIES } from "./fields"

type Contact = Tables<"contacts">

// The contact's fields, grouped in cards: /contacts/new and the details of /contacts/[id].
function Field({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
    </div>
  )
}

export function ContactForm({ t, action, c, disabled, defs, tags }: { t: T; action: (fd: FormData) => Promise<void>; c?: Contact; disabled?: boolean; defs: FieldDef[]; tags: string[] }) {
  const regions = new Intl.DisplayNames([t.locale], { type: "region" })
  return (
    <form action={action} className="grid gap-6">
      {c && <input type="hidden" name="id" value={c.id} />}
      <fieldset disabled={disabled} className="grid gap-6">
        <FormCard id="person" title={t("contacts.person")} description={t("contacts.personHint")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="c-first" name="first_name" label={t("contacts.firstName")} defaultValue={c?.first_name ?? ""} maxLength={100} autoComplete="off" />
            <Field id="c-last" name="last_name" label={t("contacts.lastName")} defaultValue={c?.last_name ?? ""} maxLength={100} autoComplete="off" />
          </div>
          <Field id="c-company" name="company" label={t("contacts.company")} defaultValue={c?.company ?? ""} maxLength={200} autoComplete="off" />
          <div className="grid gap-2">
            <Label htmlFor="c-birthday">{t("contacts.birthday")}</Label>
            <TypedInput kind="date" id="c-birthday" name="birthday" defaultValue={c?.birthday ?? ""} />
          </div>
        </FormCard>

        <FormCard id="reach" title={t("contacts.reach")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <Label htmlFor="c-email">{t("contacts.email")}</Label>
              <TypedInput kind="email" id="c-email" name="email" defaultValue={c?.email ?? ""} autoComplete="off" />
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="c-phone">{t("contacts.phone")}</Label>
              <TypedInput kind="phone" id="c-phone" name="phone" defaultValue={c?.phone ?? ""} autoComplete="off" />
            </div>
          </div>
        </FormCard>

        <FormCard id="address" title={t("contacts.address")}>
          <Field id="c-street" name="street" label={t("contacts.street")} defaultValue={c?.street ?? ""} maxLength={200} autoComplete="off" />
          <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-4">
            <div className="grid content-start gap-2">
              <Label htmlFor="c-zip">{t("contacts.postalCode")}</Label>
              <TypedInput kind="postcode" id="c-zip" name="postal_code" defaultValue={c?.postal_code ?? ""} country={c?.country} autoComplete="off" />
            </div>
            <Field id="c-city" name="city" label={t("contacts.city")} defaultValue={c?.city ?? ""} maxLength={100} autoComplete="off" />
          </div>
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor="c-country">{t("contacts.country")}</Label>
            <Choice id="c-country" name="country" label={t("contacts.country")} defaultValue={c?.country} options={COUNTRIES.map((code) => ({ value: code, label: regions.of(code) ?? code }))} />
          </div>
        </FormCard>

        <FormCard id="more" title={t("contacts.more")}>
          <div className="grid gap-2">
            <Label htmlFor="c-tags">{t("contacts.tags")}</Label>
            <TagSelect id="c-tags" name="tags" options={tags} defaultValue={c?.tags ?? []} creatable disabled={disabled} />
            <p id="c-tags-help" className="text-xs text-muted-foreground">
              {t("contacts.tagsHelp")}
            </p>
          </div>
          <CustomFieldInputs defs={defs} values={c?.custom as CustomValues | undefined} idPrefix="c-custom" />
        </FormCard>
        {!disabled && <SaveBar label={c ? undefined : t("contacts.create")} always={!c} />}
      </fieldset>
    </form>
  )
}
