// Shop, server side (service role). Buyers are anonymous: everything here validates its own input; team actions
// are checked by their callers (Server Actions / API). Money goes through src/payments (createOrder → startCheckout
// or a manual payment); this module adds delivery, stock, the invoice and the buyer's mails.
import { createAdminClient } from "@/lib/supabase/admin"
import { orgT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { siteUrl } from "@/lib/url"
import { sendOrgEmail } from "@/lib/org-email"
import { builtInTemplate, renderEventMail } from "@/email/event-mail"
import { button, type Markup } from "@/email/render"
import { totals } from "@/documents/calc"
import { addDays, today } from "@/documents/drafts"
import { loadDocView, pdfLogo } from "@/documents/load"
import { renderPdf } from "@/documents/pdf"
import { createOrder, payManually, providerFor, refundOrder, startCheckout } from "@/payments/server"
import { cancelCollect } from "@/payments/pos"
import type { PaidOrder } from "@/payments/fulfilment"
import {
  deliveriesFor,
  paymentsFor,
  priceCart,
  readShippingRates,
  shippingCents,
  subtotalOf,
  type CartLine,
  type CatalogProduct,
  type Delivery,
  type MailKind,
  type Payment,
} from "./fields"

const db = () => createAdminClient()

export const DEFAULT_SETTINGS = {
  title: null as string | null,
  intro: null as string | null,
  pay_online: true,
  pay_transfer: false,
  pay_on_pickup: false,
  transfer_days: 7,
  pickup: true,
  pickup_text: null as string | null,
  shipping: false,
  shipping_rates: [] as unknown,
  auto_invoice: true,
  terms: null as string | null,
  withdrawal: null as string | null,
  mails: {} as unknown,
}
export type Settings = typeof DEFAULT_SETTINGS

export async function shopSettings(orgId: string): Promise<Settings> {
  const { data } = await db().from("shop_settings").select("*").eq("org_id", orgId).maybeSingle()
  return data ? { ...DEFAULT_SETTINGS, ...data } : DEFAULT_SETTINGS
}

/** Published products as the public pages see them (one with its description when `slug` is given). */
export async function catalog(orgId: string, slug?: string): Promise<CatalogProduct[]> {
  const { data } = await db().rpc("shop_catalog", { p_org: orgId, p_slug: slug })
  return (data ?? []) as CatalogProduct[]
}

/** Can the org take online payments right now? (provider connected and ready) */
export const onlineReady = async (orgId: string) => !!(await providerFor(orgId))

// ---------- placing an order (public) ----------

export type Address = { company: string | null; street: string; postal_code: string; city: string; country: string }
export type PlaceInput = {
  orgId: string
  cart: CartLine[]
  name: string
  email: string
  delivery: Delivery
  payment: Payment
  rateId: string | null
  address: Address | null
  note: string | null
  expectedTotal: number // what the buyer saw; a different total now = "store.priceChanged"
  orderUrl: (orderId: string, token: string) => string
  cancelUrl: (orderId: string, token: string) => string
}

/** Checks the cart against today's catalog + settings, stores the order; `url` = where to send the buyer. Throws message keys. */
export async function placeOrder(p: PlaceInput) {
  const [settings, products, ready] = await Promise.all([shopSettings(p.orgId), catalog(p.orgId), onlineReady(p.orgId)])
  const lines = priceCart(p.cart, products)
  if (!lines.length || lines.length !== p.cart.length) throw new Error("store.cartChanged")
  if (lines.some((l) => l.problem)) throw new Error("store.soldOutError")
  if (!deliveriesFor(settings, lines).includes(p.delivery)) throw new Error("store.deliveryInvalid")
  const subtotal = subtotalOf(lines)
  let shipping = 0
  let rateName: string | null = null
  if (p.delivery === "shipping") {
    const rate = readShippingRates(settings.shipping_rates).find((r) => r.id === p.rateId)
    if (!rate || !p.address || !rate.countries.includes(p.address.country)) throw new Error("store.shippingInvalid")
    shipping = shippingCents(rate, subtotal)
    rateName = rate.name
  }
  const total = subtotal + shipping
  if (total !== p.expectedTotal) throw new Error("store.priceChanged")
  if (total > 0 && !paymentsFor(settings, p.delivery, ready).includes(p.payment)) throw new Error("store.paymentInvalid")
  const payment: Payment = total === 0 ? "online" : p.payment // free: startCheckout marks it paid right away
  const t = await orgT(p.orgId)
  // Shipping counts at the highest VAT rate of the goods (ponytail: no split by rate for mixed carts).
  const shipRate = Math.max(...lines.map((l) => l.tax_rate))

  const orderId = await createOrder({
    orgId: p.orgId,
    sourceModule: "shop",
    customerEmail: p.email,
    customerName: p.name,
    items: [
      ...lines.map((l) => ({ description: l.name.slice(0, 200), quantity: l.quantity, unitAmount: l.unit, sourceId: l.id, metadata: { tax_rate: l.tax_rate, product_id: l.product.id, kind: l.product.kind } })),
      ...(rateName ? [{ description: `${t("store.shippingLine")}: ${rateName}`.slice(0, 200), quantity: 1, unitAmount: shipping, metadata: { tax_rate: shipRate, shipping: true } }] : []),
    ],
  })
  // Units are held while the order is open: online until the checkout ends, transfers for a few days, pickup until done.
  if (payment === "transfer") await db().from("pay_orders").update({ expires_at: new Date(Date.now() + settings.transfer_days * 86_400_000).toISOString() }).eq("id", orderId)
  const { data: so, error } = await db()
    .from("shop_orders")
    .insert({
      org_id: p.orgId,
      order_id: orderId,
      number: 0, // set by the trigger (per org, from 1001)
      delivery: p.delivery,
      payment,
      name: p.name,
      company: p.address?.company ?? null,
      street: p.address?.street ?? null,
      postal_code: p.address?.postal_code ?? null,
      city: p.address?.city ?? null,
      country: p.address?.country ?? null,
      shipping_name: rateName,
      shipping_cents: shipping,
      note: p.note,
    })
    .select("id, token")
    .single()
  const cancel = async () => {
    await db().from("pay_orders").update({ status: "cancelled" }).eq("id", orderId)
    if (so) await db().from("shop_orders").update({ status: "cancelled" }).eq("id", so.id)
  }
  if (error || !so) {
    await cancel()
    throw error ?? new Error("store.failed")
  }
  const { data: fits } = await db().rpc("shop_check", { p_order: orderId })
  if (!fits) {
    await cancel()
    throw new Error("store.soldOutError")
  }
  const orderUrl = p.orderUrl(orderId, so.token)
  const done = { orderId, token: so.token, orderUrl }
  if (payment === "online") {
    try {
      const successUrl = `${orderUrl}${orderUrl.includes("?") ? "&" : "?"}paid=1`
      return { ...done, url: await startCheckout(orderId, { successUrl, cancelUrl: p.cancelUrl(orderId, so.token) }) }
    } catch (e) {
      await cancel()
      throw e
    }
  }
  await placed(orderId) // transfer / pay on pickup: the order is real now
  return { ...done, url: orderUrl }
}

// ---------- after placing / paying ----------

const ORDER_COLS =
  "id, org_id, order_id, number, token, status, delivery, payment, name, company, street, postal_code, city, country, shipping_name, shipping_cents, note, tracking, contact_id, invoice_id, invoice_error, created_at, pay_orders!inner(status, amount_total, currency, customer_email, customer_name, expires_at, paid_at, pay_order_items(description, quantity, unit_amount, source_id, metadata)), orgs!inner(slug, name, logo_path, site_domain)"

async function loadOrder(orderId: string) {
  const { data } = await db().from("shop_orders").select(ORDER_COLS).eq("order_id", orderId).maybeSingle()
  return data
}
type Order = NonNullable<Awaited<ReturnType<typeof loadOrder>>>

/** Transfer / pay-on-pickup orders right after placing: contact, invoice (transfer: now, to pay against), mail, event. */
async function placed(orderId: string) {
  const o = await loadOrder(orderId)
  if (!o) return
  await db().from("shop_orders").update({ placed_at: new Date().toISOString() }).eq("id", o.id)
  await linkContact(o)
  if (o.payment === "transfer") await ensureInvoice(o.order_id).catch((e) => console.error("shop invoice", orderId, e))
  await mail("confirmation", o.order_id).catch((e) => console.error("shop mail", orderId, e))
  await emitPlaced(o)
}

const emitPlaced = (o: Order) =>
  db().rpc("emit_event", {
    p_org: o.org_id,
    p_type: "shop.order_placed",
    p_payload: { shop_order_id: o.id, order_id: o.order_id, number: o.number, name: o.name, contact_id: o.contact_id, amount: o.pay_orders.amount_total, currency: o.pay_orders.currency },
    p_subject_table: "shop_orders",
    p_subject_id: o.id,
  })

/** Paid (webhook, manual payment, free order). Idempotent enough: runs until it succeeded once (payments/fulfil). */
export async function shopPaid(order: PaidOrder) {
  const o = await loadOrder(order.id)
  if (!o || o.status === "cancelled") return
  await db().from("shop_orders").update({ placed_at: new Date().toISOString() }).eq("id", o.id).is("placed_at", null)
  await linkContact(o)
  if (o.delivery === "digital") await db().from("shop_orders").update({ status: "completed" }).eq("id", o.id).eq("status", "new")
  await ensureInvoice(o.order_id).catch((e) => console.error("shop invoice", o.order_id, e))
  // Online orders weren't real before the payment: they get the confirmation (and count as placed) now.
  await mail(o.payment === "online" ? "confirmation" : "paid", o.order_id).catch((e) => console.error("shop mail", o.order_id, e))
  if (o.payment === "online") await emitPlaced(o)
}

/** Fully refunded: the order is cancelled, the invoice gets its Stornorechnung, the buyer a mail. */
export async function shopRefunded(order: PaidOrder) {
  const o = await loadOrder(order.id)
  if (!o || o.status === "cancelled") return
  await closeOrder(o)
}

async function closeOrder(o: Order) {
  await db().from("shop_orders").update({ status: "cancelled" }).eq("id", o.id)
  if (o.invoice_id) {
    const { data: inv } = await db().from("documents").select("status").eq("id", o.invoice_id).single()
    if (inv && ["sent", "paid"].includes(inv.status)) await db().rpc("cancel_invoice", { p_id: o.invoice_id })
  }
  await mail("cancelled", o.order_id).catch((e) => console.error("shop mail", o.order_id, e))
}

async function linkContact(o: Order) {
  const email = o.pay_orders.customer_email
  if (o.contact_id || !email) return
  const { data: found } = await db().from("contacts").select("id").eq("org_id", o.org_id).eq("email", email).is("deleted_at", null).maybeSingle()
  let id = found?.id ?? null
  if (!id) {
    const [first, ...rest] = o.name.trim().split(/\s+/)
    const { data: created } = await db()
      .from("contacts")
      .insert({ org_id: o.org_id, email, first_name: first || null, last_name: rest.join(" ") || null, company: o.company, street: o.street, postal_code: o.postal_code, city: o.city, tags: ["Shop"] })
      .select("id")
      .single()
    id = created?.id ?? null
  }
  if (id) {
    await db().from("shop_orders").update({ contact_id: id }).eq("id", o.id)
    o.contact_id = id
  }
}

// ---------- invoice ----------

const addressLines = (o: Pick<Order, "name" | "company" | "street" | "postal_code" | "city" | "country">) =>
  [o.company ? o.name : null, o.street, [o.postal_code, o.city].filter(Boolean).join(" ") || null, o.country && o.country !== "DE" ? o.country : null]
    .filter(Boolean)
    .join("\n") || null

/**
 * The order's invoice (gross prices = exactly what was paid), issued at once. Without the invoices module or with
 * auto invoices off: nothing. A failure (invoice settings incomplete…) is stored on the order; the draft stays linked,
 * so the team can fix it in Rechnungen or retry from the order.
 */
export async function ensureInvoice(orderId: string, force = false) {
  const o = await loadOrder(orderId)
  if (!o) return
  const [{ data: mod }, settings] = await Promise.all([
    db().from("org_modules").select("module_key").eq("org_id", o.org_id).eq("module_key", "invoices").maybeSingle(),
    shopSettings(o.org_id),
  ])
  if (!mod || (!settings.auto_invoice && !force)) return
  const paid = ["paid", "partially_refunded"].includes(o.pay_orders.status)
  let id = o.invoice_id
  if (id) {
    const { data: inv } = await db().from("documents").select("status").eq("id", id).single()
    if (inv?.status === "sent" && paid) await db().from("documents").update({ status: "paid" }).eq("id", id)
    if (inv?.status !== "draft") return
  } else {
    const { data: b } = await db().from("org_billing").select("tax_mode, invoice_intro, invoice_outro").eq("org_id", o.org_id).maybeSingle()
    const small = b?.tax_mode === "small_business"
    const items = o.pay_orders.pay_order_items.map((i, position) => {
      const meta = (i.metadata ?? {}) as Record<string, unknown>
      return { position, title: i.description, description: null, quantity: i.quantity, unit: meta.shipping ? "flat" : "piece", unit_price: i.unit_amount, tax_rate: small ? 0 : Number(meta.tax_rate ?? 19) }
    })
    const sum = totals(items, small, true)
    const t = await orgT(o.org_id)
    const { data: doc, error } = await db()
      .from("documents")
      .insert({
        org_id: o.org_id,
        kind: "invoice",
        prices_gross: true,
        contact_id: o.contact_id,
        recipient_name: o.company || o.name,
        recipient_address: addressLines(o),
        recipient_email: o.pay_orders.customer_email,
        tax_mode: small ? "small_business" : "standard",
        currency: o.pay_orders.currency,
        intro: b?.invoice_intro ?? null,
        outro: b?.invoice_outro ?? null,
        service_from: today(),
        due_date: paid ? null : o.pay_orders.expires_at ? o.pay_orders.expires_at.slice(0, 10) : addDays(today(), 14),
        notes: t("store.invoiceNote", { number: String(o.number) }),
        net_total: sum.net,
        tax_total: sum.tax,
        gross_total: sum.gross,
      })
      .select("id")
      .single()
    if (error) return void (await saveInvoiceError(o.id, error.message))
    id = doc.id
    await db().from("document_items").insert(items.map((i) => ({ ...i, org_id: o.org_id, document_id: doc.id })))
    await db().from("shop_orders").update({ invoice_id: id }).eq("id", o.id)
  }
  const { error } = await db().rpc("issue_document", { p_id: id! })
  if (error) return void (await saveInvoiceError(o.id, error.message))
  if (paid) await db().from("documents").update({ status: "paid" }).eq("id", id!)
  await db().from("shop_orders").update({ invoice_error: null }).eq("id", o.id)
}
const saveInvoiceError = (id: string, message: string) => db().from("shop_orders").update({ invoice_error: message.slice(0, 300) }).eq("id", id)

async function invoicePdf(o: Order, t: T) {
  if (!o.invoice_id) return null
  const loaded = await loadDocView({ supabase: db(), org: { id: o.org_id, logo_path: o.orgs.logo_path } }, o.invoice_id, t)
  if (!loaded || loaded.doc.status === "draft") return null
  return { filename: `${loaded.doc.number}.pdf`, content: await renderPdf(loaded.view, await pdfLogo(loaded.view.logoUrl)) }
}

// ---------- mails ----------

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const md = (html: string, text: string): Markup => ({ html, text })

/** The buyer's order page. */
export const orderLink = (o: { order_id: string; token: string; orgs: { slug: string; site_domain: string | null } }) =>
  siteUrl(o.orgs.slug, `/o/${o.order_id}?k=${o.token}`, o.orgs.site_domain)

function mailMessage(kind: MailKind, o: Order, t: T, custom: string | null, bank: { holder: string; iban: string; bic: string | null } | null, pickupText: string | null) {
  const cur = o.pay_orders.currency
  const vars = { number: String(o.number), name: o.name, total: t.money(o.pay_orders.amount_total, cur), org: o.orgs.name }
  const intro = custom?.trim() ? custom.replace(/\{([a-z]+)\}/g, (m, k: string) => (k in vars ? vars[k as keyof typeof vars] : m)) : t.dynamic(`store.mail.${kind}.message`, vars)
  const parts: Markup[] = [md(`<p>${esc(intro).replace(/\n/g, "<br>")}</p>`, intro)]
  if (kind === "confirmation" || kind === "paid") {
    const rows = o.pay_orders.pay_order_items.map((i) => [`${i.quantity}× ${i.description}`, t.money(i.quantity * i.unit_amount, cur)])
    rows.push([t("store.total"), t.money(o.pay_orders.amount_total, cur)])
    parts.push(
      md(
        `<table style="border-collapse:collapse;margin:0 0 14px">${rows.map(([a, b], n) => `<tr><td style="padding:2px 16px 2px 0${n === rows.length - 1 ? ";font-weight:600" : ""}">${esc(a)}</td><td style="padding:2px 0;text-align:right${n === rows.length - 1 ? ";font-weight:600" : ""}">${esc(b)}</td></tr>`).join("")}</table>`,
        rows.map(([a, b]) => `${a}: ${b}`).join("\n"),
      ),
    )
  }
  const unpaid = o.pay_orders.status === "open"
  if (kind === "confirmation" && unpaid && o.payment === "transfer" && bank) {
    const lines = [
      t("store.transfer.holder", { holder: bank.holder }),
      `IBAN: ${bank.iban.replace(/(.{4})/g, "$1 ").trim()}`,
      ...(bank.bic ? [`BIC: ${bank.bic}`] : []),
      t("store.transfer.amount", { amount: t.money(o.pay_orders.amount_total, cur) }),
      t("store.transfer.reference", { reference: t("store.transfer.referenceText", { number: String(o.number) }) }),
    ]
    const head = t("store.transfer.title", { date: o.pay_orders.expires_at ? t.date(o.pay_orders.expires_at, { dateStyle: "medium" }) : "" })
    parts.push(md(`<p><strong>${esc(head)}</strong><br>${lines.map(esc).join("<br>")}</p>`, `${head}\n${lines.join("\n")}`))
  }
  if (kind === "confirmation" && unpaid && o.payment === "pickup") parts.push(md(`<p>${esc(t("store.payOnPickupNote"))}</p>`, t("store.payOnPickupNote")))
  if ((kind === "ready" || (kind === "confirmation" && o.delivery === "pickup")) && pickupText) parts.push(md(`<p>${esc(pickupText).replace(/\n/g, "<br>")}</p>`, pickupText))
  if (kind === "shipped" && o.tracking) parts.push(md(`<p>${esc(t("store.trackingLine", { tracking: o.tracking }))}</p>`, t("store.trackingLine", { tracking: o.tracking })))
  if (o.delivery === "digital" && !unpaid && (kind === "confirmation" || kind === "paid")) parts.push(md(`<p>${esc(t("store.downloadsNote"))}</p>`, t("store.downloadsNote")))
  return { html: parts.map((p) => p.html).join(""), text: parts.map((p) => p.text).join("\n\n") }
}

/** One buyer mail, unless the org switched that kind off. False = not sent (off, no address, no provider). */
export async function mail(kind: MailKind, orderId: string) {
  const o = await loadOrder(orderId)
  const to = o?.pay_orders.customer_email
  if (!o || !to) return false
  const settings = await shopSettings(o.org_id)
  const conf = ((settings.mails ?? {}) as Record<string, { off?: boolean; message?: string }>)[kind] ?? {}
  if (conf.off) return false
  const [t, { data: org }, { data: bank }] = await Promise.all([
    orgT(o.org_id),
    db().from("orgs").select("org_modules(module_key), email_templates(subject, body, format)").eq("id", o.org_id).eq("org_modules.module_key", "email").eq("email_templates.is_default", true).single(),
    db().from("org_billing").select("legal_name, iban, bic").eq("org_id", o.org_id).maybeSingle(),
  ])
  const template = org?.org_modules.length ? (org.email_templates[0] ?? null) : null
  const link = orderLink(o)
  const vars = { number: String(o.number), name: o.name }
  const mailVars = {
    name: o.name,
    email: to,
    org: o.orgs.name,
    number: String(o.number),
    total: t.money(o.pay_orders.amount_total, o.pay_orders.currency),
    title: t.dynamic(`store.mail.${kind}.title`, vars),
    message: mailMessage(kind, o, t, conf.message ?? null, bank?.iban ? { holder: bank.legal_name ?? o.orgs.name, iban: bank.iban, bic: bank.bic } : null, settings.pickup_text),
    button: button(link, t("store.mail.button")),
    link,
    // event placeholders a shared template may use stay empty
    event: "", when: "", venue: "", count: "", list: "", until: "",
  }
  const rendered = renderEventMail(t, template ?? builtInTemplate(t), mailVars, o.orgs)
  const pdf = ["confirmation", "paid", "cancelled"].includes(kind) ? await invoicePdf(o, t).catch(() => null) : null
  let attachments = pdf ? [pdf] : undefined
  if (kind === "cancelled" && o.invoice_id) {
    // The Stornorechnung instead of the cancelled invoice.
    const { data: storno } = await db().from("documents").select("id").eq("source_id", o.invoice_id).eq("kind", "cancellation").maybeSingle()
    const s = storno && (await invoicePdf({ ...o, invoice_id: storno.id }, t).catch(() => null))
    attachments = s ? [s] : undefined
  }
  return sendOrgEmail(o.org_id, { to, ...rendered, attachments })
}

// ---------- team actions (callers check shop.manage) ----------

async function teamOrder(orgId: string, shopOrderId: string) {
  const { data } = await db().from("shop_orders").select("order_id").eq("id", shopOrderId).eq("org_id", orgId).maybeSingle()
  const o = data && (await loadOrder(data.order_id))
  if (!o) throw new Error("errors.not_found")
  return o
}

/** Money arrived (transfer) or was taken at pickup (cash). Card at pickup goes through the door's POS. */
export async function markOrderPaid(orgId: string, shopOrderId: string, method: "transfer" | "cash") {
  const o = await teamOrder(orgId, shopOrderId)
  if (o.status === "cancelled") throw new Error("store.orderCancelled")
  await payManually(o.order_id, method)
}

/** Fulfilment steps: ready for pickup, shipped (optional tracking), completed. Mails the buyer for ready/shipped. */
export async function setOrderStatus(orgId: string, shopOrderId: string, status: "ready" | "shipped" | "completed" | "new", tracking?: string | null) {
  const o = await teamOrder(orgId, shopOrderId)
  if (o.status === "cancelled") throw new Error("store.orderCancelled")
  const { error } = await db()
    .from("shop_orders")
    .update({ status, ...(tracking !== undefined ? { tracking: tracking?.trim().slice(0, 300) || null } : {}) })
    .eq("id", o.id)
  if (error) throw error
  if ((status === "ready" || status === "shipped") && o.status !== status) await mail(status, o.order_id).catch((e) => console.error("shop mail", o.order_id, e))
}

/** Cancel: paid orders are refunded in full (provider, or recorded as handed/transferred back); the rest follows from that. */
export async function cancelOrder(orgId: string, shopOrderId: string, reason?: string) {
  const o = await teamOrder(orgId, shopOrderId)
  if (o.status === "cancelled") return null
  const s = o.pay_orders.status
  if (s === "paid" || s === "partially_refunded") {
    const r = await refundOrder(o.order_id, undefined, reason) // full refund → markRefunded → shopRefunded
    if (r !== "succeeded") await db().from("shop_orders").update({ status: "cancelled" }).eq("id", o.id) // provider confirms later
    return r
  }
  await db().from("pay_orders").update({ status: "cancelled" }).eq("id", o.order_id).in("status", ["open", "failed", "expired"])
  await closeOrder(o)
  return null
}

/** The buyer left the payment page: an unpaid online order is dropped and its lines go back into the cart. */
export async function reopenCart(o: Order): Promise<CartLine[]> {
  if (o.payment !== "online" || o.pay_orders.status !== "open") return []
  await cancelCollect(o.order_id) // stops the checkout, cancels the order
  await db().from("shop_orders").update({ status: "cancelled" }).eq("id", o.id)
  return o.pay_orders.pay_order_items.filter((i) => i.source_id).map((i) => ({ id: i.source_id!, q: i.quantity }))
}

/** Buyer's order page: the order if the token matches. */
export async function orderForBuyer(orderId: string, token: string) {
  if (!/^[0-9a-f-]{36}$/.test(orderId) || !/^[0-9a-f-]{36}$/.test(token)) return null
  const o = await loadOrder(orderId)
  return o && o.token === token ? o : null
}
export type BuyerOrder = Order

/** Files of the digital products in a paid order (downloads on the order page). */
export async function orderFiles(o: Order) {
  if (!["paid", "partially_refunded"].includes(o.pay_orders.status) || o.status === "cancelled") return []
  const ids = [...new Set(o.pay_orders.pay_order_items.map((i) => (i.metadata as Record<string, unknown> | null)?.product_id).filter((x): x is string => typeof x === "string"))]
  if (!ids.length) return []
  const { data } = await db().from("files").select("id, name, size, entity_id").eq("org_id", o.org_id).eq("entity", "products").in("entity_id", ids).order("name")
  return data ?? []
}

// ---------- music: tracks = audio files on the product (files entity "product_audio", meta {title, position, stream}) ----------

export type Track = { id: string; title: string; position: number; stream: boolean; name: string }

/** A product's tracks in order. `stream` false = listed, but only buyers get the music (via downloads). */
export async function productTracks(orgId: string, productId: string): Promise<Track[]> {
  const { data } = await db().from("files").select("id, name, meta").eq("org_id", orgId).eq("entity", "product_audio").eq("entity_id", productId).is("deleted_at", null)
  return (data ?? [])
    .map((f) => {
      const m = (f.meta ?? {}) as Record<string, unknown>
      return {
        id: f.id,
        name: f.name,
        title: typeof m.title === "string" && m.title.trim() ? m.title : f.name.replace(/\.[a-z0-9]+$/i, "").replace(/^\d+[\s._-]+/, ""),
        position: Number(m.position) || 0,
        stream: m.stream !== false,
      }
    })
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, undefined, { numeric: true }))
}
