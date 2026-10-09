"use server"

import { redirect } from "next/navigation"
import { getT } from "@/i18n/server"
import { back, siteUrl, sitePath } from "@/lib/url"
import { buyTickets } from "@/tickets/server"
import { getSite } from "../../../data"

const UUID = /^[0-9a-f-]{36}$/

// Public: anyone may buy. Everything is validated here and again in reserve_tickets().
export async function buy(fd: FormData) {
  const t = await getT()
  const site = String(fd.get("site") ?? "")
  const slug = String(fd.get("slug") ?? "")
  const items = fd.getAll("type").map(String)
  const here = `${sitePath(site, `/e/${slug}/checkout`)}?${new URLSearchParams(
    Object.entries(items.reduce<Record<string, number>>((a, id) => ((a[`t_${id}`] = (a[`t_${id}`] ?? 0) + 1), a), {})).map(([k, v]) => [k, String(v)]),
  )}`
  const s = await getSite(site)
  if (!s) back(here, { error: t("errors.not_allowed") })
  const { data: ev } = await s.db
    .from("events")
    .select("id, ticket_names, max_tickets_per_order")
    .eq("org_id", s.org.id)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle()
  if (!ev) back(here, { error: t("tickets.notOnSale") })

  const email = String(fd.get("email") ?? "").trim().toLowerCase()
  const name = String(fd.get("name") ?? "").trim().slice(0, 200)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) back(here, { error: t("errors.invalid_email") })
  if (!name) back(here, { error: t("shop.nameMissing") })
  if (!items.length || items.length > ev.max_tickets_per_order || items.some((i) => !UUID.test(i)))
    back(here, { error: t("shop.tooMany", { max: ev.max_tickets_per_order }) })
  const holders = fd.getAll("holder").map((h) => String(h).trim().slice(0, 200))
  if (ev.ticket_names === "required" && items.some((_, i) => !holders[i])) back(here, { error: t("shop.holderMissing") })

  let url: string
  try {
    url = await buyTickets({
      orgId: s.org.id,
      eventId: ev.id,
      email,
      name,
      items: items.map((typeId, i) => ({ typeId, holderName: ev.ticket_names === "off" ? null : holders[i] || null })),
      successUrl: (order, token) => siteUrl(site, `/t/${order}?k=${token}`),
      cancelUrl: siteUrl(site, `/e/${slug}`),
    })
  } catch (e) {
    const key = e instanceof Error ? e.message : ""
    back(here, { error: t.has(key) ? t.dynamic(key) : t("shop.failed") })
  }
  redirect(url)
}
