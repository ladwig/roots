import { Choice } from "@/components/choice"
import { FormCard, Page, PageHeader } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { TypedInput } from "@/components/typed-input"
import { notFound } from "next/navigation"
import { Notice } from "@/components/notice"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param } from "@/lib/url"
import { TEMPLATES } from "@/documents/templates"
import { NumberRangeForm } from "@/components/number-range-form"
import { saveBilling, saveNumberRange } from "../actions"

const textarea =
  "rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"

export default async function InvoiceSettings({ searchParams }: PageProps<"/invoices/settings">) {
  const ctx = await requirePerm("invoices.manage")
  if (!ctx.modules.has("invoices")) notFound()
  const t = await getT()
  const sp = await searchParams
  const [{ data: b }, { data: ranges }] = await Promise.all([
    ctx.supabase.from("org_billing").select("*").eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("number_ranges").select("kind, format, next_number, yearly_reset").eq("org_id", ctx.org.id),
  ])
  const field = (name: string, label: string, value: string | null | undefined, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="grid gap-2">
      <Label htmlFor={`b-${name}`}>{label}</Label>
      <Input id={`b-${name}`} name={name} defaultValue={value ?? ""} {...props} />
    </div>
  )
  const area = (name: string, label: string, value: string | null | undefined) => (
    <div className="grid gap-2">
      <Label htmlFor={`b-${name}`}>{label}</Label>
      <textarea id={`b-${name}`} name={name} rows={3} defaultValue={value ?? ""} maxLength={5000} className={textarea} />
    </div>
  )

  return (
    <Page size="form">
      <PageHeader crumbs={[{ href: "/invoices", label: t("invoices.title") }, { label: t("common.settings") }]} title={t("common.settings")} />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />

      <form action={saveBilling} className="grid gap-6">
        <FormCard id="seller" title={t("invoices.seller")}>
          {field("legal_name", t("invoices.legalName"), b?.legal_name ?? ctx.org.name, { required: true, maxLength: 200 })}
          {field("street", t("contacts.street"), b?.street, { maxLength: 200 })}
          <div className="grid grid-cols-[minmax(0,7rem)_1fr] gap-4">
            <div className="grid content-start gap-2">
              <Label htmlFor="b-postal_code">{t("contacts.postalCode")}</Label>
              <TypedInput kind="postcode" id="b-postal_code" name="postal_code" defaultValue={b?.postal_code ?? ""} />
            </div>
            {field("city", t("contacts.city"), b?.city, { maxLength: 100 })}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid content-start gap-2">
              <Label htmlFor="b-email">{t("contacts.email")}</Label>
              <TypedInput kind="email" id="b-email" name="email" defaultValue={b?.email ?? ""} />
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="b-phone">{t("contacts.phone")}</Label>
              <TypedInput kind="phone" id="b-phone" name="phone" defaultValue={b?.phone ?? ""} />
            </div>
            {field("website", t("invoices.website"), b?.website, { maxLength: 200 })}
          </div>
          {field("representatives", t("invoices.representatives"), b?.representatives, { maxLength: 300, placeholder: t("invoices.representativesPlaceholder") })}
          {field("register", t("invoices.register"), b?.register, { maxLength: 200, placeholder: "Amtsgericht Köln, VR 12345" })}
        </FormCard>

        <FormCard id="tax" title={t("invoices.taxSection")}>
          <div className="grid gap-2">
            <Label htmlFor="b-tax_mode">{t("invoices.taxStatus")}</Label>
            <Choice id="b-tax_mode" name="tax_mode" label={t("invoices.taxStatus")} required defaultValue={b?.tax_mode ?? "standard"} options={(["standard", "small_business"] as const).map((x) => ({ value: x, label: t(`invoices.taxModes.${x}`) }))} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("tax_number", t("invoices.taxNumber"), b?.tax_number, { maxLength: 50, placeholder: "214/5678/1234" })}
            {field("vat_id", t("invoices.vatId"), b?.vat_id, { maxLength: 20, placeholder: "DE123456789" })}
          </div>
          <p className="text-sm text-muted-foreground">{t("invoices.taxHint")}</p>
        </FormCard>

        <FormCard id="bank" title={t("invoices.bank")}>
          {field("bank_name", t("invoices.bankName"), b?.bank_name, { maxLength: 100 })}
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <div className="grid content-start gap-2">
              <Label htmlFor="b-iban">IBAN</Label>
              <TypedInput kind="iban" id="b-iban" name="iban" defaultValue={b?.iban ?? ""} />
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="b-bic">BIC</Label>
              <TypedInput kind="bic" id="b-bic" name="bic" defaultValue={b?.bic ?? ""} />
            </div>
          </div>
        </FormCard>

        <FormCard id="defaults" title={t("invoices.defaults")}>
          <div className="grid gap-4 sm:grid-cols-3">
            {field("payment_days", t("invoices.paymentDays"), String(b?.payment_days ?? 14), { type: "number", min: 0, max: 365, className: "max-w-32" })}
            {field("quote_days", t("invoices.quoteDays"), String(b?.quote_days ?? 30), { type: "number", min: 1, max: 365, className: "max-w-32" })}
            <div className="grid gap-2">
              <Label htmlFor="b-template">{t("invoices.template")}</Label>
              <NativeSelect id="b-template" name="template" defaultValue={b?.template ?? "classic"} className="w-full">
                {TEMPLATES.map((x) => (
                  <NativeSelectOption key={x} value={x}>
                    {t.dynamic(`invoices.templates.${x}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
          {area("invoice_intro", t("invoices.invoiceIntro"), b?.invoice_intro)}
          {area("invoice_outro", t("invoices.invoiceOutro"), b?.invoice_outro)}
          {area("quote_intro", t("invoices.quoteIntro"), b?.quote_intro)}
          {area("quote_outro", t("invoices.quoteOutro"), b?.quote_outro)}
        </FormCard>
        <SaveBar />
      </form>

      <FormCard id="numbers" title={t("invoices.numberRanges")} description={t("invoices.numberHint")}>
        {(["invoice", "quote"] as const).map((kind) => (
          <NumberRangeForm key={kind} t={t} kind={kind} range={ranges?.find((x) => x.kind === kind)} label={t.dynamic(`invoices.kinds.${kind}`)} action={saveNumberRange} />
        ))}
      </FormCard>
    </Page>
  )
}

export const instant = false
