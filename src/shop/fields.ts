// Shop: the rules the public pages, the App forms and the API share (pure, relative imports only, node --test).
// Prices are gross integer cents (what the buyer pays); VAT rates as on invoices.
import { moneyCents } from "../lib/inputs.ts"
import { fromLocalInput } from "../lib/time.ts"

export const TAX_RATES = [19, 7, 0] as const
export const PRODUCT_KINDS = ["physical", "digital"] as const
export const PRODUCT_STATUSES = ["draft", "published", "archived"] as const
export const DELIVERIES = ["pickup", "shipping", "digital"] as const
export const PAYMENTS = ["online", "transfer", "pickup"] as const
export const ORDER_STATUSES = ["new", "ready", "shipped", "completed", "cancelled"] as const
/** Mails the shop sends to buyers; each can be switched off and given its own text (Shop → Einstellungen). */
export const MAIL_KINDS = ["confirmation", "paid", "ready", "shipped", "cancelled", "released"] as const
export type Delivery = (typeof DELIVERIES)[number]
export type Payment = (typeof PAYMENTS)[number]
export type MailKind = (typeof MAIL_KINDS)[number]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** "Tour-Shirt 2026 (schwarz)" → "tour-shirt-2026-schwarz" */
export function slugify(name: string) {
  const map: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" }
  return name
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => map[c])
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "")
}
export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

export type ShippingRate = { id: string; name: string; cents: number; free_from: number | null; countries: string[] }

/** Shipping rates from settings/API input; invalid entries are dropped. */
// ISO 3166-1 alpha-2 codes (names come from Intl.DisplayNames); "EU" in a rate stands for all EU members.
export const COUNTRIES = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ")
export const EU = "AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK".split(" ")

export function readShippingRates(raw: unknown): ShippingRate[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, 20).flatMap((r, i) => {
    if (!r || typeof r !== "object") return []
    const o = r as Record<string, unknown>
    const name = String(o.name ?? "").trim().slice(0, 100)
    const cents = Number(o.cents)
    const free = o.free_from === null || o.free_from === undefined || o.free_from === "" ? null : Number(o.free_from)
    const countries = (Array.isArray(o.countries) ? o.countries : String(o.countries ?? "DE").split(/[\s,;]+/))
      .flatMap((c) => (String(c).trim().toUpperCase() === "EU" ? EU : [String(c).trim().toUpperCase()]))
      .filter((c) => COUNTRIES.includes(c))
    if (!name || !Number.isInteger(cents) || cents < 0 || cents > 1_000_000 || (free !== null && !(Number.isInteger(free) && free > 0))) return []
    const id = typeof o.id === "string" && /^[a-z0-9-]{1,40}$/.test(o.id) ? o.id : `r${i + 1}`
    return [{ id, name, cents, free_from: free, countries: countries.length ? [...new Set(countries)] : ["DE"] }]
  })
}

export const shippingCents = (rate: ShippingRate, subtotal: number) => (rate.free_from !== null && subtotal >= rate.free_from ? 0 : rate.cents)

// ---------- cart (cookie, one per org) ----------

export type CartLine = { id: string; q: number; p?: number } // id = variant / product (no variants) / track id; p = chosen price (name your price)
export const MAX_UNIT_CENTS = 1_000_000 // name-your-price ceiling per unit (10.000 €): typos, abuse
export const MAX_CART_LINES = 30

export function readCart(raw: string | undefined | null): CartLine[] {
  let v: unknown
  try {
    v = JSON.parse(raw ?? "[]")
  } catch {
    return []
  }
  if (!Array.isArray(v)) return []
  const lines = new Map<string, { q: number; p?: number }>()
  for (const l of v.slice(0, MAX_CART_LINES)) {
    const id = String((l as CartLine)?.id ?? "")
    const q = Math.floor(Number((l as CartLine)?.q))
    const p = (l as CartLine)?.p
    if (!UUID.test(id) || !(q >= 1)) continue
    const price = Number.isInteger(p) && p! >= 0 && p! <= MAX_UNIT_CENTS ? p : lines.get(id)?.p
    lines.set(id, { q: Math.min(100, (lines.get(id)?.q ?? 0) + q), ...(price !== undefined && { p: price }) })
  }
  return [...lines].map(([id, l]) => ({ id, ...l }))
}

/** Add (q > 0), change (set) or remove (q = 0) a line; `price` (name your price) replaces the line's chosen price. */
export function changeCart(cart: CartLine[], id: string, q: number, mode: "add" | "set", price?: number | null): CartLine[] {
  if (!UUID.test(id)) return cart
  const line = cart.find((l) => l.id === id)
  const next = Math.max(0, Math.min(100, Math.floor(mode === "add" ? (line?.q ?? 0) + q : q)))
  const p = price !== undefined && price !== null && Number.isInteger(price) && price >= 0 && price <= MAX_UNIT_CENTS ? price : line?.p
  const rest = cart.filter((l) => l.id !== id)
  return next > 0 ? [...rest, { id, q: next, ...(p !== undefined && { p }) }].slice(-MAX_CART_LINES) : rest
}

// The public catalog (shop_catalog()) as the pages and the order logic read it.
export type CatalogVariant = { id: string; name: string; price_cents: number; left: number | null; digital: boolean; name_your_price?: boolean }
export type CatalogProduct = {
  id: string
  slug: string
  name: string
  kind: "physical" | "digital"
  price_cents: number
  tax_rate: number
  images: string[]
  video_url: string | null
  category: string | null
  max_per_order: number
  release_at?: string | null // only while ahead
  name_your_price?: boolean // price = minimum, buyers choose (variants: their own flag)
  suggested_cents?: number | null
  track_price_cents?: number | null // single tracks for sale (null = album only)
  tracks?: { id: string; title: string }[] // the buyable ones
  description?: string | null
  left: number | null // products without variants; null = unlimited
  variants: CatalogVariant[]
}

export type PricedLine = {
  id: string
  product: CatalogProduct
  variant: CatalogVariant | null
  name: string // "Shirt · M"
  quantity: number
  unit: number
  tax_rate: number
  digital: boolean // download, no shipping (digital product or digital variant)
  trackId: string | null // a single track
  nyp: boolean // name your price: `min` is the floor, `unit` what the buyer chose
  min: number
  problem: "gone" | "sold_out" | "too_many" | "below_min" | null // gone = no longer for sale
}

/** What a name-your-price item costs when the buyer didn't choose: the suggestion if it's at least the minimum. */
export const suggestedPrice = (p: CatalogProduct, min: number) => Math.max(min, p.suggested_cents ?? min)

/**
 * Cart lines with today's prices and availability. Lines whose product/variant/track vanished come back as "gone".
 * Name-your-price items cost what the buyer chose (`p`, else the suggestion), at least the minimum.
 */
export function priceCart(cart: CartLine[], catalog: CatalogProduct[]): PricedLine[] {
  return cart.flatMap((l) => {
    for (const p of catalog) {
      const track = p.track_price_cents != null ? p.tracks?.find((x) => x.id === l.id) : undefined
      const v = track ? null : (p.variants.find((x) => x.id === l.id) ?? null)
      if (!track && !v && (p.id !== l.id || p.variants.length)) continue
      const min = track ? p.track_price_cents! : v ? v.price_cents : p.price_cents
      const nyp = v ? !!v.name_your_price : !!p.name_your_price
      const unit = nyp ? (l.p ?? suggestedPrice(p, min)) : min
      const quantity = track ? 1 : l.q // a track is bought once
      const left = track ? null : v ? v.left : p.left
      const problem = left !== null && left < quantity ? "sold_out" : quantity > p.max_per_order ? "too_many" : nyp && (unit < min || unit > MAX_UNIT_CENTS) ? "below_min" : null
      const name = track ? `${p.name} – ${track.title}` : v ? `${p.name} · ${v.name}` : p.name
      return [{ id: l.id, product: p, variant: v, name, quantity, unit, tax_rate: Number(p.tax_rate), digital: track ? true : v ? !!v.digital : p.kind === "digital", trackId: track?.id ?? null, nyp, min, problem }]
    }
    return []
  })
}

export const subtotalOf = (lines: { quantity: number; unit: number }[]) => lines.reduce((s, l) => s + l.quantity * l.unit, 0)

// ---------- checkout options ----------

export type ShopSettings = {
  pay_online: boolean
  pay_transfer: boolean
  pay_on_pickup: boolean
  pickup: boolean
  shipping: boolean
  shipping_rates: unknown
}

/** How this cart can be delivered: only digital → "digital"; anything physical → pickup / shipping as switched on. */
export function deliveriesFor(s: ShopSettings, lines: { digital: boolean }[]): Delivery[] {
  if (lines.every((l) => l.digital)) return ["digital"]
  const out: Delivery[] = []
  if (s.pickup) out.push("pickup")
  if (s.shipping && readShippingRates(s.shipping_rates).length) out.push("shipping")
  return out
}

/** How it can be paid: online needs a ready provider; pay on pickup only with pickup; free orders need no method. */
export function paymentsFor(s: ShopSettings, delivery: Delivery, onlineReady: boolean): Payment[] {
  const out: Payment[] = []
  if (s.pay_online && onlineReady) out.push("online")
  if (s.pay_transfer) out.push("transfer")
  if (s.pay_on_pickup && delivery === "pickup") out.push("pickup")
  return out
}

/** A product video: YouTube/Vimeo as a privacy-friendly embed, a direct file as <video>, anything else not shown. */
export function videoEmbed(url: string | null): { kind: "iframe" | "video"; src: string } | null {
  if (!url) return null
  const yt = url.match(/^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/)
  if (yt) return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${yt[1]}` }
  const vimeo = url.match(/^https:\/\/(?:www\.)?vimeo\.com\/(\d+)/)
  if (vimeo) return { kind: "iframe", src: `https://player.vimeo.com/video/${vimeo[1]}?dnt=1` }
  if (/^https:\/\/[^\s]+\.(mp4|webm)(\?[^\s]*)?$/i.test(url)) return { kind: "video", src: url }
  return null
}
/** Slugs the shop's own pages use. */
export const RESERVED_SLUGS = ["agb", "widerruf"]

// ---------- product input (App form + API) ----------


export type ProductRow = {
  name: string
  slug: string
  description: string
  kind: (typeof PRODUCT_KINDS)[number]
  status: (typeof PRODUCT_STATUSES)[number]
  price_cents: number
  tax_rate: number
  stock: number | null
  max_per_order: number
  category: string | null
  video_url: string | null
  release_at: string | null // release date (pre-orders): digital delivery unlocks that day
  name_your_price: boolean // price = minimum, buyers choose
  suggested_cents: number | null // pre-filled choice (≥ the price)
}

const intOrNull = (v: string) => (v.trim() === "" ? null : Number(v.trim()))

/** Form/API strings → a product row, or an error key. `get` returns "" for missing fields. */
export function readProduct(get: (k: string) => string): { row: ProductRow } | { error: string } {
  const name = get("name").trim().slice(0, 200)
  if (!name) return { error: "store.nameRequired" }
  const slug = (get("slug").trim().toLowerCase() || slugify(name)).slice(0, 80)
  if (!SLUG.test(slug) || RESERVED_SLUGS.includes(slug)) return { error: "store.slugInvalid" }
  const price = moneyCents(get("price") || "0")
  if (price === null || price > 99_999_999) return { error: "store.priceInvalid" }
  const tax = Number(get("tax_rate") || 19)
  const stock = intOrNull(get("stock"))
  const max = Number(get("max_per_order") || 10)
  if (!(TAX_RATES as readonly number[]).includes(tax) || (stock !== null && !(Number.isInteger(stock) && stock >= 0 && stock <= 1_000_000)) || !(Number.isInteger(max) && max >= 1 && max <= 100))
    return { error: "errors.invalid_input" }
  const video = get("video_url").trim()
  if (video && (!/^https:\/\/\S+$/.test(video) || video.length > 500)) return { error: "store.videoInvalid" }
  const kind = PRODUCT_KINDS.find((k) => k === get("kind")) ?? "physical"
  const status = PRODUCT_STATUSES.find((s) => s === get("status")) ?? "draft"
  const release = get("release_on").trim() // "2026-11-27" (Berlin) or empty
  const release_at = release ? fromLocalInput(`${release}T00:00`)?.toISOString() ?? null : null
  if (release && (!/^\d{4}-\d{2}-\d{2}$/.test(release) || !release_at)) return { error: "store.releaseInvalid" }
  const name_your_price = get("name_your_price") === "1"
  const suggested = get("suggested").trim() ? moneyCents(get("suggested")) : null
  if (get("suggested").trim() && (suggested === null || suggested > MAX_UNIT_CENTS)) return { error: "store.priceInvalid" }
  return {
    row: { name, slug, description: get("description").slice(0, 50000), kind, status, price_cents: price, tax_rate: tax, stock, max_per_order: max, category: get("category").trim().slice(0, 60) || null, video_url: video || null, release_at, name_your_price, suggested_cents: name_your_price ? suggested : null },
  }
}

/** One variant line: name, optional own price ("" = product price), optional stock. */
export function readVariant(get: (k: string) => string): { row: { name: string; price_cents: number | null; stock: number | null; active: boolean; digital: boolean; name_your_price: boolean | null } } | { error: string } {
  const name = get("name").trim().slice(0, 100)
  if (!name) return { error: "store.nameRequired" }
  const price = get("price").trim() ? moneyCents(get("price")) : null
  if (get("price").trim() && (price === null || price > 99_999_999)) return { error: "store.priceInvalid" }
  const stock = intOrNull(get("stock"))
  if (stock !== null && !(Number.isInteger(stock) && stock >= 0 && stock <= 1_000_000)) return { error: "errors.invalid_input" }
  return { row: { name, price_cents: price, stock, active: get("has_active") === "1" ? get("active") === "1" : true, digital: get("digital") === "1", name_your_price: get("has_nyp") === "1" ? get("name_your_price") === "1" : null } }
}
