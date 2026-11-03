"use server"

import { redirect } from "next/navigation"
import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { removeImage, replaceImage } from "@/lib/images"
import { moneyCents } from "@/lib/inputs"
import { back } from "@/lib/url"
import { MAIL_KINDS, readProduct, readShippingRates, readVariant } from "@/shop/fields"
import { cancelOrder, ensureInvoice, mail, markOrderPaid, setOrderStatus } from "@/shop/server"

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
  const here = `/shop/${productId}#variants`
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
    back(here, { error: msg(t, e instanceof Error ? e.message : "") })
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
  const mails = Object.fromEntries(MAIL_KINDS.map((k) => [k, { off: !on(`mail_${k}`), message: text(`mail_${k}_message`, 2000) ?? undefined }]))
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

/** A track (audio file on the product): title, order, whether the full track plays in the shop; `delete` → trash. */
export async function saveTrack(fd: FormData) {
  const { ctx, t } = await manager()
  const productId = id(fd, "product_id")
  const fileId = id(fd)
  const here = `/shop/${productId}#tracks`
  if (!productId || !fileId) back("/shop", { error: t("errors.invalid_input") })
  if (fd.get("delete")) {
    const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.files", p_id: fileId })
    back(here, error ? { error: dbError(t, error) } : { ok: t("store.trackRemoved") })
  }
  const { data: f } = await ctx.supabase.from("files").select("meta").eq("id", fileId).eq("org_id", ctx.org.id).eq("entity", "product_audio").eq("entity_id", productId).maybeSingle()
  if (!f) back(here, { error: t("errors.not_allowed") })
  const meta = { ...((f.meta ?? {}) as Record<string, unknown>), title: String(fd.get("title") ?? "").trim().slice(0, 200), position: Math.floor(Number(fd.get("position")) || 0), stream: fd.get("stream") === "1" }
  const { error } = await ctx.supabase.from("files").update({ meta: meta as never }).eq("id", fileId).eq("org_id", ctx.org.id)
  if (error) back(here, { error: dbError(t, error) })
  back(here, { ok: t("store.saved") })
}
