import Link from "next/link"
import { notFound } from "next/navigation"
import { DataTable, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { pageParam, param, withParams } from "@/lib/url"
import { createTestPayment, refund } from "./actions"

const STATUSES = ["open", "paid", "partially_refunded", "refunded", "failed", "expired"]

export default async function PaymentsPage({ searchParams }: PageProps<"/payments">) {
  const ctx = await requirePerm("payments.view")
  if (!ctx.modules.has("payments")) notFound()
  const t = await getT()
  const sp = await searchParams
  const q = param(sp, "q")?.replace(/[%,()*]/g, "").trim()
  const status = param(sp, "status")
  const page = pageParam(sp)
  const editId = param(sp, "edit")
  const testing = ctx.isPlatformAdmin && param(sp, "new") === "test"

  let query = ctx.supabase
    .from("pay_orders")
    .select("id, created_at, customer_email, customer_name, source_module, amount_total, currency, status")
    .eq("org_id", ctx.org.id)
    .order("created_at", { ascending: false })
    .range(...pageRange(page))
  if (q) query = query.or(`customer_email.ilike.%${q}%,customer_name.ilike.%${q}%`)
  if (status && STATUSES.includes(status)) query = query.eq("status", status)
  const [{ data }, { data: stripeRow }] = await Promise.all([
    query,
    ctx.supabase.from("org_integrations").select("status").eq("org_id", ctx.org.id).eq("provider", "stripe").maybeSingle(),
  ])
  const rows = data?.slice(0, PAGE_SIZE) ?? []
  const canSeeIntegrations = ctx.can("org.integrations.manage")

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">{t("payments.title")}</h1>
        {ctx.isPlatformAdmin && (
          <Button render={<Link href={withParams(sp, { new: "test", edit: undefined })} scroll={false} />} nativeButton={false} size="sm" variant="outline">
            {t("payments.testPayment")}
          </Button>
        )}
      </div>

      {canSeeIntegrations && stripeRow?.status !== "connected" && (
        <p className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted px-3 py-2 text-sm">
          {stripeRow?.status === "pending" ? t("payments.notReady") : t("payments.notConnected")}
          <Link href="/settings/integrations" className="font-medium underline underline-offset-4">
            {t("payments.toIntegrations")}
          </Link>
        </p>
      )}
      <Notice error={!editId && !testing ? param(sp, "error") : undefined} ok={!editId ? param(sp, "ok") : undefined} />

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox q={q} label={t("common.search")} />
        <nav aria-label={t("payments.status")} className="flex flex-wrap gap-1.5">
          {[undefined, ...STATUSES].map((s) => (
            <Link
              key={s ?? "all"}
              href={withParams(sp, { status: s, page: undefined, edit: undefined })}
              aria-current={s === status ? "true" : undefined}
              className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground aria-[current=true]:bg-primary aria-[current=true]:text-primary-foreground"
            >
              {s ? t.dynamic(`payments.statuses.${s}`) : t("payments.all")}
            </Link>
          ))}
        </nav>
      </div>

      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => withParams(sp, { edit: r.id, new: undefined })}
        empty={t("payments.empty")}
        columns={[
          { header: t("payments.date"), cell: (r) => t.date(r.created_at, { dateStyle: "medium", timeStyle: "short" }) },
          { header: t("payments.customer"), cell: (r) => r.customer_name || r.customer_email || "–" },
          { header: t("payments.what"), cell: (r) => t.dynamic(`payments.sources.${r.source_module}`) },
          { header: t("payments.amount"), cell: (r) => t.money(r.amount_total, r.currency), className: "text-right tabular-nums" },
          { header: t("payments.status"), cell: (r) => <StatusBadge t={t} status={r.status} /> },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />

      {editId && <OrderSheet t={t} orderId={editId} canRefund={ctx.can("payments.refund")} error={param(sp, "error")} ok={param(sp, "ok")} />}

      {testing && (
        <UrlSheet params={["new"]} title={t("payments.testPayment")} description={t("payments.testHelp")}>
          <form action={createTestPayment} className="grid gap-4">
            <Notice error={param(sp, "error")} />
            <div className="grid gap-2">
              <Label htmlFor="test-amount">{t("payments.testAmount")}</Label>
              <Input id="test-amount" name="amount" inputMode="decimal" defaultValue="1,00" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="test-email">{t("payments.testEmail")}</Label>
              <Input id="test-email" name="email" type="email" />
            </div>
            <Button type="submit">{t("payments.startCheckout")}</Button>
          </form>
        </UrlSheet>
      )}
    </div>
  )
}

function StatusBadge({ t, status }: { t: T; status: string }) {
  const variant = status === "paid" || status === "succeeded" ? "default" : status === "failed" ? "destructive" : status === "open" || status === "pending" ? "outline" : "secondary"
  return <Badge variant={variant}>{t.dynamic(`payments.statuses.${status}`)}</Badge>
}

async function OrderSheet({ t, orderId, canRefund, error, ok }: { t: T; orderId: string; canRefund: boolean; error?: string; ok?: string }) {
  const ctx = await requirePerm("payments.view")
  const { data: order } = await ctx.supabase
    .from("pay_orders")
    .select("*, pay_order_items(*), pay_payments(*, pay_refunds(*))")
    .eq("id", orderId)
    .eq("org_id", ctx.org.id)
    .maybeSingle()
  if (!order) return null
  const refunds = order.pay_payments.flatMap((p) => p.pay_refunds)
  const refundable = canRefund && ["paid", "partially_refunded"].includes(order.status)

  return (
    <UrlSheet params={["edit"]} title={`${t("payments.order")} · ${t.money(order.amount_total, order.currency)}`} description={order.customer_email ?? undefined}>
      <Notice error={error} ok={ok} />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">{t("payments.status")}</dt>
        <dd><StatusBadge t={t} status={order.status} /></dd>
        <dt className="text-muted-foreground">{t("payments.what")}</dt>
        <dd>{t.dynamic(`payments.sources.${order.source_module}`)}</dd>
        <dt className="text-muted-foreground">{t("payments.date")}</dt>
        <dd>{t.date(order.created_at, { dateStyle: "medium", timeStyle: "short" })}</dd>
        {order.paid_at && (
          <>
            <dt className="text-muted-foreground">{t("payments.paidAt")}</dt>
            <dd>{t.date(order.paid_at, { dateStyle: "medium", timeStyle: "short" })}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{t("payments.fee")}</dt>
        <dd className="tabular-nums">{t.money(order.application_fee, order.currency)}</dd>
      </dl>

      <section className="grid gap-2">
        <h3 className="font-medium">{t("payments.items")}</h3>
        <ul className="grid divide-y rounded-lg border text-sm">
          {order.pay_order_items.map((i) => (
            <li key={i.id} className="flex justify-between gap-2 px-3 py-2">
              <span>{i.quantity} × {i.description}</span>
              <span className="tabular-nums">{t.money(i.quantity * i.unit_amount, order.currency)}</span>
            </li>
          ))}
          <li className="flex justify-between gap-2 px-3 py-2 font-medium">
            <span>{t("payments.total")}</span>
            <span className="tabular-nums">{t.money(order.amount_total, order.currency)}</span>
          </li>
        </ul>
      </section>

      {order.pay_payments.length > 0 && (
        <section className="grid gap-2">
          <h3 className="font-medium">{t("payments.payments")}</h3>
          <ul className="grid divide-y rounded-lg border text-sm">
            {order.pay_payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0 truncate">{p.provider} · {t.date(p.created_at, { dateStyle: "short", timeStyle: "short" })}</span>
                <StatusBadge t={t} status={p.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {refunds.length > 0 && (
        <section className="grid gap-2">
          <h3 className="font-medium">{t("payments.refunds")}</h3>
          <ul className="grid divide-y rounded-lg border text-sm">
            {refunds.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="tabular-nums">{t.money(r.amount, order.currency)}{r.reason ? ` · ${r.reason}` : ""}</span>
                <StatusBadge t={t} status={r.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {refundable && (
        <form action={refund.bind(null, order.id)} className="grid gap-3 rounded-lg border p-3">
          <h3 className="font-medium">{t("payments.refund")}</h3>
          <div className="grid gap-2">
            <Label htmlFor="refund-amount">{t("payments.refundAmount")}</Label>
            <Input id="refund-amount" name="amount" inputMode="decimal" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="refund-reason">{t("payments.refundReason")}</Label>
            <Input id="refund-reason" name="reason" maxLength={200} />
          </div>
          <Button type="submit" variant="destructive" className="justify-self-start">
            {t("payments.refund")}
          </Button>
        </form>
      )}
    </UrlSheet>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
