import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { T } from "@/i18n/translate"
import type { Tables } from "@/lib/supabase/types"
import { INTERVALS, type Interval } from "@/members/dues"
import { PAYMENT_METHODS } from "@/members/server"
import { CustomFieldInputs } from "@/components/custom-field-inputs"
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
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
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
        <Field id="m-start" name="starts_on" type="date" required label={t("membership.since")} defaultValue={m?.starts_on ?? today()} />
      </div>
      {m && <Field id="m-end" name="ends_on" type="date" label={t("membership.until")} defaultValue={m.ends_on ?? ""} />}
      <fieldset className="grid gap-4">
        <legend className="mb-1 font-medium">{t("membership.feeOwn")}</legend>
        <p className="text-xs text-muted-foreground">{t("membership.feeOwnHint")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="m-fee" name="fee" type="number" min="0" step="0.01" label={t("membership.fee")} placeholder={t("membership.feeOfType")} defaultValue={m?.fee_cents != null ? (m.fee_cents / 100).toFixed(2) : ""} />
          <div className="grid gap-2">
            <Label htmlFor="m-interval">{t("membership.interval")}</Label>
            <NativeSelect id="m-interval" name="fee_interval" defaultValue={m?.fee_interval ?? ""} className="w-full">
              <NativeSelectOption value="">{t("membership.feeOfType")}</NativeSelectOption>
              {INTERVALS.map((i) => (
                <NativeSelectOption key={i} value={i}>
                  {t(`membership.intervals.${i}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="m-method">{t("membership.paymentMethod")}</Label>
            <NativeSelect id="m-method" name="payment_method" defaultValue={m?.payment_method ?? ""} className="w-full">
              <NativeSelectOption value="">{t("membership.paymentAuto")}</NativeSelectOption>
              {PAYMENT_METHODS.map((p) => (
                <NativeSelectOption key={p} value={p}>
                  {t.dynamic(`membership.paymentMethods.${p}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <Field id="m-free" name="fee_free_until" type="date" label={t("membership.feeFreeUntil")} defaultValue={m?.fee_free_until ?? ""} />
        </div>
      </fieldset>
      <fieldset className="grid gap-4">
        <legend className="mb-1 font-medium">{t("membership.mandate")}</legend>
        <p className="text-xs text-muted-foreground">{t("membership.mandateHint")}</p>
        <Field id="m-holder" name="account_holder" label={t("membership.accountHolder")} maxLength={70} defaultValue={m?.account_holder ?? ""} />
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field id="m-iban" name="iban" label="IBAN" maxLength={40} defaultValue={m?.iban ?? ""} autoComplete="off" />
          <Field id="m-bic" name="bic" label={t("membership.bicOptional")} maxLength={11} defaultValue={m?.bic ?? ""} autoComplete="off" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="m-ref" name="mandate_ref" label={t("membership.mandateRef")} maxLength={35} defaultValue={m?.mandate_ref ?? ""} placeholder={t("membership.mandateRefAuto")} />
          <Field id="m-signed" name="mandate_signed_on" type="date" label={t("membership.mandateSigned")} defaultValue={m?.mandate_signed_on ?? ""} />
        </div>
      </fieldset>
      <CustomFieldInputs defs={defs} values={m?.custom as CustomValues | undefined} idPrefix="m-custom" />
      <div className="grid gap-2">
        <Label htmlFor="m-note">{t("membership.note")}</Label>
        <textarea
          id="m-note"
          name="note"
          rows={3}
          maxLength={5000}
          defaultValue={m?.note ?? ""}
          className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
      </div>
    </>
  )
}

