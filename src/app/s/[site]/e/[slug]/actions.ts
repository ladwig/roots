"use server"

import { getT } from "@/i18n/server"
import { back, sitePath } from "@/lib/url"
import { joinWaitlist } from "@/tickets/server"
import { getSite } from "../../data"

// Public: join a sold-out event's waiting list. Validated here and again in joinWaitlist() (still sold out?).
export async function joinWaitlistAction(fd: FormData) {
  const t = await getT()
  const site = String(fd.get("site") ?? "")
  const slug = String(fd.get("slug") ?? "")
  const here = `${sitePath(site, `/e/${slug}`)}#tickets`
  const s = await getSite(site)
  if (!s) back(here, { error: t("errors.not_allowed") })
  const { data: ev } = await s.db.from("events").select("id, max_tickets_per_order").eq("org_id", s.org.id).eq("slug", slug).eq("status", "published").maybeSingle()
  if (!ev) back(here, { error: t("tickets.notOnSale") })
  const email = String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 320)
  const name = String(fd.get("name") ?? "").trim().slice(0, 200)
  const quantity = Math.floor(Number(fd.get("quantity")) || 1)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) back(here, { error: t("errors.invalid_email") })
  if (!name) back(here, { error: t("shop.nameMissing") })
  if (quantity < 1 || quantity > Math.min(20, ev.max_tickets_per_order)) back(here, { error: t("shop.tooMany", { max: Math.min(20, ev.max_tickets_per_order) }) })
  try {
    await joinWaitlist({ orgId: s.org.id, eventId: ev.id, name, email, quantity })
  } catch (e) {
    const key = e instanceof Error ? e.message : ""
    back(here, { error: t.has(key) ? t.dynamic(key) : t("shop.failed") })
  }
  back(here, { ok: t("waitlist.joined") })
}
