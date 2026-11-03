// Small display helpers the public shop pages share.
import type { T } from "@/i18n/translate"
import type { CatalogProduct } from "./fields"

/** "ab 25,00 €" when variants cost differently. */
export function priceLabel(p: CatalogProduct, t: T) {
  const prices = p.variants.length ? p.variants.map((v) => v.price_cents) : [p.price_cents]
  const min = Math.min(...prices)
  return min !== Math.max(...prices) ? t("store.priceFrom", { price: t.money(min, "eur") }) : t.money(min, "eur")
}
export const soldOut = (p: CatalogProduct) => (p.variants.length ? p.variants.every((v) => v.left === 0) : p.left === 0)
