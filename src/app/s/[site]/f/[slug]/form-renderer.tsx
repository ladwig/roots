"use client"

import { useActionState } from "react"
import { SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { CONTACT_INPUTS, MEMBERSHIP_INPUTS, type Element } from "@/forms/elements"
import { useT } from "@/i18n/client"
import { COUNTRIES } from "@/app/(app)/contacts/fields"
import type { PublicForm } from "./data"
import { submitForm } from "./actions"

// Renders a published form. Client-side so a rejected submission keeps what the person typed.
export function FormRenderer({ form, site, slug, org }: { form: PublicForm; site: string; slug: string; org: string }) {
  const t = useT()
  const [state, action] = useActionState(submitForm, { error: "", values: {} as Record<string, string>, attempt: 0 })
  const v = (k: string) => state.values[k] ?? ""
  const regions = new Intl.DisplayNames([t.locale], { type: "region" })
  const creditor = form.creditor?.name || org

  const field = (e: Extract<Element, { kind: "field" }>) => {
    const custom = e.field.startsWith("custom.") ? form.custom_fields.find((d) => `custom.${d.key}` === e.field) : undefined
    const builtin = CONTACT_INPUTS[e.field] ?? MEMBERSHIP_INPUTS[e.field]
    const label = e.label || custom?.label || (builtin ? t.dynamic(builtin.label) : e.field)
    const id = `f-${e.id}`
    const common = { id, name: e.field, required: e.required, defaultValue: v(e.field) }
    let input: React.ReactNode
    if (e.field === "membership.type")
      input = (
        <div role="radiogroup" aria-labelledby={`${id}-l`} className="grid gap-2">
          {form.types.map((x) => (
            <label key={x.id} className="flex items-start gap-2 rounded-lg border p-3 text-sm has-checked:border-primary">
              <input type="radio" name={e.field} value={x.id} required={e.required} defaultChecked={v(e.field) === x.id || form.types.length === 1} className="mt-0.5 size-4" />
              <span className="grid">
                <span className="font-medium">{x.name}</span>
                <span className="text-muted-foreground">
                  {x.interval === "none" ? t.money(x.fee_cents) : t("forms.feePer", { fee: t.money(x.fee_cents), interval: t.dynamic(`membership.intervals.${x.interval}`) })}
                  {x.entry_fee_cents > 0 && ` · ${t("forms.entryFee", { fee: t.money(x.entry_fee_cents) })}`}
                </span>
              </span>
            </label>
          ))}
        </div>
      )
    else if (custom?.type === "boolean")
      input = (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name={e.field} value="ja" defaultChecked={v(e.field) === "ja"} className="size-4" /> {label}
        </label>
      )
    else if (custom?.type === "select" || builtin?.type === "country")
      input = (
        <NativeSelect {...common} className="w-full">
          <NativeSelectOption value="">–</NativeSelectOption>
          {(custom ? custom.options : COUNTRIES).map((o) => (
            <NativeSelectOption key={o} value={o}>
              {custom ? o : regions.of(o)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )
    else {
      const type = custom ? ({ number: "text", date: "date", email: "email", url: "url" } as Record<string, string>)[custom.type] ?? "text" : builtin?.type === "tel" ? "tel" : (builtin?.type ?? "text")
      const auto: Record<string, string> = { first_name: "given-name", last_name: "family-name", email: "email", phone: "tel", street: "street-address", postal_code: "postal-code", city: "address-level2", company: "organization", birthday: "bday" }
      input = <Input {...common} type={type} autoComplete={auto[e.field] ?? "off"} maxLength={custom ? 2000 : 320} />
    }
    return (
      <div key={e.id} className="grid gap-2">
        {custom?.type !== "boolean" && (
          <Label id={`${id}-l`} htmlFor={id}>
            {label}
            {e.required && <span aria-hidden> *</span>}
          </Label>
        )}
        {input}
        {e.help && <p className="text-xs text-muted-foreground">{e.help}</p>}
      </div>
    )
  }

  return (
    <form key={state.attempt} action={action} className="grid gap-5" noValidate={false}>
      <input type="hidden" name="$site" value={site} />
      <input type="hidden" name="$slug" value={slug} />
      {/* Honeypot: people never see or fill it, bots usually do. */}
      <input type="text" name="$website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      {form.elements.map((e) =>
        e.kind === "field" ? (
          field(e)
        ) : e.kind === "text" ? (
          <p key={e.id} className="whitespace-pre-line text-sm">
            {e.body}
          </p>
        ) : e.kind === "consent" ? (
          <label key={e.id} className="flex items-start gap-2 text-sm">
            <input type="checkbox" name={`consent.${e.id}`} required={e.required} defaultChecked={v(`consent.${e.id}`) === "on"} className="mt-0.5 size-4" />
            <span className="whitespace-pre-line">
              {e.label}
              {e.required && <span aria-hidden> *</span>}
            </span>
          </label>
        ) : (
          <fieldset key={e.id} className="grid gap-3 rounded-lg border p-4">
            <legend className="px-1 font-medium">{t("forms.mandate")}</legend>
            <div className="grid gap-2">
              <Label htmlFor="f-holder">{t("forms.accountHolder")}</Label>
              <Input id="f-holder" name="account_holder" maxLength={70} autoComplete="cc-name" defaultValue={v("account_holder")} />
            </div>
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <div className="grid gap-2">
                <Label htmlFor="f-iban">
                  IBAN<span aria-hidden> *</span>
                </Label>
                <Input id="f-iban" name="iban" required maxLength={42} autoComplete="off" defaultValue={v("iban")} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="f-bic">{t("forms.bicOptional")}</Label>
                <Input id="f-bic" name="bic" maxLength={11} autoComplete="off" defaultValue={v("bic")} />
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="mandate_ok" required defaultChecked={v("mandate_ok") === "on"} className="mt-0.5 size-4" />
              <span>{t("forms.mandateText", { creditor, id: form.creditor?.id ?? "–" })}</span>
            </label>
          </fieldset>
        ),
      )}
      {state.error && (
        <p role="alert" className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      <SubmitButton className="justify-self-start">{t("forms.submit")}</SubmitButton>
    </form>
  )
}
