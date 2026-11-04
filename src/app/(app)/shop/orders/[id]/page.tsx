import Link from "next/link"
import { notFound } from "next/navigation"
import { BanIcon, MailIcon, Undo2Icon } from "lucide-react"
import { ActionsMenu, MenuSeparator, MenuSubmit } from "@/components/actions-menu"
import { Notice } from "@/components/notice"
import { FormCard, Page, PageHeader, RecordLayout } from "@/components/page"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { UrlSheet } from "@/components/url-sheet"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { MAIL_KINDS } from "@/shop/fields"
import { RefundForm } from "./refund-form"
import { cancelOrderAction, invoiceAction, markPaidAction, orderStatusAction, resendMailAction } from "../../actions"

// One shop order: items, delivery, buyer, payment, invoice, and the next step (ready / shipped / done).
export default async function OrderPage({ params, searchParams }: PageProps<"/shop/orders/[id]">) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const ctx = await requirePerm("shop.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("shop.manage")
  const { data: o } = await ctx.supabase
    .from("shop_orders")
    .select("*, contacts(id, first_name, last_name), documents(id, number, status), pay_orders!inner(id, status, amount_total, currency, customer_email, expires_at, paid_at, provider, pay_order_items(id, description, quantity, refunded_quantity, unit_amount), pay_payments(amount, status, pay_refunds(id, amount, status, reason, created_at)))")
    .eq("id", id)
    .eq("org_id", ctx.org.id)
    .maybeSingle()
  if (!o) notFound()
  const pay = o.pay_orders
  const cur = pay.currency
  const paid = ["paid", "partially_refunded"].includes(pay.status)
  const live = o.status !== "cancelled"
  const payment = pay.pay_payments.find((x) => x.status === "succeeded")
  const refunds = (payment?.pay_refunds ?? []).filter((r) => r.status !== "failed").sort((a, b) => a.created_at.localeCompare(b.created_at))
  const refundLeft = (payment?.amount ?? 0) - refunds.reduce((s, r) => s + r.amount, 0)
  const canRefund = live && paid && refundLeft > 0 && ctx.can("payments.refund")
  const hidden = <input type="hidden" name="id" value={o.id} />
  const step = (status: string, label: string, variant: "default" | "outline" = "default") => (
    <form action={orderStatusAction}>
      {hidden}
      <input type="hidden" name="status" value={status} />
      <SubmitButton size="sm" variant={variant}>
        {label}
      </SubmitButton>
    </form>
  )

  return (
    <Page size="record">
      <PageHeader
        crumbs={[{ href: "/shop/orders", label: t("store.orders") }, { label: `#${o.number}` }]}
        title={t("store.orderTitle", { number: String(o.number) })}
        badge={
          <span className="flex flex-wrap gap-1">
            <Badge variant={live ? "secondary" : "destructive"}>{t.dynamic(`store.orderStatus.${o.status}`)}</Badge>
            {live && <Badge variant={paid ? "secondary" : "outline"}>{paid ? t("store.paid") : t("store.unpaid")}</Badge>}
          </span>
        }
        meta={[o.placed_at && t.date(o.placed_at, { dateStyle: "medium", timeStyle: "short" }), t.dynamic(`store.payments.${o.payment}`), t.dynamic(`store.deliveries.${o.delivery}`)].filter(Boolean).join(" · ")}
        actions={
          canRefund && (
            <Button variant="outline" size="sm" render={<Link href={withParams(sp, { refund: "1" })} />}>
              <Undo2Icon /> {t("store.refund")}
            </Button>
          )
        }
        menu={
          canManage && (
            <ActionsMenu>
              {MAIL_KINDS.filter((k) => k !== "refunded" || refunds.length).map((k) => (
                <MenuSubmit key={k} form={`mail-${k}`} icon={<MailIcon />}>
                  {t("store.resendMail", { kind: t.dynamic(`store.mailKinds.${k}`) })}
                </MenuSubmit>
              ))}
              {live && ctx.can("payments.refund") && (
                <>
                  <MenuSeparator />
                  <MenuSubmit form="cancel-order" icon={<BanIcon />} destructive confirm={paid ? "store.confirmCancelPaid" : "store.confirmCancel"}>
                    {t("store.cancelOrder")}
                  </MenuSubmit>
                </>
              )}
            </ActionsMenu>
          )
        }
      />
      {canManage &&
        MAIL_KINDS.map((k) => (
          <form key={k} id={`mail-${k}`} action={resendMailAction} hidden>
            {hidden}
            <input type="hidden" name="kind" value={k} />
          </form>
        ))}
      {canManage && live && (
        <form id="cancel-order" action={cancelOrderAction} hidden>
          {hidden}
        </form>
      )}
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {canRefund && (
        <UrlSheet params={["refund"]} title={t("store.refundTitle", { number: String(o.number) })} meta={t("store.refundMeta", { paid: t.money(payment?.amount ?? 0, cur), left: t.money(refundLeft, cur) })}>
          <RefundForm
            orderId={o.id}
            items={pay.pay_order_items.map((i) => ({ id: i.id, description: i.description, left: i.quantity - i.refunded_quantity, unit: i.unit_amount }))}
            left={refundLeft}
            currency={cur}
            manual={o.payment !== "online"}
          />
        </UrlSheet>
      )}

      <RecordLayout
        aside={
          <>
            <FormCard title={t("store.buyer")}>
              <div className="grid gap-1 text-sm">
                {o.contacts ? (
                  <Link href={`/contacts/${o.contacts.id}`} className="font-medium underline-offset-4 hover:underline">
                    {o.name}
                  </Link>
                ) : (
                  <span className="font-medium">{o.name}</span>
                )}
                {o.company && <span>{o.company}</span>}
                {o.phone && (
                  <a href={`tel:${o.phone}`} className="text-muted-foreground underline-offset-4 hover:underline">
                    {o.phone}
                  </a>
                )}
                {pay.customer_email && (
                  <a href={`mailto:${pay.customer_email}`} className="text-muted-foreground underline-offset-4 hover:underline">
                    {pay.customer_email}
                  </a>
                )}
              </div>
            </FormCard>
            <FormCard title={t("store.payment")}>
              <p className="text-sm">
                {t.dynamic(`store.payments.${o.payment}`)} · {t.dynamic(`payments.statuses.${pay.status}`)}
                {pay.paid_at && <span className="block text-xs text-muted-foreground">{t.date(pay.paid_at, { dateStyle: "medium", timeStyle: "short" })}</span>}
                {!paid && live && o.payment === "transfer" && pay.expires_at && <span className="block text-xs text-muted-foreground">{t("store.heldUntil", { date: t.date(pay.expires_at, { dateStyle: "medium" }) })}</span>}
              </p>
              {canManage && live && !paid && o.payment !== "online" && (
                <form action={markPaidAction} className="flex flex-wrap gap-2">
                  {hidden}
                  <input type="hidden" name="method" value={o.payment === "transfer" ? "transfer" : "cash"} />
                  <SubmitButton size="sm">{o.payment === "transfer" ? t("store.markTransferReceived") : t("store.markCashReceived")}</SubmitButton>
                </form>
              )}
              {ctx.can("payments.view") && (
                <Link href={`/payments?edit=${pay.id}`} className="text-sm underline-offset-4 hover:underline">
                  {t("store.toPayment")}
                </Link>
              )}
            </FormCard>
            {ctx.modules.has("invoices") && (
              <FormCard title={t("store.invoice")}>
                {o.documents && o.documents.status !== "draft" ? (
                  <Link href={`/invoices/${o.documents.id}`} className="text-sm underline-offset-4 hover:underline">
                    {o.documents.number} · {t.dynamic(`invoices.statuses.invoice.${o.documents.status}`)}
                  </Link>
                ) : (
                  <div className="grid gap-2 text-sm">
                    {o.invoice_error && <p className="text-destructive">{t.has(`errors.${o.invoice_error}`) ? t.dynamic(`errors.${o.invoice_error}`) : o.invoice_error}</p>}
                    {o.documents && (
                      <Link href={`/invoices/${o.documents.id}`} className="underline-offset-4 hover:underline">
                        {t("store.openDraft")}
                      </Link>
                    )}
                    {!o.documents && !o.invoice_error && <p className="text-muted-foreground">{t("store.noInvoiceYet")}</p>}
                    {canManage && live && (
                      <form action={invoiceAction}>
                        {hidden}
                        <SubmitButton size="sm" variant="outline">
                          {t("store.issueInvoice")}
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                )}
              </FormCard>
            )}
          </>
        }
      >
        <FormCard title={t("store.items")}>
          <ul className="grid divide-y text-sm">
            {pay.pay_order_items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3 py-2">
                <span>
                  {i.quantity}× {i.description}
                  {i.refunded_quantity > 0 && (
                    <Badge variant="outline" className="ml-2">
                      {t("store.piecesRefunded", { count: i.refunded_quantity })}
                    </Badge>
                  )}
                </span>
                <span className="tabular-nums">{t.money(i.quantity * i.unit_amount, cur)}</span>
              </li>
            ))}
            <li className="flex justify-between gap-3 py-2 font-medium">
              <span>{t("store.total")}</span>
              <span className="tabular-nums">{t.money(pay.amount_total, cur)}</span>
            </li>
            {refunds.map((r) => (
              <li key={r.id} className="flex justify-between gap-3 py-2 text-muted-foreground">
                <span>
                  {t("store.refundedOn", { date: t.date(r.created_at, { dateStyle: "medium" }) })}
                  {r.status === "pending" && ` · ${t("store.refundPendingShort")}`}
                  {r.reason && <span className="block text-xs">{r.reason}</span>}
                </span>
                <span className="tabular-nums">−{t.money(r.amount, cur)}</span>
              </li>
            ))}
          </ul>
          {o.note && <p className="rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-line">{o.note}</p>}
        </FormCard>
        <FormCard title={t.dynamic(`store.deliveries.${o.delivery}`)}>
          {(o.street || o.city) && (
            <p className="text-sm whitespace-pre-line">{[o.company, o.name, o.street, [o.postal_code, o.city].filter(Boolean).join(" "), o.country].filter(Boolean).join("\n")}</p>
          )}
          {o.shipping_name && <p className="text-sm text-muted-foreground">{o.shipping_name}</p>}
          {canManage && live && (
            <div className="grid gap-3">
              {o.delivery === "shipping" && (
                <form action={orderStatusAction} className="flex flex-wrap items-end gap-2">
                  {hidden}
                  <input type="hidden" name="status" value="shipped" />
                  <div className="grid min-w-48 flex-1 gap-1">
                    <Label htmlFor="tracking">{t("store.tracking")}</Label>
                    <Input id="tracking" name="tracking" maxLength={300} defaultValue={o.tracking ?? ""} placeholder={t("store.trackingPlaceholder")} />
                  </div>
                  <SubmitButton size="sm" variant={o.status === "shipped" ? "outline" : "default"}>
                    {o.status === "shipped" ? t("store.saveTracking") : t("store.markShipped")}
                  </SubmitButton>
                </form>
              )}
              <div className="flex flex-wrap gap-2">
                {o.delivery === "pickup" && o.status === "new" && step("ready", t("store.markReady"))}
                {o.status !== "completed" && step("completed", o.delivery === "pickup" ? t("store.markPickedUp") : t("store.markCompleted"), o.delivery === "pickup" && o.status === "new" ? "outline" : "default")}
                {o.status !== "new" && step("new", t("store.reopen"), "outline")}
              </div>
            </div>
          )}
          {o.tracking && !canManage && <p className="text-sm">{t("store.trackingLine", { tracking: o.tracking })}</p>}
        </FormCard>
      </RecordLayout>
    </Page>
  )
}

export const instant = false
