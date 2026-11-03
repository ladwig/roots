import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ShoppingBagIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import { imageUrl } from "@/lib/images"
import { param, sitePath } from "@/lib/url"
import { getCart } from "@/shop/cart"
import type { CatalogProduct } from "@/shop/fields"
import { priceLabel, soldOut } from "@/shop/view"
import { getSite } from "../data"

export async function generateMetadata({ params }: PageProps<"/s/[site]/shop">): Promise<Metadata> {
  const s = await getSite((await params).site)
  const t = await getT()
  return s ? { title: `${t("store.shopTitle")} · ${s.org.name}` } : {}
}

// The org's catalog: product cards, optional category filter (?c=), a link to the cart.
export default async function ShopPage({ params, searchParams }: PageProps<"/s/[site]/shop">) {
  const { site } = await params
  const sp = await searchParams
  const s = await getSite(site)
  if (!s) notFound()
  const [{ data: list }, { data: settings }, cart, t] = await Promise.all([
    s.db.rpc("shop_catalog", { p_org: s.org.id }),
    s.db.rpc("shop_public_settings", { p_org: s.org.id }),
    getCart(s.org.id),
    getT(),
  ])
  if (!settings) notFound() // module off
  const conf = settings as { title: string | null; intro: string | null }
  const products = (list ?? []) as CatalogProduct[]
  const categories = [...new Set(products.map((p) => p.category).filter((c): c is string => !!c))]
  const category = param(sp, "c")
  const shown = category ? products.filter((p) => p.category === category) : products
  const count = cart.reduce((n, l) => n + l.q, 0)

  return (
    <main className="site-shop mx-auto grid max-w-5xl gap-6 px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={sitePath(site)} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← {s.org.name}
        </Link>
        <Link href={sitePath(site, "/cart")} className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
          <ShoppingBagIcon className="size-4" aria-hidden /> {t("store.cart")}
          {count > 0 && <Badge>{count}</Badge>}
        </Link>
      </div>
      <header className="grid gap-2">
        <h1 className="font-heading text-3xl font-semibold">{conf.title || t("store.shopTitle")}</h1>
        {conf.intro && <p className="whitespace-pre-line text-muted-foreground">{conf.intro}</p>}
      </header>
      {categories.length > 1 && (
        <nav className="flex flex-wrap gap-2" aria-label={t("store.categories")}>
          {[null, ...categories].map((c) => (
            <Link
              key={c ?? "all"}
              href={sitePath(site, c ? `/shop?c=${encodeURIComponent(c)}` : "/shop")}
              className={`rounded-full border px-3 py-1 text-sm ${category === c || (!category && !c) ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {c ?? t("store.allCategories")}
            </Link>
          ))}
        </nav>
      )}
      {!shown.length ? (
        <p className="text-muted-foreground">{t("store.empty")}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {shown.map((p) => (
            <li key={p.id} className="site-product-card">
              <Link href={sitePath(site, `/shop/${p.slug}`)} className="group grid gap-2">
                <div className="aspect-square overflow-hidden rounded-xl border bg-muted">
                  {p.images[0] && (
                    // eslint-disable-next-line @next/next/no-img-element -- public bucket URL
                    <img src={imageUrl(p.images[0])} alt="" className="size-full object-cover transition-transform group-hover:scale-105" />
                  )}
                </div>
                <div className="grid gap-0.5">
                  <p className="font-medium leading-tight">{p.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {soldOut(p) ? t("store.soldOut") : priceLabel(p, t)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

export const instant = false
