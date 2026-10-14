import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { T } from "@/i18n/translate"
import type { Tables } from "@/lib/supabase/types"
import { INTERVALS, type Interval } from "@/members/dues"
import { PAYMENT_METHODS } from "@/members/server"
import { CustomFieldInputs } from "@/components/custom-field-inputs"
import { FormCard } from "@/components/page"
import { TypedInput } from "@/components/typed-input"
import { Textarea } from "@/components/ui/textarea"
import { formatMoney } from "@/lib/inputs"
import { type CustomValues, type FieldDef } from "@/lib/custom-fields"

export type Type = Pick<Tables<"membership_types">, "id" | "name" | "fee_cents" | "fee_is_minimum" | "interval" | "notice_months" | "active">
export const TYPE_COLS = "id, name, fee_cents, fee_is_minimum, interval, notice_months, active"
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })

export function Field({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
    </div>
  )
}

export function MembershipFields({ t, types, m, defs }: { t: T; types: Type[]; m?: Tables<"memberships">; defs: FieldDef[] }) {
  // What applies when the own fields stay empty: the (selected) type's fee and rhythm, the payment way of the mandate.
  const type = types.find((x) => x.id === m?.type_id) ?? types.find((x) => x.active) ?? types[0]
  const ofType = (v: string) => t("membership.typeDefault", { value: v })
  return (
    <>
      <FormCard id="membership" title={t("membership.period")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="m-type">{t("membership.type")}</Label>
            <NativeSelect id="m-type" name="type_id" required defaultValue={m?.type_id ?? types.find((x) => x.active)?.id ?? ""} className="w-full">
              {types
                .filter((x) => x.active || x.id === m?.type_id)
                .map((x) => (
                  <NativeSelectOption key={x.id} value={x.id}>
                    {x.name} · {x.fee_is_minimum ? t("membership.feeFrom", { fee: t.money(x.fee_cents) }) : t.money(x.fee_cents)} / {t(`membership.intervals.${x.interval as Interval}`)}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
          </div>
          <DateField id="m-start" name="starts_on" required label={t("membership.since")} defaultValue={m?.starts_on ?? today()} />
          {m && <DateField id="m-end" name="ends_on" label={t("membership.until")} defaultValue={m.ends_on ?? ""} />}
        </div>
      </FormCard>
      <FormCard id="fee" title={t("membership.feeOwn")} description={t("membership.feeOwnHint")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <Label htmlFor="m-fee">{t("membership.fee")}</Label>
            <TypedInput kind="money" id="m-fee" name="fee" placeholder={type ? (type.fee_is_minimum ? t("membership.feeFrom", { fee: t.money(type.fee_cents) }) : formatMoney(type.fee_cents)) : t("membership.feeOfType")} defaultValue={m?.fee_cents != null ? formatMoney(m.fee_cents) : ""} />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="m-interval">{t("membership.interval")}</Label>
            <NativeSelect id="m-interval" name="fee_interval" defaultValue={m?.fee_interval ?? ""} className="w-full">
              <NativeSelectOption value="">{type ? ofType(t(`membership.intervals.${type.interval as Interval}`)) : t("membership.feeOfType")}</NativeSelectOption>
              {INTERVALS.map((i) => (
                <NativeSelectOption key={i} value={i}>
                  {t(`membership.intervals.${i}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="m-method">{t("membership.paymentMethod")}</Label>
            <NativeSelect id="m-method" name="payment_method" defaultValue={m?.payment_method ?? ""} className="w-full">
              <NativeSelectOption value="">{m?.iban ? t("membership.paymentAutoSepa") : t("membership.paymentAutoTransfer")}</NativeSelectOption>
              {PAYMENT_METHODS.map((p) => (
                <NativeSelectOption key={p} value={p}>
                  {t.dynamic(`membership.paymentMethods.${p}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <DateField id="m-free" name="fee_free_until" label={t("membership.feeFreeUntil")} defaultValue={m?.fee_free_until ?? ""} />
        </div>
      </FormCard>
      <FormCard id="mandate" title={t("membership.mandate")} description={t("membership.mandateHint")}>
        <Field id="m-holder" name="account_holder" label={t("membership.accountHolder")} maxLength={70} defaultValue={m?.account_holder ?? ""} autoComplete="off" />
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <div className="grid content-start gap-2">
            <Label htmlFor="m-iban">IBAN</Label>
            <TypedInput kind="iban" id="m-iban" name="iban" defaultValue={m?.iban ?? ""} />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="m-bic">{t("membership.bicOptional")}</Label>
            <TypedInput kind="bic" id="m-bic" name="bic" defaultValue={m?.bic ?? ""} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="m-ref" name="mandate_ref" label={t("membership.mandateRef")} maxLength={35} defaultValue={m?.mandate_ref ?? ""} placeholder={t("membership.mandateRefAuto")} />
          <DateField id="m-signed" name="mandate_signed_on" label={t("membership.mandateSigned")} defaultValue={m?.mandate_signed_on ?? ""} />
        </div>
      </FormCard>
      <FormCard id="more" title={defs.length ? t("membership.moreFields") : t("membership.note")}>
        <CustomFieldInputs defs={defs} values={m?.custom as CustomValues | undefined} idPrefix="m-custom" />
        <div className="grid gap-2">
          {defs.length > 0 && <Label htmlFor="m-note">{t("membership.note")}</Label>}
          <Textarea id="m-note" name="note" rows={3} maxLength={5000} defaultValue={m?.note ?? ""} aria-label={t("membership.note")} />
        </div>
      </FormCard>
    </>
  )
}

export function DateField({ id, label, ...props }: { id: string; label: string } & Omit<React.ComponentProps<"input">, "type">) {
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={id}>{label}</Label>
      <TypedInput kind="date" id={id} {...props} />
    </div>
  )
}
