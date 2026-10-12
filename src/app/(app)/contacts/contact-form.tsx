import { CustomFieldInputs } from "@/components/custom-field-inputs"
import { SubmitButton } from "@/components/submit-button"
import { TagSelect } from "@/components/tag-select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { T } from "@/i18n/translate"
import type { CustomValues, FieldDef } from "@/lib/custom-fields"
import type { Tables } from "@/lib/supabase/types"
import { COUNTRIES } from "./fields"

type Contact = Tables<"contacts">

// The contact's fields: the "new" drawer on the list and the details section of /contacts/[id].
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
    <form action={action} className="grid gap-4">
      {c && <input type="hidden" name="id" value={c.id} />}
      <fieldset disabled={disabled} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="c-first" name="first_name" label={t("contacts.firstName")} defaultValue={c?.first_name ?? ""} maxLength={100} autoComplete="off" />
          <Field id="c-last" name="last_name" label={t("contacts.lastName")} defaultValue={c?.last_name ?? ""} maxLength={100} autoComplete="off" />
        </div>
        <Field id="c-company" name="company" label={t("contacts.company")} defaultValue={c?.company ?? ""} maxLength={200} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="c-email" name="email" type="email" label={t("contacts.email")} defaultValue={c?.email ?? ""} maxLength={320} />
          <Field id="c-phone" name="phone" type="tel" label={t("contacts.phone")} defaultValue={c?.phone ?? ""} maxLength={50} />
        </div>
        <Field id="c-street" name="street" label={t("contacts.street")} defaultValue={c?.street ?? ""} maxLength={200} />
        <div className="grid grid-cols-[minmax(0,7rem)_1fr] gap-4">
          <Field id="c-zip" name="postal_code" label={t("contacts.postalCode")} defaultValue={c?.postal_code ?? ""} maxLength={20} />
          <Field id="c-city" name="city" label={t("contacts.city")} defaultValue={c?.city ?? ""} maxLength={100} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="c-country">{t("contacts.country")}</Label>
            <NativeSelect id="c-country" name="country" defaultValue={c?.country ?? ""} className="w-full">
              <NativeSelectOption value="">–</NativeSelectOption>
              {COUNTRIES.map((code) => (
                <NativeSelectOption key={code} value={code}>
                  {regions.of(code)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <Field id="c-birthday" name="birthday" type="date" label={t("contacts.birthday")} defaultValue={c?.birthday ?? ""} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="c-tags">{t("contacts.tags")}</Label>
          <TagSelect id="c-tags" name="tags" options={tags} defaultValue={c?.tags ?? []} creatable disabled={disabled} />
          <p id="c-tags-help" className="text-xs text-muted-foreground">
            {t("contacts.tagsHelp")}
          </p>
        </div>
        <CustomFieldInputs defs={defs} values={c?.custom as CustomValues | undefined} idPrefix="c-custom" />
        {!disabled && (
          <SubmitButton className="justify-self-start">
            {c ? t("common.save") : t("contacts.new")}
          </SubmitButton>
        )}
      </fieldset>
    </form>
  )
}
