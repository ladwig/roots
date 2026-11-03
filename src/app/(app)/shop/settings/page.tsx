import Link from "next/link"
import { notFound } from "next/navigation"
import { Notice } from "@/components/notice"
import { FormCard, Page, PageHeader } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { TypedInput } from "@/components/typed-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param } from "@/lib/url"
import { COUNTRIES, EU, MAIL_KINDS, readShippingRates } from "@/shop/fields"
import { MultiSelect } from "@/components/multi-select"
import { onlineReady, shopSettings } from "@/shop/server"
import { priceInput } from "@/tickets/price"
import { saveShopSettings } from "../actions"

const textarea =
  "rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"

// Shop settings: page title, payment methods, pickup + shipping, invoices, legal texts, which mails go out.
export default async function ShopSettingsPage({ searchParams }: PageProps<"/shop/settings">) {
  const ctx = await requirePerm("shop.manage")
  if (!ctx.modules.has("shop")) notFound()
  const t = await getT()
  const sp = await searchParams
  const [s, ready, { data: bank }] = await Promise.all([
    shopSettings(ctx.org.id),
    onlineReady(ctx.org.id),
    ctx.modules.has("invoices") ? ctx.supabase.from("org_billing").select("iban").eq("org_id", ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const rates = readShippingRates(s.shipping_rates)
  // Country picker: "EU" (all members) first, then every country by its name in the reader's language.
  const names = new Intl.DisplayNames([t.locale], { type: "region" })
  const countryOptions = [{ value: "EU", label: t("store.allEu") }, ...COUNTRIES.map((c) => ({ value: c, label: `${names.of(c) ?? c} (${c})` })).sort((a, b) => a.label.localeCompare(b.label, t.locale))]
  const shown = (cs: string[]) => (EU.every((c) => cs.includes(c)) ? ["EU", ...cs.filter((c) => !EU.includes(c))] : cs)
  const mails = (s.mails ?? {}) as Record<string, { off?: boolean; message?: string }>
  const check = (name: string, on: boolean, label: string, hint?: React.ReactNode) => (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name={name} value="1" defaultChecked={on} className="mt-0.5 size-4 accent-primary" />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  )
  const area = (name: string, label: string, value: string | null, rows = 3, hint?: string) => (
    <div className="grid gap-2">
      <Label htmlFor={`s-${name}`}>{label}</Label>
      <textarea id={`s-${name}`} name={name} rows={rows} defaultValue={value ?? ""} className={textarea} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )

  return (
    <Page size="form">
      <PageHeader crumbs={[{ href: "/shop", label: t("store.nav") }, { label: t("common.settings") }]} title={t("common.settings")} />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <form action={saveShopSettings} className="grid gap-6">
        <FormCard id="page" title={t("store.settingsPage")}>
          <div className="grid gap-2">
            <Label htmlFor="s-title">{t("store.shopPageTitle")}</Label>
            <Input id="s-title" name="title" maxLength={200} defaultValue={s.title ?? ""} placeholder={t("store.shopTitle")} />
          </div>
          {area("intro", t("store.intro"), s.intro)}
        </FormCard>

        <FormCard id="payment" title={t("store.payment")}>
          {check("pay_online", s.pay_online, t("store.payments.online"), ready ? t("store.onlineReady") : <Link href="/settings/integrations" className="underline">{t("store.onlineNotReady")}</Link>)}
          {check("pay_transfer", s.pay_transfer, t("store.payments.transfer"), bank?.iban ? t("store.transferHint") : <Link href="/invoices/settings" className="underline">{t("store.transferNoIban")}</Link>)}
          <div className="grid max-w-48 gap-2 pl-6">
            <Label htmlFor="s-days">{t("store.transferDays")}</Label>
            <TypedInput kind="number" id="s-days" name="transfer_days" min={1} max={60} defaultValue={s.transfer_days} />
          </div>
          {check("pay_on_pickup", s.pay_on_pickup, t("store.payments.pickup"), t("store.payOnPickupHint"))}
        </FormCard>

        <FormCard id="delivery" title={t("store.delivery")}>
          {check("pickup", s.pickup, t("store.deliveries.pickup"))}
          {area("pickup_text", t("store.pickupText"), s.pickup_text, 2, t("store.pickupTextHint"))}
          {check("shipping", s.shipping, t("store.deliveries.shipping"), t("store.shippingHint"))}
          <div className="grid gap-2">
            <p className="text-sm font-medium">{t("store.shippingRates")}</p>
            <div className="hidden grid-cols-[1fr_6rem_6rem] gap-2 text-xs text-muted-foreground sm:grid">
              <span>{t("store.rateName")}</span>
              <span>{t("store.price")}</span>
              <span>{t("store.freeFromLabel")}</span>
            </div>
            {[...rates, null, null].map((r, i) => (
              <div key={r?.id ?? `new-${i}`} className="grid grid-cols-2 gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_6rem_6rem]">
                <input type="hidden" name="rate_id" value={r?.id ?? ""} />
                <Input name="rate_name" defaultValue={r?.name ?? ""} maxLength={100} placeholder={t("store.ratePlaceholder")} aria-label={t("store.rateName")} className="col-span-2 sm:col-span-1" />
                <TypedInput kind="money" name="rate_price" defaultValue={r ? priceInput(r.cents) : ""} aria-label={t("store.price")} />
                <TypedInput kind="money" name="rate_free" defaultValue={r?.free_from ? priceInput(r.free_from) : ""} placeholder="–" aria-label={t("store.freeFromLabel")} />
                <div className="col-span-2 sm:col-span-3">
                  <MultiSelect name="rate_countries" joined options={countryOptions} defaultValue={shown(r?.countries ?? ["DE"])} placeholder={t("store.countries")} max={250} />
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">{t("store.ratesHint")}</p>
          </div>
        </FormCard>

        <FormCard id="invoices" title={t("store.invoice")}>
          {ctx.modules.has("invoices")
            ? check("auto_invoice", s.auto_invoice, t("store.autoInvoice"), t("store.autoInvoiceHint"))
            : <p className="text-sm text-muted-foreground">{t("store.invoicesModuleOff")}</p>}
          {!ctx.modules.has("invoices") && <input type="hidden" name="auto_invoice" value={s.auto_invoice ? "1" : ""} />}
        </FormCard>

        <FormCard id="mails" title={t("store.mails")} description={t("store.mailsHint")}>
          {MAIL_KINDS.map((k) => (
            <div key={k} className="grid gap-2 rounded-lg border p-3">
              {check(`mail_${k}`, !mails[k]?.off, t.dynamic(`store.mailKinds.${k}`), t.dynamic(`store.mailWhen.${k}`))}
              <textarea
                name={`mail_${k}_message`}
                rows={2}
                maxLength={2000}
                defaultValue={mails[k]?.message ?? ""}
                placeholder={t.dynamic(`store.mail.${k}.message`, { number: "{number}", name: "{name}", total: "{total}", org: "{org}" })}
                aria-label={t("store.mailText")}
                className={textarea}
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">{t("store.mailTemplateHint")}</p>
        </FormCard>

        <FormCard id="legal" title={t("store.legal")} description={t("store.legalHint")}>
          {area("terms", t("store.terms"), s.terms, 6)}
          {area("withdrawal", t("store.withdrawal"), s.withdrawal, 6)}
        </FormCard>
        <SaveBar />
      </form>
    </Page>
  )
}

export const instant = false
