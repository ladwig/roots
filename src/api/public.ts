// Public (headless) API: what an org's public pages can do, as JSON, for the org's own website or app.
// No key: everything here is anonymous and exactly as open as the hosted pages (/s/<org>/…) — same DB policies
// (anon client), same server functions (buyTickets, joinWaitlist, submitPublicForm, addViaLink, sendLoginLink).
// Path: /api/public/v1/{org}/… with the org's address (slug). CORS is open: the data is public anyway.
// ponytail: no rate limit beyond what the shared functions do (portal link flood guard, reservation expiry,
// form honeypot is UI-only); add a per-IP limit (Vercel Firewall rule on /api/public) if it gets abused.
import { z } from "zod"
import { outsideIndex, outsidePage } from "@/wiki/outside"
import { submitPublicForm } from "@/forms/public"
import type { PublicForm } from "@/app/s/[site]/f/[slug]/data"
import { addViaLink } from "@/guestlists/server"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { imageUrl } from "@/lib/images"
import { cachedEvent, cachedForm, cachedOrg, cachedSite } from "@/lib/public-cache"
import { blockAvailable, DEFAULT_BLOCKS, readBlocks, readEventLinks } from "@/site/blocks"
import { createPublicClient } from "@/lib/supabase/server"
import { siteUrl } from "@/lib/url"
import { passOnFor, reconcileOrder } from "@/payments/server"
import { sendLoginLink } from "@/portal/login"
import { buyTickets, ticketsForBuyer } from "@/tickets/server"
import { joinWaitlist, waitlistClaim } from "@/tickets/waitlist"
import { cleanHtml } from "@/site/html"
import { DELIVERIES, ORDER_STATUSES, PAYMENTS, priceCart, readShippingRates, type CatalogProduct } from "@/shop/fields"
import { onlineReady, orderFiles, orderForBuyer, placeOrder, productTracks } from "@/shop/server"
import { ApiError, error, json, match, notFound, readInput, uuid } from "./core"

type Org = { id: string; slug: string; name: string; logo_path: string | null; site_domain: string | null }
type Ctx<Q, B> = { org: Org; params: Record<string, string>; query: Q; body: B; t: T }
export type PublicEndpoint = {
  method: "GET" | "POST"
  path: string // "/{org}/events/{slug}"
  tag: string
  summary: string
  description?: string
  query?: z.ZodType
  body?: z.ZodType
  response: z.ZodType
  status?: number
  maxAge?: number // GET: seconds browsers/CDNs may cache the answer
  handler(ctx: Ctx<never, never>): Promise<unknown>
}
const endpoint = <Q extends z.ZodType, B extends z.ZodType>(
  e: Omit<PublicEndpoint, "query" | "body" | "handler"> & { query?: Q; body?: B; handler(ctx: Ctx<z.infer<Q>, z.infer<B>>): Promise<unknown> },
) => e as unknown as PublicEndpoint

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" }
const ts = z.string().describe("ISO 8601 timestamp")
const email = z.string().trim().toLowerCase().max(320).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Invalid email")
const name = z.string().trim().min(1).max(200)
const https = z.url({ protocol: /^https?$/ }).max(2000)
// Buyer-facing message keys → error codes (everything else is the org's setup problem, see buy()).
const BUYER_ERRORS: Record<string, string> = { "tickets.soldOut": "sold_out", "tickets.notOnSale": "not_on_sale", "tickets.priceChanged": "price_changed" }
const keyError = (status: number, key: string, t: T) => new ApiError(status, key.split(".").pop()!.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), t.has(key) ? t.dynamic(key) : key)

const Event = z.object({
  id: uuid,
  slug: z.string(),
  title: z.string(),
  status: z.enum(["published", "cancelled"]),
  starts_at: ts,
  ends_at: ts.nullable(),
  venue_name: z.string().nullable(),
  venue_address: z.string().nullable(),
  description: z.string().nullable(),
  image_url: z.string().nullable(),
  max_tickets_per_order: z.number().int(),
  url: z.string().describe("Hosted event page"),
  links: z.array(z.object({ label: z.string(), url: z.string() })).describe("The event's own links (max 3)"),
  show_code_field: z.boolean().describe("Show a discount code field (codes work either way)"),
})
const Offer = z.object({
  type_id: uuid,
  name: z.string(),
  description: z.string().nullable(),
  currency: z.string(),
  price: z.number().int().describe("Base price in cents"),
  final_price: z.number().int().describe("Price to pay in cents (tier + code applied)"),
  tier_name: z.string().nullable(),
  code_applies: z.boolean(),
  remaining: z.number().int().nullable().describe("Left (null = unlimited)"),
  sales_start: ts.nullable(),
  sales_end: ts.nullable(),
  on_sale: z.boolean(),
})
const eventOut = (org: Org, e: NonNullable<Awaited<ReturnType<typeof cachedEvent>>>) => ({
  id: e.id,
  slug: e.slug,
  title: e.title,
  status: e.status,
  starts_at: e.starts_at,
  ends_at: e.ends_at,
  venue_name: e.venue_name,
  venue_address: e.venue_address,
  description: e.description,
  image_url: e.image_path ? imageUrl(e.image_path) : null,
  max_tickets_per_order: e.max_tickets_per_order,
  links: readEventLinks(e.links),
  url: siteUrl(org.slug, `/e/${e.slug}`, org.site_domain),
  show_code_field: e.show_code_field,
})
async function publishedEvent(org: Org, slug: string) {
  const e = await cachedEvent(org.id, slug)
  if (!e) throw notFound()
  return e
}
const ShopProduct = z.object({
  id: uuid,
  slug: z.string(),
  name: z.string(),
  kind: z.enum(["physical", "digital"]),
  price_cents: z.number().int().describe("Gross; variants may have their own"),
  tax_rate: z.number(),
  category: z.string().nullable(),
  images: z.array(z.string()).describe("Picture URLs, first = cover"),
  video_url: z.string().nullable(),
  max_per_order: z.number().int(),
  left: z.number().int().nullable().describe("Products without variants: units left (null = unlimited)"),
  variants: z.array(z.object({ id: uuid, name: z.string(), price_cents: z.number().int(), left: z.number().int().nullable() })),
  url: z.string().describe("Hosted product page"),
})
const shopCatalog = async (orgId: string, slug?: string) => ((await createPublicClient().rpc("shop_catalog", { p_org: orgId, p_slug: slug })).data ?? []) as CatalogProduct[]
const shopProductOut = (org: Org, p: CatalogProduct) => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  kind: p.kind,
  price_cents: p.price_cents,
  tax_rate: Number(p.tax_rate),
  category: p.category,
  images: p.images.map((i) => imageUrl(i)!),
  video_url: p.video_url,
  max_per_order: p.max_per_order,
  left: p.left,
  variants: p.variants,
  url: siteUrl(org.slug, `/shop/${p.slug}`, org.site_domain),
})
const SHOP_ERRORS: Record<string, string> = {
  "store.soldOutError": "sold_out",
  "store.cartChanged": "cart_changed",
  "store.priceChanged": "price_changed",
  "store.deliveryInvalid": "delivery_invalid",
  "store.shippingInvalid": "shipping_invalid",
  "store.paymentInvalid": "payment_invalid",
}
async function publicForm(org: Org, slug: string) {
  const f = (await cachedForm(org.id, slug)) as unknown as PublicForm | null
  if (!f) throw notFound()
  return f
}

export const publicEndpoints: PublicEndpoint[] = [
  endpoint({
    method: "GET",
    path: "/{org}/wiki",
    tag: "Wiki",
    summary: "Publicly released wiki pages (start pages)",
    description: "Pages the organisation released publicly whose parent isn't public; their public sub-pages are listed in the single page.",
    response: z.object({ data: z.array(z.object({ id: z.string(), title: z.string(), updated_at: ts, url: z.string() })) }),
    maxAge: 60,
    async handler({ org }) {
      return { data: (await outsideIndex(org.id, "public")).map((p) => ({ ...p, url: siteUrl(org.slug, `/wiki/${p.id}`, org.site_domain) })) }
    },
  }),
  endpoint({
    method: "GET",
    path: "/{org}/wiki/{id}",
    tag: "Wiki",
    summary: "One public wiki page",
    description: "`body` is Markdown; file and image links point to the hosted file route (`/wiki/file/<id>` on the public site).",
    response: z.object({
      id: z.string(),
      title: z.string(),
      body: z.string(),
      updated_at: ts,
      children: z.array(z.object({ id: z.string(), title: z.string() })),
      path: z.array(z.object({ id: z.string(), title: z.string() })),
    }),
    maxAge: 60,
    async handler({ org, params }) {
      const page = await outsidePage(org.id, params.id, "public")
      if (!page) throw notFound()
      // Files as absolute links to the public file route.
      return { ...page, body: page.body.replace(/\]\(\/files\/([0-9a-f-]{36})\)/g, (_m, id: string) => `](${siteUrl(org.slug, `/wiki/file/${id}`, org.site_domain)})`) }
    },
  }),
  endpoint({
    method: "GET",
    path: "/{org}",
    tag: "Organisation",
    summary: "The organisation",
    response: z.object({ slug: z.string(), name: z.string(), logo_url: z.string().nullable(), url: z.string().describe("Hosted public pages") }),
    maxAge: 60,
    async handler({ org }) {
      return { slug: org.slug, name: org.name, logo_url: org.logo_path ? imageUrl(org.logo_path) : null, url: siteUrl(org.slug, "", org.site_domain) }
    },
  }),
  endpoint({
    method: "GET",
    path: "/{org}/site",
    tag: "Organisation",
    summary: "The start page",
    description:
      "What the hosted start page shows, for your own website: tagline, the visible blocks in order (hero, text = Markdown, links, events, event, form, portal, wiki, shop = `limit` products of `category` or all; fetch the events/forms/products they name with the other endpoints) and the Impressum / Datenschutz texts (Markdown).",
    response: z.object({
      tagline: z.string().nullable(),
      blocks: z.array(z.record(z.string(), z.unknown())),
      imprint: z.string().nullable(),
      privacy: z.string().nullable(),
    }),
    maxAge: 60,
    async handler({ org }) {
      const site = await cachedSite(org.id)
      const blocks = (site?.saved ? readBlocks(site.blocks) : DEFAULT_BLOCKS).filter((b) => b.on && blockAvailable(b.type, site?.modules ?? []))
      return { tagline: site?.tagline ?? null, blocks, imprint: site?.imprint ?? null, privacy: site?.privacy ?? null }
    },
  }),
  endpoint({
    method: "GET",
    path: "/{org}/events",
    tag: "Events",
    summary: "Upcoming published events",
    description: "Events that haven't ended yet, soonest first (cancelled ones included, with status). `description` only in the single event.",
    response: z.object({ data: z.array(Event) }),
    maxAge: 60,
    async handler({ org }) {
      const now = new Date().toISOString()
      const { data } = await createPublicClient()
        .from("events")
        .select("id, slug, title, status, starts_at, ends_at, venue_name, venue_address, image_path, max_tickets_per_order, links, show_code_field")
        .eq("org_id", org.id)
        .or(`ends_at.gte.${now},and(ends_at.is.null,starts_at.gte.${now})`)
        .order("starts_at")
        .limit(100)
      return { data: (data ?? []).map((e) => eventOut(org, { ...e, description: null })) }
    },
  }),
  endpoint({
    method: "GET",
    path: "/{org}/events/{slug}",
    tag: "Events",
    summary: "One event, with its public timetable",
    response: Event.extend({
      timetable: z.array(z.object({ title: z.string().nullable(), artist: z.string().nullable(), stage: z.string().nullable(), starts_at: ts, ends_at: ts.nullable() })),
    }),
    maxAge: 60,
    async handler({ org, params }) {
      const e = await publishedEvent(org, params.slug)
      const { data: slots } = await createPublicClient().from("event_slots").select("title, stage, starts_at, ends_at, artists(name)").eq("event_id", e.id).order("starts_at")
      return { ...eventOut(org, e), timetable: (slots ?? []).map((s) => ({ title: s.title, artist: s.artists?.name ?? null, stage: s.stage, starts_at: s.starts_at, ends_at: s.ends_at })) }
    },
  }),
  endpoint({
    method: "GET",
    path: "/{org}/events/{slug}/offer",
    tag: "Tickets",
    summary: "Ticket types on offer, with prices and what's left",
    description:
      "Live (not cached). `code` applies a promo/unlock code (unlocks hidden types). `waitlist` = claim token from a waiting-list email (`?w=` in the link): the seats held for it count as available. `free` = everything costs 0 (show \"sign up\" instead of \"buy\"). `sold_out` = nothing visible left → offer the waiting list.",
    query: z.object({ code: z.string().trim().toUpperCase().max(40).optional(), waitlist: z.string().max(64).optional() }),
    response: z.object({
      types: z.array(Offer),
      free: z.boolean(),
      sold_out: z.boolean(),
      code_valid: z.boolean().nullable().describe("null = no code sent"),
      waitlist_claim: z.object({ quantity: z.number().int(), offered_until: ts }).nullable(),
      service_fee: z
        .object({ percent: z.number(), fixed_cents: z.number().int() })
        .nullable()
        .describe("Service fee on every paid order (the org passes payment costs on): fee = ceil((subtotal + fixed_cents) / (1 − percent/100)) − subtotal. Show it before buying; null = none"),
    }),
    async handler({ org, params, query }) {
      const e = await publishedEvent(org, params.slug)
      if (e.status !== "published") return { types: [], free: false, sold_out: false, code_valid: null, waitlist_claim: null, service_fee: null }
      const [{ data: offer }, claim, fee] = await Promise.all([
        createPublicClient().rpc("ticket_offer", { p_event: e.id, p_code: query.code || undefined, p_waitlist: query.waitlist || undefined }),
        waitlistClaim(e.id, query.waitlist ?? null),
        passOnFor(org.id),
      ])
      const now = new Date().toISOString()
      const types = (offer ?? []).map((o) => ({
        type_id: o.type_id,
        name: o.name,
        description: o.description,
        currency: o.currency,
        price: o.price,
        final_price: o.final_price,
        tier_name: o.tier_name,
        code_applies: o.code_applies,
        remaining: o.remaining,
        sales_start: o.sales_start,
        sales_end: o.sales_end,
        on_sale: (!o.sales_start || o.sales_start <= now) && (!o.sales_end || o.sales_end >= now) && o.remaining !== 0,
      }))
      return {
        types,
        free: types.length > 0 && types.every((x) => x.final_price === 0),
        sold_out: !claim && types.length > 0 && (offer ?? []).filter((o) => !o.hidden).every((o) => o.remaining === 0),
        code_valid: query.code ? types.some((x) => x.code_applies) : null,
        waitlist_claim: claim ? { quantity: claim.quantity, offered_until: claim.offered_until! } : null,
        service_fee: fee ? { percent: fee.percent, fixed_cents: fee.fixedCents } : null,
      }
    },
  }),
  endpoint({
    method: "POST",
    path: "/{org}/events/{slug}/orders",
    tag: "Tickets",
    summary: "Order tickets (or sign up for a free event)",
    description:
      "Reserves the tickets and returns `checkout_url`: send the buyer there (payment page of the org's provider; for free orders it is already your `success_url` / the ticket page). The tickets become valid when the payment arrives (provider webhook), then the buyer gets them by email. `success_url` may contain `{ORDER_ID}` and `{TOKEN}` to show the order on your own site via GET /{org}/orders/{order_id}?token=…; default: the hosted ticket page. Errors: `sold_out`, `not_on_sale`, `price_changed` (offer changed — reload it), `unavailable` (the org's sales setup isn't ready).",
    body: z
      .object({
        email,
        name,
        items: z.array(z.object({ type_id: uuid, holder_name: z.string().trim().max(200).optional() }).strict()).min(1).max(100).describe("One entry per ticket; the first ticket's holder_name defaults to the buyer's name"),
        code: z.string().trim().toUpperCase().max(40).optional(),
        waitlist: z.string().max(64).optional().describe("Waiting-list claim token"),
        success_url: https.optional(),
        cancel_url: https.optional(),
      })
      .strict(),
    response: z.object({ order_id: uuid, token: z.string().describe("Secret for GET /orders/{order_id}; keep it with the buyer"), checkout_url: z.string(), tickets_url: z.string() }),
    status: 201,
    async handler({ org, params, body, t }) {
      const e = await publishedEvent(org, params.slug)
      const { data: ev } = await createPublicClient().from("events").select("ticket_names").eq("id", e.id).eq("status", "published").maybeSingle()
      if (!ev) throw new ApiError(422, "not_on_sale", t("tickets.notOnSale"))
      if (body.items.length > e.max_tickets_per_order) throw new ApiError(422, "too_many", t("shop.tooMany", { max: e.max_tickets_per_order }))
      if (ev.ticket_names === "required" && body.items.some((i, n) => n > 0 && !i.holder_name)) throw new ApiError(422, "holder_missing", t("shop.holderMissing"))
      let ids = { order: "", token: "" }
      let url: string
      try {
        url = await buyTickets({
          orgId: org.id,
          eventId: e.id,
          email: body.email,
          name: body.name,
          code: body.code || null,
          waitlist: body.waitlist || null,
          items: body.items.map((i, n) => ({ typeId: i.type_id, holderName: ev.ticket_names === "off" ? null : i.holder_name || (n === 0 ? body.name : null) })),
          successUrl: (order, token) => {
            ids = { order, token }
            return body.success_url ? body.success_url.replaceAll("{ORDER_ID}", order).replaceAll("{TOKEN}", token) : siteUrl(org.slug, `/t/${order}?k=${token}`, org.site_domain)
          },
          cancelUrl: body.cancel_url ?? siteUrl(org.slug, `/e/${e.slug}`, org.site_domain),
        })
      } catch (err) {
        const key = err instanceof Error ? err.message : ""
        if (BUYER_ERRORS[key]) throw new ApiError(409, BUYER_ERRORS[key], t.dynamic(key))
        console.error("public api checkout", org.slug, e.slug, key)
        throw new ApiError(503, "unavailable", t("shop.unavailable"))
      }
      return { order_id: ids.order, token: ids.token, checkout_url: url, tickets_url: siteUrl(org.slug, `/t/${ids.order}?k=${ids.token}`, org.site_domain) }
    },
  }),
  endpoint({
    method: "GET",
    path: "/{org}/orders/{order_id}",
    tag: "Tickets",
    summary: "An order and its tickets",
    description:
      "Needs the order's `token`. While the order is `open` the payment provider is asked directly, so call this on your success page (poll every few seconds until `paid`). Tickets carry the `code` for the QR code.",
    query: z.object({ token: z.string().max(64) }),
    response: z.object({
      order_id: uuid,
      status: z.string().describe("open (waiting for payment), paid, cancelled, refunded …"),
      email: z.string().nullable(),
      tickets: z.array(
        z.object({
          code: z.string(),
          status: z.enum(["valid", "used", "reserved", "void"]),
          type: z.string().nullable(),
          holder_name: z.string().nullable(),
          event: z.object({ title: z.string(), starts_at: ts, venue_name: z.string().nullable(), venue_address: z.string().nullable() }).nullable(),
        }),
      ),
      pdf_url: z.string().nullable().describe("All tickets as PDF (once paid)"),
      tickets_url: z.string(),
    }),
    async handler({ org, params, query }) {
      const id = params.order_id
      let data = uuid.safeParse(id).success ? await ticketsForBuyer(id, query.token) : null
      if (!data || data.order.org_id !== org.id) throw notFound()
      if (data.order.status === "open") {
        await reconcileOrder(id).catch((e) => console.error("reconcile", id, e))
        data = (await ticketsForBuyer(id, query.token))!
      }
      const paid = data.order.status === "paid"
      return {
        order_id: id,
        status: data.order.status,
        email: data.order.customer_email,
        tickets: data.tickets
          .filter((k) => k.status !== "void" || !paid)
          .map((k) => ({ code: k.code, status: k.status, type: k.ticket_types?.name ?? null, holder_name: k.holder_name, event: k.events })),
        pdf_url: paid ? siteUrl(org.slug, `/t/${id}/pdf?k=${query.token}`, org.site_domain) : null,
        tickets_url: siteUrl(org.slug, `/t/${id}?k=${query.token}`, org.site_domain),
      }
    },
  }),
  endpoint({
    method: "GET",
    path: "/{org}/shop",
    tag: "Shop",
    summary: "The shop: settings buyers see + published products",
    description: "Products with what's still available (`left`, null = unlimited; per variant when a product has variants). Delivery and payment options as the checkout offers them; prices are gross cents.",
    response: z.object({
      title: z.string().nullable(),
      intro: z.string().nullable(),
      deliveries: z.object({ pickup: z.boolean(), pickup_text: z.string().nullable(), shipping: z.boolean(), shipping_rates: z.array(z.object({ id: z.string(), name: z.string(), cents: z.number().int(), free_from: z.number().int().nullable(), countries: z.array(z.string()) })) }),
      payments: z.object({ online: z.boolean(), transfer: z.boolean(), pickup: z.boolean() }),
      terms: z.boolean().describe("Has terms / a cancellation policy the buyer must accept (accept_terms)"),
      products: z.array(ShopProduct),
      url: z.string(),
    }),
    async handler({ org }) {
      const [{ data: conf }, products, ready] = await Promise.all([createPublicClient().rpc("shop_public_settings", { p_org: org.id }), shopCatalog(org.id), onlineReady(org.id)])
      if (!conf) throw notFound()
      const c = conf as Record<string, unknown>
      return {
        title: (c.title as string) ?? null,
        intro: (c.intro as string) ?? null,
        deliveries: { pickup: !!c.pickup, pickup_text: (c.pickup_text as string) ?? null, shipping: !!c.shipping, shipping_rates: readShippingRates(c.shipping_rates) },
        payments: { online: !!c.pay_online && ready, transfer: !!c.pay_transfer, pickup: !!c.pay_on_pickup },
        terms: !!(c.terms || c.withdrawal),
        products: products.map((p) => shopProductOut(org, p)),
        url: siteUrl(org.slug, "/shop", org.site_domain),
      }
    },
  }),
  endpoint({
    method: "GET",
    path: "/{org}/shop/products/{slug}",
    tag: "Shop",
    summary: "One product with its description",
    response: ShopProduct.extend({
      description: z.string().describe("HTML, already cleaned"),
      tracks: z.array(z.object({ id: uuid, title: z.string(), stream_url: z.string().nullable().describe("Audio to play (a redirect to a short-lived link); null = buyers only") })).describe("Music for a player, in order"),
    }),
    async handler({ org, params }) {
      const [p] = await shopCatalog(org.id, params.slug)
      if (!p) throw notFound()
      const tracks = await productTracks(org.id, p.id)
      return {
        ...shopProductOut(org, p),
        description: cleanHtml(p.description ?? ""),
        tracks: tracks.map((x) => ({ id: x.id, title: x.title, stream_url: x.stream ? siteUrl(org.slug, `/shop/${p.slug}/track/${x.id}`, org.site_domain) : null })),
      }
    },
  }),
  endpoint({
    method: "POST",
    path: "/{org}/shop/orders",
    tag: "Shop",
    summary: "Place a shop order",
    description:
      "Checks items, stock, delivery and payment like the hosted cart. `total_cents` = what you showed the buyer (items + shipping); a different total now → `price_changed`. Send the buyer to `next_url`: the provider's payment page (`payment: online`), else the order page (transfer: bank details there + by mail; pickup: pay when collecting). `success_url` may contain `{ORDER_ID}` and `{TOKEN}`. Errors: `sold_out`, `cart_changed`, `price_changed`, `delivery_invalid`, `shipping_invalid`, `payment_invalid`, `terms_missing`, `waiver_missing` (digital items need `digital_waiver: true`), `unavailable`.",
    body: z
      .object({
        email,
        name,
        items: z.array(z.object({ id: uuid.describe("Variant id, or product id for products without variants"), quantity: z.number().int().min(1).max(100) }).strict()).min(1).max(30),
        delivery: z.enum(DELIVERIES),
        shipping_rate: z.string().max(40).optional(),
        payment: z.enum(PAYMENTS).default("online"),
        address: z.object({ company: z.string().max(200).optional(), street: z.string().trim().min(1).max(200), postal_code: z.string().trim().min(1).max(20), city: z.string().trim().min(1).max(100), country: z.string().regex(/^[A-Z]{2}$/).default("DE") }).strict().optional().describe("Required for shipping; else optional billing address"),
        note: z.string().max(2000).optional(),
        total_cents: z.number().int().min(0),
        accept_terms: z.boolean().optional(),
        digital_waiver: z.boolean().optional(),
        success_url: https.optional(),
        cancel_url: https.optional(),
      })
      .strict(),
    response: z.object({ order_id: uuid, token: z.string().describe("Secret for GET /shop/orders/{order_id}"), next_url: z.string(), order_url: z.string() }),
    status: 201,
    async handler({ org, body, t }) {
      const [{ data: conf }, products] = await Promise.all([createPublicClient().rpc("shop_public_settings", { p_org: org.id }), shopCatalog(org.id)])
      if (!conf) throw notFound()
      const c = conf as Record<string, unknown>
      if ((c.terms || c.withdrawal) && !body.accept_terms) throw keyError(422, "store.termsMissing", t)
      const lines = priceCart(body.items.map((i) => ({ id: i.id, q: i.quantity })), products)
      if (lines.some((l) => l.product.kind === "digital") && !body.digital_waiver) throw keyError(422, "store.waiverMissing", t)
      if (body.delivery === "shipping" && !body.address) throw keyError(422, "store.addressMissing", t)
      const order = (id: string, token: string) => siteUrl(org.slug, `/o/${id}?k=${token}`, org.site_domain)
      try {
        const r = await placeOrder({
          orgId: org.id,
          cart: body.items.map((i) => ({ id: i.id, q: i.quantity })),
          name: body.name,
          email: body.email,
          delivery: body.delivery,
          payment: body.payment,
          rateId: body.shipping_rate ?? null,
          address: body.address ? { company: body.address.company || null, street: body.address.street, postal_code: body.address.postal_code, city: body.address.city, country: body.address.country } : null,
          note: body.note?.trim() || null,
          expectedTotal: body.total_cents,
          orderUrl: (id, token) => (body.success_url ? body.success_url.replaceAll("{ORDER_ID}", id).replaceAll("{TOKEN}", token) : order(id, token)),
          cancelUrl: () => body.cancel_url ?? siteUrl(org.slug, "/shop", org.site_domain),
        })
        return { order_id: r.orderId, token: r.token, next_url: r.url, order_url: order(r.orderId, r.token) }
      } catch (err) {
        const key = err instanceof Error ? err.message : ""
        if (SHOP_ERRORS[key]) throw new ApiError(409, SHOP_ERRORS[key], t.dynamic(key))
        console.error("public api shop order", org.slug, key)
        throw new ApiError(503, "unavailable", t("store.unavailable"))
      }
    },
  }),
  endpoint({
    method: "GET",
    path: "/{org}/shop/orders/{order_id}",
    tag: "Shop",
    summary: "A shop order",
    description: "Needs the order's `token`. While an online payment is open the provider is asked directly (poll on your success page until `payment_status` is `paid`). Downloads of digital products appear once paid.",
    query: z.object({ token: z.string().max(64) }),
    response: z.object({
      order_id: uuid,
      number: z.number().int(),
      status: z.enum(ORDER_STATUSES),
      payment: z.enum(PAYMENTS),
      payment_status: z.string(),
      delivery: z.enum(DELIVERIES),
      total_cents: z.number().int(),
      items: z.array(z.object({ description: z.string(), quantity: z.number().int(), unit_amount: z.number().int() })),
      tracking: z.string().nullable(),
      downloads: z.array(z.object({ name: z.string(), url: z.string() })),
      invoice_url: z.string().nullable(),
      order_url: z.string(),
    }),
    async handler({ org, params, query }) {
      const id = params.order_id
      let o = uuid.safeParse(id).success ? await orderForBuyer(id, query.token) : null
      if (!o || o.org_id !== org.id) throw notFound()
      if (o.pay_orders.status === "open" && o.payment === "online") {
        await reconcileOrder(id).catch((e) => console.error("reconcile", id, e))
        o = (await orderForBuyer(id, query.token))!
      }
      const files = await orderFiles(o)
      return {
        order_id: id,
        number: o.number,
        status: o.status as (typeof ORDER_STATUSES)[number],
        payment: o.payment as (typeof PAYMENTS)[number],
        payment_status: o.pay_orders.status,
        delivery: o.delivery as (typeof DELIVERIES)[number],
        total_cents: o.pay_orders.amount_total,
        items: o.pay_orders.pay_order_items.map((i) => ({ description: i.description, quantity: i.quantity, unit_amount: i.unit_amount })),
        tracking: o.tracking,
        downloads: files.map((f) => ({ name: f.name, url: siteUrl(org.slug, `/o/${id}/file/${f.id}?k=${query.token}`, org.site_domain) })),
        invoice_url: o.invoice_id ? siteUrl(org.slug, `/o/${id}/invoice?k=${query.token}`, org.site_domain) : null,
        order_url: siteUrl(org.slug, `/o/${id}?k=${query.token}`, org.site_domain),
      }
    },
  }),
  endpoint({
    method: "POST",
    path: "/{org}/events/{slug}/waitlist",
    tag: "Tickets",
    summary: "Join the waiting list of a sold-out event",
    description: "Only while nothing is on sale. When seats free up, people are offered them in order by email (24 h to claim, link with `?w=<token>`).",
    body: z.object({ email, name, quantity: z.number().int().min(1).max(20).default(1) }).strict(),
    response: z.object({ ok: z.literal(true) }),
    status: 201,
    async handler({ org, params, body, t }) {
      const e = await publishedEvent(org, params.slug)
      if (e.status !== "published") throw new ApiError(422, "not_on_sale", t("tickets.notOnSale"))
      if (body.quantity > e.max_tickets_per_order) throw new ApiError(422, "too_many", t("shop.tooMany", { max: e.max_tickets_per_order }))
      try {
        await joinWaitlist({ orgId: org.id, eventId: e.id, name: body.name, email: body.email, quantity: body.quantity })
      } catch (err) {
        const key = err instanceof Error ? err.message : ""
        throw keyError(key === "waitlist.already" ? 409 : 422, key || "shop.failed", t)
      }
      return { ok: true }
    },
  }),
  endpoint({
    method: "GET",
    path: "/{org}/forms/{slug}",
    tag: "Forms",
    summary: "A published form: its elements, to render it yourself",
    description:
      "`elements` in order (fields, texts, consents, SEPA mandate). Submit the values with the same keys as the hosted form uses: platform fields by key (`first_name`, `email` …), custom fields as `custom.<key>`, consents as `consent.<id>` = \"1\", membership type as `type_id`. Easiest: look at the hosted form (`url`) for the field names.",
    response: z.object({ id: uuid, title: z.string(), intro: z.string().nullable(), purpose: z.string(), elements: z.array(z.unknown()), custom_fields: z.array(z.unknown()), types: z.array(z.unknown()), success_text: z.string().nullable(), url: z.string() }),
    maxAge: 60,
    async handler({ org, params }) {
      const f = await publicForm(org, params.slug)
      return { id: f.id, title: f.title, intro: f.intro, purpose: f.purpose, elements: f.elements, custom_fields: f.custom_fields, types: f.types, success_text: f.success_text, url: siteUrl(org.slug, `/f/${params.slug}`, org.site_domain) }
    },
  }),
  endpoint({
    method: "POST",
    path: "/{org}/forms/{slug}/submissions",
    tag: "Forms",
    summary: "Submit a form",
    description: "Validated exactly like the hosted form. Contact forms create/update the contact at once; membership applications wait for the board. The submitter gets a confirmation email (`confirmation_sent` false = it couldn't be sent). Error `invalid` with `details.field`.",
    body: z.object({ values: z.record(z.string().max(100), z.union([z.string().max(2000), z.boolean(), z.number()])) }).strict(),
    response: z.object({ id: uuid, success_text: z.string(), confirmation_sent: z.boolean() }),
    status: 201,
    async handler({ org, params, body, t }) {
      const f = await publicForm(org, params.slug)
      const value = (k: string) => {
        const v = body.values[k]
        return v === undefined || v === false ? "" : v === true ? "1" : String(v)
      }
      const r = await submitPublicForm(org, f, value, t)
      if ("error" in r) {
        if (r.error === "errors.generic") throw new ApiError(500, "internal", t("errors.generic"))
        throw new ApiError(422, "invalid", t.has(r.error) ? t.dynamic(r.error) : t("errors.invalid_input"), r.field ? { field: r.field } : undefined)
      }
      return { id: r.id, success_text: f.success_text || t("forms.thanks"), confirmation_sent: !r.mailFailed }
    },
  }),
  endpoint({
    method: "GET",
    path: "/{org}/guest-links/{token}",
    tag: "Guest lists",
    summary: "A guest-list sign-up link",
    description: "What the link is for and how many names may still be added (names of others are never shown).",
    response: z.object({ list_name: z.string(), event_title: z.string().nullable(), starts_at: ts.nullable(), open: z.boolean(), per_submission: z.number().int(), remaining: z.number().int().nullable() }),
    async handler({ params }) {
      const { data } = await createPublicClient().rpc("guest_link_info", { p_token: params.token }).maybeSingle()
      if (!data) throw notFound()
      return { list_name: data.list_name, event_title: data.event_title, starts_at: data.starts_at, open: data.open, per_submission: data.per_submission, remaining: data.remaining }
    },
  }),
  endpoint({
    method: "POST",
    path: "/{org}/guest-links/{token}/guests",
    tag: "Guest lists",
    summary: "Put names on a guest list via its link",
    body: z.object({ by: name.describe("Who submits"), email: email.optional(), names: z.array(z.string().trim().min(1).max(200)).min(1).max(50) }).strict(),
    response: z.object({ added: z.number().int() }),
    status: 201,
    async handler({ params, body, t }) {
      try {
        return { added: await addViaLink(params.token, body.by, body.names, body.email ?? null) }
      } catch (err) {
        const key = err instanceof Error ? err.message : ""
        throw keyError(key === "guestlists.full" || key === "guestlists.closed" ? 409 : 422, key || "errors.invalid_input", t)
      }
    },
  }),
  endpoint({
    method: "POST",
    path: "/{org}/portal/login-link",
    tag: "Member area",
    summary: "Email a member-area login link",
    description: "Answers the same whether or not the address is known. The link opens the hosted member area. 503 email_unavailable: the org can't send emails right now.",
    body: z.object({ email }).strict(),
    response: z.object({ ok: z.literal(true) }),
    async handler({ org, body, t }) {
      if (!(await sendLoginLink(org, org.slug, body.email, t))) throw new ApiError(503, "email_unavailable", t("portal.mailFailed"))
      return { ok: true }
    },
  }),
]

export async function dispatchPublic(request: Request, path: string) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...CORS, "access-control-max-age": "86400" } })
  try {
    const candidates = publicEndpoints.map((e) => ({ e, params: match(e.path, path) })).filter((c) => c.params)
    if (!candidates.length) throw notFound()
    const hit = candidates.find((c) => c.e.method === request.method)
    if (!hit) throw new ApiError(405, "method_not_allowed", `Use ${candidates.map((c) => c.e.method).join(", ")}.`)
    const { e } = hit
    const params = hit.params!
    const org = await cachedOrg(params.org)
    if (!org) throw notFound()
    const { query, body } = await readInput(e, request)
    const result = await e.handler({ org, params, query, body, t: await getT() })
    const cache: Record<string, string> = e.method === "GET" && e.maxAge ? { "cache-control": `public, max-age=${e.maxAge}, s-maxage=${e.maxAge}` } : {}
    return json(e.status ?? 200, result, { ...CORS, ...cache })
  } catch (err) {
    if (err instanceof ApiError) return error(err, CORS)
    console.error("public api", err)
    return error(new ApiError(500, "internal", "Something went wrong."), CORS)
  }
}
