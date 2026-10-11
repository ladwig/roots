// Ticketing, server side (service role). Buyers are anonymous: everything here validates its own input.
import QRCode from "qrcode"
import { messages } from "@/i18n/config"
import { createT, type T } from "@/i18n/translate"
import { sendOrgEmail } from "@/lib/org-email"
import { siteUrl } from "@/lib/url"
import { ticketsPdf, type PdfTicket } from "./pdf"
import { createAdminClient } from "@/lib/supabase/admin"
import { createOrder, startCheckout } from "@/payments/server"
import type { PaidOrder } from "@/payments/fulfilment"

const db = () => createAdminClient()
const RESERVE_MINUTES = 31 // a bit longer than the checkout (30 min), so a late payment still finds its tickets

export type BuyInput = {
  orgId: string
  eventId: string
  email: string
  name: string
  code: string | null // promo / unlock code
  items: { typeId: string; holderName: string | null }[] // one per ticket
  successUrl: (orderId: string, token: string) => string
  cancelUrl: string
}

/** The current offer (tier prices, code discount, what's left) – same function the shop shows. */
export async function ticketOffer(eventId: string, code: string | null) {
  const { data } = await db().rpc("ticket_offer", { p_event: eventId, p_code: code ?? undefined })
  return data ?? []
}

/** Reserve tickets, create the order and return where to send the buyer. Throws message keys. */
export async function buyTickets(b: BuyInput) {
  const offer = new Map((await ticketOffer(b.eventId, b.code)).map((o) => [o.type_id, o]))
  if (!b.items.length || b.items.some((i) => !offer.has(i.typeId))) throw new Error("tickets.notOnSale")
  const currencies = new Set(b.items.map((i) => offer.get(i.typeId)!.currency))
  if (currencies.size > 1) throw new Error("tickets.notOnSale")
  const { data: event } = await db().from("events").select("title").eq("id", b.eventId).single()

  // Order items: one line per ticket type, at the price the buyer saw (tier + code).
  const counts = new Map<string, number>()
  b.items.forEach((i) => counts.set(i.typeId, (counts.get(i.typeId) ?? 0) + 1))
  const token = crypto.randomUUID() // access to the buyer's ticket page
  const lines = [...counts].map(([typeId, quantity]) => {
    const o = offer.get(typeId)!
    return { description: [event?.title, o.name, o.tier_name].filter(Boolean).join(" · ").slice(0, 200), quantity, unitAmount: o.final_price, sourceId: typeId }
  })
  const orderId = await createOrder({
    orgId: b.orgId,
    sourceModule: "tickets",
    sourceId: b.eventId,
    currency: [...currencies][0],
    customerEmail: b.email,
    customerName: b.name,
    metadata: { ticket_token: token, ...(b.code ? { code: b.code.toUpperCase() } : {}) },
    items: lines,
  })
  const { data: reserved, error } = await db().rpc("reserve_tickets", {
    p_order: orderId,
    p_event: b.eventId,
    p_items: b.items.map((i) => ({ type_id: i.typeId, holder_name: i.holderName })),
    p_minutes: RESERVE_MINUTES,
    p_code: b.code ?? undefined,
  })
  // The tier or code changed between showing and reserving: don't charge a different price silently.
  const expected = lines.reduce((s, l) => s + l.quantity * l.unitAmount, 0)
  const actual = reserved?.reduce((s, k) => s + (k.price ?? 0), 0)
  if (error || actual !== expected) {
    await db().from("pay_orders").update({ status: "cancelled" }).eq("id", orderId)
    if (!error) await db().from("tickets").update({ status: "void" }).eq("order_id", orderId)
    throw new Error(error?.message.includes("sold_out") ? "tickets.soldOut" : error ? "tickets.notOnSale" : "tickets.priceChanged")
  }
  return startCheckout(orderId, { successUrl: b.successUrl(orderId, token), cancelUrl: b.cancelUrl })
}

/** Paid (webhook): tickets become valid, the buyer becomes/links to a contact. Idempotent. */
export async function issueTickets(order: PaidOrder) {
  let contactId: string | null = null
  if (order.customer_email) {
    const { data: found } = await db()
      .from("contacts")
      .select("id")
      .eq("org_id", order.org_id)
      .eq("email", order.customer_email)
      .is("deleted_at", null)
      .maybeSingle()
    contactId = found?.id ?? null
    if (!contactId) {
      const { data: o } = await db().from("pay_orders").select("customer_name").eq("id", order.id).single()
      const [first, ...rest] = (o?.customer_name ?? "").trim().split(/\s+/)
      const { data: created } = await db()
        .from("contacts")
        .insert({ org_id: order.org_id, email: order.customer_email, first_name: first || null, last_name: rest.join(" ") || null, tags: ["Tickets"] })
        .select("id")
        .single()
      contactId = created?.id ?? null
    }
  }
  const { error } = await db()
    .from("tickets")
    .update({ status: "valid", expires_at: null, contact_id: contactId })
    .eq("order_id", order.id)
    .eq("status", "reserved")
  if (error) throw error
  // Email with link + PDF. Never fails the payment: tickets are valid either way (the buyer page has them too).
  await emailTickets(order.id).catch((e) => console.error("ticket email", order.id, e))
}

// ponytail: emails/PDF in German until orgs pick a language for their public pages.
const tDe = () => createT("de", messages.de)

async function pdfTicketsFor(orderId: string, t: T): Promise<{ list: PdfTicket[]; org: { id: string; slug: string; name: string } } | null> {
  const { data: rows } = await db()
    .from("tickets")
    .select("code, holder_name, status, ticket_types(name), ticket_tiers(name), events(title, starts_at, venue_name, venue_address), orgs(id, slug, name)")
    .eq("order_id", orderId)
    .in("status", ["valid", "used"])
    .order("created_at")
  if (!rows?.length || !rows[0].orgs) return null
  const org = rows[0].orgs
  return {
    org,
    list: rows.map((k) => ({
      code: k.code,
      event: k.events?.title ?? "",
      when: k.events ? t.date(k.events.starts_at, { dateStyle: "full", timeStyle: "short" }) : "",
      venue: [k.events?.venue_name, k.events?.venue_address].filter(Boolean).join(", ") || null,
      type: [k.ticket_types?.name, k.ticket_tiers?.name].filter(Boolean).join(" · "),
      holder: k.holder_name,
      org: org.name,
    })),
  }
}

/** PDF of an order's valid tickets (buyer page download, email attachment). */
export async function orderPdf(orderId: string, t: T) {
  const data = await pdfTicketsFor(orderId, t)
  return data ? ticketsPdf(data.list) : null
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export async function emailTickets(orderId: string) {
  const t = tDe()
  const { data: order } = await db().from("pay_orders").select("id, customer_email, customer_name, metadata").eq("id", orderId).single()
  const token = (order?.metadata as Record<string, unknown>)?.ticket_token
  const data = await pdfTicketsFor(orderId, t)
  if (!order?.customer_email || typeof token !== "string" || !data) return false
  const link = siteUrl(data.org.slug, `/t/${orderId}?k=${token}`)
  const ev = data.list[0].event
  const subject = t("shop.emailSubject", { event: ev })
  const intro = t("shop.emailIntro", { name: order.customer_name ?? "", count: data.list.length, event: ev, when: data.list[0].when })
  const pdf = await ticketsPdf(data.list)
  return sendOrgEmail(data.org.id, {
    to: order.customer_email,
    subject,
    text: `${intro}\n\n${t("shop.emailLink")}: ${link}\n\n${t("shop.emailFooter", { org: data.org.name })}`,
    html: `<div style="font:16px/1.5 system-ui,sans-serif"><p>${esc(intro)}</p><p><a href="${esc(link)}">${esc(t("shop.emailLink"))}</a></p><p style="color:#666;font-size:13px">${esc(t("shop.emailFooter", { org: data.org.name }))}</p></div>`,
    attachments: [{ filename: "tickets.pdf", content: pdf }],
  })
}

/** Fully refunded: tickets can't be used any more. */
export async function voidTickets(order: PaidOrder) {
  const { error } = await db().from("tickets").update({ status: "void" }).eq("order_id", order.id).in("status", ["reserved", "valid"])
  if (error) throw error
}

/** The buyer's tickets, if the token matches the order. */
export async function ticketsForBuyer(orderId: string, token: string) {
  if (!/^[0-9a-f-]{36}$/.test(orderId) || !/^[0-9a-f-]{36}$/.test(token)) return null
  const { data: order } = await db().from("pay_orders").select("id, org_id, status, metadata, customer_email").eq("id", orderId).maybeSingle()
  if (!order || (order.metadata as Record<string, unknown>)?.ticket_token !== token) return null
  const { data: tickets } = await db()
    .from("tickets")
    .select("id, code, holder_name, status, ticket_types(name), events(title, starts_at, venue_name, venue_address)")
    .eq("order_id", orderId)
    .order("created_at")
  return { order, tickets: tickets ?? [] }
}

export const qrSvg = (code: string) => QRCode.toString(code, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
