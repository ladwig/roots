import { z } from "zod"
import { deliverSoon } from "@/events/worker"
import { imageUrl, removeImage } from "@/lib/images"
import { DELIVERIES, MAIL_KINDS, ORDER_STATUSES, PAYMENTS, PRODUCT_KINDS, PRODUCT_STATUSES, readProduct, readShippingRates, readVariant, TAX_RATES } from "@/shop/fields"
import { cancelOrder, ensureInvoice, mail, markOrderPaid, setOrderStatus } from "@/shop/server"
import { ApiError, dbError, endpoint, list, notFound, page, paged, uuid, type Endpoint } from "../core"
import { putImage, ts, type Db } from "./shared"

// Shop: products (+ variants, pictures, downloads via /files), orders and their fulfilment, settings. Validation =
// the App's (src/shop/fields.ts), order steps = src/shop/server.ts (mails, invoices, refunds happen there too).
const TAG = "Shop"
const Variant = z.object({ id: uuid, name: z.string(), price_cents: z.number().int().nullable().describe("null = the product's price"), stock: z.number().int().nullable(), active: z.boolean(), position: z.number().int() })
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
  images: z.array(z.object({ path: z.string(), image_url: z.string() })).describe("First = cover"),
  variants: z.array(Variant),
  created_at: ts,
  updated_at: ts,
})
const PRODUCT_COLS = "id, slug, name, description, kind, status, price_cents, tax_rate, stock, max_per_order, category, video_url, images, created_at, updated_at, product_variants(id, name, price_cents, stock, active, position)"
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
  })
  .partial()
  .strict()
const VariantInput = z.object({ name: z.string().max(100), price_cents: z.number().int().min(0).max(99_999_999).nullable(), stock: z.number().int().min(0).max(1_000_000).nullable(), active: z.boolean(), position: z.number().int() }).partial().strict()

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
  items: z.array(z.object({ description: z.string(), quantity: z.number().int(), unit_amount: z.number().int(), item_id: z.string().nullable().describe("Variant or product id") })),
  placed_at: ts.nullable(),
  created_at: ts,
})
const ORDER_COLS =
  "id, number, status, delivery, payment, name, company, street, postal_code, city, country, shipping_name, shipping_cents, note, tracking, contact_id, invoice_id, invoice_error, order_id, placed_at, created_at, pay_orders!inner(status, amount_total, currency, customer_email, pay_order_items(description, quantity, unit_amount, source_id))"
type OrderRow = { order_id: string; invoice_error: string | null; pay_orders: { status: string; amount_total: number; currency: string; customer_email: string | null; pay_order_items: { description: string; quantity: number; unit_amount: number; source_id: string | null }[] } } & Record<string, unknown>
const orderOut = ({ pay_orders: p, ...o }: OrderRow) => ({
  ...o,
  payment_status: p.status,
  total_cents: p.amount_total,
  currency: p.currency,
  email: p.customer_email,
  items: p.pay_order_items.map(({ source_id, ...i }) => ({ ...i, item_id: source_id })),
})

const getter = (o: Record<string, unknown>) => (k: string) => {
  const v = o[k]
  return v == null ? "" : typeof v === "boolean" ? (v ? "1" : "") : String(v)
}
const invalid = (key: string) => new ApiError(422, key.split(".").pop()!.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), key)
// The API speaks cents; the shared parser reads form strings ("25,00").
const asForm = (b: Record<string, unknown>) => ({ ...b, price: b.price_cents == null ? undefined : (Number(b.price_cents) / 100).toFixed(2).replace(".", ",") })

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
    description: "Starts as a draft unless `status` is `published`. The slug is made from the name when left out. Add pictures with POST /shop/products/{id}/images, sizes/colours as variants, download files (digital products) via /files with entity `products`.",
    body: ProductInput.required({ name: true, price_cents: true }),
    response: Product,
    status: 201,
    async handler({ db, orgId, body }) {
      const r = readProduct(getter(asForm(body)))
      if ("error" in r) throw invalid(r.error)
      const { data, error } = await db.from("products").insert({ ...r.row, org_id: orgId }).select("id").single()
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
      const { error } = await db.from("products").update(r.row).eq("id", params.id).eq("org_id", orgId)
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
      const { data: old } = await db.from("product_variants").select("name, price_cents, stock, active, position").eq("id", params.id).eq("org_id", orgId).maybeSingle()
      if (!old) throw notFound()
      const next = { name: body.name ?? old.name, price_cents: body.price_cents !== undefined ? body.price_cents : old.price_cents, stock: body.stock !== undefined ? body.stock : old.stock, active: body.active ?? old.active, position: body.position ?? old.position }
      const r = readVariant(getter({ ...asForm(next), has_active: "1" }))
      if ("error" in r) throw invalid(r.error)
      const { data, error } = await db.from("product_variants").update({ ...r.row, position: next.position }).eq("id", params.id).eq("org_id", orgId).select("id, name, price_cents, stock, active, position").single()
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
    description: "Payment methods, pickup/shipping (rates: [{name, cents, free_from, countries}]), automatic invoices, legal texts (Markdown), mails ({confirmation|paid|ready|shipped|cancelled: {off, message}}).",
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
