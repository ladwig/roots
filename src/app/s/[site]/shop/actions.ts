"use server"

import { redirect } from "next/navigation"
import { getT } from "@/i18n/server"
import { back, siteActionPath, siteUrl } from "@/lib/url"
import { getCart, saveCart } from "@/shop/cart"
import { changeCart, DELIVERIES, PAYMENTS, type Delivery, type Payment } from "@/shop/fields"
import { moneyCents } from "@/lib/inputs"
import { orderForBuyer, placeOrder, reopenCart } from "@/shop/server"
import { getSite } from "../data"

const str = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max)
// Name your price: "12,50" → cents (checked against the minimum when the cart is priced; junk = keep the old one).
const chosenPrice = (fd: FormData) => (fd.get("price") ? moneyCents(str(fd, "price", 20)) : null)
const BUYER_ERRORS = ["store.soldOutError", "store.belowMinError", "store.cartChanged", "store.priceChanged", "store.deliveryInvalid", "store.shippingInvalid", "store.paymentInvalid"]

// Public: put a product/variant into the cart (validated again at checkout against the live catalog).
export async function addToCart(fd: FormData) {
  const site = str(fd, "site", 100)
  const s = await getSite(site)
  if (!s) redirect(siteActionPath(site, "/shop"))
  const q = Math.max(1, Math.min(100, Math.floor(Number(fd.get("q")) || 1)))
  await saveCart(s.org.id, changeCart(await getCart(s.org.id), str(fd, "item", 36), q, "add", chosenPrice(fd)))
  redirect(siteActionPath(site, "/cart"))
}

// Public: change a line's quantity (0 = remove).
export async function updateCart(fd: FormData) {
  const site = str(fd, "site", 100)
  const s = await getSite(site)
  if (!s) redirect(siteActionPath(site, "/shop"))
  const q = Math.max(0, Math.min(100, Math.floor(Number(fd.get("q")) || 0)))
  await saveCart(s.org.id, changeCart(await getCart(s.org.id), str(fd, "item", 36), q, "set", chosenPrice(fd)))
  redirect(`${siteActionPath(site, "/cart")}?${new URLSearchParams(str(fd, "keep", 200))}`)
}

// Public: anyone may order. Everything is checked here and again in placeOrder() (catalog, stock, prices, settings).
export async function checkout(fd: FormData) {
  const t = await getT()
  const site = str(fd, "site", 100)
  const delivery = DELIVERIES.find((d) => d === fd.get("delivery")) as Delivery | undefined
  const rate = str(fd, "rate", 40) || null
  const here = `${siteActionPath(site, "/cart")}?${new URLSearchParams([...(delivery ? [["d", delivery]] : []), ...(rate ? [["r", rate]] : [])])}`
  const s = await getSite(site)
  if (!s) back(here, { error: t("errors.not_allowed") })
  const cart = await getCart(s.org.id)
  if (!cart.length) back(here, { error: t("store.cartEmpty") })

  const email = str(fd, "email", 320).toLowerCase()
  const name = str(fd, "name", 200)
  const payment = (PAYMENTS.find((p) => p === fd.get("payment")) ?? "online") as Payment
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) back(here, { error: t("errors.invalid_email") })
  if (!name) back(here, { error: t("store.nameMissing") })
  if (!delivery) back(here, { error: t("store.deliveryInvalid") })
  if (fd.get("terms_required") && !fd.get("terms")) back(here, { error: t("store.termsMissing") })
  if (fd.get("waiver_required") && !fd.get("waiver")) back(here, { error: t("store.waiverMissing") })
  const street = str(fd, "street", 200)
  const postal = str(fd, "postal_code", 20)
  const city = str(fd, "city", 100)
  const country = str(fd, "country", 2).toUpperCase() || "DE"
  const hasAddress = !!(street && postal && city)
  if (delivery === "shipping" && !hasAddress) back(here, { error: t("store.addressMissing") })
  if (!/^[A-Z]{2}$/.test(country)) back(here, { error: t("store.addressMissing") })

  let url: string
  try {
    url = (
      await placeOrder({
        orgId: s.org.id,
        cart,
        name,
        email,
        delivery,
        payment,
        rateId: rate,
        address: hasAddress ? { company: str(fd, "company", 200) || null, street, postal_code: postal, city, country } : null,
        note: str(fd, "note", 2000) || null,
        expectedTotal: Math.floor(Number(fd.get("total"))),
        orderUrl: (order, token) => siteUrl(site, `/o/${order}?k=${token}`, s.org.site_domain),
        cancelUrl: (order, token) => siteUrl(site, `/cart?back=${order}&k=${token}`, s.org.site_domain),
      })
    ).url
  } catch (e) {
    // Buyers only see what they can act on; setup problems (payment provider not ready …) are the org's.
    const key = e instanceof Error ? e.message : ""
    if (!BUYER_ERRORS.includes(key)) console.error("shop checkout", site, key)
    back(here, { error: BUYER_ERRORS.includes(key) ? t.dynamic(key) : t("store.unavailable") })
  }
  await saveCart(s.org.id, [])
  redirect(url)
}

// Public: back from a payment page without paying → the order is dropped (its units free again), the cart comes back.
export async function restoreCart(fd: FormData) {
  const site = str(fd, "site", 100)
  const s = await getSite(site)
  const o = s && (await orderForBuyer(str(fd, "order", 36), str(fd, "k", 36)))
  if (s && o && o.org_id === s.org.id) {
    const lines = await reopenCart(o)
    if (lines.length) await saveCart(s.org.id, lines)
  }
  redirect(siteActionPath(site, "/cart"))
}
