import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon } from "lucide-react"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Separator } from "@/components/ui/separator"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param } from "@/lib/url"
import { TEMPLATES } from "@/documents/templates"
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
    <div className="grid max-w-3xl gap-6">
      <div className="grid gap-1">
        <Link href="/invoices" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> {t("invoices.title")}
        </Link>
        <h1 className="font-heading text-2xl font-semibold">{t("invoices.settings")}</h1>
      </div>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />

      <form action={saveBilling} className="grid gap-6">
        <section className="grid gap-4" aria-labelledby="seller">
          <h2 id="seller" className="font-medium">
            {t("invoices.seller")}
          </h2>
          {field("legal_name", t("invoices.legalName"), b?.legal_name ?? ctx.org.name, { required: true, maxLength: 200 })}
          {field("street", t("contacts.street"), b?.street, { maxLength: 200 })}
          <div className="grid grid-cols-[minmax(0,7rem)_1fr] gap-4">
            {field("postal_code", t("contacts.postalCode"), b?.postal_code, { maxLength: 20 })}
            {field("city", t("contacts.city"), b?.city, { maxLength: 100 })}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {field("email", t("contacts.email"), b?.email, { type: "email" })}
            {field("phone", t("contacts.phone"), b?.phone, { maxLength: 50 })}
            {field("website", t("invoices.website"), b?.website, { maxLength: 200 })}
          </div>
          {field("representatives", t("invoices.representatives"), b?.representatives, { maxLength: 300, placeholder: t("invoices.representativesPlaceholder") })}
          {field("register", t("invoices.register"), b?.register, { maxLength: 200, placeholder: "Amtsgericht Köln, VR 12345" })}
        </section>
        <Separator />

        <section className="grid gap-4" aria-labelledby="tax">
          <h2 id="tax" className="font-medium">
            {t("invoices.taxSection")}
          </h2>
          <div className="grid gap-2">
            <Label htmlFor="b-tax_mode">{t("invoices.taxStatus")}</Label>
            <NativeSelect id="b-tax_mode" name="tax_mode" defaultValue={b?.tax_mode ?? "standard"} className="w-full">
              <NativeSelectOption value="standard">{t("invoices.taxModes.standard")}</NativeSelectOption>
              <NativeSelectOption value="small_business">{t("invoices.taxModes.small_business")}</NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("tax_number", t("invoices.taxNumber"), b?.tax_number, { maxLength: 50, placeholder: "214/5678/1234" })}
            {field("vat_id", t("invoices.vatId"), b?.vat_id, { maxLength: 20, placeholder: "DE123456789" })}
          </div>
          <p className="text-xs text-muted-foreground">{t("invoices.taxHint")}</p>
        </section>
        <Separator />

        <section className="grid gap-4" aria-labelledby="bank">
          <h2 id="bank" className="font-medium">
            {t("invoices.bank")}
          </h2>
          {field("bank_name", t("invoices.bankName"), b?.bank_name, { maxLength: 100 })}
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            {field("iban", "IBAN", b?.iban, { maxLength: 42 })}
            {field("bic", "BIC", b?.bic, { maxLength: 11 })}
          </div>
        </section>
        <Separator />

        <section className="grid gap-4" aria-labelledby="defaults">
          <h2 id="defaults" className="font-medium">
            {t("invoices.defaults")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {field("payment_days", t("invoices.paymentDays"), String(b?.payment_days ?? 14), { type: "number", min: 0, max: 365 })}
            {field("quote_days", t("invoices.quoteDays"), String(b?.quote_days ?? 30), { type: "number", min: 1, max: 365 })}
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
        </section>
        <SubmitButton className="justify-self-start">{t("common.save")}</SubmitButton>
      </form>
      <Separator />

      <section className="grid gap-4" aria-labelledby="numbers">
        <h2 id="numbers" className="font-medium">
          {t("invoices.numberRanges")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("invoices.numberHint")}</p>
        {(["invoice", "quote"] as const).map((kind) => {
          const r = ranges?.find((x) => x.kind === kind)
          return (
            <form key={kind} action={saveNumberRange} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_8rem_auto_auto] sm:items-end">
              <input type="hidden" name="kind" value={kind} />
              <div className="grid gap-2">
                <Label htmlFor={`n-${kind}`}>{t.dynamic(`invoices.kinds.${kind}`)}</Label>
                <Input id={`n-${kind}`} name="format" defaultValue={r?.format ?? (kind === "invoice" ? "RE-{YYYY}-{NNNN}" : "AN-{YYYY}-{NNNN}")} required className="font-mono" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`nn-${kind}`}>{t("invoices.nextNumber")}</Label>
                <Input id={`nn-${kind}`} name="next_number" type="number" min={1} defaultValue={r?.next_number ?? 1} />
              </div>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input type="checkbox" name="yearly_reset" value="1" defaultChecked={r?.yearly_reset ?? true} className="size-4" />
                {t("invoices.yearlyReset")}
              </label>
              <SubmitButton variant="outline" size="sm">
                {t("common.save")}
              </SubmitButton>
            </form>
          )
        })}
      </section>
    </div>
  )
}

export const instant = false
