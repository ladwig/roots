// Small display helpers the public shop pages share.
import type { T } from "@/i18n/translate"
import type { CatalogProduct } from "./fields"

/** "ab 25,00 €" when variants cost differently, "12,00 € oder mehr" for name your price. */
export function priceLabel(p: CatalogProduct, t: T) {
  const prices = p.variants.length ? p.variants.map((v) => v.price_cents) : [p.price_cents]
  const min = Math.min(...prices)
  if (min !== Math.max(...prices)) return t("store.priceFrom", { price: t.money(min, "eur") })
  const nyp = p.variants.length ? p.variants.every((v) => v.name_your_price) : p.name_your_price
  return nyp ? t("store.orMore", { price: t.money(min, "eur") }) : t.money(min, "eur")
}
export const soldOut = (p: CatalogProduct) => (p.variants.length ? p.variants.every((v) => v.left === 0) : p.left === 0)
