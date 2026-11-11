import Link from "next/link"
import { DataTable } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { formatMoney } from "@/lib/inputs"
import { param, withParams } from "@/lib/url"
import { cn } from "@/lib/utils"
import { stockHistory, stockList } from "@/shop/stock"
import { StockForm } from "./stock-form"

// Shop → Lager: every physical item with what's on hand, held by open orders and still free; a row opens its
// drawer to book a movement (Zugang, Entnahme, Schwund, Inventur) or a sale at the merch table, and its history.
export default async function StockPage({ searchParams }: PageProps<"/shop/stock">) {
  const ctx = await requirePerm("shop.view")
  const t = await getT()
  const sp = await searchParams
  const itemId = param(sp, "item")
  const items = await stockList(ctx.supabase, ctx.org.id)
  const item = itemId ? items.find((i) => i.item_id === itemId) : undefined
  const [history, price] = item
    ? await Promise.all([
        stockHistory(ctx.supabase, ctx.org.id, item.item_id!),
        item.variant_id
          ? ctx.supabase.from("product_variants").select("price_cents, products(price_cents)").eq("id", item.variant_id).single().then(({ data }) => data?.price_cents ?? data?.products?.price_cents ?? null)
          : ctx.supabase.from("products").select("price_cents").eq("id", item.product_id!).single().then(({ data }) => data?.price_cents ?? null),
      ])
    : [[], null]
  const manage = ctx.can("shop.manage")
  const num = (n: number | null) => (n === null ? "–" : String(n))

  return (
    <Page>
      <PageHeader area="shop" title={t("store.lager.title")} description={t("store.lager.hint")} settings={manage && { href: "/shop/settings", label: t("common.settings") }} />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <DataTable
        rows={items}
        rowKey={(i) => i.item_id!}
        rowHref={(i) => withParams(sp, { item: i.item_id!, ok: undefined, error: undefined })}
        empty={<EmptyState area="shop" title={t("store.lager.empty")} text={t("store.lager.emptyText")} />}
        columns={[
          { header: t("store.lager.item"), cell: (i) => <span className="font-medium">{i.name}</span> },
          {
            header: t("store.lager.onHand"),
            cell: (i) => (i.stock === null ? <span className="text-muted-foreground">{t("store.lager.untracked")}</span> : <span className={cn("tabular-nums", (i.on_hand ?? 0) <= 0 && "font-medium text-destructive")}>{i.on_hand}</span>),
          },
          { header: t("store.lager.reserved"), cell: (i) => <span className="tabular-nums">{i.reserved || "–"}</span> },
          { header: t("store.lager.available"), cell: (i) => <span className="tabular-nums">{num(i.available)}</span> },
          { header: t("store.lager.sold"), cell: (i) => <span className="tabular-nums">{i.sold}</span> },
          { header: t("store.lager.lastMove"), cell: (i) => (i.last_move ? t.date(i.last_move, { dateStyle: "medium" }) : "–"), className: "whitespace-nowrap" },
        ]}
      />
      {item && (
        <UrlSheet
          params={["item"]}
          title={item.name!}
          meta={t("store.lager.meta", { onHand: num(item.on_hand), reserved: String(item.reserved), available: num(item.available), sold: String(item.sold) })}
          actions={
            <Link href={`/shop/${item.product_id}`} className="text-sm text-primary underline-offset-4 hover:underline">
              {t("store.lager.toProduct")}
            </Link>
          }
        >
          <div className="grid gap-6">
            {manage && <StockForm item={item.item_id!} onHand={item.on_hand ?? 0} price={price === null ? "" : formatMoney(price)} />}
            <section className="grid gap-2">
              <h3 className="text-sm font-medium">{t("store.lager.history")}</h3>
              {history.length ? (
                <ul className="grid divide-y rounded-lg border text-sm">
                  {history.map((h) => (
                    <li key={h.id} className="flex items-center gap-3 px-3 py-2">
                      <span className={cn("w-12 shrink-0 text-right font-medium tabular-nums", h.quantity < 0 ? "text-destructive" : "text-foreground")}>{h.quantity > 0 ? `+${h.quantity}` : h.quantity}</span>
                      <span className="grid min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">{t.dynamic(`store.lager.reasons.${h.kind}`)}</Badge>
                          {h.order && (
                            <Link href={`/shop/orders/${h.order.id}`} className="underline-offset-4 hover:underline">
                              #{h.order.number}
                            </Link>
                          )}
                        </span>
                        {h.note && <span className="truncate text-xs text-muted-foreground">{h.note}</span>}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{t.date(h.at, { dateStyle: "short", timeStyle: "short" })}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("store.lager.noHistory")}</p>
              )}
            </section>
          </div>
        </UrlSheet>
      )}
    </Page>
  )
}

export const instant = false
