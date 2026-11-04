# Shop: "Name your price" – plan

Status: plan, not built (agreed 2026-11-04, to be implemented later).

## Goal
Like Bandcamp's "€12 EUR or more": the org lets buyers choose what they pay for a product or variant. The set price
becomes the minimum (0 = free, "pay what you want"). Typical uses: digital albums, benefit merch, free downloads with
an optional tip.

## Naming
- DE: **„Preis selbst wählen“** (setting), shop shows **„12,00 € oder mehr“** and an input **„Dein Preis“**.
- EN: **"Name your price"**, shop: **"€12.00 or more"**, input **"Your price"**.
- Never "Spende" (donation has tax meaning) and never "mehr zahlen erlaubt".

## Decisions
- Per **product** (switch in the Produkt tab) and per **variant** (overrides; e.g. vinyl fixed 12 €, digital album
  "name your price" from 8 €). Variants without their own setting follow the product.
- The product/variant price = **minimum**. Optional **suggested price** pre-filled in the input (default = minimum).
- Upper limit 10.000 € per unit (typos / abuse), whole cents.
- 0 € minimum allowed → a free order (no payment step, existing free-order path), e-mail still required.
- No service fee (as everywhere in the shop, § 270a BGB).

## Data
- `products.name_your_price boolean not null default false`, `products.suggested_cents int null`.
- `product_variants.name_your_price boolean null` (null = follow the product), `product_variants.suggested_cents int null`.
- `shop_catalog()` returns per product/variant: `name_your_price`, `min_cents` (= price), `suggested_cents`.
- Order items keep the chosen unit price as today (`pay_order_items.unit_amount`), metadata `name_your_price: true`.

## Flow
1. Product page: price line "12,00 € oder mehr"; next to the quantity an input "Dein Preis" (money input, pre-filled
   with the suggested price). Add to cart posts `price`.
2. Cart cookie line becomes `{ id, q, p? }` (`p` = chosen cents, only for name-your-price items). `readCart()`
   validates it; the same item with two prices = two lines. In the cart the price is editable like the quantity
   (auto-save).
3. `priceCart()` uses `p` when the item is name-your-price: `p < min` → problem `"below_min"` (shown in the cart,
   checkout blocked), missing `p` → the suggested/minimum price. Fixed-price items ignore `p`.
4. Checkout / `placeOrder()` re-checks every line on the server (min, max), the expected total check stays.
5. Invoice: the chosen amount is the gross price (VAT taken out as usual). 0 € lines: no invoice for an all-free order.

## Interplay
- **Single tracks** (if built): the per-track price can be "or more" with the same switch on the product.
- **Release date / pre-order**: unchanged (pay now, unlock on release day).
- **Stock**: unchanged; free orders count against stock like paid ones.

## API
- Key API: product/variant fields `name_your_price`, `suggested_cents` (read/write).
- Public API: catalog fields as above; `POST /{org}/shop/orders` items get optional `price_cents` (required ≥ min for
  name-your-price items, ignored otherwise); new error `price_below_min`.

## Tests (lean)
- `fields.test.mjs`: `readCart` keeps/validates `p`; `priceCart` uses `p`, flags `below_min`, ignores `p` on fixed items.

## Open
- Show "Käufer:innen zahlen im Schnitt X €" on the product? (Bandcamp doesn't; skip unless asked.)
