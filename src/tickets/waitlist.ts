// Waiting list (event capacity reached): join, claim links, the worker's offers. Own module without payment imports,
// so public pages can use it without pulling in the payments ↔ tickets import cycle.
import { messages } from "@/i18n/config"
import { createT } from "@/i18n/translate"
import { sendEventMail } from "@/email/event-mail"
import { createAdminClient } from "@/lib/supabase/admin"
import { siteUrl } from "@/lib/url"

const db = () => createAdminClient()
const tDe = () => createT("de", messages.de)
const ticketOffer = async (eventId: string) => (await db().rpc("ticket_offer", { p_event: eventId })).data ?? []

/** Minute worker: expire old waiting-list offers, offer free seats in order and email each claim link. */
export async function offerWaitlist() {
  const { data: offers, error } = await db().rpc("offer_waitlist")
  if (error) throw error
  for (const o of offers ?? []) {
    const { data: ev } = await db().from("events").select("slug, orgs(slug)").eq("id", o.event_id).single()
    if (!ev?.orgs) continue
    const until = tDe().date(o.offered_until, { dateStyle: "medium", timeStyle: "short" })
    const link = siteUrl(ev.orgs.slug, `/e/${ev.slug}?w=${o.token}`)
    await sendEventMail("waitlist", o.event_id, { name: o.name, email: o.email, count: o.quantity, link, until }).catch((e) => console.error("waitlist email", o.id, e))
  }
  return offers?.length ?? 0
}

/** Public: join an event's waiting list (only while nothing is on sale). Throws message keys. */
export async function joinWaitlist(w: { orgId: string; eventId: string; name: string; email: string; quantity: number }) {
  const offer = await ticketOffer(w.eventId)
  if (!offer.length || offer.some((o) => !o.hidden && o.remaining !== 0)) throw new Error("waitlist.notFull")
  const { error } = await db().from("event_waitlist").insert({ org_id: w.orgId, event_id: w.eventId, name: w.name, email: w.email, quantity: w.quantity })
  if (error) throw new Error(error.code === "23505" ? "waitlist.already" : "shop.failed")
}

/** A waiting-list claim link that is still valid for this event: how many seats are held until when. */
export async function waitlistClaim(eventId: string, token: string | null) {
  if (!token || !/^[0-9a-f]{36}$/.test(token)) return null
  const { data } = await db().from("event_waitlist").select("quantity, offered_until").eq("event_id", eventId).eq("token", token).eq("status", "offered").gt("offered_until", new Date().toISOString()).maybeSingle()
  return data
}
