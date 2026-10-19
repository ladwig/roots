import Link from "next/link"
import { ChevronLeftIcon, ChevronRightIcon, Trash2Icon } from "lucide-react"
import { monthOverview, thisMonth, type PriceRow } from "@/billing/server"
import { FREE, monthRange, type Price } from "@/billing/pricing"
import { DataTable } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { FormCard } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { SubmitButton } from "@/components/submit-button"
import { TypedInput } from "@/components/typed-input"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { formatMoney } from "@/lib/inputs"
import { requirePlatformAdmin } from "@/lib/context"
import { param } from "@/lib/url"
import { modules } from "@/modules/registry"
import { deletePrice, savePrice } from "./actions"

const shift = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

// What roots charges each org per month: price (own or default, from a month on), usage, bill. Prices change only
// from the next month on; the running month and the past stay as billed.
export default async function AdminBilling({ searchParams }: PageProps<"/admin/billing">) {
  const { supabase } = await requirePlatformAdmin()
  const t = await getT()
  const sp = await searchParams
  const now = thisMonth()
  const month = /^\d{4}-\d{2}$/.test(param(sp, "month") ?? "") ? param(sp, "month")! : now
  const rows = await monthOverview(supabase, month)
  const editing = param(sp, "price")
  const { data: defaults } = await supabase.from("org_prices").select("*").is("org_id", null).order("starts_on")
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0)
  const label = (m: string) => t.date(`${m}-15`, { month: "long", year: "numeric" })
  const href = (extra: Record<string, string>) => `/admin/billing?${new URLSearchParams({ month, ...extra })}`

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">{t("admin.billing.title")}</h1>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label={t("admin.billing.prev")} render={<Link href={`/admin/billing?month=${shift(month, -1)}`} />} nativeButton={false}>
            <ChevronLeftIcon />
          </Button>
          <span className="min-w-36 text-center text-sm font-medium">
            {label(month)}
            {month === now && <span className="text-muted-foreground"> · {t("admin.billing.running")}</span>}
          </span>
          <Button variant="outline" size="icon-sm" aria-label={t("admin.billing.next")} render={<Link href={`/admin/billing?month=${shift(month, 1)}`} />} nativeButton={false}>
            <ChevronRightIcon />
          </Button>
          <Button variant="outline" size="sm" className="ml-2" render={<Link href={href({ price: "default" })} />} nativeButton={false}>
            {t("admin.billing.defaultPrice")}
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{t("admin.billing.intro")}</p>
      <Notice error={!editing ? param(sp, "error") : undefined} ok={param(sp, "ok")} />

      <dl className="grid gap-3 sm:grid-cols-4">
        <Stat label={t("admin.billing.totalDue")} value={t.money(sum((r) => r.bill.total))} strong />
        <Stat label={t("admin.billing.feesOpen")} value={t.money(sum((r) => r.bill.feesOpen))} />
        <Stat label={t("admin.billing.feesCollected")} value={t.money(sum((r) => Number(r.usage.fees_collected_cents)))} />
        <Stat label={t("admin.billing.sales")} value={t.money(sum((r) => Number(r.usage.sales_cents)))} />
      </dl>

      <DataTable
        rows={rows}
        rowKey={(r) => r.org.id}
        rowHref={(r) => href({ price: r.org.id })}
        empty={null}
        columns={[
          {
            header: t("admin.billing.org"),
            cell: (r) => (
              <span className="grid gap-0.5">
                <span className="font-medium">{r.org.name}</span>
                <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  <Badge variant={r.priceSource === "own" ? "default" : "outline"}>{t.dynamic(`admin.billing.source.${r.priceSource}`)}</Badge>
                  {r.price.discount_percent === 100 ? t("admin.billing.free") : summary(t, r.price)}
                </span>
              </span>
            ),
          },
          { header: t("admin.billing.subscription"), cell: (r) => money(t, r.bill.subscription), className: "tabular-nums text-right" },
          { header: t("admin.billing.usersMembers"), cell: (r) => `${r.usage.users} / ${r.usage.members}`, className: "tabular-nums text-right" },
          { header: t("admin.billing.salesCol"), cell: (r) => (r.usage.orders ? `${r.usage.orders} · ${t.money(Number(r.usage.sales_cents))}` : "–"), className: "tabular-nums text-right" },
          { header: t("admin.billing.feesCollectedShort"), cell: (r) => money(t, Number(r.usage.fees_collected_cents)), className: "tabular-nums text-right" },
          { header: t("admin.billing.feesOpenShort"), cell: (r) => money(t, r.bill.feesOpen), className: "tabular-nums text-right" },
          { header: t("admin.billing.discount"), cell: (r) => (r.bill.discount ? `−${t.money(r.bill.discount)}` : "–"), className: "tabular-nums text-right" },
          { header: t("admin.billing.total"), cell: (r) => <span className="font-medium">{t.money(r.bill.total)}</span>, className: "tabular-nums text-right" },
        ]}
      />
      <p className="text-xs text-muted-foreground">{t("admin.billing.footnote")}</p>

      {editing && (
        <UrlSheet params={["price", "error"]} title={editing === "default" ? t("admin.billing.defaultPrice") : (rows.find((r) => r.org.id === editing)?.org.name ?? "")} wide>
          <Notice error={param(sp, "error")} />
          <PriceEditor
            t={t}
            target={editing}
            view={month}
            history={editing === "default" ? (defaults ?? []) : (rows.find((r) => r.org.id === editing)?.ownPrices ?? [])}
            fallback={editing === "default" ? null : (defaults ?? []).filter((d) => d.starts_on <= monthRange(now).from).at(-1) ?? null}
          />
        </UrlSheet>
      )}
    </>
  )
}

const money = (t: T, cents: number) => (cents ? t.money(cents) : "–")

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="grid gap-1 rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={strong ? "text-xl font-semibold tabular-nums" : "text-lg tabular-nums"}>{value}</dd>
    </div>
  )
}

/** "20,00 €/Monat · Module 15,00 € · 3,00 €/Nutzer ab 4 · 1,5 % + 0,25 € je Verkauf · −50 %" */
function summary(t: T, p: Price | PriceRow) {
  const mods = Object.values((p.module_cents ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0)
  const parts = [
    p.base_cents && t("admin.billing.sumBase", { amount: t.money(p.base_cents) }),
    mods && t("admin.billing.sumModules", { amount: t.money(mods) }),
    p.user_cents && t("admin.billing.sumUsers", { amount: t.money(p.user_cents), from: p.included_users + 1 }),
    p.member_cents && t("admin.billing.sumMembers", { amount: t.money(p.member_cents), from: p.included_members + 1 }),
    (Number(p.sales_percent) || p.sales_fixed_cents) && t("admin.billing.sumSales", { percent: String(Number(p.sales_percent)).replace(".", ","), fixed: t.money(p.sales_fixed_cents) }),
    p.discount_percent && `−${p.discount_percent} %`,
  ].filter(Boolean)
  return parts.length ? parts.join(" · ") : t("admin.billing.free")
}

function PriceEditor({ t, target, view, history, fallback }: { t: T; target: string; view: string; history: PriceRow[]; fallback: PriceRow | null }) {
  const now = thisMonth()
  const future = Array.from({ length: 12 }, (_, i) => shift(now, i + 1))
  const start: Price | PriceRow = history.at(-1) ?? fallback ?? FREE
  const mc = (start.module_cents ?? {}) as Record<string, number>
  const m = (c: number) => (c ? formatMoney(c) : "")
  return (
    <div className="grid gap-6">
      <FormCard title={t("admin.billing.history")} description={target === "default" ? t("admin.billing.defaultHint") : t("admin.billing.ownHint")}>
        {history.length ? (
          <ul className="grid divide-y rounded-lg border text-sm">
            {[...history].reverse().map((h) => (
              <li key={h.id} className="flex items-start gap-3 px-3 py-2">
                <span className="w-32 shrink-0 font-medium">{t("admin.billing.from", { month: t.date(h.starts_on, { month: "long", year: "numeric" }) })}</span>
                <span className="min-w-0 flex-1 text-muted-foreground">
                  {summary(t, h)}
                  {h.note && <span className="block text-xs">{h.note}</span>}
                </span>
                {h.starts_on > monthRange(now).from && (
                  <form action={deletePrice}>
                    <input type="hidden" name="id" value={h.id} />
                    <input type="hidden" name="org" value={target} />
                    <input type="hidden" name="view" value={view} />
                    <SubmitButton size="icon-sm" variant="ghost" aria-label={t("admin.billing.deletePlanned")} data-confirm="admin.billing.confirmDelete">
                      <Trash2Icon />
                    </SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{target === "default" ? t("admin.billing.noDefault") : t("admin.billing.usesDefault")}</p>
        )}
      </FormCard>

      <form action={savePrice} className="grid gap-6">
        <input type="hidden" name="org" value={target} />
        <input type="hidden" name="view" value={view} />
        <FormCard title={t("admin.billing.newPrice")} description={t("admin.billing.newPriceHint")}>
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor="p-month">{t("admin.billing.validFrom")}</Label>
            <NativeSelect id="p-month" name="month" defaultValue={future[0]} className="w-full">
              {future.map((f) => (
                <NativeSelectOption key={f} value={f}>
                  {t.date(`${f}-15`, { month: "long", year: "numeric" })}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </FormCard>
        <FormCard title={t("admin.billing.monthly")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Money id="p-base" name="base" label={t("admin.billing.base")} value={m(start.base_cents)} />
            <div />
            <Money id="p-user" name="user" label={t("admin.billing.perUser")} value={m(start.user_cents)} />
            <Num id="p-iu" name="included_users" label={t("admin.billing.includedUsers")} value={start.included_users} />
            <Money id="p-member" name="member" label={t("admin.billing.perMember")} value={m(start.member_cents)} />
            <Num id="p-im" name="included_members" label={t("admin.billing.includedMembers")} value={start.included_members} />
          </div>
        </FormCard>
        <FormCard title={t("admin.billing.modules")} description={t("admin.billing.modulesHint")}>
          <div className="grid gap-3 sm:grid-cols-3">
            {modules.map((mod) => (
              <Money key={mod.key} id={`p-mod-${mod.key}`} name={`module.${mod.key}`} label={t.dynamic(`modules.${mod.key}.name`)} value={m(mc[mod.key] ?? 0)} />
            ))}
          </div>
        </FormCard>
        <FormCard title={t("admin.billing.salesFee")} description={t("admin.billing.salesFeeHint")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Num id="p-sp" name="sales_percent" label={t("admin.billing.salesPercent")} value={String(Number(start.sales_percent)).replace(".", ",")} decimal />
            <Money id="p-sf" name="sales_fixed" label={t("admin.billing.salesFixed")} value={m(start.sales_fixed_cents)} />
          </div>
        </FormCard>
        <FormCard title={t("admin.billing.discountTitle")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Num id="p-d" name="discount_percent" label={t("admin.billing.discountPercent")} value={start.discount_percent} />
            <div className="grid gap-2">
              <Label htmlFor="p-note">{t("admin.billing.note")}</Label>
              <Input id="p-note" name="note" maxLength={500} placeholder={t("admin.billing.notePlaceholder")} />
            </div>
          </div>
        </FormCard>
        <SaveBar label={t("admin.billing.savePrice")} always />
      </form>
    </div>
  )
}

function Money({ id, name, label, value }: { id: string; name: string; label: string; value: string }) {
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={id}>{label}</Label>
      <TypedInput kind="money" id={id} name={name} defaultValue={value} placeholder="0,00" />
    </div>
  )
}

function Num({ id, name, label, value, decimal }: { id: string; name: string; label: string; value: number | string; decimal?: boolean }) {
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} inputMode={decimal ? "decimal" : "numeric"} defaultValue={String(value)} className="tabular-nums" />
    </div>
  )
}

export const instant = false
