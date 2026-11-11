import Link from "next/link"
import { DataTable, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { FileTextIcon } from "lucide-react"
import { ActionsMenu, MenuSubmit } from "@/components/actions-menu"
import { Notice } from "@/components/notice"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { Segments } from "@/components/segments"
import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { pageParam, param, withParams } from "@/lib/url"
import { cn } from "@/lib/utils"
import { missingInvoices } from "@/shop/server"
import { issueMissingInvoicesAction } from "../actions"

const VIEWS = { open: ["new", "ready"], done: ["shipped", "completed"], cancelled: ["cancelled"], all: null } as const

// Shop orders: to do first (new / ready for pickup), with payment state at a glance. A row opens the order.
export default async function OrdersPage({ searchParams }: PageProps<"/shop/orders">) {
  const ctx = await requirePerm("shop.view")
  const t = await getT()
  const sp = await searchParams
  const view = (Object.keys(VIEWS) as (keyof typeof VIEWS)[]).find((v) => v === param(sp, "view")) ?? "open"
  const q = param(sp, "q")?.replace(/[%,()*]/g, "").trim()
  const page = pageParam(sp)
  let query = ctx.supabase
    .from("shop_orders")
    .select("id, number, status, delivery, payment, name, placed_at, pay_orders!inner(status, amount_total, currency, customer_email, pay_order_items(description, quantity, metadata))")
    .eq("org_id", ctx.org.id)
    .not("placed_at", "is", null) // online orders only count once paid (abandoned checkouts aren't orders)
    .order("placed_at", { ascending: false })
    .range(...pageRange(page))
  const statuses = VIEWS[view]
  if (statuses) query = query.in("status", [...statuses])
  if (q) query = /^\d+$/.test(q) ? query.eq("number", Number(q)) : query.ilike("name", `%${q}%`)
  const canInvoice = ctx.can("shop.manage") && ctx.modules.has("invoices")
  const [{ data }, missing] = await Promise.all([query, canInvoice ? missingInvoices(ctx.org.id) : 0])
  const rows = (data ?? []).slice(0, PAGE_SIZE)
  const paid = (s: string) => s === "paid" || s === "partially_refunded"

  return (
    <Page>
      <PageHeader area="shop" title={t("store.orders")} settings={ctx.can("shop.manage") && { href: "/shop/settings", label: t("common.settings") }}
        menu={
          missing > 0 && (
            <ActionsMenu>
              <MenuSubmit form="issue-invoices" icon={<FileTextIcon />}>
                {t("store.issueMissingInvoices", { count: missing })}
              </MenuSubmit>
            </ActionsMenu>
          )
        }
      />
      {missing > 0 && <form id="issue-invoices" action={issueMissingInvoicesAction} hidden />}
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox q={q} label={t("store.searchOrders")} keep={{ view }} />
        <Segments
          label={t("store.orders")}
          items={(Object.keys(VIEWS) as (keyof typeof VIEWS)[]).map((v) => ({ href: `/shop/orders${withParams(sp, { view: v === "open" ? undefined : v, page: undefined })}`, label: t.dynamic(`store.views.${v}`), current: v === view }))}
        />
      </div>
      <DataTable
        rows={rows}
        rowKey={(o) => o.id}
        rowHref={(o) => `/shop/orders/${o.id}`}
        empty={q || view !== "open" ? t("store.noOrders") : <EmptyState area="shop" title={t("store.noOpenOrders")} text={t("store.noOpenOrdersText")} />}
        columns={[
          {
            header: t("store.order"),
            cell: (o) => (
              <Link href={`/shop/orders/${o.id}`} className="grid underline-offset-4 hover:underline">
                <span className="font-medium">#{o.number}</span>
                <span className="text-xs text-muted-foreground">{t.date(o.placed_at!, { dateStyle: "medium", timeStyle: "short" })}</span>
              </Link>
            ),
          },
          {
            header: t("store.items"),
            // One line per item, cut with … so long names don't stretch the table.
            cell: (o) => (
              <span className="grid max-w-xs gap-0.5">
                {o.pay_orders.pay_order_items
                  .filter((i) => !(i.metadata as Record<string, unknown> | null)?.shipping)
                  .map((i, n) => (
                    <span key={n} className="truncate" title={`${i.quantity}× ${i.description}`}>
                      {i.quantity}× {i.description}
                    </span>
                  ))}
              </span>
            ),
          },
          {
            header: t("store.buyer"),
            cell: (o) => (
              <span className="grid">
                <span>{o.name}</span>
                {o.pay_orders.customer_email && <span className="text-xs text-muted-foreground">{o.pay_orders.customer_email}</span>}
              </span>
            ),
          },
          { header: t("store.total"), cell: (o) => t.money(o.pay_orders.amount_total, o.pay_orders.currency) },
          { header: t("store.delivery"), cell: (o) => t.dynamic(`store.deliveries.${o.delivery}`) },
          {
            header: t("store.payment"),
            cell: (o) => (
              <span className="grid">
                <span>{t.dynamic(`store.payments.${o.payment}`)}</span>
                <span className={cn("text-xs", paid(o.pay_orders.status) || o.status === "cancelled" ? "text-muted-foreground" : "font-medium text-destructive")}>{t.dynamic(`payments.statuses.${o.pay_orders.status}`)}</span>
              </span>
            ),
          },
          {
            header: t("store.status"),
            cell: (o) => (
              <span className="flex flex-wrap gap-1">
                <Badge variant={o.status === "cancelled" ? "destructive" : o.status === "new" ? "default" : "secondary"}>{t.dynamic(`store.orderStatus.${o.status}`)}</Badge>
              </span>
            ),
          },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />
    </Page>
  )
}

export const instant = false
