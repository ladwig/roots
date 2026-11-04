import { z } from "zod"
import { deliverSoon } from "@/events/worker"
import { imageUrl, removeImage } from "@/lib/images"
import { DELIVERIES, MAIL_KINDS, ORDER_STATUSES, PAYMENTS, PRODUCT_KINDS, PRODUCT_STATUSES, readOptions, readProduct, readShippingRates, readVariant, TAX_RATES } from "@/shop/fields"
import { applyOptions, cancelOrder, ensureInvoice, mail, markOrderPaid, refundShopOrder, setOrderStatus } from "@/shop/server"
import { deleteTrack, finishTrackUpload, productTrackList, startTrackUpload, updateTrack } from "@/shop/audio"
import { ApiError, dbError, endpoint, list, notFound, page, paged, uuid, type Endpoint } from "../core"
import { putImage, ts, type Db } from "./shared"
import { toLocalInput } from "@/lib/time"

// Shop: products (+ variants, pictures, downloads via /files), orders and their fulfilment, settings. Validation =
// the App's (src/shop/fields.ts), order steps = src/shop/server.ts (mails, invoices, refunds happen there too).
const TAG = "Shop"
const Variant = z.object({ id: uuid, name: z.string(), price_cents: z.number().int().nullable().describe("null = the product's price"), stock: z.number().int().nullable(), active: z.boolean(), digital: z.boolean().describe("Download only: no shipping, no stock needed"), name_your_price: z.boolean().nullable().describe("Name your price for this variant (price = minimum); null = as the product"), option_values: z.array(z.string()).nullable().describe("Its combination when the product has options (in option order)"), image_path: z.string().nullable().describe("One of the product's pictures, shown when picked"), position: z.number().int() })
const Product = z.object({
  id: uuid,
  slug: z.string(),
  name: z.string(),
  description: z.string().describe("Rich text (HTML)"),
  kind: z.enum(PRODUCT_KINDS),
  status: z.enum(PRODUCT_STATUSES).describe("Only published products are in the public shop"),
  price_cents: z.number().int().describe("Gross price in cents"),
  tax_rate: z.number(),
  stock: z.number().int().nullable().describe("Units for sale in total (null = unlimited); with variants, the variants' stock counts"),
  max_per_order: z.number().int(),
  category: z.string().nullable(),
  video_url: z.string().nullable(),
  name_your_price: z.boolean().describe("Name your price: `price_cents` is the minimum, buyers choose what they pay"),
  suggested_cents: z.number().int().nullable().describe("Pre-filled choice for name your price"),
  track_price_cents: z.number().int().nullable().describe("Single tracks for sale at this price (the minimum when name your price); null = album only"),
  options: z.array(z.object({ name: z.string(), values: z.array(z.string()) })).describe("Variant options (e.g. Farbe, Größe); variants are their combinations. Change with PUT /shop/products/{id}/options"),
  release_at: ts.nullable().describe("Release date (pre-order): sells before it, digital delivery (downloads, music) unlocks that day"),
  images: z.array(z.object({ path: z.string(), image_url: z.string() })).describe("First = cover"),
  variants: z.array(Variant),
  created_at: ts,
  updated_at: ts,
})
const PRODUCT_COLS = "id, slug, name, description, kind, status, price_cents, tax_rate, stock, max_per_order, category, video_url, release_at, name_your_price, suggested_cents, track_price_cents, options, images, created_at, updated_at, product_variants(id, name, price_cents, stock, active, digital, name_your_price, option_values, image_path, position)"
type ProductRow = { images: string[]; tax_rate: number; product_variants: { position: number }[] } & Record<string, unknown>
const productOut = ({ product_variants, images, ...p }: ProductRow) => ({
  ...p,
  tax_rate: Number(p.tax_rate),
  images: images.map((path) => ({ path, image_url: imageUrl(path)! })),
  variants: [...product_variants].sort((a, b) => a.position - b.position),
})
const ProductInput = z
  .object({
    name: z.string().max(200),
    slug: z.string().max(80),
    description: z.string().max(50000),
    kind: z.enum(PRODUCT_KINDS),
    status: z.enum(PRODUCT_STATUSES),
    price_cents: z.number().int().min(0).max(99_999_999),
    tax_rate: z.union(TAX_RATES.map((r) => z.literal(r)) as [z.ZodLiteral<19>, z.ZodLiteral<7>, z.ZodLiteral<0>]),
    stock: z.number().int().min(0).max(1_000_000).nullable(),
    max_per_order: z.number().int().min(1).max(100),
    category: z.string().max(60).nullable(),
    video_url: z.string().max(500).nullable().describe("YouTube/Vimeo link or a direct https MP4"),
    name_your_price: z.boolean(),
    suggested_cents: z.number().int().min(0).max(1_000_000).nullable(),
    track_price_cents: z.number().int().min(0).max(1_000_000).nullable(),
    release_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().describe("Release date YYYY-MM-DD (Europe/Berlin), null = none. Before it the product sells normally; downloads/music unlock on the day and the buyers get the `released` mail."),
  })
  .partial()
  .strict()
const VariantInput = z.object({ name: z.string().max(100), price_cents: z.number().int().min(0).max(99_999_999).nullable(), stock: z.number().int().min(0).max(1_000_000).nullable(), active: z.boolean(), digital: z.boolean(), name_your_price: z.boolean().nullable(), image_path: z.string().max(300).nullable(), position: z.number().int() }).partial().strict()

const ShopOrder = z.object({
  id: uuid,
  number: z.number().int(),
  status: z.enum(ORDER_STATUSES),
  delivery: z.enum(DELIVERIES),
  payment: z.enum(PAYMENTS),
  payment_status: z.string().describe("open, paid, partially_refunded, refunded, cancelled …"),
  total_cents: z.number().int(),
  currency: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  company: z.string().nullable(),
  street: z.string().nullable(),
  postal_code: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  shipping_name: z.string().nullable(),
  shipping_cents: z.number().int(),
  note: z.string().nullable(),
  tracking: z.string().nullable(),
  contact_id: uuid.nullable(),
  invoice_id: uuid.nullable(),
  invoice_error: z.string().nullable(),
  order_id: uuid.describe("The payment order (/payments)"),
  items: z.array(z.object({ line_id: uuid.describe("Order line (for refunds)"), description: z.string(), quantity: z.number().int(), refunded_quantity: z.number().int(), unit_amount: z.number().int(), item_id: z.string().nullable().describe("Variant or product id") })),
  placed_at: ts.nullable(),
  created_at: ts,
})
const ORDER_COLS =
  "id, number, status, delivery, payment, name, phone, company, street, postal_code, city, country, shipping_name, shipping_cents, note, tracking, contact_id, invoice_id, invoice_error, order_id, placed_at, created_at, pay_orders!inner(status, amount_total, currency, customer_email, pay_order_items(id, description, quantity, refunded_quantity, unit_amount, source_id))"
type OrderRow = { order_id: string; invoice_error: string | null; pay_orders: { status: string; amount_total: number; currency: string; customer_email: string | null; pay_order_items: { id: string; description: string; quantity: number; refunded_quantity: number; unit_amount: number; source_id: string | null }[] } } & Record<string, unknown>
const orderOut = ({ pay_orders: p, ...o }: OrderRow) => ({
  ...o,
  payment_status: p.status,
  total_cents: p.amount_total,
  currency: p.currency,
  email: p.customer_email,
  items: p.pay_order_items.map(({ source_id, id, ...i }) => ({ ...i, line_id: id, item_id: source_id })),
})

const getter = (o: Record<string, unknown>) => (k: string) => {
  const v = o[k]
  return v == null ? "" : typeof v === "boolean" ? (v ? "1" : "") : String(v)
}
const Track = z.object({ id: uuid, title: z.string(), position: z.number().int(), stream: z.boolean(), buyable: z.boolean().describe("Sold on its own when the product has a track price"), status: z.enum(["uploading", "pending", "processing", "ready", "failed"]), error: z.string().nullable(), file_name: z.string(), duration_seconds: z.number().int().nullable(), formats: z.record(z.string(), z.object({ size: z.number().int() })) })
const trackOut = (x: Awaited<ReturnType<typeof productTrackList>>[number]) => ({ id: x.id, title: x.title, position: x.position, stream: x.stream, buyable: x.buyable, status: x.status as "ready", error: x.error, file_name: x.master_name, duration_seconds: x.duration_seconds, formats: Object.fromEntries(Object.entries(x.formats).map(([k, v]) => [k, { size: v!.size }])) })
const invalid = (key: string) => new ApiError(422, key.split(".").pop()!.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), key)
// The API speaks cents; the shared parser reads form strings ("25,00").
const asForm = (b: Record<string, unknown>) => ({ ...b, suggested: b.suggested_cents == null ? "" : (Number(b.suggested_cents) / 100).toFixed(2).replace(".", ","), has_nyp: b.name_your_price == null ? "" : "1", release_on: b.release_on !== undefined ? b.release_on : b.release_at ? toLocalInput(String(b.release_at)).slice(0, 10) : null, price: b.price_cents == null ? undefined : (Number(b.price_cents) / 100).toFixed(2).replace(".", ",") })

async function productOf(db: Db, orgId: string, id: string) {
  const { data } = await db.from("products").select(PRODUCT_COLS).eq("id", id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
  if (!data) throw notFound()
  return productOut(data as unknown as ProductRow)
}
async function orderOf(db: Db, orgId: string, id: string) {
  const { data } = await db.from("shop_orders").select(ORDER_COLS).eq("id", id).eq("org_id", orgId).maybeSingle()
  if (!data) throw notFound()
  return orderOut(data as unknown as OrderRow)
}
const conflictOrDb = (e: { code?: string; message: string }) => (e.code === "23505" ? new ApiError(409, "slug_taken", "Another product already has this slug.") : dbError(e))
// Track helpers return message keys: not found → 404, the rest → 422 (store.audioTooBig → audio_too_big).
const fail = (key: string) => (key === "errors.not_found" ? notFound() : invalid(key))

// Order steps throw message keys; "store.orderCancelled" → 409 order_cancelled.
const stepError = (e: unknown) => {
  const key = e instanceof Error ? e.message : ""
  if (key === "errors.not_found") return notFound()
  if (/^[a-z]+\.[a-zA-Z]+$/.test(key)) return new ApiError(409, key.split(".")[1].replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), key)
  return e
}

export const endpoints: Endpoint[] = [
  endpoint({
    method: "GET",
    path: "/shop/products",
    permission: "shop.view",
    tag: TAG,
    summary: "List products",
    query: page.extend({ q: z.string().max(100).optional(), status: z.enum(PRODUCT_STATUSES).optional() }),
    response: list(Product),
    async handler({ db, orgId, query }) {
      let q = db.from("products").select(PRODUCT_COLS).eq("org_id", orgId).is("deleted_at", null).order("position").order("created_at", { ascending: false }).range(query.offset, query.offset + query.limit)
      const s = query.q?.replace(/[%,()*]/g, "").trim()
      if (s) q = q.or(`name.ilike.%${s}%,category.ilike.%${s}%`)
      if (query.status) q = q.eq("status", query.status)
      const { data } = await q
      return paged((data ?? []).map((r) => productOut(r as unknown as ProductRow)), query)
    },
  }),
  endpoint({
    method: "GET",
    path: "/shop/products/{id}",
    permission: "shop.view",
    tag: TAG,
    summary: "Get a product",
    response: Product,
    async handler({ db, orgId, params }) {
      return productOf(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "POST",
    path: "/shop/products",
    permission: "shop.manage",
    tag: TAG,
    summary: "Create a product",
    description: "Starts as a draft unless `status` is `published`. The slug is made from the name when left out. Add pictures with POST /shop/products/{id}/images, sizes/colours as variants, download files via /files with entity `products` (every paid buyer of the product gets them, so a vinyl variant can include the download; mark download-only variants `digital`).",
    body: ProductInput.required({ name: true, price_cents: true }),
    response: Product,
    status: 201,
    async handler({ db, orgId, body }) {
      const r = readProduct(getter(asForm(body)))
      if ("error" in r) throw invalid(r.error)
      const { data, error } = await db.from("products").insert({ ...r.row, track_price_cents: body.track_price_cents ?? null, org_id: orgId }).select("id").single()
      if (error) throw conflictOrDb(error)
      return productOf(db, orgId, data.id)
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/shop/products/{id}",
    permission: "shop.manage",
    tag: TAG,
    summary: "Change a product",
    body: ProductInput,
    response: Product,
    async handler({ db, orgId, params, body }) {
      const old = await productOf(db, orgId, params.id)
      const r = readProduct(getter(asForm({ ...old, ...body })))
      if ("error" in r) throw invalid(r.error)
      const { error } = await db.from("products").update({ ...r.row, ...(body.track_price_cents !== undefined && { track_price_cents: body.track_price_cents }) }).eq("id", params.id).eq("org_id", orgId)
      if (error) throw conflictOrDb(error)
      return productOf(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/shop/products/{id}",
    permission: "shop.manage",
    tag: TAG,
    summary: "Move a product to the trash",
    description: "Restorable in the App for 30 days. Orders keep their own copy of name and price.",
    response: z.object({ ok: z.literal(true) }),
    async handler({ db, orgId, params }) {
      await productOf(db, orgId, params.id)
      const { error } = await db.rpc("soft_delete", { p_table: "public.products", p_id: params.id })
      if (error) throw dbError(error)
      return { ok: true }
    },
  }),
  endpoint({
    method: "POST",
    path: "/shop/products/{id}/images",
    permission: "shop.manage",
    tag: TAG,
    summary: "Add a product picture",
    description: "Send the image itself as the body (`Content-Type: image/jpeg|png|webp|gif`, max. 2 MB). Appended at the end; max. 12 pictures.",
    upload: "image",
    response: Product,
    async handler({ db, orgId, params, request }) {
      const p = await productOf(db, orgId, params.id)
      if (p.images.length >= 12) throw new ApiError(422, "too_many_images", "At most 12 pictures per product.")
      const path = await putImage(db, request, `orgs/${orgId}/shop/${params.id}`, null)
      if (!path) throw new ApiError(500, "internal", "Upload failed.")
      const { error } = await db.from("products").update({ images: [...p.images.map((i) => i.path), path] }).eq("id", params.id).eq("org_id", orgId)
      if (error) throw dbError(error)
      return productOf(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/shop/products/{id}/images/{index}",
    permission: "shop.manage",
    tag: TAG,
    summary: "Remove a product picture",
    description: "`index` = position in `images` (0 = cover).",
    response: Product,
    async handler({ db, orgId, params }) {
      const p = await productOf(db, orgId, params.id)
      const gone = p.images[Number(params.index)]
      if (!gone) throw notFound()
      const { error } = await db.from("products").update({ images: p.images.filter((i) => i !== gone).map((i) => i.path) }).eq("id", params.id).eq("org_id", orgId)
      if (error) throw dbError(error)
      await removeImage(db, gone.path)
      return productOf(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "PUT",
    path: "/shop/products/{id}/options",
    permission: "shop.manage",
    tag: TAG,
    summary: "Set variant options (generates the variants)",
    description: "Up to 3 options with values, e.g. `[{ name: \"Farbe\", values: [\"Schwarz\", \"Weiß\"] }, { name: \"Größe\", values: [\"S\", \"M\", \"L\"] }]` (max 100 combinations). Creates one variant per combination; existing combinations keep stock, price and picture; variants whose combination is gone are deleted (orders keep their own copy). An empty list removes the options and leaves the variants as they are.",
    body: z.object({ options: z.array(z.object({ name: z.string().max(40), values: z.array(z.string().max(40)).max(30) })).max(3) }).strict(),
    response: Product,
    async handler({ db, orgId, params, body }) {
      const r = readOptions(body.options)
      if ("error" in r) throw invalid(r.error)
      const res = await applyOptions(db, orgId, params.id, r.options)
      if ("error" in res) throw res.error === "db" ? dbError(res.db!) : notFound()
      return productOf(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "POST",
    path: "/shop/products/{id}/variants",
    permission: "shop.manage",
    tag: TAG,
    summary: "Add a variant",
    description: "Sizes, colours …: each with its own stock and optionally its own price. Once a product has variants, buyers always pick one.",
    body: VariantInput.required({ name: true }),
    response: Product,
    status: 201,
    async handler({ db, orgId, params, body }) {
      await productOf(db, orgId, params.id)
      const r = readVariant(getter({ ...asForm(body), has_active: "1", active: body.active ?? true }))
      if ("error" in r) throw invalid(r.error)
      const { error } = await db.from("product_variants").insert({ ...r.row, position: body.position ?? 0, org_id: orgId, product_id: params.id })
      if (error) throw dbError(error)
      return productOf(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/shop/variants/{id}",
    permission: "shop.manage",
    tag: TAG,
    summary: "Change a variant",
    body: VariantInput,
    response: Variant,
    async handler({ db, orgId, params, body }) {
      const { data: old } = await db.from("product_variants").select("product_id, name, price_cents, stock, active, digital, name_your_price, image_path, position").eq("id", params.id).eq("org_id", orgId).maybeSingle()
      if (!old) throw notFound()
      const next = { name: body.name ?? old.name, price_cents: body.price_cents !== undefined ? body.price_cents : old.price_cents, stock: body.stock !== undefined ? body.stock : old.stock, active: body.active ?? old.active, digital: body.digital ?? old.digital, name_your_price: body.name_your_price !== undefined ? body.name_your_price : old.name_your_price, position: body.position ?? old.position }
      const r = readVariant(getter({ ...asForm(next), has_active: "1" }))
      if ("error" in r) throw invalid(r.error)
      const image = body.image_path !== undefined ? body.image_path : old.image_path
      if (image && !(await productOf(db, orgId, old.product_id)).images.some((i) => i.path === image)) throw new ApiError(422, "image_unknown", "image_path must be one of the product's pictures.")
      const { data, error } = await db.from("product_variants").update({ ...r.row, image_path: image, position: next.position }).eq("id", params.id).eq("org_id", orgId).select("id, name, price_cents, stock, active, digital, name_your_price, option_values, image_path, position").single()
      if (error) throw dbError(error)
      return data
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/shop/variants/{id}",
    permission: "shop.manage",
    tag: TAG,
    summary: "Delete a variant",
    description: "Orders keep their own copy of name and price. To stop selling it but keep it, PATCH `active: false`.",
    response: z.object({ ok: z.literal(true) }),
    async handler({ db, orgId, params }) {
      const { error, count } = await db.from("product_variants").delete({ count: "exact" }).eq("id", params.id).eq("org_id", orgId)
      if (error) throw dbError(error)
      if (!count) throw notFound()
      return { ok: true }
    },
  }),

  endpoint({
    method: "GET",
    path: "/shop/products/{id}/tracks",
    permission: "shop.view",
    tag: TAG,
    summary: "List a product's music tracks",
    description: "Tracks in order with their conversion status (`uploading` → `pending` → `processing` → `ready` | `failed`), duration and the formats made from the master (stream = 128 kbps MP3 for the shop's player; mp3 = 320 kbps and wav = the master, what buyers download). One album ZIP (WAV + MP3 320 folders) is built once every track is ready.",
    response: z.object({ tracks: z.array(Track), album_zips: z.record(z.string(), z.object({ size: z.number().int() })) }),
    async handler({ db, orgId, params }) {
      await productOf(db, orgId, params.id)
      const { data } = await db.from("products").select("audio_zips").eq("id", params.id).eq("org_id", orgId).single()
      const zips = (data?.audio_zips ?? {}) as Record<string, { size: number }>
      return { tracks: (await productTrackList(db, orgId, params.id)).map(trackOut), album_zips: Object.fromEntries(Object.entries(zips).map(([k, v]) => [k, { size: v.size }])) }
    },
  }),
  endpoint({
    method: "POST",
    path: "/shop/products/{id}/tracks",
    permission: "shop.manage",
    tag: TAG,
    summary: "Add a music track (get an upload link)",
    description: "Step 1 of 2: creates the track and returns `upload_url`, a one-hour link to PUT the lossless master to (WAV, AIFF or FLAC, up to 250 MB; the file body as is). Step 2: POST /shop/tracks/{id}/uploaded. The title is guessed from the file name when left out.",
    body: z.object({ file_name: z.string().min(1).max(300), size: z.number().int().positive(), title: z.string().max(200).optional(), stream: z.boolean().optional().describe("Plays in the shop (default true); false = buyers only") }).strict(),
    response: z.object({ id: uuid, upload_url: z.string() }),
    status: 201,
    async handler({ db, orgId, params, body }) {
      const r = await startTrackUpload(db, orgId, params.id, { name: body.file_name, size: body.size })
      if ("error" in r) throw r.error === "db" ? dbError(r.db!) : fail(String(r.error))
      if (body.title || body.stream === false) await updateTrack(db, orgId, r.id!, { title: body.title || undefined, stream: body.stream })
      return { id: r.id!, upload_url: r.uploadUrl! }
    },
  }),
  endpoint({
    method: "POST",
    path: "/shop/tracks/{id}/uploaded",
    permission: "shop.manage",
    tag: TAG,
    summary: "Finish a track upload (start the conversion)",
    description: "Step 2 of 2 after the PUT to `upload_url`: checks the file arrived and queues the conversion (also re-runs a failed one). Poll GET /shop/products/{id}/tracks until `ready`.",
    response: z.object({ ok: z.literal(true) }),
    async handler({ db, orgId, params }) {
      const r = await finishTrackUpload(db, orgId, params.id)
      if ("error" in r) throw r.error === "db" ? dbError(r.db!) : fail(String(r.error))
      return { ok: true as const }
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/shop/tracks/{id}",
    permission: "shop.manage",
    tag: TAG,
    summary: "Change a track",
    description: "Title, number (`position`), whether it plays in the shop (`stream`) and whether it is sold on its own (`buyable`, needs the product's `track_price_cents`). Title or order changes rebuild the album ZIPs.",
    body: z.object({ title: z.string().max(200), position: z.number().int().min(0).max(999), stream: z.boolean(), buyable: z.boolean() }).partial().strict(),
    response: z.object({ ok: z.literal(true) }),
    async handler({ db, orgId, params, body }) {
      const r = await updateTrack(db, orgId, params.id, body)
      if ("error" in r) throw r.error === "db" ? dbError(r.db!) : fail(String(r.error))
      return { ok: true as const }
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/shop/tracks/{id}",
    permission: "shop.manage",
    tag: TAG,
    summary: "Delete a track",
    description: "Removes the track and all its audio files (master and formats); the album ZIPs are rebuilt without it. Buyers lose access to it too.",
    response: z.object({ ok: z.literal(true) }),
    async handler({ db, orgId, params }) {
      const r = await deleteTrack(db, orgId, params.id)
      if ("error" in r) throw r.error === "db" ? dbError(r.db!) : fail(String(r.error))
      return { ok: true as const }
    },
  }),

  endpoint({
    method: "GET",
    path: "/shop/orders",
    permission: "shop.view",
    tag: TAG,
    summary: "List shop orders",
    description: "Placed orders only (online orders count once paid), newest first.",
    query: page.extend({ status: z.enum(ORDER_STATUSES).optional(), q: z.string().max(100).optional().describe("Name or order number") }),
    response: list(ShopOrder),
    async handler({ db, orgId, query }) {
      let q = db.from("shop_orders").select(ORDER_COLS).eq("org_id", orgId).not("placed_at", "is", null).order("placed_at", { ascending: false }).range(query.offset, query.offset + query.limit)
      if (query.status) q = q.eq("status", query.status)
      const s = query.q?.replace(/[%,()*]/g, "").trim()
      if (s) q = /^\d+$/.test(s) ? q.eq("number", Number(s)) : q.ilike("name", `%${s}%`)
      const { data } = await q
      return paged((data ?? []).map((r) => orderOut(r as unknown as OrderRow)), query)
    },
  }),
  endpoint({
    method: "GET",
    path: "/shop/orders/{id}",
    permission: "shop.view",
    tag: TAG,
    summary: "Get a shop order",
    response: ShopOrder,
    async handler({ db, orgId, params }) {
      return orderOf(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "POST",
    path: "/shop/orders/{id}/pay",
    permission: "shop.manage",
    tag: TAG,
    summary: "Mark an order as paid",
    description: "For bank transfers (`transfer`) and cash at pickup (`cash`). Sends the 'payment received' mail and issues/marks the invoice.",
    body: z.object({ method: z.enum(["transfer", "cash"]) }).strict(),
    response: ShopOrder,
    async handler({ db, orgId, params, body }) {
      await markOrderPaid(orgId, params.id, body.method).catch((e) => Promise.reject(stepError(e)))
      deliverSoon()
      return orderOf(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "POST",
    path: "/shop/orders/{id}/status",
    permission: "shop.manage",
    tag: TAG,
    summary: "Move an order on: ready for pickup, shipped, completed",
    description: "`ready` and `shipped` mail the buyer (unless switched off in the settings); `tracking` is free text (carrier + number).",
    body: z.object({ status: z.enum(["new", "ready", "shipped", "completed"]), tracking: z.string().max(300).nullable().optional() }).strict(),
    response: ShopOrder,
    async handler({ db, orgId, params, body }) {
      await setOrderStatus(orgId, params.id, body.status, body.tracking).catch((e) => Promise.reject(stepError(e)))
      deliverSoon()
      return orderOf(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "POST",
    path: "/shop/orders/{id}/cancel",
    permission: "payments.refund",
    tag: TAG,
    summary: "Cancel an order",
    description: "A paid order is refunded in full (at the provider, or recorded as paid back for transfers/cash); its invoice gets a cancellation invoice and the buyer a mail. Units become available again.",
    body: z.object({ reason: z.string().max(500).optional() }).strict(),
    response: z.object({ refund: z.enum(["pending", "succeeded", "failed"]).nullable(), order: ShopOrder }),
    async handler({ db, orgId, params, body }) {
      const refund = await cancelOrder(orgId, params.id, body.reason).catch((e) => Promise.reject(stepError(e)))
      deliverSoon()
      return { refund, order: await orderOf(db, orgId, params.id) }
    },
  }),
  endpoint({
    method: "POST",
    path: "/shop/orders/{id}/refund",
    permission: "payments.refund",
    tag: TAG,
    summary: "Refund part of an order",
    description: "Pieces per order line (`lines`, line ids from the order's items) and/or another amount (`amount_cents`, e.g. goodwill; default = the pieces' price). The money goes back at the provider (transfers/cash: recorded, the org pays back itself). Refunded pieces are back in stock and unlock no downloads/music. An issued invoice gets a cancellation invoice and a new invoice for what stays. Refunding everything cancels the order. `notify` mails the buyer (kind refunded).",
    body: z
      .object({
        lines: z.array(z.object({ line_id: uuid, quantity: z.number().int().min(1) })).max(100).default([]),
        amount_cents: z.number().int().min(1).optional(),
        reason: z.string().max(500).optional(),
        notify: z.boolean().default(true),
      })
      .strict(),
    response: z.object({ refund: z.enum(["pending", "succeeded", "failed"]), order: ShopOrder }),
    async handler({ db, orgId, params, body }) {
      const form: Record<string, string> = { reason: body.reason ?? "" }
      for (const l of body.lines) form[`q_${l.line_id}`] = String(l.quantity)
      if (body.amount_cents != null) Object.assign(form, { other: "1", amount: (body.amount_cents / 100).toFixed(2).replace(".", ",") })
      const refund = await refundShopOrder(orgId, params.id, (k) => form[k] ?? "", body.notify).catch((e) => Promise.reject(stepError(e)))
      deliverSoon()
      return { refund, order: await orderOf(db, orgId, params.id) }
    },
  }),
  endpoint({
    method: "POST",
    path: "/shop/orders/{id}/invoice",
    permission: "shop.manage",
    tag: TAG,
    summary: "Issue the order's invoice",
    description: "When automatic invoices are off or the first try failed (e.g. invoice settings incomplete). Needs the invoices module.",
    response: ShopOrder,
    async handler({ db, orgId, params }) {
      const o = await orderOf(db, orgId, params.id)
      await ensureInvoice(o.order_id, true)
      const after = await orderOf(db, orgId, params.id)
      if (after.invoice_error) throw new ApiError(422, after.invoice_error, after.invoice_error)
      return after
    },
  }),
  endpoint({
    method: "POST",
    path: "/shop/orders/{id}/send",
    permission: "shop.manage",
    tag: TAG,
    summary: "Send a buyer mail again",
    body: z.object({ kind: z.enum(MAIL_KINDS) }).strict(),
    response: z.object({ sent: z.boolean() }),
    async handler({ db, orgId, params, body }) {
      const o = await orderOf(db, orgId, params.id)
      return { sent: await mail(body.kind, o.order_id) }
    },
  }),

  endpoint({
    method: "GET",
    path: "/shop/settings",
    permission: "shop.view",
    tag: TAG,
    summary: "Shop settings",
    response: z.record(z.string(), z.unknown()),
    async handler({ db, orgId }) {
      const { data } = await db.from("shop_settings").select("title, intro, pay_online, pay_transfer, pay_on_pickup, transfer_days, pickup, pickup_text, shipping, shipping_rates, auto_invoice, terms, withdrawal, mails").eq("org_id", orgId).maybeSingle()
      return data ?? {}
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/shop/settings",
    permission: "shop.manage",
    tag: TAG,
    summary: "Change the shop settings",
    description: "Payment methods, pickup/shipping (rates: [{name, cents, free_from, countries}]), automatic invoices, legal texts (Markdown), mails ({confirmation|paid|ready|shipped|refunded|cancelled|released: {off, message}}).",
    body: z
      .object({
        title: z.string().max(200).nullable(),
        intro: z.string().max(5000).nullable(),
        pay_online: z.boolean(),
        pay_transfer: z.boolean(),
        pay_on_pickup: z.boolean(),
        transfer_days: z.number().int().min(1).max(60),
        pickup: z.boolean(),
        pickup_text: z.string().max(2000).nullable(),
        shipping: z.boolean(),
        shipping_rates: z.array(z.object({ id: z.string().optional(), name: z.string(), cents: z.number().int(), free_from: z.number().int().nullable().optional(), countries: z.array(z.string()).optional() })).max(20),
        auto_invoice: z.boolean(),
        terms: z.string().max(50000).nullable(),
        withdrawal: z.string().max(50000).nullable(),
        mails: z.record(z.enum(MAIL_KINDS), z.object({ off: z.boolean().optional(), message: z.string().max(2000).optional() })),
      })
      .partial()
      .strict(),
    response: z.record(z.string(), z.unknown()),
    async handler({ db, orgId, body }) {
      const row = { ...body, ...(body.shipping_rates ? { shipping_rates: readShippingRates(body.shipping_rates.map((r, i) => ({ ...r, id: r.id ?? `api${i + 1}` }))) } : {}) }
      const { data, error } = await db
        .from("shop_settings")
        .upsert({ ...(row as Record<string, unknown>), org_id: orgId } as never, { onConflict: "org_id" })
        .select("title, intro, pay_online, pay_transfer, pay_on_pickup, transfer_days, pickup, pickup_text, shipping, shipping_rates, auto_invoice, terms, withdrawal, mails")
        .single()
      if (error) throw dbError(error)
      return data
    },
  }),
]
