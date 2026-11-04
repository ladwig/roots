import Link from "next/link"
import { ExternalLinkIcon, ShoppingBagIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuLink } from "@/components/actions-menu"
import { DataTable, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { imageUrl } from "@/lib/images"
import { pageParam, param, siteUrl } from "@/lib/url"

// Products: picture, price, stock, status. A row opens the product.
export default async function ProductsPage({ searchParams }: PageProps<"/shop">) {
  const ctx = await requirePerm("shop.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("shop.manage")
  const trash = canManage && param(sp, "status") === "trash"
  const q = param(sp, "q")?.replace(/[%,()*]/g, "").trim()
  const page = pageParam(sp)
  let query = ctx.supabase
    .from("products")
    .select("id, name, slug, status, kind, price_cents, stock, category, images, product_variants(stock, active)")
    .eq("org_id", ctx.org.id)
    .order("position")
    .order("created_at", { ascending: false })
    .range(...pageRange(page))
  query = trash ? query.not("deleted_at", "is", null) : query.is("deleted_at", null)
  if (q) query = query.or(`name.ilike.%${q}%,category.ilike.%${q}%`)
  const { data } = await query
  const rows = (data ?? []).slice(0, PAGE_SIZE)
  // Sold so far per product: paid orders, refunded pieces taken off (pieces + revenue).
  const { data: sales } = rows.length
    ? await ctx.supabase
        .from("pay_order_items")
        .select("quantity, refunded_quantity, unit_amount, metadata, pay_orders!inner(status, source_module)")
        .eq("org_id", ctx.org.id)
        .eq("pay_orders.source_module", "shop")
        .in("pay_orders.status", ["paid", "partially_refunded"])
        .in("metadata->>product_id", rows.map((p) => p.id))
    : { data: [] }
  const sold = new Map<string, { pieces: number; cents: number }>()
  for (const i of sales ?? []) {
    const id = String((i.metadata as Record<string, unknown>)?.product_id)
    const n = i.quantity - i.refunded_quantity
    const cur = sold.get(id) ?? { pieces: 0, cents: 0 }
    sold.set(id, { pieces: cur.pieces + n, cents: cur.cents + n * i.unit_amount })
  }
  const stock = (p: (typeof rows)[number]) => {
    const list = p.product_variants.filter((v) => v.active)
    const values = list.length ? list.map((v) => v.stock) : [p.stock]
    return values.some((v) => v === null) ? t("store.unlimited") : String(values.reduce((s, v) => s! + v!, 0))
  }

  return (
    <Page>
      <PageHeader
        area="shop"
        title={trash ? `${t("store.products")} · ${t("store.trash")}` : t("store.products")}
        settings={canManage && { href: "/shop/settings", label: t("common.settings") }}
        actions={
          <a href={siteUrl(ctx.org.slug, "/shop", ctx.org.site_domain)} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm hover:bg-muted">
            <ExternalLinkIcon className="size-4" /> {t("store.openShop")}
          </a>
        }
        menu={
          canManage && (
            <ActionsMenu>
              <MenuLink href={trash ? "/shop" : "/shop?status=trash"} icon={trash ? <ShoppingBagIcon /> : <Trash2Icon />}>
                {trash ? t("store.backToList") : t("store.trash")}
              </MenuLink>
            </ActionsMenu>
          )
        }
        primary={canManage && !trash ? { href: "/shop/new", label: t("store.newProduct") } : undefined}
      />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox q={q} label={t("store.search")} keep={trash ? { status: "trash" } : undefined} />
      </div>
      <DataTable
        rows={rows}
        rowKey={(p) => p.id}
        rowHref={(p) => `/shop/${p.id}`}
        empty={
          q || trash ? (
            t("store.noMatch")
          ) : (
            <EmptyState area="shop" title={t("store.emptyTitle")} text={t("store.emptyText")} />
          )
        }
        columns={[
          {
            header: t("store.productName"),
            cell: (p) => (
              <Link href={`/shop/${p.id}`} className="flex items-center gap-3 underline-offset-4 hover:underline">
                <span className="size-10 shrink-0 overflow-hidden rounded-md border bg-muted">
                  {p.images[0] && (
                    // eslint-disable-next-line @next/next/no-img-element -- public bucket URL
                    <img src={imageUrl(p.images[0])} alt="" className="size-full object-cover" />
                  )}
                </span>
                <span className="grid">
                  <span className="font-medium">{p.name}</span>
                  {p.category && <span className="text-xs text-muted-foreground">{p.category}</span>}
                </span>
              </Link>
            ),
          },
          { header: t("store.price"), cell: (p) => t.money(p.price_cents, "eur") },
          { header: t("store.stock"), cell: (p) => stock(p) },
          {
            header: t("store.sold"),
            cell: (p) => {
              const s = sold.get(p.id)
              return s?.pieces ? (
                <span className="grid">
                  <span>{t("store.soldPieces", { count: s.pieces })}</span>
                  <span className="text-xs text-muted-foreground">{t.money(s.cents, "eur")}</span>
                </span>
              ) : (
                <span className="text-muted-foreground">–</span>
              )
            },
          },
          {
            header: t("store.status"),
            cell: (p) => (
              <span className="flex flex-wrap gap-1">
                <Badge variant={p.status === "published" ? "default" : "secondary"}>{t.dynamic(`store.statuses.${p.status}`)}</Badge>
                {p.kind === "digital" && <Badge variant="outline">{t("store.kinds.digital")}</Badge>}
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
