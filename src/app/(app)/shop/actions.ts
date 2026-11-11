"use server"

import { redirect } from "next/navigation"
import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { removeImage, replaceImage } from "@/lib/images"
import { moneyCents } from "@/lib/inputs"
import { back } from "@/lib/url"
import { MAIL_KINDS, readOptions, readProduct, readShippingRates, readStockMove, readVariant } from "@/shop/fields"
import { bookStock, stockItem } from "@/shop/stock"
import { applyOptions, cancelOrder, ensureInvoice, issueMissingInvoices, mail, markOrderPaid, refundShopOrder, setOrderStatus } from "@/shop/server"
import { deleteTrack, finishTrackUpload, startTrackUpload, updateTrack } from "@/shop/audio"

const UUID = /^[0-9a-f-]{36}$/
const id = (fd: FormData, k = "id") => {
  const v = String(fd.get(k) ?? "")
  return UUID.test(v) ? v : null
}
const getter = (fd: FormData) => (k: string) => String(fd.get(k) ?? "")
type T = Awaited<ReturnType<typeof getT>>
const msg = (t: T, key: string) => (t.has(key) ? t.dynamic(key) : t("store.failed"))

async function manager() {
  const ctx = await requirePerm("shop.manage")
  const t = await getT()
  if (!ctx.modules.has("shop")) back("/shop", { error: t("errors.not_allowed") })
  return { ctx, t }
}

// ---------- products ----------

/** Create (→ its page) or update a product. */
export async function saveProduct(fd: FormData) {
  const { ctx, t } = await manager()
  const productId = id(fd)
  const here = productId ? `/shop/${productId}` : "/shop/new"
  const r = readProduct(getter(fd))
  if ("error" in r) back(here, { error: msg(t, r.error) })
  if (productId) {
    const { error } = await ctx.supabase.from("products").update(r.row).eq("id", productId).eq("org_id", ctx.org.id)
    if (error) back(here, { error: error.code === "23505" ? t("store.slugTaken") : dbError(t, error) })
    back(here, { ok: t("store.saved") })
  }
  const { data, error } = await ctx.supabase.from("products").insert({ ...r.row, org_id: ctx.org.id }).select("id").single()
  if (error) back(here, { error: error.code === "23505" ? t("store.slugTaken") : dbError(t, error) })
  redirect(`/shop/${data.id}?ok=${encodeURIComponent(t("store.created"))}#images`)
}

export async function trashProduct(fd: FormData) {
  const { ctx, t } = await manager()
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.products", p_id: String(fd.get("id") ?? "") })
  if (error) back(`/shop/${fd.get("id")}`, { error: dbError(t, error) })
  back("/shop", { ok: t("store.trashed") })
}

export async function restoreProduct(fd: FormData) {
  const { ctx, t } = await manager()
  const productId = String(fd.get("id") ?? "")
  const { error } = await ctx.supabase.rpc("restore_deleted", { p_table: "public.products", p_id: productId })
  if (error) back(`/shop/${productId}`, { error: error.code === "23505" ? t("store.slugTaken") : dbError(t, error) })
  back(`/shop/${productId}`, { ok: t("store.restored") })
}

/** Pictures: upload one (appended), remove one, or make one the cover (first). */
export async function productImage(fd: FormData) {
  const { ctx, t } = await manager()
  const productId = id(fd)
  const here = `/shop/${productId}#images`
  const { data: p } = await ctx.supabase.from("products").select("images").eq("id", productId ?? "").eq("org_id", ctx.org.id).maybeSingle()
  if (!p) back("/shop", { error: t("errors.not_allowed") })
  const path = String(fd.get("path") ?? "")
  let images = p.images
  if (fd.get("op") === "remove" && images.includes(path)) {
    images = images.filter((x) => x !== path)
    await removeImage(ctx.supabase, path)
  } else if (fd.get("op") === "cover" && images.includes(path)) {
    images = [path, ...images.filter((x) => x !== path)]
  } else {
    if (images.length >= 12) back(here, { error: t("store.tooManyImages") })
    const up = await replaceImage(ctx.supabase, `orgs/${ctx.org.id}/shop/${productId}`, fd.get("file"))
    if ("error" in up) back(here, { error: t.dynamic(`errors.${up.error}`) })
    images = [...images, up.path]
  }
  const { error } = await ctx.supabase.from("products").update({ images }).eq("id", productId!).eq("org_id", ctx.org.id)
  if (error) back(here, { error: dbError(t, error) })
  back(here, {})
}

/** Add (no id) or change a variant; `delete` removes it (orders keep their own copy of name + price). */
export async function saveVariant(fd: FormData) {
  const { ctx, t } = await manager()
  const productId = id(fd, "product_id")
  const variantId = id(fd)
  const here = `/shop/${productId}?tab=variants`
  if (!productId) back("/shop", { error: t("errors.invalid_input") })
  if (variantId && fd.get("delete")) {
    const { error } = await ctx.supabase.from("product_variants").delete().eq("id", variantId).eq("org_id", ctx.org.id)
    if (error) back(here, { error: dbError(t, error) })
    back(here, { ok: t("store.variantDeleted") })
  }
  const r = readVariant(getter(fd))
  if ("error" in r) back(here, { error: msg(t, r.error) })
  const { error } = variantId
    ? await ctx.supabase.from("product_variants").update(r.row).eq("id", variantId).eq("org_id", ctx.org.id)
    : await ctx.supabase.from("product_variants").insert({ ...r.row, org_id: ctx.org.id, product_id: productId, position: Number(fd.get("position")) || 0 })
  if (error) back(here, { error: dbError(t, error) })
  back(here, { ok: t("store.saved") })
}

/** All variants of a product in one go (the table): each row's fields come as `<field>_<variant id>`. */
export async function saveVariants(fd: FormData) {
  const { ctx, t } = await manager()
  const productId = id(fd, "product_id")
  const here = `/shop/${productId}?tab=variants`
  if (!productId) back("/shop", { error: t("errors.invalid_input") })
  const { data: p } = await ctx.supabase.from("products").select("images").eq("id", productId).eq("org_id", ctx.org.id).maybeSingle()
  if (!p) back(here, { error: t("errors.not_allowed") })
  const ids = fd.getAll("variant").map(String).filter((v) => UUID.test(v))
  for (const v of ids) {
    const r = readVariant((k) => String(fd.get(`${k}_${v}`) ?? ""))
    if ("error" in r) back(here, { error: msg(t, r.error) })
    const image = String(fd.get(`image_${v}`) ?? "")
    const { error } = await ctx.supabase
      .from("product_variants")
      .update({ ...r.row, image_path: p.images.includes(image) ? image : null })
      .eq("id", v)
      .eq("product_id", productId)
      .eq("org_id", ctx.org.id)
    if (error) back(here, { error: dbError(t, error) })
  }
  back(here, { ok: t("store.saved") })
}

/** Variant options (Farbe, Größe …): rows `option_name` + `option_values` (comma list) → variants per combination. */
export async function saveOptions(fd: FormData) {
  const { ctx, t } = await manager()
  const productId = id(fd, "product_id")
  const here = `/shop/${productId}?tab=variants`
  if (!productId) back("/shop", { error: t("errors.invalid_input") })
  const values = fd.getAll("option_values").map(String)
  const r = readOptions(fd.getAll("option_name").map((name, i) => ({ name: String(name), values: (values[i] ?? "").split(",") })))
  if ("error" in r) back(here, { error: msg(t, r.error) })
  const res = await applyOptions(ctx.supabase, ctx.org.id, productId, r.options)
  if ("error" in res) back(here, { error: res.error === "db" ? dbError(t, res.db!) : msg(t, String(res.error)) })
  back(here, { ok: t("store.optionsSaved", { created: res.created, removed: res.removed }) })
}

// ---------- orders ----------

type Ctx = Awaited<ReturnType<typeof manager>>["ctx"]

// Every order action: shop.manage, the order id from the form, errors and success as a toast on the order page.
async function orderStep(fd: FormData, run: (ctx: Ctx, orderId: string, t: T) => Promise<string | void>) {
  const { ctx, t } = await manager()
  const orderId = id(fd)
  const here = `/shop/orders/${orderId}`
  if (!orderId) back("/shop/orders", { error: t("errors.invalid_input") })
  let ok: string | void
  try {
    ok = await run(ctx, orderId, t)
  } catch (e) {
    const m = e instanceof Error ? e.message : ""
    // Unknown errors (e.g. the payment provider's own message): log them and show what the provider said.
    if (!t.has(m)) console.error("shop order step", orderId, e)
    back(here, { error: t.has(m) ? t.dynamic(m) : m ? t("store.failedWith", { message: m.slice(0, 300) }) : t("store.failed") })
  }
  deliverSoon()
  back(here, { ok: ok || t("store.saved") })
}
const payOrderOf = async (ctx: Ctx, orderId: string) => {
  const { data } = await ctx.supabase.from("shop_orders").select("order_id").eq("id", orderId).eq("org_id", ctx.org.id).maybeSingle()
  if (!data) throw new Error("errors.not_found")
  return data.order_id
}

export async function markPaidAction(fd: FormData) {
  await orderStep(fd, async (ctx, order, t) => {
    await markOrderPaid(ctx.org.id, order, fd.get("method") === "cash" ? "cash" : "transfer")
    return t("store.markedPaid")
  })
}

export async function orderStatusAction(fd: FormData) {
  const status = (["new", "ready", "shipped", "completed"] as const).find((s) => s === fd.get("status"))
  await orderStep(fd, async (ctx, order) => {
    if (!status) throw new Error("errors.invalid_input")
    await setOrderStatus(ctx.org.id, order, status, fd.has("tracking") ? String(fd.get("tracking")) : undefined)
  })
}

/** Cancel; a paid order is refunded in full, so this needs payments.refund too. */
export async function cancelOrderAction(fd: FormData) {
  await orderStep(fd, async (ctx, order, t) => {
    if (!ctx.can("payments.refund")) throw new Error("errors.not_allowed")
    const r = await cancelOrder(ctx.org.id, order, String(fd.get("reason") ?? "").slice(0, 500) || undefined)
    return r === "pending" ? t("store.refundPending") : t("store.cancelled")
  })
}

/** Refund part of the order (pieces and/or another amount, drawer on the order page); needs payments.refund. */
export async function refundOrderAction(fd: FormData) {
  await orderStep(fd, async (ctx, order, t) => {
    if (!ctx.can("payments.refund")) throw new Error("errors.not_allowed")
    const r = await refundShopOrder(ctx.org.id, order, (k) => String(fd.get(k) ?? ""), fd.get("notify") === "1")
    return r === "pending" ? t("payments.refundPending") : t("store.refundDone")
  })
}

/** Shop → Bestellungen → ⋯: invoices for every paid order that has none yet. */
export async function issueMissingInvoicesAction() {
  const { ctx, t } = await manager()
  let done = 0
  try {
    done = await issueMissingInvoices(ctx.org.id)
  } catch (e) {
    back("/shop/orders", { error: msg(t, e instanceof Error ? e.message : "") })
  }
  back("/shop/orders", { ok: t("store.invoicesIssued", { count: done }) })
}

/** Issue the invoice now (auto invoices off, or the first try failed). */
export async function invoiceAction(fd: FormData) {
  await orderStep(fd, async (ctx, order, t) => {
    await ensureInvoice(await payOrderOf(ctx, order), true)
    const { data } = await ctx.supabase.from("shop_orders").select("invoice_error").eq("id", order).single()
    if (data?.invoice_error) throw new Error(`errors.${data.invoice_error}`)
    return t("store.invoiceIssued")
  })
}

export async function resendMailAction(fd: FormData) {
  const kind = MAIL_KINDS.find((k) => k === fd.get("kind"))
  await orderStep(fd, async (ctx, order, t) => {
    if (!kind) throw new Error("errors.invalid_input")
    if (!(await mail(kind, await payOrderOf(ctx, order)))) throw new Error("store.mailNotSent")
    return t("store.mailSent")
  })
}

// ---------- settings ----------

const readMails = (fd: FormData) =>
  Object.fromEntries(MAIL_KINDS.map((k) => [k, { off: fd.get(`mail_${k}`) !== "1", message: String(fd.get(`mail_${k}_message`) ?? "").trim().slice(0, 2000) || undefined }]))

/** Only the buyer mails (E-Mail → Vorlagen shows them too). */
export async function saveShopMails(fd: FormData) {
  const { ctx, t } = await manager()
  const here = "/email/templates"
  const { error } = await ctx.supabase.from("shop_settings").upsert({ org_id: ctx.org.id, mails: readMails(fd) as never }, { onConflict: "org_id" })
  if (error) back(here, { error: dbError(t, error) })
  back(here, { ok: t("store.saved") })
}

export async function saveShopSettings(fd: FormData) {
  const { ctx, t } = await manager()
  const here = "/shop/settings"
  const on = (k: string) => fd.get(k) === "1"
  const text = (k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max) || null
  // Shipping rates come as parallel lists (one row per rate; empty names are dropped).
  const list = (k: string) => fd.getAll(k).map(String)
  const rates = list("rate_name").map((name, i) => ({
    id: list("rate_id")[i] || crypto.randomUUID().slice(0, 8),
    name,
    cents: moneyCents(list("rate_price")[i] || "0"),
    free_from: list("rate_free")[i]?.trim() ? moneyCents(list("rate_free")[i]) : null,
    countries: list("rate_countries")[i] || "DE",
  }))
  const mails = readMails(fd)
  const days = Math.floor(Number(fd.get("transfer_days")) || 7)
  const { error } = await ctx.supabase.from("shop_settings").upsert(
    {
      org_id: ctx.org.id,
      title: text("title", 200),
      intro: text("intro", 5000),
      pay_online: on("pay_online"),
      pay_transfer: on("pay_transfer"),
      pay_on_pickup: on("pay_on_pickup"),
      transfer_days: Math.min(60, Math.max(1, days)),
      pickup: on("pickup"),
      pickup_text: text("pickup_text", 2000),
      shipping: on("shipping"),
      shipping_rates: readShippingRates(rates) as never,
      auto_invoice: on("auto_invoice"),
      terms: text("terms", 50000),
      withdrawal: text("withdrawal", 50000),
      mails: mails as never,
    },
    { onConflict: "org_id" },
  )
  if (error) back(here, { error: dbError(t, error) })
  back(here, { ok: t("store.saved") })
}

/** Music upload, step 1 (called from the browser): the track row + a link to PUT the master to. */
export async function startAudioUpload(productId: string, name: string, size: number): Promise<{ id: string; url: string } | { error: string }> {
  const { ctx, t } = await manager()
  const r = await startTrackUpload(ctx.supabase, ctx.org.id, productId, { name: String(name), size: Number(size) })
  if ("error" in r) return { error: r.error === "db" ? dbError(t, r.db!) : t.dynamic(String(r.error), { max: "250 MB" }) }
  return { id: r.id, url: r.uploadUrl }
}

/** Step 2: the upload is done → convert (runs in the background, the page shows the status). */
export async function finishAudioUpload(trackId: string): Promise<{ error?: string }> {
  const { ctx, t } = await manager()
  const r = await finishTrackUpload(ctx.supabase, ctx.org.id, trackId)
  return "error" in r ? { error: r.error === "db" ? dbError(t, r.db!) : t.dynamic(String(r.error)) } : {}
}

/** Single tracks: one price for all of a product's tracks (empty = album only). */
/** The music tab in one go: price per single track (empty = album only) + every track's number, title, switches. */
export async function saveTracks(fd: FormData) {
  const { ctx, t } = await manager()
  const productId = id(fd, "product_id")
  const here = `/shop/${productId}?tab=digital`
  const raw = String(fd.get("track_price") ?? "").trim()
  const cents = raw ? moneyCents(raw) : null
  if (!productId || (raw && (cents === null || cents > 1_000_000))) back(here, { error: t("store.priceInvalid") })
  const { error, count } = await ctx.supabase.from("products").update({ track_price_cents: cents }, { count: "exact" }).eq("id", productId).eq("org_id", ctx.org.id)
  if (error || !count) back(here, { error: error ? dbError(t, error) : t("errors.not_allowed") })
  const buyable = fd.get("has_buyable") === "1"
  for (const v of fd.getAll("track").map(String).filter((v) => UUID.test(v))) {
    const r = await updateTrack(ctx.supabase, ctx.org.id, v, {
      title: String(fd.get(`title_${v}`) ?? ""),
      position: Number(fd.get(`position_${v}`)) || 0,
      stream: fd.get(`stream_${v}`) === "1",
      ...(buyable ? { buyable: fd.get(`buyable_${v}`) === "1" } : {}),
    })
    if ("error" in r) back(here, { error: r.error === "db" ? dbError(t, r.db!) : t.dynamic(String(r.error)) })
  }
  back(here, { ok: t("store.saved") }) // the catalog is read live, no cache to refresh
}

/** One track: `delete` removes it with its files, else it is converted again (retry). Edits go through saveTracks. */
export async function saveTrack(fd: FormData) {
  const { ctx, t } = await manager()
  const productId = id(fd, "product_id")
  const trackId = id(fd)
  const here = `/shop/${productId}?tab=digital`
  if (!productId || !trackId) back("/shop", { error: t("errors.invalid_input") })
  const r = fd.get("delete")
    ? await deleteTrack(ctx.supabase, ctx.org.id, trackId)
    : await finishTrackUpload(ctx.supabase, ctx.org.id, trackId)
  if ("error" in r) back(here, { error: r.error === "db" ? dbError(t, r.db!) : t.dynamic(String(r.error)) })
  back(here, { ok: fd.get("delete") ? t("store.trackRemoved") : t("store.saved") })
}

// ---------- Lager ----------

/** Book a movement or a sale at the merch table on one item (drawer on Shop → Lager). */
export async function bookStockAction(fd: FormData) {
  const { ctx, t } = await manager()
  const itemId = id(fd, "item")
  const here = `/shop/stock?item=${itemId}`
  const item = itemId && (await stockItem(ctx.supabase, ctx.org.id, itemId))
  if (!item) back("/shop/stock", { error: t("errors.not_found") })
  const r = readStockMove(getter(fd), item.on_hand ?? 0)
  if ("error" in r) back(here, { error: msg(t, r.error) })
  let order: string | null = null
  try {
    order = await bookStock(ctx.supabase, ctx.org.id, item, r)
  } catch (e) {
    const m = e instanceof Error ? e.message : ""
    if (!t.has(m)) console.error("shop stock", itemId, e)
    back(here, { error: msg(t, m) })
  }
  deliverSoon()
  back(here, { ok: t(order ? "store.lager.soldDone" : "store.lager.booked") })
}
