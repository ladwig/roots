import Link from "next/link"
import type { T } from "@/i18n/translate"
import { imageUrl } from "@/lib/images"
import { sitePath } from "@/lib/url"
import type { CatalogProduct } from "@/shop/fields"
import { priceLabel, soldOut } from "@/shop/view"

// Product cards: the catalog and the start page's shop block.
export function ProductCards({ products, site, t }: { products: CatalogProduct[]; site: string; t: T }) {
  return (
    <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => (
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
              <p className="text-sm text-muted-foreground">{soldOut(p) ? t("store.soldOut") : priceLabel(p, t)}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
